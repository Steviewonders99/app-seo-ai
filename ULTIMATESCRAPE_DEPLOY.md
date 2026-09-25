# UltimateScrape beside SEO AI

The SEO AI API can front a separate UltimateScrape container at
`/uscrape/api/*`. Its own `/api/keywords`, `/api/serp`, and
`/api/competitors` routes stay on the Node process. The Node route accepts
only the dedicated `USCRAPE_BRIDGE_TOKEN`, enforces the OneTake path allowlist,
and sends requests to `http://127.0.0.1:8791` by default. The Python bridge
listens on loopback in the same pod.

## Deployment owner checks

1. Identify the live `onetake-seo-ai` Deployment and namespace. The June ACA
   request may be stale: Azure DevOps pipeline 3052 has a K8s deployment step
   for `onetake-seo-ai`. Inspect the current workload before applying the patch.
2. Confirm the existing SEO AI container is named `onetake-seo-ai`. If not,
   edit that name in `k8s/onetake-seo-ai-uscrape.patch.yaml` before applying.
3. Confirm the node has room for the bridge's requested 500m CPU / 2 GiB RAM,
   with limits of 2 CPU / 4 GiB. The browser tier in the bridge image can use
   substantial memory; do not reduce those limits without a live run test.
4. Create a K8s Secret named `onetake-uscrape` with keys
   `USCRAPE_BRIDGE_TOKEN`, `OPENROUTER_API_KEY`, `FEAS_DB_PROXY_SECRET`, and
   `DATABASE_URL`. Use the existing OneTake bridge token so Vercel and the
   bridge remain synchronized. `DATABASE_URL` is the Azure mirror connection
   used by the existing private extensions; platform DB access stays through
   `FEAS_DB_PROXY_URL` and `FEAS_DB_PROXY_SECRET`.
   The patch excludes `gateway_ext.py`, whose startup hook creates DB tables;
   the OneTake page does not use that gateway route.
5. Use an immutable bridge image digest. The patch currently pins the digest
   behind ACR `uscrape-bridge:main-Aug27-269969c3` as checked on 25 September.
   The SEO AI image must include the `/uscrape` route from this branch.

The patch's `emptyDir` is intentionally an immediate recovery configuration:
run history and graph changes vanish on pod replacement. Its init container
copies baked-in seed data at startup. Replace `emptyDir` with a persistent
volume claim before relying on run history across rollouts.

## Apply and verify

The deployment owner should inspect the existing Deployment JSON and server
side dry-run the strategic patch before any live change. Steven's per-step
approval is required for the K8s change and the later Vercel production change.

```bash
kubectl -n <namespace> get deployment onetake-seo-ai -o json
kubectl -n <namespace> patch deployment onetake-seo-ai \
  --type=strategic --patch-file=k8s/onetake-seo-ai-uscrape.patch.yaml \
  --dry-run=server -o yaml
```

After approval, apply the same patch without `--dry-run=server -o yaml`, then
wait for rollout. Check SEO AI's `/health` and an authenticated keyword API
request. Check the new research path without and with the existing bridge
token: unauthenticated must return 401; authenticated `/uscrape/api/health`
must return 200. Also check `/uscrape/api/doctor`, a real research run,
feasibility, and a binary export.

Only after those checks, set OneTake production
`ULTIMATESCRAPE_BRIDGE_URL=https://onetake-seo-ai.oneforma.com/uscrape`,
deploy OneTake from `main`, and verify the page. Its existing API proxy appends
`/api/<path>`, so no OneTake code change is needed for this URL.

If the bridge causes SEO AI errors or resource pressure, revert the Deployment
to its saved prior revision and restore the prior Vercel variable value. The
SEO AI Node route fails closed when `USCRAPE_BRIDGE_TOKEN` is absent and
returns 502 when the sidecar is unavailable.
