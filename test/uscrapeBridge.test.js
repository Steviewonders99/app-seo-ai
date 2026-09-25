import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { after, before, test } from 'node:test';
import express from 'express';
import { createUscrapeBridge } from '../src/routes/uscrapeBridge.js';

const token = 'bridge-test-token';
let bridge;
let proxy;
let bridgeUrl;
let proxyUrl;

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

before(async () => {
  bridge = http.createServer(async (req, res) => {
    const body = [];
    for await (const chunk of req) body.push(chunk);
    if (req.url === '/api/brand/jobs.xlsx') {
      res.writeHead(200, {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': 'attachment; filename="jobs.xlsx"',
      });
      res.end(Buffer.from([0, 1, 2, 255]));
      return;
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      url: req.url,
      method: req.method,
      authorization: req.headers.authorization,
      body: Buffer.concat(body).toString(),
    }));
  });
  bridgeUrl = await listen(bridge);

  const app = express();
  app.use('/uscrape', createUscrapeBridge({
    token: () => token,
    upstreamUrl: () => bridgeUrl,
  }));
  app.use(express.json({ limit: 1 })); // Bridge POSTs must bypass JSON parsing.
  proxy = http.createServer(app);
  proxyUrl = await listen(proxy);
});

after(async () => {
  await Promise.all([
    new Promise((resolve) => proxy.close(resolve)),
    new Promise((resolve) => bridge.close(resolve)),
  ]);
});

test('requires the dedicated bridge bearer and only forwards allowed paths', async () => {
  const unauthenticated = await fetch(`${proxyUrl}/uscrape/api/health`);
  assert.equal(unauthenticated.status, 401);

  const forbidden = await fetch(`${proxyUrl}/uscrape/api/private`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(forbidden.status, 404);

  const health = await fetch(`${proxyUrl}/uscrape/api/health?probe=1`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {
    url: '/api/health?probe=1', method: 'GET',
    authorization: `Bearer ${token}`, body: '',
  });
});

test('forwards a research POST body without Express JSON truncation', async () => {
  const response = await fetch(`${proxyUrl}/uscrape/api/feas/start`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ project: 'Pine', criteria: { country: 'US' } }),
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.method, 'POST');
  assert.equal(result.authorization, `Bearer ${token}`);
  assert.deepEqual(JSON.parse(result.body), { project: 'Pine', criteria: { country: 'US' } });
});

test('preserves binary exports and attachment filename', async () => {
  const response = await fetch(`${proxyUrl}/uscrape/api/brand/jobs.xlsx`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="jobs.xlsx"');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from([0, 1, 2, 255]));
});

test('fails closed when its bridge secret is absent', async () => {
  const app = express();
  app.use('/uscrape', createUscrapeBridge({ token: () => '' }));
  const server = http.createServer(app);
  const url = await listen(server);
  try {
    const response = await fetch(`${url}/uscrape/api/health`);
    assert.equal(response.status, 503);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('returns a bounded 502 when the sidecar is offline', async () => {
  const app = express();
  app.use('/uscrape', createUscrapeBridge({
    token: () => token,
    upstreamUrl: () => 'http://127.0.0.1:1',
  }));
  const server = http.createServer(app);
  const url = await listen(server);
  try {
    const response = await fetch(`${url}/uscrape/api/health`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'bridge_offline' });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
