# Deploying onetake-seo-ai to Azure Container Apps

This service backs the OneTake Content Hub blog generation pipeline. The Next.js
app at `onetake.oneforma.com` calls it for keyword research, search volumes, and
competitive analysis during AI blog drafting.

## Image

`novacert.azurecr.io/onetake-seo-ai:<tag>` — built from `Dockerfile.aca`,
multi-stage `node:20-alpine`, runs as non-root user `app:app` under `tini`.

## Local production build

```bash
docker buildx build --platform linux/amd64 \
  -f Dockerfile.aca \
  -t novacert.azurecr.io/onetake-seo-ai:dev \
  --load .

docker run --rm -p 3000:3000 \
  -e SEO_AI_API_KEY=local-dev-key \
  -e GOOGLE_ADS_DEVELOPER_TOKEN=... \
  -e GOOGLE_ADS_CLIENT_ID=... \
  -e GOOGLE_ADS_CLIENT_SECRET=... \
  -e GOOGLE_ADS_REFRESH_TOKEN=... \
  -e GOOGLE_ADS_LOGIN_CUSTOMER_ID=... \
  novacert.azurecr.io/onetake-seo-ai:dev

curl -H "Authorization: Bearer local-dev-key" \
  'http://localhost:3000/api/keywords/ideas?keyword=data+labeling&language=en&locations=%5B2840%5D'
```

## CI/CD

`.github/workflows/deploy-aca.yml` runs on every push to `main` that touches
`src/`, `package*.json`, or the Dockerfile. It:

1. Builds linux/amd64 with buildx
2. Pushes `:latest` + `:<git-sha>` to `novacert.azurecr.io`
3. (Optional) Restarts the ACA revision when `ACA_AUTO_RESTART` is set

### Required GitHub repo secrets

- `ACR_USERNAME` — `novacert` ACR admin user
- `ACR_PASSWORD` — `novacert` ACR admin password

### Optional secrets (for auto-restart)

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

### Optional repo variables

- `ACA_AUTO_RESTART=true`
- `ACA_RESOURCE_GROUP=<rg>`

## Authentication

Production sends `Authorization: Bearer <SEO_AI_API_KEY>` on every `/api/*`
request. The middleware in `src/middleware/auth.js` enforces it when
`SEO_AI_API_KEY` is set; otherwise the service is open (dev mode).

`/health` + `/api-docs` are never gated — ACA's healthcheck and on-call humans
need them open.

## Cost expectation

0.5 vCPU / 1 GiB, 1–3 replicas, mostly idle. Under $25/mo on Azure pricing.
Google Ads API itself is free at our usage volumes.
