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

Ship the keyword research capability as a **proper MCP server + plugin** that:

1. Runs against Steven's existing Google Ads MCC test account
   (`4998240505`) using credentials stored server-side.
2. Works in both Claude Desktop and Claude.ai (web).
3. Requires **zero code, zero terminal, zero config-file editing** by
   colleagues. Desktop install is double-click; web install is paste-URL.
4. Is built on the official Anthropic `@modelcontextprotocol/sdk` so the
   server is a canonical MCP, reusable across transports.
5. Reuses the existing `keywordPlannerService.js` so there is exactly one
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
| Server SDK         | `@modelcontextprotocol/sdk` (official) — single source of tool definitions      |
| HTTP transport     | `@vercel/mcp-adapter` wrapping the official `McpServer` (Streamable HTTP, stateless) |
| Hosting            | Vercel Functions                                                                |
| Auth               | Shared bearer token (`Authorization: Bearer <CONNECTOR_SHARED_TOKEN>`)          |
| Desktop install    | **`.dxt` Desktop Extension** (one-click), with Settings UI as fallback          |
| Web install        | Settings → Connectors → Add custom connector (URL + token)                      |
| Tools exposed      | `research_keywords`, `get_keyword_metrics`, `get_historical_metrics`, `health_check` |
| Google Ads account | Steven's existing MCC test account (`4998240505`)                                |

## Architecture

Two deployable artifacts share one tool-definition module so the team
always sees identical tool behaviour regardless of how they installed.

```
                ┌───────────────────────────────────────────────┐
                │   connector/lib/tools.ts                       │
                │   (Canonical tool registrations built on the   │
                │    official @modelcontextprotocol/sdk)         │
                └───────────────┬───────────────────────────────┘
                                │ imported by both artifacts
        ┌───────────────────────┴──────────────────────────────────┐
        │                                                          │
        ▼                                                          ▼
┌──────────────────────────────────┐         ┌───────────────────────────────────────────────┐
│ ARTIFACT 1: Hosted MCP server    │         │ ARTIFACT 2: Claude Desktop Extension (.dxt)   │
│ connector/api/mcp.ts             │         │ connector-dxt/                                │
│                                  │         │   - manifest.json (DXT spec)                  │
│ @vercel/mcp-adapter wraps        │         │   - server/index.js (stdio MCP server using   │
│ the official McpServer.          │         │     @modelcontextprotocol/sdk; each tool      │
│                                  │         │     handler proxies HTTPS → hosted /mcp with  │
│ Auth + rate-limit middleware     │         │     the user's shared token from user_config) │
│ Handlers call keywordPlanner-    │         │                                               │
│ Service for real Google Ads.     │         │ Built into seo-ai-keywords.dxt and signed.    │
└──────────────────────────────────┘         └───────────────────────────────────────────────┘
        ▲                                                          ▲
        │ HTTPS, bearer token                                      │ user double-clicks .dxt;
        │                                                          │ Claude Desktop prompts for
        │                                                          │ bearer token at install
        │                                                          │ time via DXT user_config
        │                                                          │
┌───────┴─────────────┐                       ┌────────────────────┴───────────────────┐
│ Claude.ai (Web)     │                       │ Claude Desktop                         │
│ Settings → Add      │                       │ Double-click .dxt → install → prompted │
│ custom connector    │                       │ for token once → ready. (Settings UI   │
│ (URL + token)       │                       │ is a fallback if .dxt has issues.)     │
└─────────────────────┘                       └────────────────────────────────────────┘
                                                              │
                                                              │ proxies every tool call as
                                                              │ HTTPS POST → hosted /mcp
                                                              ▼
                                              [ hits the same Vercel function as web ]
```

Both surfaces ultimately reach the **same** hosted endpoint and the
**same** Google Ads MCC test account. The `.dxt` is a thin stdio→HTTP
proxy, not a duplicate implementation; tool schemas live once in
`connector/lib/tools.ts`.

### Why this layering

- **Official MCP SDK on the server, transport adapter on top**: registers
  tools with `McpServer` from `@modelcontextprotocol/sdk`, then hands the
  configured server to `@vercel/mcp-adapter` (which provides Vercel-flavored
  HTTP wiring). Not a fork or a re-implementation — the adapter is the
  thinnest possible bridge. This is the same SDK pattern `src/mcp-stdio.js`
  already uses.
- **Stateless Streamable HTTP** over SSE: no Redis/Upstash to provision,
  no per-session state across function cold starts. Both Claude surfaces
  accept it.
- **`.dxt` as the canonical Desktop install**: one downloadable file, one
  double-click, one token paste. No menu hunting. The DXT spec is
  Anthropic's blessed packaging format for exactly this case.
- **Separate Vercel project** rather than bolting onto the existing Express
  server: keeps the local stdio dev server (`src/mcp-stdio.js`) untouched
  and lets us deploy/rollback the connector independently.

## Tools

All four tools are defined once in `connector/lib/tools.ts` as `McpServer`
tool registrations (Zod schemas, async handlers). Behaviour is identical
to today's `src/mcp-stdio.js`; descriptions are tuned to lead with the
article-research use case so Claude picks them correctly when a colleague
writes "find keywords for an article about X."

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

### Hosted server request flow

1. Client (web custom connector OR the .dxt's proxy server) sends
   `POST /mcp` with `Authorization: Bearer <CONNECTOR_SHARED_TOKEN>`.
2. Auth middleware does a **constant-time** comparison against the env-var
   token. Mismatch → `401 Unauthorized` (no token-shape hints in the body).
3. Rate-limit middleware (see below).
4. `@vercel/mcp-adapter` dispatches to the right `McpServer` tool handler.
5. Handler calls `keywordPlannerService` using Steven's MCC test account.
6. Result streams back as a normal MCP response.

### `.dxt` proxy behaviour (Claude Desktop)

The `.dxt` ships a small stdio MCP server (built with the official SDK)
that registers the same four tools. Each tool handler:

1. Reads the bearer token from `process.env.CONNECTOR_SHARED_TOKEN`
   (which Claude Desktop injects from DXT `user_config` at install).
2. Reads the hosted URL from a bundled constant (`https://app-seo-ai-connector.vercel.app/mcp`).
3. Performs an HTTPS POST to the hosted `/mcp`, forwarding the MCP request
   verbatim and adding the `Authorization` header.
4. Streams the response back over stdio to Claude Desktop.

The proxy is intentionally dumb: it does not implement business logic.
If we add a tool to `connector/lib/tools.ts`, we re-build and re-publish
the `.dxt`, but no per-tool code lives in the DXT.

### Rate limit (v1)

- 60 keyword-tool requests per token per hour.
- In-memory per function instance (good enough for a small team).
- `health_check` is exempt.
- On exceed: `429 Too Many Requests`, `Retry-After` header.
- Documented in the README as an explicit known limit; upgrade path to
  Upstash is documented but not built.

### Rotation runbook (shipped in `connector/README.md`)

1. Generate a new token: `openssl rand -hex 32`.
2. `vercel env rm CONNECTOR_SHARED_TOKEN production`
3. `vercel env add CONNECTOR_SHARED_TOKEN production` (paste new value).
4. `vercel --prod` to redeploy.
5. Send the new token to colleagues. Old token is dead the instant the
   redeploy goes live. Colleagues update the token:
   - Web: edit the custom connector, paste new token.
   - Desktop (.dxt): reinstall the .dxt or update token in
     Settings → Extensions → SEO AI Keywords → Configuration.

### Logging

- Vercel's built-in function logs only.
- Per request: timestamp, tool name, primary keyword arg (or `"[…]"` for
  multi-keyword), latency, status.
- No PII; no full keyword-list dumps.

## Distribution & Install Paths

**Hard constraints:** no code, no terminal, no `claude_desktop_config.json`
editing, no `~/.claude/*` editing, no Node install for colleagues.

### Claude Desktop — primary path (`.dxt`, one-click)

1. Colleague clicks a link in the onboarding email/doc:
   `https://<your-domain>/seo-ai-keywords.dxt` (hosted on Vercel static
   alongside the API, or a GitHub Release asset).
2. Browser downloads `seo-ai-keywords.dxt`.
3. Double-click the file. Claude Desktop opens an install dialog
   showing name, description, requested permissions.
4. Install dialog includes a single field: **"Shared access token"**
   (declared in the DXT manifest's `user_config`). Colleague pastes the
   token Steven sent and clicks Install.
5. Done. Tools appear in Claude immediately.

### Claude Desktop — fallback path (Settings UI)

If the `.dxt` install has issues (e.g. unsigned, OS gatekeeper, internal
policy), the same Settings → Connectors → Add custom connector flow
works as a fallback against the hosted URL.

### Claude.ai (web) — only path

Settings → Connectors → Add custom connector → paste URL + token → toggle on.

### Onboarding doc shipped with the code (`connector/ONBOARDING.md`)

A one-page handout containing:

1. **For Claude Desktop**: download link for the `.dxt`, one screenshot of
   the install dialog, one-line "paste this token: …".
2. **For Claude.ai (web)**: the connector URL (copy button), the shared
   token (copy button), 6-step screenshot walkthrough.
3. A "test it" prompt example, e.g.
   *"Research keywords for an article about engine leasing for charter operators in the UK."*
4. Troubleshooting block:
   - `401` → wrong/expired token, ping Steven.
   - `429` → rate-limited, wait a bit.
   - ".dxt won't install" → use the web flow OR the Desktop fallback flow.
   - "Connector won't add (web)" → confirm URL ends in `/mcp`.

## Repo Layout

Everything new lives under `/connector` (hosted server) and
`/connector-dxt` (Desktop Extension). No changes to `src/mcp-stdio.js`
or the existing Express server.

```
connector/
  api/
    mcp.ts                # Vercel route handler:
                          #   - constructs McpServer from @modelcontextprotocol/sdk
                          #   - wires auth + rate-limit middleware
                          #   - hands the server to @vercel/mcp-adapter
  lib/
    tools.ts              # CANONICAL tool registrations (used by both artifacts).
                          # Imports ../../src/services/keywordPlannerService.js
    auth.ts               # constant-time bearer-token check
    rate-limit.ts         # in-memory sliding-window limiter
    logger.ts             # structured log helper
  public/
    seo-ai-keywords.dxt   # built artifact, copied here by the build script so
                          # https://<vercel-url>/seo-ai-keywords.dxt serves it
  package.json            # @modelcontextprotocol/sdk, @vercel/mcp-adapter, zod
  vercel.json             # function config (region, max duration)
  tsconfig.json
  README.md               # operator docs: deploy, rotate, build .dxt, troubleshoot
  ONBOARDING.md           # colleague-facing handout (above)
  .env.example            # all required vars, no values

connector-dxt/
  manifest.json           # DXT manifest:
                          #   - name, version, description, icon
                          #   - user_config.shared_token (string, required, secret)
                          #   - server: { type: "node", entry_point: "server/index.js",
                          #              mcp_config: { env: { CONNECTOR_SHARED_TOKEN:
                          #              "${user_config.shared_token}" } } }
  server/
    index.js              # stdio MCP server using @modelcontextprotocol/sdk;
                          # registers the 4 tools; each handler proxies to the
                          # hosted /mcp via fetch with the bearer token
    package.json
  icon.png
  build.sh                # zips manifest + server into seo-ai-keywords.dxt
                          # and copies it into ../connector/public/
  README.md               # how to build, version, and sign the .dxt
```

### Service reuse rules

- `connector/lib/tools.ts` imports from `../../src/services/keywordPlannerService.js`.
  A bug fix in the service benefits both the local stdio server *and* the
  hosted connector.
- `connector-dxt/server/index.js` does **not** import the service or
  Google Ads SDK. It only proxies over HTTPS. This keeps the `.dxt` small
  and means no credentials ever ship to colleagues' machines.

## Deployment Pipeline

### Hosted server (Vercel)

1. `cd connector && vercel link` — bind to a new Vercel project named
   `app-seo-ai-connector`.
2. `vercel env add` for each of the 6 env vars listed above (production
   and preview environments).
3. `vercel --prod` for the first deploy. Returns the stable production
   URL like `https://app-seo-ai-connector.vercel.app`.
4. Subsequent deploys go automatically on push to `main` once GitHub
   integration is enabled in the Vercel dashboard.

### Desktop Extension (`.dxt`)

1. `cd connector-dxt && ./build.sh` — produces `seo-ai-keywords.dxt`
   and copies it to `connector/public/seo-ai-keywords.dxt`.
2. Next `vercel --prod` deploy publishes it at
   `https://app-seo-ai-connector.vercel.app/seo-ai-keywords.dxt` so
   colleagues can download it directly from the link in the onboarding doc.
3. Version bumps update `connector-dxt/manifest.json` `version`. Old
   installs prompt to upgrade on next launch.

## Rollout Order

1. Build hosted server + deploy to Vercel **preview** URL.
2. Build `.dxt` pointing at the production URL (NOT preview — the URL is
   baked in). For preview testing, build a dev `.dxt` pointing at the
   preview URL.
3. Steven installs the dev `.dxt` on his own Claude Desktop and runs a
   sanity check: `research_keywords` for one known topic; verify monthly
   search numbers match what Steven sees in the Google Ads UI.
4. Steven also adds the preview URL via the web flow on claude.ai and
   runs the same query to confirm both surfaces work.
5. Promote hosted server to **production** URL.
6. Re-build the production `.dxt` (pointing at the production URL).
7. Send the onboarding doc to **one canary colleague**, confirm install
   + first query worked on Desktop (.dxt) and Web.
8. Send to the rest.

## Security Follow-Ups (out of scope for this spec, tracked separately)

These do not block this spec; the connector will work either way. They
should be done before relying on this in production:

- **Rotate the Google Ads refresh token** — currently committed in `.env`
  (commit `7d71eb7`) and `smithery.yaml`.
- **Remove `.env` from git history**; add to `.gitignore` if missing;
  replace with a fresh `.env.example`.
- **Rotate the Google Ads developer token** — also in committed
  `smithery.yaml`.

## Success Criteria

This is "done" when **all** of these are true:

1. A non-Steven colleague, given only the `.dxt` download link and a
   shared token, can install the Desktop Extension via double-click in
   **under 60 seconds**, with no code, no terminal, and no config-file
   edits.
2. The same colleague can run a `research_keywords` query inside Claude
   Desktop and receive real Google Ads data (not mocked, not cached)
   within ~5 seconds for a typical seed keyword.
3. The same colleague, given only the URL + token, can install the same
   capability in Claude.ai (web) via Settings → Connectors → Add custom
   connector in **under 2 minutes**.
4. Steven can rotate the shared token in under 5 minutes following the
   runbook; the old token is rejected immediately after redeploy and
   colleagues can update their stored token in-place (no reinstall).
5. A bad/missing/empty `Authorization` header to the hosted endpoint
   returns `401` and never touches the Google Ads API.
6. Tool schemas in the `.dxt` and the hosted server are byte-identical
   because they're both built from `connector/lib/tools.ts` — no risk
   of drift between install paths.
