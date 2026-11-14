# Draft

A note-taking web app packaged as a hybrid Android app with Capacitor.

## Source of truth

**Only edit in `~/draft_app` (this repo):**

- `app.js` / `i18n.js` / `style.css` — shared logic
- `index.template.html` — shared shell (placeholders for mode-specific head/scripts)
- `capacitor.config.json` — main offline app (`com.kwiwi.draft`)
- `capacitor.config.cdn.json` — CDN app id/name (`com.kwiwi.draft.cdn`)

Do **not** hand-edit `~/draft` or `~/draft_app_n` for features; refresh them from here.

## Multi-target build

```bash
npm install
npm run build:all    # local + cdn + web
# or one target:
npm run build        # = build:local → www/  (Capacitor offline)
npm run build:cdn    # → dist/cdn/
npm run build:web    # → dist/web/  (Pages / browser, no native bridge)
```

| Target | Output | Use |
|--------|--------|-----|
| `local` | `www/` | Main Capacitor APK (vendored fonts/KaTeX) |
| `cdn` | `dist/cdn/` | Light Capacitor APK (`Draft CDN`) |
| `web` | `dist/web/` | Cloudflare Pages / static host |

`index.html` at repo root is regenerated from the template when you `build:local` (convenience only).

## Hybrid Android build (offline / main)

```bash
npm install
npm run build
npx cap add android   # first time only
npx cap sync android
cd android && ./gradlew assembleDebug
```

CDN APK (separate app id), from this same tree:

```bash
npm run build:cdn
npx cap sync android --config capacitor.config.cdn.json   # if supported by your CLI flow
# or keep using ~/draft_app_n after: npm run sync:cdn
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

## App name & icon

See [`resources/README.md`](resources/README.md) (中文小白说明).

- Name / ID: `capacitor.config.json` → `appName`, `appId`
- Icon: replace `resources/icon.png` (1024×1024), then rebuild

## Satellite folders (optional mirrors)

| Folder | Role | Refresh |
|--------|------|---------|
| `~/draft_app` | **Canonical source** + local Capacitor | edit here |
| `~/draft_app_n` | CDN Capacitor working copy | `npm run sync:cdn` |
| `~/draft` | Web / Pages working copy | `npm run sync:web` |

```bash
npm run sync:cdn   # build:cdn → ~/draft_app_n
npm run sync:web   # build:web → ~/draft  (+ dist/web for deploy)
```

Deploy Pages from `dist/web` (or `~/draft` after sync).

## Android back button & export

- Hardware back closes overlays first, then edit → view → home, then minimizes the app.
- Export on device uses the system share sheet (Save to Files / Drive / etc.).
- **Direct export** (drawer / settings): source content — no markdown/math pass (`.txt` / `.md` / `.rtf` / `.source.html`).
- **Render Preview export**: rendered snapshot (markdown + math) as self-contained `.rendered.html` with inlined fonts/KaTeX.

## Offline assets

`npm run build` (local) still vendors into `www/`:

- `vendor/marked`, `vendor/katex`, `vendor/draft-native.js`
- `fonts/`

