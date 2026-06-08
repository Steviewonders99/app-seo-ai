# SEO AI — Keyword Research (Desktop Extension)

A Claude Desktop Extension (`.dxt`) that exposes the keyword-research
tools from the hosted MCP server at
`https://connector-theta-ten.vercel.app/api/mcp` via a tiny stdio proxy.

This package contains **no Google Ads credentials**. Each tool call is
forwarded over HTTPS to the hosted server, which holds the real
credentials. The only secret stored on the colleague's machine is the
shared access token (held by Claude Desktop, not by us).

## Layout

- `manifest.json` — DXT v0.1 manifest. Declares the
  `user_config.shared_token` field that Claude Desktop prompts for at
  install time, and bakes the hosted `CONNECTOR_REMOTE_URL` into the
  server's env so the proxy knows where to call.
- `server/index.js` — stdio MCP server (uses
  `@modelcontextprotocol/sdk@1.26.0`) that registers the same 4 tools as
  the hosted server and proxies each call.
- `server/tool-schemas.js` — Zod schemas + tool descriptions. **Mirror
  of `connector/lib/tools.ts` `SCHEMAS`/`DESCRIPTIONS`. Keep in sync
  when tool inputs change.**
- `build.sh` — bundles into `seo-ai-keywords.dxt` and stages a copy
  into `../connector/public/` so the hosted Next app serves it.
- `icon.png` — 128×128 icon shown in the install dialog (solid color
  placeholder; replace with branded art when convenient).

## Build

```bash
./build.sh
```

Output: `seo-ai-keywords.dxt` here and a copy in
`../connector/public/seo-ai-keywords.dxt`. Then redeploy the hosted
server to publish the new artifact:

```bash
cd ../connector && npx vercel --prod
```

## Version bumps

Bump `manifest.json` `version` (semver) for every user-visible change.
Existing installs will see an upgrade prompt on next launch.

## Signing (future)

v1 ships unsigned. To distribute via Anthropic's gallery or to avoid OS
gatekeeper friction at scale, sign the `.dxt` per the DXT spec before
publishing.

## Why this is a proxy, not a real implementation

Two reasons we keep this thin:

1. **No credential sprawl** — Google Ads OAuth refresh tokens never
   leave the Vercel server. Each colleague's laptop only has the shared
   bearer token, which we can rotate centrally.

2. **One source of truth for tool behaviour** — the hosted server is
   where the real logic lives. The .dxt is a transport adapter. If you
   change a tool's behaviour, change `connector/lib/tools.ts` and
   redeploy; the .dxt will keep working without rebuild as long as the
   tool name and schema haven't changed. (If they have, rebuild and
   re-publish the .dxt.)
