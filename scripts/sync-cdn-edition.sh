#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
A="$(cd "$(dirname "$0")/.." && pwd)"
N="${DRAFT_CDN_DIR:-$HOME/draft_app_n}"
mkdir -p "$N/vendor" "$N/scripts" "$N/resources"
cp -f "$A/app.js" "$A/i18n.js" "$A/style.css" "$N/"
cp -f "$A/vendor/draft-native.js" "$N/vendor/"
cp -f "$A/scripts/native-entry.js" "$A/scripts/build-native-bridge.js" "$N/scripts/"
cp -f "$A/resources/icon.png" "$A/resources/splash.png" "$A/resources/README.md" "$N/resources/" 2>/dev/null || true
echo "Synced logic -> $N (keep its index.html / package.json / capacitor.config.json)"
