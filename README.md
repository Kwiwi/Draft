# Draft

A note-taking web app packaged as a hybrid Android app with Capacitor.

## Web app

Static frontend:

- `index.html`
- `app.js`
- `style.css`
- `i18n.js`

Open `index.html` in a browser, or serve the folder locally.

## Hybrid Android build

```bash
npm install
npm run build
npx cap add android   # first time only
npx cap sync android
cd android && ./gradlew assembleDebug
```

Or push to `main` and download the **draft-debug-apk-rN** artifact from the **Android APK** GitHub Action
(`Draft-debug-rN-<sha>.apk`).

### Re-installing a new debug build

- **“已下载过该软件，禁止覆盖”** (download blocked): phone already has the same download name.
  Delete the old APK in Downloads, or use the new run-numbered filename from CI.
- Same package id: `com.kwiwi.draft`.

### Stable debug signing (update without uninstall)

CI used to mint a **new debug key every run**, so Android blocked “update”. Fix: one long-lived
debug keystore in **GitHub Actions secrets**.

**One-time setup (on your machine):**

```bash
chmod +x scripts/generate-debug-keystore.sh
./scripts/generate-debug-keystore.sh
# Secrets text is written to .signing/github-secrets.txt (gitignored)
```

Then in GitHub → **Settings → Secrets and variables → Actions**, create:

| Secret | Value |
|--------|--------|
| `DRAFT_DEBUG_KEYSTORE_BASE64` | base64 blob from the script output |
| `DRAFT_DEBUG_STORE_PASSWORD` | from the script (default `draft-debug`) |
| `DRAFT_DEBUG_KEY_ALIAS` | from the script (default `draft`) |
| `DRAFT_DEBUG_KEY_PASSWORD` | from the script (same as store password by default) |

With GitHub CLI:

```bash
gh secret set DRAFT_DEBUG_KEYSTORE_BASE64 < <(base64 -w0 .signing/draft-debug.keystore)
gh secret set DRAFT_DEBUG_STORE_PASSWORD --body 'draft-debug'
gh secret set DRAFT_DEBUG_KEY_ALIAS --body 'draft'
gh secret set DRAFT_DEBUG_KEY_PASSWORD --body 'draft-debug'
```

**After secrets are set:** push → download new APK.

- **First** time switching to this key: still **uninstall once** (old random CI signature ≠ new one).
- **Later** builds with the same secrets: install over the top; no uninstall.
- Never commit `.signing/` or `*.keystore`. This key is for **sideload/debug only**, not Play Store.
## Requirements (local Android build)

- Node.js 22+
- Java 21
- Android SDK

## Offline assets

CDN copies are vendored under:

- `vendor/marked` — Markdown parser
- `vendor/katex` — math rendering (JS/CSS/fonts)
- `fonts/` — app typefaces (Cardo, Noto Serif HK, Source Han Serif SC as Noto Serif SC, Source Serif 4, plus Latin woff2 for Lora/Merriweather/Open Sans/Roboto)

`npm run build` copies these into `www/` for Capacitor.

## App name & icon

See [`resources/README.md`](resources/README.md) (中文小白说明).

- Name / ID: `capacitor.config.json` → `appName`, `appId`
- Icon: replace `resources/icon.png` (1024×1024), then rebuild

## Two editions

| Folder | Edition | Network |
|--------|---------|---------|
| `~/draft_app` | Offline assets vendored | Works offline |
| `~/draft_app_n` | CDN fonts/libs | Needs network for fonts/math |

## Android back button & export

- Hardware back closes overlays first, then edit → view → home, then minimizes the app.
- Export on device uses the system share sheet (Save to Files / Drive / etc.).
- **Direct export** (drawer / settings): source content — no markdown/math pass (`.txt` / `.md` / `.rtf` / `.source.html`).
- **Render Preview export**: rendered snapshot (markdown + math) as self-contained `.rendered.html` with inlined fonts/KaTeX.

## Sync CDN edition

```bash
./scripts/sync-cdn-edition.sh
```

Copies `app.js` / `i18n.js` / `style.css` / native bridge into `~/draft_app_n`.
That folder keeps its own CDN `index.html` and `com.kwiwi.draft.cdn` identity.

