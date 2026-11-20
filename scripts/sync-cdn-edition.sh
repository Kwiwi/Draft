#!/data/data/com.termux/files/usr/bin/bash
# Build a CDN-flavoured target from draft_app (source of truth) and refresh a
# satellite working copy.
#
#   bash scripts/sync-cdn-edition.sh            # dist/cdn       → ~/draft_app_n
#   bash scripts/sync-cdn-edition.sh cdn-local  # dist/cdn-local → ~/draft_app_n_local
#
# Override the destinations with DRAFT_CDN_DIR (cdn) / DRAFT_CDN_LOCAL_DIR (cdn-local).
set -euo pipefail
A="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-cdn}"

if [[ "$TARGET" != "cdn" && "$TARGET" != "cdn-local" ]]; then
  echo "Unknown target '$TARGET'. Use: cdn | cdn-local" >&2
  exit 1
fi

if [[ "$TARGET" == "cdn-local" ]]; then
  OUT="dist/cdn-local"
  N="${DRAFT_CDN_LOCAL_DIR:-$HOME/draft_app_n_local}"
else
  OUT="dist/cdn"
  N="${DRAFT_CDN_DIR:-$HOME/draft_app_n}"
fi

cd "$A"
node scripts/build-targets.js "$TARGET"

mkdir -p "$N/www" "$N/vendor" "$N/scripts" "$N/resources"

# Logic + generated site
cp -f "$A/$OUT/index.html" "$A/$OUT/app.js" "$A/$OUT/i18n.js" "$A/$OUT/style.css" "$N/"
rm -rf "$N/www"
cp -a "$A/$OUT" "$N/www"
mkdir -p "$N/vendor"
cp -f "$A/vendor/draft-native.js" "$N/vendor/"
cp -f "$A/scripts/native-entry.js" "$A/scripts/build-native-bridge.js" "$A/scripts/build-targets.js" \
      "$A/scripts/check-fonts.js" "$A/scripts/gen-cdn-fonts-css.js" "$N/scripts/" 2>/dev/null || true
cp -f "$A/resources/icon.png" "$A/resources/splash.png" "$A/resources/README.md" "$N/resources/" 2>/dev/null || true

# Keep this edition's identity; align capacitor webDir with www (filled above)
node - "$N/capacitor.config.json" "$TARGET" <<'NODE'
const fs = require('fs');
const [p, target] = process.argv.slice(2);
const identity = target === 'cdn-local'
  ? { appId: 'com.kwiwi.draft.cdnlocal', appName: 'Draft CDN Local' }
  : { appId: 'com.kwiwi.draft.cdn', appName: 'Draft CDN' };
const j = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
// Only fill in blanks — a satellite that was renamed keeps its own name.
j.appId = j.appId || identity.appId;
j.appName = j.appName || identity.appName;
j.webDir = 'www';
j.server = j.server || { androidScheme: 'https' };
fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
NODE

echo "Synced $TARGET edition -> $N (www from $OUT; identity preserved)"
