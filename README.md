# Draft

A note-taking web app packaged as a hybrid Android app with Capacitor.

## Source of truth

**Only edit in `~/draft_app` (this repo):**

- `app.js` / `i18n.js` / `style.css` — shared logic
- `index.template.html` — shared shell (placeholders for mode-specific head/scripts)
- `capacitor.config.json` — main offline app (`com.kwiwi.draft`)
- `capacitor.config.cdn.json` — CDN app id/name (`com.kwiwi.draft.cdn`)
- `capacitor.config.cdn-local.json` — CDN + local Latin fonts (`com.kwiwi.draft.cdnlocal`)
- `capacitor.config.js` — picks one of the three JSONs from `DRAFT_EDITION`
  (Capacitor 7 has **no** `--config` flag; it only reads the root config file)

Do **not** hand-edit `~/draft` or `~/draft_app_n` for features; refresh them from here.

## Multi-target build

```bash
npm install
npm run build:all         # local + cdn + cdn-local + web
# or one target:
npm run build             # = build:local  → www/              (Capacitor offline)
npm run build:cdn         # → dist/cdn/                      (light: fonts + KaTeX from CDN)
npm run build:cdn-local   # → dist/cdn-local/                (light, but Latin fonts inside)
npm run build:web         # → dist/web/                      (Pages / browser, no native bridge)
```

| Target | Output | APK package id | Fonts | Native bridge |
|--------|--------|----------------|-------|---------------|
| `local` | `www/` | `com.kwiwi.draft` | everything vendored (offline) | yes |
| `cdn` | `dist/cdn/` | `com.kwiwi.draft.cdn` | all from Google Fonts | yes |
| `cdn-local` | `dist/cdn-local/` | `com.kwiwi.draft.cdnlocal` | Latin fonts local, Chinese from Google Fonts | yes |
| `web` | `dist/web/` | — | all from Google Fonts | no |

`index.html` at repo root is regenerated from the template when you `build:local` (convenience only).

### Editions on one branch / in one CI run

All editions build from the **same branch and the same commit**; nothing is
duplicated per edition. `.github/workflows/android.yml` runs a matrix job
(`offline`, `cdn`, `cdn-local`) and publishes one rolling release per edition:

| Release tag | APK |
|-------------|-----|
| `debug-latest` (also GitHub "Latest") | `Draft-debug-rN-sha.apk` |
| `cdn-debug-latest` | `Draft-CDN-debug-rN-sha.apk` |
| `cdn-local-debug-latest` | `Draft-CDN-Local-debug-rN-sha.apk` |

- Manifest → **Draft CDN Local** → Actions → **Android APKs** → *Run workflow* →
  `editions` = `all` / `offline` / `cdn` / `cdn-local` to build just one.
- The three APKs share one package id family and one debug key, so they install
  side by side and update in place.
- The `offline` apk filename/artifact name is unchanged, so old download links
  keep working.
- `dist/` and `www/` are gitignored: only the generated APKs travel through
  Releases, so the repo never stores four copies of the 30 MB fonts.

## Fonts (CJK local / CDN)

`fonts/app-fonts.css` declares the app fonts; which files actually ship decides
whether Chinese text comes from the package or the network.

- `local` — Chinese **and** Latin fonts in the APK (fully offline).
- `cdn` — no font files; everything from Google Fonts (~0.2 MB APK).
- `cdn-local` — Latin fonts in the APK (Cardo / Source Serif 4, ~1.5 MB), Chinese
  from Google Fonts. English text is instant and needs no network; Chinese needs
  the network once per font subset, then the WebView cache serves it.

| File | Used by | Notes |
|------|---------|-------|
| `fonts/app-fonts.css` | `local` | CJK TTFs + Cardo / Source Serif 4 |
| `fonts/app-fonts.cdn.css` | `cdn-local` (and CJK-less builds) | generated: Cardo / Source Serif 4 only |
| `fonts/latin-fonts.css` | `local` (linked, but Cardo/Source Serif 4 entries unused) | Google subsets for the editor font families |
| `fonts/latin-fonts.local.css` | `local` (generated, not linked) | TTF + system-fallback variant |

- **In the app / APK:** Latin text uses the bundled Cardo and Source Serif 4
  TTFs. Lora, Merriweather, Open Sans and Roboto only appear as *options* in the
  editor font list; their Google woff2 subsets are no longer shipped in the APK
  or committed (62 files, ~1.5 MB). `style.css` styles UI chrome with the system
  font stack, never those families.
- `latin-fonts.css` still lists all four families, so a saved fontStack keeps
  working; in the APK those four resolve through the system font (the woff2
  files it points at are simply absent — browsers fall back silently).
- `build:cdn` ships no font files at all; `build:cdn-local` ships the Latin files
  above and links **only** the CJK Google Fonts stylesheet. Neither ships the
  `latin-fonts*.css` Google files — they are not linked from those two editions.
- `npm run check:fonts` verifies the CJK TTFs are present (also runs on
  `npm install`; builds that claim to bundle CJK fail without them).
- `DRAFT_CJK_FONTS=cdn npm run build:local` makes a quick local build **without**
  the 30 MB of CJK files: `app-fonts.cdn.css` is shipped and the page links the
  Google Fonts CJK stylesheet instead (this is `cdn-local`'s normal behaviour).
- `cdn-local` is the one edition that *promises* in-package Latin fonts, so a
  missing `Cardo`/`Source Serif 4` file fails the build
  (`node scripts/check-fonts.js --strict --latin-only`).
- `node scripts/gen-cdn-fonts-css.js` / `node scripts/gen-local-latin-css.js`
  regenerate the two derived CSS files (the build does this automatically).

## Hybrid Android build (offline / main)

```bash
npm install
npm run build
npx cap add android   # first time only
npx cap sync android
cd android && ./gradlew assembleDebug
```

CDN APKs (separate app ids), from this same tree. Capacitor picks the edition
via `DRAFT_EDITION` (it has no `--config` flag):

```bash
npm run build:cdn
DRAFT_EDITION=cdn npx cap add android        # first time only
DRAFT_EDITION=cdn npx cap sync android

npm run build:cdn-local
DRAFT_EDITION=cdn-local npx cap add android  # first time only
DRAFT_EDITION=cdn-local npx cap sync android
```

`npx cap config --json` prints the effective `appId` / `webDir` if you want to
check which edition you are about to build. `DRAFT_EDITION` unset = offline.

Or push to `main`; the **Android APKs** workflow publishes one APK per edition
(`Draft-debug-rN-<sha>.apk`, `Draft-CDN-debug-rN-<sha>.apk`,
`Draft-CDN-Local-debug-rN-<sha>.apk`).

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
# Secrets text is written OUTSIDE the repo:
#   ~/.draft-signing/github-secrets.txt   (override with DRAFT_SECRETS_FILE=...)
# Keystore itself stays at .signing/draft-debug.keystore (gitignored).
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
- Never commit `.signing/` or `*.keystore`, and keep `github-secrets.txt` (store/key
  passwords) outside the repo — it holds the debug signing passwords in plaintext.
  This key is for **sideload/debug only**, not Play Store.
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
| `~/draft_app_n_local` | CDN + local Latin fonts Capacitor working copy | `npm run sync:cdn-local` |
| `~/draft` | Web / Pages working copy | `npm run sync:web` |

```bash
npm run sync:cdn         # build:cdn → ~/draft_app_n
npm run sync:cdn-local   # build:cdn-local → ~/draft_app_n_local
npm run sync:web         # build:web → ~/draft (+ dist/web for deploy)
```

Override destinations with `DRAFT_CDN_DIR`, `DRAFT_CDN_LOCAL_DIR`, `DRAFT_WEB_DIR`.
Deploy Pages from `dist/web` (or `~/draft` after sync).

## Android back button & export

- Hardware back closes overlays first, then edit → view → home, then minimizes the app.
- Export on device uses the system share sheet (Save to Files / Drive / etc.).
- **Direct export** (drawer / settings): source content — no markdown/math pass (`.txt` / `.md` / `.rtf` / `.source.html`).
- **Render Preview export**: rendered snapshot (markdown + math) as self-contained `.rendered.html` with inlined fonts/KaTeX.

## Offline assets

`npm run build` (local) vendors into `www/`:

- `vendor/marked`, `vendor/katex`, `vendor/draft-native.js`
- `fonts/` — CJK TTFs (~30 MB), Latin TTFs, and the woff2 slices still used

`build:cdn-local` vendors `vendor/draft-native.js` plus the **Latin** TTFs
(~1.5 MB); KaTeX, marked and the Chinese webfonts come from CDN.

