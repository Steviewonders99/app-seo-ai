# Claude Keyword Research Connector — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-06-08-claude-keyword-research-connector-design.md`](../specs/2026-06-08-claude-keyword-research-connector-design.md)

**Goal:** Ship a hosted MCP server on Vercel plus a one-click Claude Desktop Extension (`.dxt`) so colleagues can run Google Ads Keyword Planner research from Claude (Desktop + Web) without touching any config file, terminal, or credentials.

**Architecture:** Two artifacts share one `connector/lib/tools.ts` module: (1) a Vercel Function at `connector/api/mcp.ts` that exposes the tools over Streamable HTTP using the official `@modelcontextprotocol/sdk` wrapped by `@vercel/mcp-adapter`, gated by a shared bearer token; (2) a `connector-dxt/` Desktop Extension whose stdio MCP server proxies every tool call over HTTPS to that same `/mcp` endpoint, prompting the colleague for the bearer token at install time via DXT `user_config`. Google Ads credentials live only in Vercel env vars; the `.dxt` ships none.

**Tech Stack:**
- TypeScript on the connector (matches the spec; Vercel runs `.ts` natively).
- Plain JS/ESM in the `.dxt` server (smaller bundle, no build step needed inside the .dxt).
- `@modelcontextprotocol/sdk` (canonical MCP server SDK).
- `@vercel/mcp-adapter` (HTTP transport wrapper for the SDK).
- `zod` for input validation.
- `vitest` for unit tests (the only unit-tested module is the security-critical bearer auth).
- Vercel Functions (Node 20 runtime) for hosting; `vercel` CLI for deploys.
- The DXT manifest spec from Anthropic for the `.dxt` package.

---

## File Map

| File                                      | Responsibility                                                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `connector/package.json`                  | Vercel project deps + scripts.                                                                                       |
| `connector/tsconfig.json`                 | TS config for Node20 + ESM.                                                                                          |
| `connector/vercel.json`                   | Function runtime + max duration.                                                                                     |
| `connector/.env.example`                  | All required env var names, no values.                                                                               |
| `connector/.gitignore`                    | Ignores `node_modules`, `.vercel`, `public/seo-ai-keywords.dxt` (built artifact).                                    |
| `connector/lib/auth.ts`                   | Constant-time bearer-token check; returns `Response | null`.                                                         |
| `connector/lib/rate-limit.ts`             | In-memory sliding-window rate limiter keyed by token.                                                                |
| `connector/lib/logger.ts`                 | One-line structured log helper.                                                                                      |
| `connector/lib/tools.ts`                  | Canonical MCP tool registrations; imports `keywordPlannerService` from `../../src/services/keywordPlannerService.js`.|
| `connector/api/mcp.ts`                    | Vercel Function: wires auth + rate limit + `@vercel/mcp-adapter` + tools.                                            |
| `connector/test/auth.test.ts`             | Unit tests for the bearer-token middleware.                                                                          |
| `connector/public/seo-ai-keywords.dxt`    | Built `.dxt` artifact, served at `/seo-ai-keywords.dxt`. Created by build script; gitignored.                        |
| `connector/README.md`                     | Operator runbook: deploy, rotate token, build .dxt, troubleshoot.                                                    |
| `connector/ONBOARDING.md`                 | Colleague-facing handout (Desktop + Web install).                                                                    |
| `connector-dxt/manifest.json`             | DXT manifest with `user_config.shared_token` and node entry point.                                                   |
| `connector-dxt/server/package.json`       | DXT server deps (`@modelcontextprotocol/sdk`, `zod`).                                                                |
| `connector-dxt/server/index.js`           | Stdio MCP server; each tool handler proxies to the hosted `/mcp` over HTTPS.                                         |
| `connector-dxt/server/tool-schemas.js`    | Tool input schemas mirrored from `connector/lib/tools.ts` so the proxy can register them locally.                    |
| `connector-dxt/icon.png`                  | Optional but recommended; can be a 128x128 placeholder for v1.                                                       |
| `connector-dxt/build.sh`                  | Bundles `manifest.json` + `server/` into `seo-ai-keywords.dxt` and copies it to `connector/public/`.                 |
| `connector-dxt/README.md`                 | How to build, version, and (later) sign the .dxt.                                                                    |

**Service reuse rule:** `connector/lib/tools.ts` is the **only** file that imports from `src/services/keywordPlannerService.js`. `connector-dxt/server/index.js` never imports the service or any Google Ads code; it only `fetch()`es the hosted endpoint.

---

## Task 1: Scaffold the `connector/` Vercel project

**Files:**
- Create: `connector/package.json`
- Create: `connector/tsconfig.json`
- Create: `connector/vercel.json`
- Create: `connector/.gitignore`
- Create: `connector/.env.example`

- [ ] **Step 1: Create the directory and `package.json`**

```bash
mkdir -p connector/{api,lib,test,public}
```

Write `connector/package.json`:

```json
{
  "name": "app-seo-ai-connector",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "dev": "vercel dev",
    "deploy:preview": "vercel",
    "deploy:prod": "vercel --prod"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.26.0",
    "@vercel/mcp-adapter": "^0.6.0",
    "google-auth-library": "^9.15.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `connector/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "allowJs": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["api/**/*", "lib/**/*", "test/**/*"]
}
```

`allowJs: true` is required so we can import `../../src/services/keywordPlannerService.js`.

- [ ] **Step 3: Create `connector/vercel.json`**

```json
{
  "functions": {
    "api/mcp.ts": {
      "runtime": "nodejs20.x",
      "maxDuration": 30
    }
  }
}
```

- [ ] **Step 4: Create `connector/.gitignore`**

```
node_modules/
.vercel/
public/seo-ai-keywords.dxt
*.log
```

- [ ] **Step 5: Create `connector/.env.example`**

```
# Server-side only. Never committed.
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_REFRESH_TOKEN=
GOOGLE_ADS_LOGIN_CUSTOMER_ID=

# 32-byte hex string. Generate with: openssl rand -hex 32
CONNECTOR_SHARED_TOKEN=
```

- [ ] **Step 6: Install dependencies**

```bash
cd connector && npm install
```

Expected: a `connector/package-lock.json` is created and `node_modules/` populated.

- [ ] **Step 7: Commit**

```bash
git add connector/package.json connector/package-lock.json connector/tsconfig.json connector/vercel.json connector/.gitignore connector/.env.example
git commit -m "feat(connector): scaffold Vercel project"
```

---

## Task 2: Implement `lib/auth.ts` (bearer-token middleware) with tests

**Files:**
- Create: `connector/lib/auth.ts`
- Create: `connector/test/auth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `connector/test/auth.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { requireBearerToken } from '../lib/auth.js';

describe('requireBearerToken', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('CONNECTOR_SHARED_TOKEN', 'correct-secret-token-value');
  });

  it('returns null when the bearer token matches', () => {
    const req = new Request('https://x.test/mcp', {
      headers: { Authorization: 'Bearer correct-secret-token-value' },
    });
    expect(requireBearerToken(req)).toBeNull();
  });

  it('returns 401 when the header is missing', async () => {
    const req = new Request('https://x.test/mcp');
    const res = requireBearerToken(req);
    expect(res).toBeInstanceOf(Response);
    expect(res!.status).toBe(401);
  });

  it('returns 401 when the scheme is not Bearer', async () => {
    const req = new Request('https://x.test/mcp', {
      headers: { Authorization: 'Basic correct-secret-token-value' },
    });
    expect(requireBearerToken(req)!.status).toBe(401);
  });

  it('returns 401 when the token does not match', async () => {
    const req = new Request('https://x.test/mcp', {
      headers: { Authorization: 'Bearer wrong-token' },
    });
    expect(requireBearerToken(req)!.status).toBe(401);
  });

  it('returns 401 when the token is the right length but wrong (constant-time path)', async () => {
    const req = new Request('https://x.test/mcp', {
      headers: { Authorization: 'Bearer correct-secret-token-valuX' },
    });
    expect(requireBearerToken(req)!.status).toBe(401);
  });

  it('returns 500 when the server env var is not configured', async () => {
    vi.stubEnv('CONNECTOR_SHARED_TOKEN', '');
    const req = new Request('https://x.test/mcp', {
      headers: { Authorization: 'Bearer anything' },
    });
    expect(requireBearerToken(req)!.status).toBe(500);
  });

  it('does not leak the expected token in the 401 body', async () => {
    const req = new Request('https://x.test/mcp', {
      headers: { Authorization: 'Bearer wrong' },
    });
    const body = await requireBearerToken(req)!.text();
    expect(body).not.toContain('correct-secret-token-value');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd connector && npx vitest run test/auth.test.ts
```

Expected: FAIL with "Cannot find module '../lib/auth.js'".

- [ ] **Step 3: Implement `lib/auth.ts`**

Create `connector/lib/auth.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd connector && npx vitest run test/auth.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add connector/lib/auth.ts connector/test/auth.test.ts
git commit -m "feat(connector): add bearer-token auth middleware"
```

---

## Task 3: Implement `lib/rate-limit.ts`

**Files:**
- Create: `connector/lib/rate-limit.ts`

- [ ] **Step 1: Implement the rate limiter**

Create `connector/lib/rate-limit.ts`:

```ts
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
```

- [ ] **Step 2: Sanity-check the typechecker**

```bash
cd connector && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add connector/lib/rate-limit.ts
git commit -m "feat(connector): add in-memory rate limiter"
```

---

## Task 4: Implement `lib/logger.ts`

**Files:**
- Create: `connector/lib/logger.ts`

- [ ] **Step 1: Implement the logger**

Create `connector/lib/logger.ts`:

```ts
/**
 * One-line structured JSON logger to stdout/stderr.
 * Vercel ingests stdout/stderr automatically — no transport needed.
 */

type Level = 'info' | 'warn' | 'error';

interface LogFields {
  tool?: string;
  status?: number;
  latencyMs?: number;
  keyword?: string;
  keywordCount?: number;
  err?: string;
}

export function log(level: Level, msg: string, fields: LogFields = {}): void {
  const entry = { ts: new Date().toISOString(), level, msg, ...fields };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else console.log(line);
}
```

- [ ] **Step 2: Typecheck**

```bash
cd connector && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add connector/lib/logger.ts
git commit -m "feat(connector): add structured logger"
```

---

## Task 5: Implement `lib/tools.ts` (canonical MCP tool registrations)

**Files:**
- Create: `connector/lib/tools.ts`

- [ ] **Step 1: Implement the tool registrations**

Create `connector/lib/tools.ts`:

```ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// Imported from the existing repo service. Plain JS, ESM. allowJs covers it.
// @ts-ignore — JS file with no declarations
import keywordPlannerService from '../../src/services/keywordPlannerService.js';
import { log } from './logger.js';

/**
 * Tool input schemas. Exported so the .dxt proxy can mirror them.
 */
export const SCHEMAS = {
  research_keywords: {
    keyword: z.string().describe('Seed keyword to generate ideas from'),
    language: z.string().optional().default('en').describe('Language code (e.g., "en", "es", "fr")'),
    locations: z
      .array(z.number())
      .optional()
      .default([2840])
      .describe('Array of Google Ads geo target constant IDs. 2840 = US, 2826 = UK.'),
    limit: z.number().optional().default(50).describe('Maximum number of keyword ideas to return'),
  },
  get_keyword_metrics: {
    keywords: z.array(z.string()).describe('Array of exact keywords to get metrics for'),
    language: z.string().optional().default('en').describe('Language code'),
    locations: z.array(z.number()).optional().default([2840]).describe('Array of geo target constant IDs'),
  },
  get_historical_metrics: {
    keywords: z.array(z.string()).describe('Array of keywords to get historical metrics for'),
    language: z.string().optional().default('en').describe('Language code'),
    locations: z.array(z.number()).optional().default([2840]).describe('Array of geo target constant IDs'),
  },
} as const;

/**
 * Register all keyword-research tools on an McpServer instance.
 * Called by both the hosted Vercel handler and (in the future) any other transport.
 */
export function registerTools(server: McpServer): void {
  server.tool(
    'research_keywords',
    'Discover keyword ideas for an article topic using Google Ads Keyword Planner. Pass a seed phrase like "engine leasing" and get back related keywords with monthly search volume, competition level, and CPC bid estimates. Use this as the first step when planning a new article.',
    SCHEMAS.research_keywords,
    async ({ keyword, language, locations, limit }) => {
      const t0 = Date.now();
      try {
        const results = await keywordPlannerService.generateKeywordIdeas(keyword, language, locations, limit);
        log('info', 'tool.ok', { tool: 'research_keywords', keyword, latencyMs: Date.now() - t0 });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ seedKeyword: keyword, count: results.length, keywordIdeas: results }, null, 2),
            },
          ],
        };
      } catch (error) {
        const err = error instanceof Error ? error.message : String(error);
        log('error', 'tool.err', { tool: 'research_keywords', keyword, latencyMs: Date.now() - t0, err });
        return { content: [{ type: 'text', text: `Error: ${err}` }], isError: true };
      }
    },
  );

  server.tool(
    'get_keyword_metrics',
    'Get search volume, competition, and CPC bid estimates for a specific list of keywords (no expansion). Use this after research_keywords when you want fresh metrics for an exact shortlist you already have.',
    SCHEMAS.get_keyword_metrics,
    async ({ keywords, language, locations }) => {
      const t0 = Date.now();
      try {
        const results = await keywordPlannerService.getKeywordMetrics(keywords, language, locations);
        log('info', 'tool.ok', { tool: 'get_keyword_metrics', keywordCount: keywords.length, latencyMs: Date.now() - t0 });
        return {
          content: [
            { type: 'text', text: JSON.stringify({ keywords, count: results.length, metrics: results }, null, 2) },
          ],
        };
      } catch (error) {
        const err = error instanceof Error ? error.message : String(error);
        log('error', 'tool.err', { tool: 'get_keyword_metrics', keywordCount: keywords.length, latencyMs: Date.now() - t0, err });
        return { content: [{ type: 'text', text: `Error: ${err}` }], isError: true };
      }
    },
  );

  server.tool(
    'get_historical_metrics',
    'Get historical forecast metrics for keywords by creating a temporary Google Ads keyword plan. Use this when you need projected performance, not just current monthly searches.',
    SCHEMAS.get_historical_metrics,
    async ({ keywords, language, locations }) => {
      const t0 = Date.now();
      try {
        const results = await keywordPlannerService.getHistoricalMetrics(keywords, language, locations);
        log('info', 'tool.ok', { tool: 'get_historical_metrics', keywordCount: keywords.length, latencyMs: Date.now() - t0 });
        return {
          content: [{ type: 'text', text: JSON.stringify({ keywords, forecastMetrics: results }, null, 2) }],
        };
      } catch (error) {
        const err = error instanceof Error ? error.message : String(error);
        log('error', 'tool.err', { tool: 'get_historical_metrics', keywordCount: keywords.length, latencyMs: Date.now() - t0, err });
        return { content: [{ type: 'text', text: `Error: ${err}` }], isError: true };
      }
    },
  );

  server.tool(
    'health_check',
    'Check that the SEO AI connector is up and that all required Google Ads env vars are present. Returns names of missing variables (never values).',
    {},
    async () => {
      const required = [
        'GOOGLE_ADS_DEVELOPER_TOKEN',
        'GOOGLE_ADS_CLIENT_ID',
        'GOOGLE_ADS_CLIENT_SECRET',
        'GOOGLE_ADS_REFRESH_TOKEN',
        'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
        'CONNECTOR_SHARED_TOKEN',
      ];
      const missing = required.filter((k) => !process.env[k]);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                status: missing.length === 0 ? 'ok' : 'misconfigured',
                tools: ['research_keywords', 'get_keyword_metrics', 'get_historical_metrics', 'health_check'],
                missingEnvVars: missing,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd connector && npm run typecheck
```

Expected: no errors. If `@modelcontextprotocol/sdk/server/mcp.js` does not resolve, run `cd connector && npm install` again.

- [ ] **Step 3: Commit**

```bash
git add connector/lib/tools.ts
git commit -m "feat(connector): register MCP tools using official SDK"
```

---

## Task 6: Implement `api/mcp.ts` (Vercel Function entry point)

**Files:**
- Create: `connector/api/mcp.ts`

- [ ] **Step 1: Implement the handler**

Create `connector/api/mcp.ts`:

```ts
import { createMcpHandler } from '@vercel/mcp-adapter';
import { requireBearerToken } from '../lib/auth.js';
import { checkRateLimit, rateLimitResponse, tokenKey } from '../lib/rate-limit.js';
import { registerTools } from '../lib/tools.js';
import { log } from '../lib/logger.js';

export const config = { runtime: 'nodejs' };

const mcpHandler = createMcpHandler(
  (server) => {
    registerTools(server);
  },
  {
    // Server metadata exposed to clients.
    serverInfo: { name: 'seo-ai-keywords', version: '0.1.0' },
  },
  {
    // Adapter options: stateless Streamable HTTP, no Redis.
    basePath: '',
  },
);

export default async function handler(req: Request): Promise<Response> {
  // 1. Auth.
  const authError = requireBearerToken(req);
  if (authError) {
    log('warn', 'auth.fail', { status: authError.status });
    return authError;
  }

  // 2. Rate limit (skipped for health_check by inspecting the inbound payload
  //    is tricky pre-dispatch; instead we limit ALL requests and the cap of
  //    60/hr is comfortably above any sensible health probe rate).
  const key = tokenKey(req.headers.get('authorization'));
  const limit = checkRateLimit(key);
  if (!limit.ok) {
    log('warn', 'ratelimit.block', { status: 429 });
    return rateLimitResponse(limit.retryAfterSeconds);
  }

  // 3. Dispatch to the MCP adapter.
  return mcpHandler(req);
}
```

- [ ] **Step 2: Typecheck**

```bash
cd connector && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Run unit tests (auth) to confirm nothing regressed**

```bash
cd connector && npm test
```

Expected: 7 tests pass.

- [ ] **Step 4: Commit**

```bash
git add connector/api/mcp.ts
git commit -m "feat(connector): wire Vercel Function handler"
```

---

## Task 7: Local smoke test against real Google Ads

**Files:**
- (No files created; uses `vercel dev`)

Goal: confirm the handler returns real keyword data before deploying.

- [ ] **Step 1: Generate a shared token**

```bash
openssl rand -hex 32
```

Copy the output. Call it `<LOCAL_TOKEN>` for the rest of this task.

- [ ] **Step 2: Create a local `.env` for `vercel dev`**

```bash
cp connector/.env.example connector/.env.local
```

Edit `connector/.env.local` and fill in:
- The 5 `GOOGLE_ADS_*` values from the project root `.env`.
- `CONNECTOR_SHARED_TOKEN=<LOCAL_TOKEN>`.

(`.env.local` is already covered by `.vercel/` ignore pattern indirectly; double-check with `git status` that it does NOT appear staged. If it does, add `.env.local` to `connector/.gitignore`.)

- [ ] **Step 3: Start the local dev server**

```bash
cd connector && npx vercel dev --listen 3001
```

(First run will prompt you to link the project — pick "create a new project" later in Task 8. For now, accept the local linking prompts.)

Expected: server listening on `http://localhost:3001`.

- [ ] **Step 4: Smoke-test `health_check` over HTTP**

In another terminal:

```bash
curl -sS -X POST http://localhost:3001/api/mcp \
  -H "Authorization: Bearer <LOCAL_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"health_check","arguments":{}}}'
```

Expected: a JSON-RPC response whose `result.content[0].text` parses to `{"status":"ok", ...}`.

- [ ] **Step 5: Smoke-test `research_keywords` with a known seed**

```bash
curl -sS -X POST http://localhost:3001/api/mcp \
  -H "Authorization: Bearer <LOCAL_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"research_keywords","arguments":{"keyword":"engine leasing","limit":5}}}'
```

Expected: response contains 5 keyword ideas with non-zero `avgMonthlySearches` for at least one of them.

- [ ] **Step 6: Smoke-test auth rejection**

```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/mcp \
  -H "Authorization: Bearer wrong-token" \
  -d '{}'
```

Expected: `401`.

- [ ] **Step 7: Stop `vercel dev` (Ctrl-C) and continue to deploy**

No commit — nothing changed in git.

---

## Task 8: Deploy hosted server to Vercel (preview, then production)

**Files:**
- (No files created.)

- [ ] **Step 1: Link the directory to a new Vercel project**

```bash
cd connector && npx vercel link
```

When prompted:
- Set up and deploy: **Y**
- Which scope: pick your personal/team scope
- Link to existing project: **N**
- Project name: `app-seo-ai-connector`
- Directory: `./` (you're already in it)

This creates `connector/.vercel/` (already gitignored).

- [ ] **Step 2: Push env vars to the preview environment**

For each of the 6 vars below, run `npx vercel env add <NAME> preview`, then paste the value when prompted:
- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GOOGLE_ADS_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`
- `GOOGLE_ADS_REFRESH_TOKEN`
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID`
- `CONNECTOR_SHARED_TOKEN` (use the `<LOCAL_TOKEN>` from Task 7 or generate a new one)

- [ ] **Step 3: Deploy to preview**

```bash
cd connector && npx vercel
```

Note the preview URL output, e.g. `https://app-seo-ai-connector-abc123.vercel.app`. Call it `<PREVIEW_URL>`.

- [ ] **Step 4: Smoke-test the preview URL**

```bash
curl -sS -X POST <PREVIEW_URL>/api/mcp \
  -H "Authorization: Bearer <CONNECTOR_SHARED_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"health_check","arguments":{}}}'
```

Expected: same `{"status":"ok"}` response as Task 7, this time from production infra.

- [ ] **Step 5: Add the same env vars to production**

Repeat Step 2 with `production` instead of `preview` for all 6 vars.

- [ ] **Step 6: Deploy to production**

```bash
cd connector && npx vercel --prod
```

Note the production URL output, e.g. `https://app-seo-ai-connector.vercel.app`. Call it `<PROD_URL>`. **Record this URL** — it is baked into the `.dxt` in Task 11.

- [ ] **Step 7: Smoke-test production**

```bash
curl -sS -X POST <PROD_URL>/api/mcp \
  -H "Authorization: Bearer <CONNECTOR_SHARED_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"research_keywords","arguments":{"keyword":"engine leasing","limit":3}}}'
```

Expected: real keyword data returned.

- [ ] **Step 8: Verify auth gate from claude.ai web (manual, no commit)**

In claude.ai → Settings → Connectors → Add custom connector:
- URL: `<PROD_URL>/api/mcp`
- Authentication: Bearer token = `<CONNECTOR_SHARED_TOKEN>`

Then in a new chat: *"Use the SEO AI connector to research keywords for an article about engine leasing for charter operators."*

Expected: Claude calls `research_keywords`, returns data with real numbers.

No commit — deployment state lives in Vercel, not git.

---

## Task 9: Scaffold the `.dxt` Desktop Extension

**Files:**
- Create: `connector-dxt/manifest.json`
- Create: `connector-dxt/server/package.json`
- Create: `connector-dxt/server/tool-schemas.js`
- Create: `connector-dxt/.gitignore`

- [ ] **Step 1: Create the directory tree**

```bash
mkdir -p connector-dxt/server
```

- [ ] **Step 2: Create `connector-dxt/manifest.json`**

Replace `<PROD_URL>` with the actual production URL from Task 8, Step 6.

```json
{
  "dxt_version": "0.1",
  "name": "seo-ai-keywords",
  "display_name": "SEO AI — Keyword Research",
  "version": "0.1.0",
  "description": "Google Ads Keyword Planner research for article topics. Connects to a shared hosted server using a team access token.",
  "author": {
    "name": "Steven Junop"
  },
  "license": "ISC",
  "icon": "icon.png",
  "server": {
    "type": "node",
    "entry_point": "server/index.js",
    "mcp_config": {
      "command": "node",
      "args": ["${__dirname}/server/index.js"],
      "env": {
        "CONNECTOR_SHARED_TOKEN": "${user_config.shared_token}",
        "CONNECTOR_REMOTE_URL": "<PROD_URL>/api/mcp"
      }
    }
  },
  "user_config": {
    "shared_token": {
      "type": "string",
      "title": "Shared access token",
      "description": "Paste the team access token Steven sent you. This is the only thing you need to configure.",
      "sensitive": true,
      "required": true
    }
  },
  "tools": [
    { "name": "research_keywords" },
    { "name": "get_keyword_metrics" },
    { "name": "get_historical_metrics" },
    { "name": "health_check" }
  ]
}
```

- [ ] **Step 3: Create `connector-dxt/server/package.json`**

```json
{
  "name": "seo-ai-keywords-dxt-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "index.js",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.26.0",
    "zod": "^3.23.8"
  }
}
```

- [ ] **Step 4: Create `connector-dxt/server/tool-schemas.js`**

Mirrors `connector/lib/tools.ts` `SCHEMAS`. Kept as a separate JS file because the .dxt server is plain JS and cannot import a TS file directly.

```js
import { z } from 'zod';

export const SCHEMAS = {
  research_keywords: {
    keyword: z.string().describe('Seed keyword to generate ideas from'),
    language: z.string().optional().default('en').describe('Language code (e.g., "en", "es", "fr")'),
    locations: z.array(z.number()).optional().default([2840]).describe('Array of geo target constant IDs. 2840 = US, 2826 = UK.'),
    limit: z.number().optional().default(50).describe('Maximum number of keyword ideas to return'),
  },
  get_keyword_metrics: {
    keywords: z.array(z.string()).describe('Array of exact keywords to get metrics for'),
    language: z.string().optional().default('en').describe('Language code'),
    locations: z.array(z.number()).optional().default([2840]).describe('Array of geo target constant IDs'),
  },
  get_historical_metrics: {
    keywords: z.array(z.string()).describe('Array of keywords to get historical metrics for'),
    language: z.string().optional().default('en').describe('Language code'),
    locations: z.array(z.number()).optional().default([2840]).describe('Array of geo target constant IDs'),
  },
};

export const DESCRIPTIONS = {
  research_keywords: 'Discover keyword ideas for an article topic using Google Ads Keyword Planner. Pass a seed phrase like "engine leasing" and get back related keywords with monthly search volume, competition level, and CPC bid estimates. Use this as the first step when planning a new article.',
  get_keyword_metrics: 'Get search volume, competition, and CPC bid estimates for a specific list of keywords (no expansion). Use this after research_keywords when you want fresh metrics for an exact shortlist you already have.',
  get_historical_metrics: 'Get historical forecast metrics for keywords by creating a temporary Google Ads keyword plan. Use this when you need projected performance, not just current monthly searches.',
  health_check: 'Check that the SEO AI connector is up and that all required Google Ads env vars are present.',
};
```

- [ ] **Step 5: Create `connector-dxt/.gitignore`**

```
server/node_modules/
*.dxt
```

- [ ] **Step 6: Install DXT server deps**

```bash
cd connector-dxt/server && npm install
```

- [ ] **Step 7: Commit**

```bash
git add connector-dxt/manifest.json connector-dxt/server/package.json connector-dxt/server/package-lock.json connector-dxt/server/tool-schemas.js connector-dxt/.gitignore
git commit -m "feat(dxt): scaffold Desktop Extension manifest and schemas"
```

---

## Task 10: Implement the `.dxt` stdio→HTTPS proxy server

**Files:**
- Create: `connector-dxt/server/index.js`

- [ ] **Step 1: Implement the proxy server**

Create `connector-dxt/server/index.js`:

```js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SCHEMAS, DESCRIPTIONS } from './tool-schemas.js';

const REMOTE_URL = process.env.CONNECTOR_REMOTE_URL;
const SHARED_TOKEN = process.env.CONNECTOR_SHARED_TOKEN;

if (!REMOTE_URL) {
  console.error('CONNECTOR_REMOTE_URL not set — check the .dxt manifest.');
  process.exit(1);
}
if (!SHARED_TOKEN) {
  console.error('CONNECTOR_SHARED_TOKEN not set — open Claude Desktop → Settings → Extensions and paste the shared token.');
  process.exit(1);
}

const server = new McpServer({
  name: 'seo-ai-keywords',
  version: '0.1.0',
});

/**
 * Build a tool handler that forwards a tools/call request to the hosted /mcp
 * endpoint over HTTPS and returns the resulting MCP content blocks verbatim.
 */
function proxyHandler(toolName) {
  return async (args) => {
    let rpcId = 0;
    try {
      rpcId = Math.floor(Math.random() * 1e9);
      const res = await fetch(REMOTE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Authorization': `Bearer ${SHARED_TOKEN}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: rpcId,
          method: 'tools/call',
          params: { name: toolName, arguments: args },
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        return {
          content: [{ type: 'text', text: `Connector error (${res.status}): ${body.slice(0, 500)}` }],
          isError: true,
        };
      }

      const data = await res.json();
      if (data.error) {
        return {
          content: [{ type: 'text', text: `Connector error: ${data.error.message || JSON.stringify(data.error)}` }],
          isError: true,
        };
      }
      // The remote already returns the MCP-shaped content array.
      return data.result;
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Network error reaching connector: ${err.message}` }],
        isError: true,
      };
    }
  };
}

server.tool('research_keywords', DESCRIPTIONS.research_keywords, SCHEMAS.research_keywords, proxyHandler('research_keywords'));
server.tool('get_keyword_metrics', DESCRIPTIONS.get_keyword_metrics, SCHEMAS.get_keyword_metrics, proxyHandler('get_keyword_metrics'));
server.tool('get_historical_metrics', DESCRIPTIONS.get_historical_metrics, SCHEMAS.get_historical_metrics, proxyHandler('get_historical_metrics'));
server.tool('health_check', DESCRIPTIONS.health_check, {}, proxyHandler('health_check'));

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 2: Smoke-test the proxy locally over stdio**

This simulates Claude Desktop launching the server. Run from `connector-dxt/server/`:

```bash
cd connector-dxt/server && \
  CONNECTOR_REMOTE_URL="<PROD_URL>/api/mcp" \
  CONNECTOR_SHARED_TOKEN="<CONNECTOR_SHARED_TOKEN>" \
  node index.js <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"health_check","arguments":{}}}
EOF
```

Expected: two JSON-RPC responses on stdout. The second contains a `health_check` result with `"status":"ok"`. (You may see a partial response if stdin closes before the request completes; that's OK — what matters is the response shape.)

- [ ] **Step 3: Commit**

```bash
git add connector-dxt/server/index.js
git commit -m "feat(dxt): implement stdio->HTTPS proxy server"
```

---

## Task 11: Write the `.dxt` build script and produce the artifact

**Files:**
- Create: `connector-dxt/build.sh`
- Create: `connector-dxt/icon.png` (placeholder)

- [ ] **Step 1: Create a placeholder icon**

A 128x128 PNG is fine for v1. From the repo root:

```bash
# Easiest: copy any existing image; or generate a solid color square.
# If you have ImageMagick installed:
convert -size 128x128 xc:'#0a84ff' connector-dxt/icon.png
# Otherwise create an empty file as a placeholder; the .dxt will still build:
# (Anthropic's DXT runtime falls back to a generic icon if the file is bad.)
```

- [ ] **Step 2: Create `connector-dxt/build.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# Strip dev junk before bundling.
rm -f seo-ai-keywords.dxt

# A .dxt is a zip containing manifest.json + server/ + icon.png at the root.
# server/node_modules must be included — Claude Desktop does not run npm install.
(cd server && npm install --omit=dev --no-audit --no-fund)

zip -r seo-ai-keywords.dxt \
  manifest.json \
  icon.png \
  server/package.json \
  server/index.js \
  server/tool-schemas.js \
  server/node_modules

# Stage the artifact for the hosted server to serve at /seo-ai-keywords.dxt.
mkdir -p ../connector/public
cp seo-ai-keywords.dxt ../connector/public/seo-ai-keywords.dxt

echo "Built $(pwd)/seo-ai-keywords.dxt ($(wc -c < seo-ai-keywords.dxt) bytes)"
echo "Staged to ../connector/public/seo-ai-keywords.dxt"
```

```bash
chmod +x connector-dxt/build.sh
```

- [ ] **Step 3: Build the artifact**

```bash
./connector-dxt/build.sh
```

Expected: prints a byte size; `connector-dxt/seo-ai-keywords.dxt` exists; `connector/public/seo-ai-keywords.dxt` exists (gitignored).

- [ ] **Step 4: Redeploy the hosted server so the new `.dxt` is served**

```bash
cd connector && npx vercel --prod
```

- [ ] **Step 5: Verify the `.dxt` download is live**

```bash
curl -sS -o /tmp/test.dxt -w "%{http_code} %{size_download}\n" <PROD_URL>/seo-ai-keywords.dxt
```

Expected: `200 <byte size matching the local build>`.

- [ ] **Step 6: Commit**

```bash
git add connector-dxt/build.sh connector-dxt/icon.png
git commit -m "build(dxt): add build script for .dxt artifact"
```

---

## Task 12: Install the `.dxt` in Claude Desktop and run end-to-end check

**Files:**
- (No files created.)

Goal: verify the full happy path a colleague will experience.

- [ ] **Step 1: Open the production download URL in a browser**

Open `<PROD_URL>/seo-ai-keywords.dxt`. The browser should download `seo-ai-keywords.dxt`.

- [ ] **Step 2: Double-click the downloaded file**

Claude Desktop should launch (or come to the foreground) and show an install dialog:
- Title: "SEO AI — Keyword Research"
- A field labeled "Shared access token"

- [ ] **Step 3: Paste the shared token and install**

Paste `<CONNECTOR_SHARED_TOKEN>` and click Install.

Expected: dialog closes; extension appears in Settings → Extensions.

- [ ] **Step 4: Run each tool from a fresh Claude Desktop chat**

In a new conversation, ask:

1. *"Run a health check on the SEO AI connector."*
   Expected: `health_check` is called, returns `status: ok`.

2. *"Research keywords for an article about engine leasing for charter operators."*
   Expected: `research_keywords` is called with a sensible seed; results include real monthly search numbers.

3. *"Get current metrics for these exact keywords: 'engine leasing', 'aircraft engine lease'."*
   Expected: `get_keyword_metrics` is called with both keywords.

4. *"Get a historical forecast for 'engine leasing'."*
   Expected: `get_historical_metrics` is called.

- [ ] **Step 5: Confirm logs in Vercel**

Open the Vercel dashboard → project → Logs. You should see one structured JSON log line per call with `tool`, `latencyMs`, and no PII.

- [ ] **Step 6: Confirm the .dxt and web flows return identical output**

In claude.ai (the connector already added in Task 8 Step 8), run the same `research_keywords` query. Compare a single line of the output (e.g. the first keyword and its `avgMonthlySearches`) to the Desktop run — they should be byte-identical.

No commit — verification only.

---

## Task 13: Write `connector/README.md` (operator runbook)

**Files:**
- Create: `connector/README.md`

- [ ] **Step 1: Write the operator runbook**

Create `connector/README.md`:

````markdown
# SEO AI Connector — Operator Runbook

This is the **server-side** docs for the hosted MCP connector and the
`.dxt` Desktop Extension. Colleagues should be sent
[`ONBOARDING.md`](./ONBOARDING.md) instead.

## What it is

A Vercel-hosted MCP server that exposes 4 keyword-research tools backed by
the Google Ads Keyword Planner API. Two distribution paths share one
backend:

- **Claude.ai (web)** — colleagues add a custom connector pointing at the
  hosted URL with a shared bearer token.
- **Claude Desktop** — colleagues install a `.dxt` Desktop Extension that
  spawns a tiny stdio proxy that forwards every call to the same hosted URL.

## Repo layout

- `connector/` — this Vercel project (server).
- `connector-dxt/` — the Claude Desktop Extension (proxy).

## Production URL

`https://app-seo-ai-connector.vercel.app/api/mcp` (replace if yours differs).

## Required env vars (set in Vercel)

| Name                            | Where to get it                                                |
| ------------------------------- | -------------------------------------------------------------- |
| `GOOGLE_ADS_DEVELOPER_TOKEN`    | Google Ads MCC → Tools → API Center                            |
| `GOOGLE_ADS_CLIENT_ID`          | GCP OAuth 2.0 client ID                                        |
| `GOOGLE_ADS_CLIENT_SECRET`      | Same OAuth client                                              |
| `GOOGLE_ADS_REFRESH_TOKEN`      | Run `npm run get-token` in repo root once                      |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID`  | MCC customer ID (digits only, no dashes), e.g. `4998240505`    |
| `CONNECTOR_SHARED_TOKEN`        | `openssl rand -hex 32`                                         |

## Deploy

```bash
cd connector
npx vercel --prod
```

For preview: `npx vercel`.

## Rotate the shared token

1. `NEW=$(openssl rand -hex 32)` and remember the value.
2. `npx vercel env rm CONNECTOR_SHARED_TOKEN production`
3. `npx vercel env add CONNECTOR_SHARED_TOKEN production` and paste `$NEW`.
4. `npx vercel --prod` to redeploy.
5. Send `$NEW` to colleagues. Old token is rejected immediately.

Colleagues update their stored token:
- **Web**: edit the custom connector → paste new token.
- **Desktop**: Settings → Extensions → SEO AI Keywords → Configuration → paste new token.

## Build and publish the `.dxt`

```bash
./connector-dxt/build.sh
cd connector && npx vercel --prod
```

This stages the new `.dxt` into `connector/public/` and the redeploy
publishes it at `<PROD_URL>/seo-ai-keywords.dxt`. Bump
`connector-dxt/manifest.json` `version` for each user-visible change so
existing installs see an upgrade prompt.

## Rate limit

60 requests/token/hour, in-memory per function instance. To raise the
limit: edit `lib/rate-limit.ts`. To make it persistent across cold starts,
swap the in-memory `Map` for an Upstash Redis client (`@upstash/redis` +
`@upstash/ratelimit`); the public API of `checkRateLimit` does not need
to change.

## Logs

Vercel dashboard → Project → Logs. Each tool call emits one JSON line
with `tool`, `latencyMs`, `status`, and either `keyword` or
`keywordCount`. No secrets, no full keyword lists.

## Troubleshoot

| Symptom                                  | Cause + Fix                                                                              |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| `401 Unauthorized`                       | Wrong/missing bearer token. Confirm both sides have the same `CONNECTOR_SHARED_TOKEN`.   |
| `429 Too Many Requests`                  | Hit 60/hr limit. Wait or raise the cap.                                                  |
| `500 Server misconfigured`               | `CONNECTOR_SHARED_TOKEN` not set in the environment that's running.                      |
| `Google Ads API error (401)`             | OAuth refresh token expired or developer token wrong. Re-run `npm run get-token`.        |
| `.dxt` install dialog shows no token field | `manifest.json` `user_config` block missing or malformed. Re-validate against DXT spec.  |
````

- [ ] **Step 2: Commit**

```bash
git add connector/README.md
git commit -m "docs(connector): operator runbook"
```

---

## Task 14: Write `connector/ONBOARDING.md` (colleague handout)

**Files:**
- Create: `connector/ONBOARDING.md`

- [ ] **Step 1: Write the handout**

Replace `<PROD_URL>` with the actual production URL.

Create `connector/ONBOARDING.md`:

````markdown
# Set up the SEO AI Keyword Connector in Claude

This adds **Google Ads Keyword Planner** research directly inside Claude.
Use it to plan keywords for new articles.

You need two things from Steven:

1. **The download link** for Claude Desktop: `<PROD_URL>/seo-ai-keywords.dxt`
2. **The shared access token** (a long random string).

You only set this up **once**.

---

## Claude Desktop (recommended — one click)

1. Click the download link above. Your browser downloads `seo-ai-keywords.dxt`.
2. **Double-click the downloaded file.** Claude Desktop opens an install dialog.
3. Paste the **shared access token** into the field labeled "Shared access token."
4. Click **Install**.
5. Open a new conversation. You're done — try:

   > *Research keywords for an article about [your topic].*

To update the token later: Claude Desktop → Settings → Extensions →
**SEO AI — Keyword Research** → Configuration → paste the new token.

---

## Claude.ai (web)

1. Go to **Settings → Connectors → Add custom connector**.
2. **Server URL**: `<PROD_URL>/api/mcp`
3. **Authentication**: **Bearer token** = the shared access token Steven sent.
4. Save and toggle the connector **on**.
5. Open a new conversation and try the same prompt as above.

---

## What you can ask Claude

- *"Research keywords for an article about engine leasing for charter operators."*
- *"What's the search volume for 'aircraft engine lease' in the UK?"*
- *"Give me 30 long-tail keyword ideas around 'asset management for engine portfolios'."*
- *"Forecast historical metrics for these keywords: …"*

---

## Troubleshooting

| What you see                                        | What to do                                                       |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| `401 Unauthorized` or "wrong token"                 | Double-check you pasted the token correctly. Ping Steven.        |
| `429 Too Many Requests`                             | You hit the hourly limit (60 calls). Wait a bit or ask Steven.   |
| Claude Desktop won't install the `.dxt`             | Try the **Claude.ai (web)** flow instead — it works the same.    |
| "Can't add custom connector" (web)                  | Confirm the URL ends in `/api/mcp` (not just the domain).        |
| Claude doesn't seem to use the connector            | Mention "use the SEO AI connector" explicitly in your prompt.    |
````

- [ ] **Step 2: Commit**

```bash
git add connector/ONBOARDING.md
git commit -m "docs(connector): colleague onboarding handout"
```

---

## Task 15: Write `connector-dxt/README.md`

**Files:**
- Create: `connector-dxt/README.md`

- [ ] **Step 1: Write the DXT README**

Create `connector-dxt/README.md`:

````markdown
# SEO AI — Keyword Research (Desktop Extension)

A Claude Desktop Extension (`.dxt`) that surfaces the keyword-research
tools from the hosted MCP server at
`https://app-seo-ai-connector.vercel.app/api/mcp` via a tiny stdio proxy.

This package contains **no** Google Ads credentials. Each call is forwarded
over HTTPS to the hosted server, which holds the real credentials. The
only secret stored on the colleague's machine is the shared access token
(stored by Claude Desktop, never by us).

## Layout

- `manifest.json` — DXT v0.1 manifest. Declares the `user_config.shared_token`
  field that Claude Desktop prompts for at install time.
- `server/index.js` — stdio MCP server (uses `@modelcontextprotocol/sdk`)
  that registers the same 4 tools as the hosted server and proxies each
  call.
- `server/tool-schemas.js` — Zod schemas + tool descriptions. **Mirror of
  `connector/lib/tools.ts` `SCHEMAS`/`DESCRIPTIONS`. Keep in sync when
  tool inputs change.**
- `build.sh` — bundles into `seo-ai-keywords.dxt` and stages a copy into
  `../connector/public/` for the hosted server to serve.
- `icon.png` — 128×128 icon shown in the install dialog.

## Build

```bash
./build.sh
```

Output: `seo-ai-keywords.dxt` here and `../connector/public/seo-ai-keywords.dxt`.
Then redeploy the hosted server (`cd ../connector && npx vercel --prod`)
to publish the new artifact.

## Version bumps

Bump `manifest.json` `version` (semver) for every user-visible change.
Existing installs will see an upgrade prompt on next launch.

## Signing (future)

v1 ships unsigned. To distribute via Anthropic's gallery or to avoid OS
gatekeeper friction at scale, sign the `.dxt` per the DXT spec before
publishing.
````

- [ ] **Step 2: Commit**

```bash
git add connector-dxt/README.md
git commit -m "docs(dxt): readme"
```

---

## Self-Review

**Spec coverage check (each requirement → task):**

| Spec requirement                                         | Implemented in |
| -------------------------------------------------------- | -------------- |
| Hosted MCP server on Vercel                              | Tasks 1–8      |
| Official `@modelcontextprotocol/sdk` on the server       | Task 5         |
| `@vercel/mcp-adapter` as transport wrapper               | Task 6         |
| Stateless Streamable HTTP, no Redis                      | Task 6         |
| Shared bearer token, constant-time check                 | Task 2         |
| In-memory rate limit (60/token/hr)                       | Task 3         |
| 4 tools: research_keywords, get_keyword_metrics, get_historical_metrics, health_check | Task 5 |
| Tool descriptions tuned for article-research use case    | Tasks 5, 9     |
| Service reuse: tools.ts imports keywordPlannerService    | Task 5         |
| Vercel env vars for all secrets                          | Task 8         |
| Token rotation runbook                                   | Task 13        |
| Vercel-only logging (no external store)                  | Tasks 4, 6     |
| `.dxt` Desktop Extension (one-click install)             | Tasks 9–12     |
| `.dxt` proxies to hosted endpoint; ships no credentials  | Task 10        |
| Same tool schemas in `.dxt` and hosted server (no drift) | Tasks 5, 9     |
| `.dxt` user_config prompts for shared token at install   | Task 9         |
| Web install via Settings → Custom Connector              | Task 8 Step 8, Task 14 |
| Onboarding doc shipped with the code                     | Task 14        |
| Smoke test of `.dxt` install + every tool                | Task 12        |
| Operator README with deploy + rotate + build runbooks    | Task 13        |
| Success criteria #1–#6                                   | Verified in Tasks 8, 12 |

No spec requirements left without a task.

**Placeholder scan:** No "TBD", "TODO", "implement later", or vague
"add error handling" steps. Every step contains either runnable code or
exact shell commands with expected output. The only literal placeholders
(`<PROD_URL>`, `<CONNECTOR_SHARED_TOKEN>`, `<LOCAL_TOKEN>`) are intentional —
they refer to values produced earlier in the plan, and the tasks that
produce them are explicit.

**Type consistency check:**
- `requireBearerToken(req): Response | null` — declared in Task 2, used in Task 6. Match.
- `checkRateLimit(key): RateLimitResult` — declared in Task 3, used in Task 6. Match.
- `tokenKey(header): string` — declared in Task 3, used in Task 6. Match.
- `log(level, msg, fields)` — declared in Task 4, used in Tasks 5 and 6. Match.
- `registerTools(server: McpServer): void` — declared in Task 5, used in Task 6. Match.
- `SCHEMAS` / `DESCRIPTIONS` objects — declared in Task 9, used in Task 10. Match.

No drift between tasks.
