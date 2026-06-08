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
