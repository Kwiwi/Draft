#!/data/data/com.termux/files/usr/bin/bash
# Build CDN target from draft_app (source of truth) and refresh ~/draft_app_n.
set -euo pipefail
A="$(cd "$(dirname "$0")/.." && pwd)"
N="${DRAFT_CDN_DIR:-$HOME/draft_app_n}"

cd "$A"
node scripts/build-targets.js cdn

mkdir -p "$N/www" "$N/vendor" "$N/scripts" "$N/resources"

# Logic + generated CDN site
cp -f "$A/dist/cdn/index.html" "$A/dist/cdn/app.js" "$A/dist/cdn/i18n.js" "$A/dist/cdn/style.css" "$N/"
rm -rf "$N/www"
cp -a "$A/dist/cdn" "$N/www"
mkdir -p "$N/vendor"
cp -f "$A/vendor/draft-native.js" "$N/vendor/"
cp -f "$A/scripts/native-entry.js" "$A/scripts/build-native-bridge.js" "$A/scripts/build-targets.js" "$N/scripts/" 2>/dev/null || true
cp -f "$A/resources/icon.png" "$A/resources/splash.png" "$A/resources/README.md" "$N/resources/" 2>/dev/null || true

# Keep CDN identity; align capacitor webDir with www (filled above)
if [[ -f "$N/capacitor.config.json" ]]; then
  node -e "
    const fs=require('fs');
    const p=process.argv[1];
    const j=JSON.parse(fs.readFileSync(p,'utf8'));
    j.appId=j.appId||'com.kwiwi.draft.cdn';
    j.appName=j.appName||'Draft CDN';
    j.webDir='www';
    j.server=j.server||{androidScheme:'https'};
    fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n');
  " "$N/capacitor.config.json"
fi

echo "Synced CDN edition -> $N (www from dist/cdn; identity preserved)"
