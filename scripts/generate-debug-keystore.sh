#!/data/data/com.termux/files/usr/bin/bash
# Generate a stable debug keystore for CI over-the-air updates (same signature every build).
# Does NOT commit the keystore — prints values to paste into GitHub Secrets.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${ROOT}/.signing"
KS="${OUT_DIR}/draft-debug.keystore"
PASS="${DRAFT_DEBUG_STORE_PASSWORD:-draft-debug}"
ALIAS="${DRAFT_DEBUG_KEY_ALIAS:-draft}"
KEYPASS="${DRAFT_DEBUG_KEY_PASSWORD:-$PASS}"
VALIDITY_DAYS="${DRAFT_KEY_VALIDITY_DAYS:-10000}"

mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"

if [[ -f "$KS" ]]; then
  echo "Keystore already exists: $KS"
  echo "Delete it first if you want a brand-new key (would force one uninstall on devices)."
else
  keytool -genkeypair \
    -v \
    -keystore "$KS" \
    -storetype JKS \
    -keyalg RSA \
    -keysize 2048 \
    -validity "$VALIDITY_DAYS" \
    -alias "$ALIAS" \
    -storepass "$PASS" \
    -keypass "$KEYPASS" \
    -dname "CN=Draft Debug, OU=Dev, O=Kwiwi, L=Local, ST=NA, C=US"
  chmod 600 "$KS"
  echo "Created $KS"
fi

B64="$(base64 -w0 "$KS" 2>/dev/null || base64 "$KS" | tr -d '\n')"
# Secrets text goes OUTSIDE the repo by default; override with DRAFT_SECRETS_FILE.
META="${DRAFT_SECRETS_FILE:-$HOME/.draft-signing/github-secrets.txt}"
mkdir -p "$(dirname "$META")"
{
  echo "# Paste these into GitHub → Settings → Secrets and variables → Actions"
  echo "# Repo secrets (names must match exactly):"
  echo
  echo "DRAFT_DEBUG_KEYSTORE_BASE64="
  echo "$B64"
  echo
  echo "DRAFT_DEBUG_STORE_PASSWORD=$PASS"
  echo "DRAFT_DEBUG_KEY_ALIAS=$ALIAS"
  echo "DRAFT_DEBUG_KEY_PASSWORD=$KEYPASS"
  echo
  echo "# Or with GitHub CLI (from this machine, logged in):"
  echo "#   gh secret set DRAFT_DEBUG_KEYSTORE_BASE64 < <(base64 -w0 \"$KS\" 2>/dev/null || base64 \"$KS\" | tr -d '\\n')"
  echo "#   gh secret set DRAFT_DEBUG_STORE_PASSWORD --body '$PASS'"
  echo "#   gh secret set DRAFT_DEBUG_KEY_ALIAS --body '$ALIAS'"
  echo "#   gh secret set DRAFT_DEBUG_KEY_PASSWORD --body '$KEYPASS'"
} > "$META"
chmod 600 "$META"

echo
echo "Wrote secret helper → $META"
echo "Fingerprint:"
keytool -list -v -keystore "$KS" -storepass "$PASS" -alias "$ALIAS" 2>/dev/null \
  | grep -E "Alias name|SHA1:|SHA256:" || true
echo
echo "Next: add the four secrets on GitHub, then push. See README (Stable debug signing)."
