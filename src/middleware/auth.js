// Bearer-token middleware for the SEO AI service.
//
// When SEO_AI_API_KEY is set, every /api/* request must arrive with a
// matching `Authorization: Bearer <key>` header. Without the env var the
// middleware is a no-op — same shape as a dev environment behind a private
// network. /health and /api-docs stay open for ACA's healthcheck + on-call
// debugging.
//
// Pairs with src/lib/content/seo-client.ts on the centric-intake side, which
// sends the same header when SEO_AI_API_KEY is set.

export function bearerAuth(req, res, next) {
  const expected = process.env.SEO_AI_API_KEY;
  if (!expected) return next();

  // Skip auth for health + docs — the ACA healthcheck and on-call humans need
  // these without a token.
  if (req.path === '/health' || req.path.startsWith('/api-docs')) {
    return next();
  }

  const header = req.get('authorization') ?? '';
  const match = /^Bearer (.+)$/i.exec(header);
  if (!match || match[1] !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}
