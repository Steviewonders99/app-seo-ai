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
  if (aBuf.length !== bBuf.length) {
    // Still compare to keep timing stable.
    const padded = Buffer.alloc(aBuf.length, 0);
    bBuf.copy(padded, 0, 0, Math.min(aBuf.length, bBuf.length));
    timingSafeEqual(aBuf, padded);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}
