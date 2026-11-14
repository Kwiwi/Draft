#!/data/data/com.termux/files/usr/bin/bash
# Build browser/Pages target and refresh ~/draft (legacy web folder) if present.
set -euo pipefail
A="$(cd "$(dirname "$0")/.." && pwd)"
W="${DRAFT_WEB_DIR:-$HOME/draft}"

cd "$A"
node scripts/build-targets.js web

if [[ -d "$W" ]]; then
  cp -f "$A/dist/web/index.html" "$A/dist/web/app.js" "$A/dist/web/i18n.js" "$A/dist/web/style.css" "$W/"
  echo "Synced web edition -> $W"
else
  echo "Built dist/web only (no $W directory)."
fi
echo "Deploy folder: $A/dist/web"
