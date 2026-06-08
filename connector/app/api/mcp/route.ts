import { createMcpHandler } from 'mcp-handler';
import { requireBearerToken } from '../../../lib/auth';
import { checkRateLimit, rateLimitResponse, tokenKey } from '../../../lib/rate-limit';
import { registerTools } from '../../../lib/tools';
import { log } from '../../../lib/logger';

const mcpHandler = createMcpHandler(
  (server) => {
    registerTools(server);
  },
  {
    serverInfo: { name: 'seo-ai-keywords', version: '0.1.0' },
  },
  {
    // basePath matches the route file location (App Router serves this at /api/mcp).
    basePath: '/api',
    maxDuration: 30,
    // Disable SSE so mcp-handler does not require Redis. We only need
    // stateless Streamable HTTP, which is what Claude clients use.
    disableSse: true,
  },
);

async function withMiddleware(req: Request): Promise<Response> {
  // 1. Auth.
  const authError = requireBearerToken(req);
  if (authError) {
    log('warn', 'auth.fail', { status: authError.status });
    return authError;
  }

  // 2. Rate limit. We don't try to exempt health_check pre-dispatch (would
  //    require parsing the JSON-RPC body); the 60/hr cap is comfortably above
  //    any sensible health probe rate.
  const key = tokenKey(req.headers.get('authorization'));
  const limit = checkRateLimit(key);
  if (!limit.ok) {
    log('warn', 'ratelimit.block', { status: 429 });
    return rateLimitResponse(limit.retryAfterSeconds);
  }

  // 3. Dispatch to the MCP adapter.
  return mcpHandler(req);
}

export const GET = withMiddleware;
export const POST = withMiddleware;
export const DELETE = withMiddleware;
export const runtime = 'nodejs';
export const maxDuration = 30;
