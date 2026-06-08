import { timingSafeEqual } from 'node:crypto';

const BEARER_PREFIX = 'Bearer ';

/**
 * Validate the Authorization header against CONNECTOR_SHARED_TOKEN.
 * Returns null when the request is authorized.
 * Returns a Response (401 or 500) when it is not — caller should return it as-is.
 */
export function requireBearerToken(req: Request): Response | null {
  const expected = process.env.CONNECTOR_SHARED_TOKEN;
  if (!expected) {
    return new Response('Server misconfigured: CONNECTOR_SHARED_TOKEN missing', { status: 500 });
  }

  const header = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!header || !header.startsWith(BEARER_PREFIX)) {
    return unauthorized();
  }
  const presented = header.slice(BEARER_PREFIX.length);

  if (!constantTimeEqual(presented, expected)) {
    return unauthorized();
  }
  return null;
}

function unauthorized(): Response {
  return new Response('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Bearer realm="seo-ai-connector"' },
  });
}

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  // Always pad both buffers to the same length and run timingSafeEqual,
  // regardless of input lengths. The length-mismatch check is folded into
  // the final boolean so the timing cost is identical for length-correct
  // and length-wrong tokens.
  const len = Math.max(aBuf.length, bBuf.length, 1);
  const aPadded = Buffer.alloc(len, 0);
  const bPadded = Buffer.alloc(len, 0);
  aBuf.copy(aPadded);
  bBuf.copy(bPadded);
  const bytesMatch = timingSafeEqual(aPadded, bPadded);
  return bytesMatch && aBuf.length === bBuf.length;
}
