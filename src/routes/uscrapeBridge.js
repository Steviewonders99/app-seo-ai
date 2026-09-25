import { createHash, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';

// Keep this list aligned with OneTake's /api/ultimate-scrape/[...path] route.
// The SEO AI bearer never grants access to the research bridge.
const ALLOWED = [
  /^health$/,
  /^doctor$/,
  /^platforms$/,
  /^jobs$/,
  /^ga4\/(reports|run|properties)$/,
  /^graph\/(stats|search|entity)$/,
  /^sources$/,
  /^swarm\/(estimate|start)$/,
  /^runs$/,
  /^runs\/[A-Za-z0-9._-]+$/,
  /^runs\/[A-Za-z0-9._-]+\/(report|resume|export)$/,
  /^runs\/[A-Za-z0-9._-]+\/files\/[A-Za-z0-9._ -]+$/,
  /^feas\/start$/,
  /^feas\/extract$/,
  /^feas\/runs$/,
  /^feas\/runs\/[A-Za-z0-9._-]+$/,
  /^feas\/runs\/[A-Za-z0-9._-]+\/(rerun|rewrite|ramp)$/,
  /^feas\/runs\/[A-Za-z0-9._-]+\/export\.html$/,
  /^audience\/(overview|segment|plan)$/,
  /^audience\/ga4\/(geo|funnel)$/,
  /^audience\/export\.xlsx$/,
  /^brand\/(swarm|feas)\/[A-Za-z0-9._-]+\.xlsx$/,
  /^brand\/(jobs|graph)\.xlsx$/,
];

const MAX_BODY_BYTES = 100_000;
const MAX_WORKBOOK_BODY_BYTES = 6_500_000;
const UPSTREAM_TIMEOUT_MS = 120_000;

function bearerMatches(header, expected) {
  if (!expected || typeof header !== 'string') return false;
  const match = /^Bearer (.+)$/i.exec(header);
  if (!match) return false;
  // Fixed-size digests make the comparison independent of token length.
  const suppliedHash = createHash('sha256').update(match[1]).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(suppliedHash, expectedHash);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    let settled = false;
    req.on('data', (chunk) => {
      if (settled) return;
      length += chunk.length;
      if (length > limit) {
        settled = true;
        req.resume();
        reject(new Error('body_too_large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!settled) resolve(Buffer.concat(chunks));
    });
    req.on('error', (error) => {
      if (!settled) reject(error);
    });
    req.on('aborted', () => {
      if (!settled) reject(new Error('client_aborted'));
    });
  });
}

/**
 * Mount at /uscrape before express.json() and the SEO AI bearer middleware.
 * The bridge is a separate container in the same pod/app, bound to loopback
 * port 8791. USCRAPE_UPSTREAM_URL can point at a private service instead.
 */
export function createUscrapeBridge({
  token = () => process.env.USCRAPE_BRIDGE_TOKEN,
  upstreamUrl = () => process.env.USCRAPE_UPSTREAM_URL || 'http://127.0.0.1:8791',
} = {}) {
  return async function uscrapeBridge(req, res) {
    const expected = token();
    if (!expected) {
      return res.status(503).json({ error: 'bridge_unconfigured' });
    }
    if (!bearerMatches(req.get('authorization'), expected)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // originalUrl retains the encoded path and query after Express mounts
    // /uscrape. Decode for the allowlist, forward the original encoding.
    const [rawPath, ...queryParts] = req.originalUrl.split('?');
    if (!rawPath.startsWith('/uscrape/api/')) {
      return res.status(404).json({ error: 'Path not allowed' });
    }
    const encodedTail = rawPath.slice('/uscrape/api/'.length);
    let tail;
    try {
      tail = decodeURIComponent(encodedTail);
    } catch {
      return res.status(400).json({ error: 'Malformed path' });
    }
    if (
      tail.split('/').some((part) => part === '.' || part === '..') ||
      !ALLOWED.some((pattern) => pattern.test(tail))
    ) {
      return res.status(404).json({ error: 'Path not allowed' });
    }

    const bodyLimit = tail === 'feas/extract' ? MAX_WORKBOOK_BODY_BYTES : MAX_BODY_BYTES;
    const declaredLength = Number(req.get('content-length') || 0);
    if (declaredLength > bodyLimit) {
      return res.status(413).json({ error: 'Request body too large' });
    }

    let body;
    try {
      body = req.method === 'POST' ? await readBody(req, bodyLimit) : undefined;
    } catch (error) {
      return res.status(error.message === 'body_too_large' ? 413 : 400).json({
        error: error.message === 'body_too_large' ? 'Request body too large' : 'Invalid request body',
      });
    }

    let base;
    try {
      base = new URL(upstreamUrl());
      if (!['http:', 'https:'].includes(base.protocol) || base.pathname !== '/') {
        throw new Error('invalid upstream');
      }
    } catch {
      return res.status(503).json({ error: 'bridge_unconfigured' });
    }
    const search = queryParts.length ? `?${queryParts.join('?')}` : '';
    const target = new URL(`/api/${encodedTail}${search}`, base);
    const transport = target.protocol === 'https:' ? https : http;
    const headers = {
      authorization: `Bearer ${expected}`,
      accept: req.get('accept') || '*/*',
    };
    if (body !== undefined) {
      headers['content-type'] = req.get('content-type') || 'application/json';
      headers['content-length'] = String(body.length);
    }

    const upstream = transport.request(target, {
      method: req.method,
      headers,
      timeout: UPSTREAM_TIMEOUT_MS,
    }, (response) => {
      res.status(response.statusCode || 502);
      for (const name of ['content-type', 'content-disposition']) {
        if (response.headers[name]) res.set(name, response.headers[name]);
      }
      res.set('Cache-Control', 'no-store');
      response.pipe(res);
    });
    upstream.on('timeout', () => upstream.destroy(new Error('bridge_timeout')));
    upstream.on('error', (error) => {
      if (res.headersSent) {
        res.destroy(error);
      } else {
        res.status(error.message === 'bridge_timeout' ? 504 : 502).json({
          error: error.message === 'bridge_timeout' ? 'bridge_timeout' : 'bridge_offline',
        });
      }
    });
    upstream.end(body);
  };
}
