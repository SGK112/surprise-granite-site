#!/usr/bin/env bash
# Deploy the shopify-retire Worker to store.surprisegranite.com.
#
# Rebuild first if the site's product pages changed:
#   node scripts/build-shopify-retire-worker.js --write
#
# Needs CF_DEPLOY_TOKEN in ~/.env (CF_TOKEN is dead).
set -euo pipefail

ACCOUNT=6177928feb5572d4763161ac6a30cafc
ZONE=b966b55f41b17d3628175f257cc818b7
SCRIPT_NAME=shopify-retire
WORKER="$(cd "$(dirname "$0")" && pwd)/shopify-retire-worker.js"

CF_DEPLOY_TOKEN=${CF_DEPLOY_TOKEN:-$(grep -E '^CF_DEPLOY_TOKEN=' "$HOME/.env" | head -1 | cut -d= -f2- | tr -d '"'"'"' ')}
[ -n "$CF_DEPLOY_TOKEN" ] || { echo "CF_DEPLOY_TOKEN not found in ~/.env"; exit 1; }

node --check <(sed 's/^export default/const _default =/' "$WORKER") 2>/dev/null || \
  node --check "${WORKER%.js}.mjs" 2>/dev/null || true

echo "Uploading $(du -h "$WORKER" | cut -f1) worker..."
curl -sS -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/workers/scripts/$SCRIPT_NAME" \
  -H "Authorization: Bearer $CF_DEPLOY_TOKEN" \
  -F 'metadata={"main_module":"worker.js","compatibility_date":"2024-11-01"};type=application/json' \
  -F "worker.js=@$WORKER;filename=worker.js;type=application/javascript+module" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print("success:", d.get("success"), d.get("errors") or "")'

# Cloudflare Redirect Rules run BEFORE Workers. If a blanket rule for this host is ever
# re-enabled it silently pre-empts everything the Worker does — this is the check for that.
echo "Verifying (410 on a feed means the Worker is live, 301 means something pre-empted it):"
for u in \
  "https://store.surprisegranite.com/collections/all.atom" \
  "https://store.surprisegranite.com/collections/single-bowl-sinks" \
  "https://store.surprisegranite.com/products/black-hadyn-matteshell-vessel-bathroom-sink" \
  "https://store.surprisegranite.com/products/definitely-not-a-real-handle" \
  "https://store.surprisegranite.com/"; do
  printf '  %-78s ' "${u#https://store.surprisegranite.com}"
  curl -sI --max-time 15 "$u" | awk 'BEGIN{ORS=" "} /^HTTP|^location/{print}' | tr -d '\r'
  echo
done
