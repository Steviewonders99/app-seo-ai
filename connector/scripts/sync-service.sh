#!/usr/bin/env bash
# Sync the vendored Google Ads service files from the repo's src/ tree
# into connector/lib/. Run this whenever you change the upstream service.
#
# Why vendored: Vercel only uploads files inside the project root
# (connector/), so cross-directory imports from ../../src/services/* fail
# at build time. Keeping a vendored copy is the simplest workaround.

set -euo pipefail

CONNECTOR_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$CONNECTOR_DIR/.." && pwd)"

SRC_SERVICE="$REPO_ROOT/src/services/keywordPlannerService.js"
SRC_CONFIG="$REPO_ROOT/src/config/googleAdsConfig.js"

DST_SERVICE="$CONNECTOR_DIR/lib/keywordPlannerService.js"
DST_CONFIG="$CONNECTOR_DIR/lib/googleAdsConfig.js"

cp "$SRC_SERVICE" "$DST_SERVICE"
cp "$SRC_CONFIG" "$DST_CONFIG"

# The vendored copies need two edits that the upstream files don't:
# 1. googleAdsConfig.js drops dotenv (Next handles env loading).
# 2. keywordPlannerService.js imports config from ./ instead of ../config/.
# Apply both edits in place.
sed -i.bak "s|from '../config/googleAdsConfig.js'|from './googleAdsConfig.js'|" "$DST_SERVICE"
rm "$DST_SERVICE.bak"

# For googleAdsConfig.js, replace the dotenv-loading preamble with a comment.
python3 - <<PY
from pathlib import Path
p = Path("$DST_CONFIG")
content = p.read_text()
preamble_marker = "// Google Ads API configuration"
idx = content.find(preamble_marker)
if idx < 0:
    raise SystemExit("Could not find marker in $DST_CONFIG — manual edit needed")
header = (
    "// Google Ads API configuration.\n"
    "// Env vars are injected by Vercel (production) and by Next.js .env.local (dev).\n"
    "// dotenv is intentionally not used here — Next handles env loading.\n"
)
p.write_text(header + content[idx + len(preamble_marker):])
PY

echo "Synced:"
echo "  $SRC_SERVICE -> $DST_SERVICE"
echo "  $SRC_CONFIG  -> $DST_CONFIG (dotenv stripped)"
