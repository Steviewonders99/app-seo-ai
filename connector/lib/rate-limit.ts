/**
 * Tiny in-memory sliding-window rate limiter, keyed by the bearer token
 * (so all colleagues share one bucket; this is intentional in v1).
 *
 * 60 tool requests per token per hour. health_check is exempt — caller decides.
 *
 * Note: state lives in module scope, so it's per Vercel function instance.
 * Cold starts reset the window. Good enough for a small team; upgrade to
 * Upstash when traffic warrants.
 */

const WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS = 60;

const hits = new Map<string, number[]>();

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

export function checkRateLimit(tokenKey: string, now = Date.now()): RateLimitResult {
  const cutoff = now - WINDOW_MS;
  const existing = (hits.get(tokenKey) ?? []).filter((t) => t > cutoff);

  if (existing.length >= MAX_REQUESTS) {
    const oldest = existing[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
    hits.set(tokenKey, existing);
    return { ok: false, retryAfterSeconds };
  }

  existing.push(now);
  hits.set(tokenKey, existing);
  return { ok: true };
}

export function rateLimitResponse(retryAfterSeconds: number): Response {
  return new Response('Rate limit exceeded', {
    status: 429,
    headers: { 'Retry-After': String(retryAfterSeconds) },
  });
}

/** Stable key derived from the bearer token, never logged in full. */
export function tokenKey(authorizationHeader: string | null): string {
  if (!authorizationHeader) return 'anon';
  const token = authorizationHeader.replace(/^Bearer\s+/i, '');
  // Last 8 chars is enough to bucket different tokens without storing them.
  return token.slice(-8);
}
