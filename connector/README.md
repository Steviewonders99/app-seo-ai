# SEO AI Connector — Operator Runbook

Server-side docs for the hosted MCP connector and the `.dxt` Desktop
Extension. **Colleagues should be sent [`ONBOARDING.md`](./ONBOARDING.md)
instead.**

## What this is

A Vercel-hosted Next.js app that exposes 4 keyword-research MCP tools
backed by Google Ads Keyword Planner. Two distribution paths share one
backend:

- **Claude.ai (web)** — colleagues add a custom connector pointing at
  the hosted URL with a shared bearer token.
- **Claude Desktop** — colleagues install a `.dxt` Desktop Extension
  that spawns a tiny stdio proxy forwarding every call to the same
  hosted URL.

## Live URLs

| What                          | URL                                                                  |
| ----------------------------- | -------------------------------------------------------------------- |
| Production MCP endpoint       | `https://connector-theta-ten.vercel.app/api/mcp`                     |
| `.dxt` download link          | `https://connector-theta-ten.vercel.app/seo-ai-keywords.dxt`         |
| Vercel project dashboard      | `https://vercel.com/steven-junops-projects/connector`                |

## Repo layout

- `connector/` — this Next.js project (hosted server).
- `connector-dxt/` — the Claude Desktop Extension (proxy).

## Required env vars (set in Vercel project settings)

| Name                            | Where to get it                                                  |
| ------------------------------- | ---------------------------------------------------------------- |
| `GOOGLE_ADS_DEVELOPER_TOKEN`    | Google Ads MCC → Tools → API Center                              |
| `GOOGLE_ADS_CLIENT_ID`          | GCP OAuth 2.0 client ID                                          |
| `GOOGLE_ADS_CLIENT_SECRET`      | Same OAuth client                                                |
| `GOOGLE_ADS_REFRESH_TOKEN`      | Run `npm run get-token` in the repo root once                    |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID`  | MCC customer ID (digits only, no dashes), e.g. `4998240505`      |
| `CONNECTOR_SHARED_TOKEN`        | `openssl rand -hex 32`                                           |

All six are marked **sensitive** in Vercel (encrypted, not retrievable
after creation). To inspect: `npx vercel env ls`.

## Deploy

```bash
# Build the .dxt artifact first so it gets bundled into the deployment.
./connector-dxt/build.sh

# Then deploy the Next app (which serves both /api/mcp and /seo-ai-keywords.dxt).
cd connector
npx vercel --prod
```

For a preview build (separate URL, same code): `npx vercel`.

The Vercel CLI is already configured for this project (`.vercel/project.json`
is committed-ignored). If you need to relink: `npx vercel link --yes` from
inside `connector/`.

## Rotate the shared token

When you need to revoke access for everyone and re-issue:

```bash
# 1. Generate a new token (copy the output).
NEW_TOKEN=$(openssl rand -hex 32)
echo "$NEW_TOKEN"

# 2. Replace the env var (delete + re-add, because --force on a sensitive
#    var doesn't actually overwrite).
cd connector
npx vercel env rm CONNECTOR_SHARED_TOKEN production --yes
printf '%s' "$NEW_TOKEN" | npx vercel env add CONNECTOR_SHARED_TOKEN production --sensitive --force

# 3. Redeploy so the new value is picked up.
npx vercel --prod
```

Send `$NEW_TOKEN` to colleagues. The old token is rejected the instant
the redeploy goes live. Colleagues update their stored token:

- **Web**: edit the custom connector → paste new token.
- **Desktop (.dxt)**: Claude Desktop → Settings → Extensions →
  **SEO AI Keywords** → Configuration → paste new token.

## Build and publish a new `.dxt`

The `.dxt` artifact is **not** in git (gitignored — it's a 4–5 MB binary).
It's built fresh from source and copied into `connector/public/` by the
build script.

```bash
./connector-dxt/build.sh
cd connector && npx vercel --prod
```

That redeploy publishes the new file at
`https://connector-theta-ten.vercel.app/seo-ai-keywords.dxt`. Bump
`connector-dxt/manifest.json` `version` for each user-visible change so
existing installs see an upgrade prompt.

## Sync vendored service files

The hosted connector vendors `keywordPlannerService.js` and
`googleAdsConfig.js` from `src/services/` and `src/config/` because
Vercel only uploads files inside the project root. When you change the
upstream files:

```bash
./connector/scripts/sync-service.sh
```

The script strips dotenv from the vendored `googleAdsConfig.js` (Next
handles env loading) and re-points imports. Commit the result.

## Rate limit

60 requests/token/hour, in-memory per Vercel function instance. To raise
the limit: edit `connector/lib/rate-limit.ts` (constant `MAX_REQUESTS`).
To make it persistent across cold starts, swap the in-memory `Map` for
an Upstash Redis client (`@upstash/redis` + `@upstash/ratelimit`); the
public API of `checkRateLimit` does not need to change.

## Logs

Vercel dashboard → Project → Logs. Each tool call emits one JSON line
with `tool`, `latencyMs`, `status`, and either `keyword` or
`keywordCount`. No secrets, no full keyword lists.

## Smoke test (after any deploy)

```bash
PROD="https://connector-theta-ten.vercel.app/api/mcp"
TOKEN="<your shared token>"

curl -sS -X POST "$PROD" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"health_check","arguments":{}}}'
```

Expect `"status":"ok"` and `"missingEnvVars":[]`.

## Troubleshoot

| Symptom                                    | Cause + Fix                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `401 Unauthorized`                         | Wrong/missing bearer token. Confirm both sides have the same `CONNECTOR_SHARED_TOKEN`.       |
| `429 Too Many Requests`                    | Hit 60/hr limit. Wait, or raise the cap in `lib/rate-limit.ts`.                              |
| `500 Server misconfigured`                 | `CONNECTOR_SHARED_TOKEN` not set in the running environment.                                 |
| `health_check` returns `missingEnvVars`    | The named env var is unset in Vercel. Re-run `vercel env add` for that var.                  |
| `Google Ads API error (401)`               | OAuth refresh token expired or developer token wrong. Re-run `npm run get-token` at repo root, copy the new refresh token into Vercel. |
| `.dxt` 404 on the download URL             | The deployment lost the artifact. Re-run `./connector-dxt/build.sh && npx vercel --prod`.    |
| `.dxt` install dialog shows no token field | `manifest.json` `user_config` block missing or malformed. Re-validate against DXT spec.      |
| Next build fails: module not found         | A relative import uses `../../src/...`. Vercel only deploys files inside `connector/`. Either vendor the file or refactor.            |
