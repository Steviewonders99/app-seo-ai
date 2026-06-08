# Claude Keyword Research Connector — Design

**Date:** 2026-06-08
**Status:** Approved (design phase)
**Owner:** Steven Junop

## Problem

Colleagues need to do Google Ads Keyword Planner research for new articles
directly inside Claude (Desktop + Web), without each of them setting up Google
Ads API access. A working stdio MCP server already exists locally
(`src/mcp-stdio.js`) but only Steven can use it because it depends on his local
`.env` and a Node install.

## Goal

Ship a hosted MCP "custom connector" that:

1. Runs against Steven's existing Google Ads MCC test account
   (`4998240505`) using credentials stored server-side.
2. Works in both Claude Desktop and Claude.ai (web).
3. Requires zero config-file editing by colleagues — UI-only install
   (no `claude_desktop_config.json`, no `~/.claude/*`, no terminal, no Node).
4. Reuses the existing `keywordPlannerService.js` so there is exactly one
   Google Ads integration in the repo.

## Non-Goals (v1)

- No per-user API keys, OAuth, or SSO — single shared bearer token.
- No web search / web fetch tools — keyword tools only.
- No admin dashboard — Vercel logs are sufficient.
- No Smithery marketplace listing.
- No tests beyond an end-to-end smoke test against the deployed preview.
- No new "composite" tools (e.g. `article_brief`) — lean v1.

## Decisions Locked In

| Decision           | Choice                                                                          |
| ------------------ | ------------------------------------------------------------------------------- |
| Claude surfaces    | Claude Desktop + Claude.ai (web)                                                |
| Transport          | MCP Streamable HTTP, stateless (no Redis)                                       |
| Hosting            | Vercel Functions, via `@vercel/mcp-adapter`                                     |
| Auth               | Shared bearer token (`Authorization: Bearer <CONNECTOR_SHARED_TOKEN>`)          |
| Install path       | Settings → Connectors → Add custom connector (UI only, both surfaces)           |
| Tools exposed      | `research_keywords`, `get_keyword_metrics`, `get_historical_metrics`, `health_check` |
| Google Ads account | Steven's existing MCC test account (`4998240505`)                                |

## Architecture

A new Vercel project lives in this repo at `/connector` and is deployed
independently from the existing Express + stdio MCP server. The existing
local server (`src/mcp-stdio.js`) is untouched and continues to work for
Steven's own use.

```
┌────────────────────────┐      Authorization: Bearer …
│ Claude Desktop / Web   │ ───────────────────────────────────►  https://<project>.vercel.app/mcp
└────────────────────────┘                                              │
                                                                        ▼
                                                  ┌──────────────────────────────────┐
                                                  │ Vercel Function: connector/api/mcp.ts │
                                                  │   1. auth middleware (bearer)    │
                                                  │   2. rate-limit middleware       │
                                                  │   3. @vercel/mcp-adapter         │
                                                  │   4. tool handlers               │
                                                  └──────────────┬───────────────────┘
                                                                 │
                                                                 ▼
                                          ┌────────────────────────────────────────────┐
                                          │ src/services/keywordPlannerService.js      │
                                          │   (existing, unchanged — single source     │
                                          │    of truth for Google Ads integration)    │
                                          └────────────────────┬───────────────────────┘
                                                               │
                                                               ▼
                                                       Google Ads API
                                                       (MCC 4998240505)
```

### Why these choices

- **Stateless Streamable HTTP** over SSE: no Redis/Upstash to provision, no
  per-session state to track across function cold starts. Both Claude
  surfaces accept it as a custom connector. SSE only matters if we
  later need server-pushed tool progress events, which we don't for
  Keyword Planner.
- **Separate Vercel project** rather than bolting onto the existing Express
  server: `@vercel/mcp-adapter` expects Vercel-style request/response, not
  Express middleware; separating lets us deploy and roll back the connector
  without touching the local-dev server.
- **Shared bearer token** over per-user keys: smallest possible v1 with
  one-line rotation (change env var, redeploy). If team grows or we need
  per-user usage attribution, we swap to a key store later without changing
  the wire protocol.

## Tools

All four tools are thin wrappers around `keywordPlannerService`. Behaviour
is identical to today's `src/mcp-stdio.js`; only the descriptions are tuned
to lead with the article-research use case so Claude picks them correctly
when a colleague writes "find keywords for an article about X."

| Tool                     | Inputs                                                                                                    | Returns                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `research_keywords`      | `keyword` (string, required); `language` (default `"en"`); `locations` (default `[2840]`); `limit` (default `50`) | Array of keyword ideas with monthly searches, competition, low/high CPC bid estimates                |
| `get_keyword_metrics`    | `keywords` (string[]); `language`; `locations`                                                            | Metrics for the exact keywords passed (no expansion)                                                 |
| `get_historical_metrics` | `keywords` (string[]); `language`; `locations`                                                            | Forecast metrics via a temporary keyword plan                                                        |
| `health_check`           | —                                                                                                         | Server status + which env vars are present (names only, **never** values); used by Steven for triage |

## Auth & Secrets

### Server-side env vars (Vercel, encrypted)

- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GOOGLE_ADS_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`
- `GOOGLE_ADS_REFRESH_TOKEN`
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID`
- `CONNECTOR_SHARED_TOKEN` — 32-byte random hex; the only secret colleagues hold

### Request flow

1. Client sends `POST /mcp` with `Authorization: Bearer <CONNECTOR_SHARED_TOKEN>`.
2. Auth middleware does a **constant-time** comparison against the env-var
   token. Mismatch → `401 Unauthorized` (no token-shape hints in the body).
3. Rate-limit middleware (see below).
4. `@vercel/mcp-adapter` dispatches to the right tool handler.
5. Handler calls `keywordPlannerService` using Steven's MCC test account.
6. Result streams back as a normal MCP response.

### Rate limit (v1)

- 60 keyword-tool requests per token per hour.
- In-memory per function instance (good enough for a small team).
- `health_check` is exempt.
- On exceed: `429 Too Many Requests`, `Retry-After` header.
- Documented in the README as an explicit known limit to upgrade to Upstash
  if the team grows.

### Rotation runbook (shipped in `connector/README.md`)

1. Generate a new token: `openssl rand -hex 32`
2. `vercel env rm CONNECTOR_SHARED_TOKEN production`
3. `vercel env add CONNECTOR_SHARED_TOKEN production` (paste new value)
4. `vercel --prod` to redeploy.
5. Send the new token to colleagues. Old token is dead the instant the
   redeploy goes live.

### Logging

- Vercel's built-in function logs only.
- Per request: timestamp, tool name, primary keyword arg (or "[…]" if
  multi-keyword), latency, status.
- No PII; no full keyword-list dumps (keep log lines small).

## Install Path (Colleague Experience)

**Hard constraint:** colleagues never edit `claude_desktop_config.json`,
never edit `~/.claude/*`, never open a terminal, never install Node.

### Claude Desktop

1. Settings → Connectors → **Add custom connector**.
2. Paste connector URL.
3. Paste shared token.
4. Toggle on.

### Claude.ai (web)

Identical flow — Settings → Connectors → Add custom connector → URL + token.

### Onboarding doc shipped with the code (`connector/ONBOARDING.md`)

A one-page handout containing:

1. The connector URL (copy button).
2. The shared token (copy button).
3. A 6-step screenshot walkthrough for Claude Desktop.
4. A 6-step screenshot walkthrough for Claude.ai web.
5. A "test it" prompt example, e.g.
   *"Research keywords for an article about engine leasing for charter operators in the UK."*
6. Troubleshooting block:
   - `401` → wrong/expired token, ping Steven.
   - `429` → rate-limited, wait a bit.
   - "Connector won't add" → try the other surface; confirm URL ends in `/mcp`.

## Repo Layout

Everything new lives under `/connector`. No changes to `src/mcp-stdio.js`
or the existing Express server.

```
connector/
  api/
    mcp.ts                # Vercel route handler:
                          #   - imports @vercel/mcp-adapter
                          #   - wires auth + rate-limit middleware
                          #   - registers the 4 tools
  lib/
    auth.ts               # constant-time bearer-token check
    rate-limit.ts         # in-memory sliding-window limiter
    tools.ts              # tool registration; calls ../../src/services/keywordPlannerService.js
    logger.ts             # structured log helper
  package.json            # @vercel/mcp-adapter, zod
  vercel.json             # function config (region, max duration)
  tsconfig.json
  README.md               # operator docs: deploy, rotate, troubleshoot
  ONBOARDING.md           # colleague-facing handout (above)
  .env.example            # all required vars, no values
```

### Service reuse rule

`connector/lib/tools.ts` imports from `../../src/services/keywordPlannerService.js`.
A bug fix in the service benefits both the local stdio server and the
hosted connector. **Do not** duplicate the Google Ads logic inside
`/connector`.

## Deployment Pipeline

1. `cd connector && vercel link` — bind to a new Vercel project named
   `app-seo-ai-connector`.
2. `vercel env add` for each of the 6 env vars listed above (production +
   preview environments).
3. `vercel --prod` for the first deploy. Returns a stable URL like
   `https://app-seo-ai-connector.vercel.app`.
4. Subsequent deploys go automatically on push to `main` once GitHub
   integration is enabled in the Vercel dashboard.

## Rollout Order

1. Build + deploy to Vercel **preview** URL.
2. Steven adds the preview URL as a connector in his own Claude Desktop
   and runs a sanity check: `research_keywords` for one known topic,
   verify the returned monthly-search numbers match what Steven sees in
   the Google Ads UI.
3. Promote to **production** URL.
4. Send the onboarding doc to **one canary colleague**, confirm install
   + first query worked.
5. Send to the rest.

## Security Follow-Ups (out of scope for this spec but tracked)

These are flagged here so they don't get lost; they should be a separate
piece of work, not bundled into this build:

- **Rotate the Google Ads refresh token** after the production deploy.
  The current refresh token is in `.env` committed to git (commit
  `7d71eb7`) and also visible in `smithery.yaml` history.
- **Remove `.env` from git history** and add it to `.gitignore` if not
  already. Replace with a fresh `.env.example`.
- **Rotate the Google Ads developer token** (also in committed
  `smithery.yaml`).

These do not block this spec; the connector will work either way. They
should be done before relying on this in production.

## Success Criteria

This is "done" when **all** of these are true:

1. A non-Steven colleague, given only the URL and token, can install the
   connector in Claude Desktop via the UI (no file edits) in under
   2 minutes.
2. The same colleague can run a `research_keywords` query inside Claude
   and receive real Google Ads data (not mocked, not cached) within
   ~5 seconds for a typical seed keyword.
3. Steven can rotate the shared token in under 5 minutes following the
   runbook, and the old token is rejected immediately after redeploy.
4. The same install flow works in Claude.ai (web) without any change to
   the connector code.
5. A bad/missing/empty `Authorization` header returns `401` and never
   touches the Google Ads API.
