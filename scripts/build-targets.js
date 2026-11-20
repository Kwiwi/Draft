#!/usr/bin/env node
/**
 * Multi-target web build from one source tree (draft_app).
 *
 * Targets:
 *   local     — Capacitor offline APK (www/), all fonts local
 *   cdn       — Capacitor light APK (dist/cdn/), fonts via Google Fonts
 *   cdn-local — Capacitor light APK (dist/cdn-local/), Latin fonts local, CJK via CDN
 *   web       — Browser / Pages (dist/web/), no native bridge
 *
 * Usage:
 *   node scripts/build-targets.js            # all
 *   node scripts/build-targets.js local cdn
 *   DRAFT_ASSET_VERSION=0.9.17 node scripts/build-targets.js web
 *
 * CJK toggle: DRAFT_CJK_FONTS=local|cdn (default local) overrides whether the
 * Noto Serif HK / Noto Serif SC (Source Han Serif SC) files ship with the build;
 * `local` and `cdn-local` both honour it.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE = path.join(ROOT, 'index.template.html');
const ASSET_VERSION = process.env.DRAFT_ASSET_VERSION || '0.9.17';

// Latin webfonts (Cardo, Lora, Merriweather, Open Sans, Roboto, Source Serif 4)
const GOOGLE_FONTS_LATIN_FAMILIES = [
  'Cardo:ital,wght@0,400;0,700;1,400',
  'Lora:ital,wght@0,400;0,700;1,400',
  'Merriweather:ital,wght@0,400;0,700;1,400',
  'Open+Sans:ital,wght@0,400;0,700;1,400',
  'Roboto:ital,wght@0,400;0,500;0,700;1,400',
  'Source+Serif+4:opsz,wght@8..60,400;8..60,700'
];
const GOOGLE_FONTS_CJK_FAMILIES = ['Noto+Serif+HK:wght@400;700', 'Noto+Serif+SC:wght@400;700'];

function googleFontsHref(families) {
  return `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join('&')}&display=swap`;
}

const GOOGLE_FONTS_LATIN = googleFontsHref(GOOGLE_FONTS_LATIN_FAMILIES);
const GOOGLE_FONTS_CJK = googleFontsHref(GOOGLE_FONTS_CJK_FAMILIES);
// Full CDN build: one request for everything.
const GOOGLE_FONTS = googleFontsHref([...GOOGLE_FONTS_LATIN_FAMILIES, ...GOOGLE_FONTS_CJK_FAMILIES]);
const KATEX_CDN = 'https://cdn.jsdelivr.net/npm/katex@0.19.1/dist';
const MARKED_CDN = 'https://cdn.jsdelivr.net/npm/marked/lib/marked.umd.js';

// Which font files ship inside the package.
const CJK_MODE = (process.env.DRAFT_CJK_FONTS || 'local').toLowerCase() === 'cdn' ? 'cdn' : 'local';
// Only ship the CJK files that CSS actually points at (app-fonts.css).
const LOCAL_FONT_FILES = [
  'app-fonts.css',
  'latin-fonts.css',
  'Cardo-Regular.ttf',
  'SourceSerif4-Regular.ttf',
  'SourceSerif4-Bold.ttf',
  'SourceSerif4-Italic.ttf',
  'SourceSerif4-BoldItalic.ttf'
];
const LOCAL_CJK_FONT_FILES = ['NotoSerifHK-Variable.ttf', 'SourceHanSerifSC-Regular.ttf'];

// Files listed under FONT_OVERRIDES replace the source copy in a target
// (CJK-less CSS, or the offline latin-fonts.css with TTF-backed families).
const FONT_OVERRIDES = {
  'fonts/app-fonts.css': 'fonts/app-fonts.cdn.css', // when CJK is not bundled
  'fonts/latin-fonts.css': 'fonts/latin-fonts.local.css' // full-offline build
};


const TARGETS = {
  local: {
    title: 'Draft',
    assetMode: 'local',
    cjk: 'local',
    outDir: 'www',
    headMode: `  <!-- Local fonts + KaTeX (offline-friendly). -->
  <script>window.DRAFT_ASSET_MODE = 'local'; window.DRAFT_CJK_FONTS = '{{CJK}}';</script>`,
    headAssets: `  <link rel="stylesheet" href="fonts/app-fonts.css">
  <link rel="stylesheet" href="fonts/latin-fonts.css">
  <link rel="stylesheet" href="vendor/katex/katex.min.css">
  <link rel="stylesheet" href="style.css?v=${ASSET_VERSION}">`,
    bodyScripts: `  <!-- 引用 JS -->
  <script src="vendor/draft-native.js"></script>
  <script src="vendor/marked/marked.umd.js"></script>
  <script src="vendor/katex/katex.min.js"></script>
  <script src="vendor/katex/auto-render.min.js"></script>
  <script src="i18n.js?v=${ASSET_VERSION}"></script>
  <script src="app.js?v=${ASSET_VERSION}"></script>`,
    copyLogic: true,
    copyNative: true,
    copyVendorFull: true,
    copyFonts: 'local',
    // Full offline package: every font file travels inside the APK.
    bundleAllFonts: true,
    writeRootIndex: true
  },
  cdn: {
    title: 'Draft CDN',
    assetMode: 'cdn',
    cjk: 'cdn',
    outDir: 'dist/cdn',
    headMode: `  <!-- CDN fonts + KaTeX (smaller package; needs network). -->
  <script>window.DRAFT_ASSET_MODE = 'cdn'; window.DRAFT_CJK_FONTS = '{{CJK}}';</script>`,
    headAssets: `  <link href="${GOOGLE_FONTS}" rel="stylesheet">
  <link rel="stylesheet" href="${KATEX_CDN}/katex.min.css">
  <link rel="stylesheet" href="style.css?v=${ASSET_VERSION}">`,
    bodyScripts: `  <!-- 引用 JS -->
  <script src="vendor/draft-native.js"></script>
  <script src="${MARKED_CDN}"></script>
  <script src="${KATEX_CDN}/katex.min.js"></script>
  <script src="${KATEX_CDN}/contrib/auto-render.min.js"></script>
  <script src="i18n.js?v=${ASSET_VERSION}"></script>
  <script src="app.js?v=${ASSET_VERSION}"></script>`,
    copyLogic: true,
    copyNative: true,
    copyVendorFull: false,
    copyFonts: 'cdn'
  },
  // Light package (CDN KaTeX/marked): Latin fonts ship inside the APK so English
  // text is instant/offline and never re-downloaded; Chinese fonts come from
  // Google Fonts (~30 MB would otherwise be baked into the APK).
  'cdn-local': {
    title: 'Draft CDN Local',
    assetMode: 'cdn',
    cjk: 'cdn',
    outDir: 'dist/cdn-local',
    headMode: `  <!-- CDN KaTeX + CDN CJK fonts, local Latin fonts. -->
  <script>window.DRAFT_ASSET_MODE = 'cdn'; window.DRAFT_CJK_FONTS = '{{CJK}}';</script>`,
    headAssets: `  <link rel="stylesheet" href="fonts/app-fonts.css">
  <link rel="stylesheet" href="fonts/latin-fonts.css">
  <link href="${GOOGLE_FONTS_CJK}" rel="stylesheet">
  <link rel="stylesheet" href="${KATEX_CDN}/katex.min.css">
  <link rel="stylesheet" href="style.css?v=${ASSET_VERSION}">`,
    bodyScripts: `  <!-- 引用 JS -->
  <script src="vendor/draft-native.js"></script>
  <script src="${MARKED_CDN}"></script>
  <script src="${KATEX_CDN}/katex.min.js"></script>
  <script src="${KATEX_CDN}/contrib/auto-render.min.js"></script>
  <script src="i18n.js?v=${ASSET_VERSION}"></script>
  <script src="app.js?v=${ASSET_VERSION}"></script>`,
    copyLogic: true,
    copyNative: true,
    copyVendorFull: false,
    copyFonts: 'local',
    // Latin TTFs are the whole point of this edition: never drop them.
    forceLatinFonts: true
  },
  web: {
    title: 'Draft',
    assetMode: 'cdn',
    cjk: 'cdn',
    outDir: 'dist/web',
    headMode: `  <!-- Web / Pages: CDN assets, no native bridge. -->
  <script>window.DRAFT_ASSET_MODE = 'cdn'; window.DRAFT_CJK_FONTS = '{{CJK}}';</script>`,
    headAssets: `  <link href="${GOOGLE_FONTS}" rel="stylesheet">
  <link rel="stylesheet" href="${KATEX_CDN}/katex.min.css">
  <link rel="stylesheet" href="style.css?v=${ASSET_VERSION}">`,
    bodyScripts: `  <!-- 引用 JS -->
  <script src="${MARKED_CDN}"></script>
  <script src="${KATEX_CDN}/katex.min.js"></script>
  <script src="${KATEX_CDN}/contrib/auto-render.min.js"></script>
  <script src="i18n.js?v=${ASSET_VERSION}"></script>
  <script src="app.js?v=${ASSET_VERSION}"></script>`,
    copyLogic: true,
    copyNative: false,
    copyVendorFull: false,
    copyFonts: 'cdn'
  }
};

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyFile(src, dest) {
  mkdirp(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  fs.cpSync(src, dest, { recursive: true });
}

// A target that normally bundles CJK fonts can be downgraded with
// DRAFT_CJK_FONTS=cdn (e.g. a quick test build without the 30 MB of TTFs).
// Targets whose CJK comes from Google Fonts always report 'cdn'.
function effectiveCjk(target) {
  if (target.cjk !== 'local') return target.cjk;
  return CJK_MODE === 'cdn' ? 'cdn' : 'local';
}

// Copy only the font files a target actually references.
function copyFonts(target, out) {
  if (target.copyFonts !== 'local') return [];
  const cjkLocal = effectiveCjk(target) === 'local';
  const overrides = {};
  // app-fonts.css registers the CJK TTFs, so swap in the CJK-less variant
  // whenever those files are not shipped with this build.
  if (!cjkLocal) overrides['fonts/app-fonts.css'] = FONT_OVERRIDES['fonts/app-fonts.css'];
  if (target.bundleAllFonts) overrides['fonts/latin-fonts.css'] = FONT_OVERRIDES['fonts/latin-fonts.css'];

  const files = cjkLocal
    ? [...LOCAL_FONT_FILES, ...LOCAL_CJK_FONT_FILES]
    : [...LOCAL_FONT_FILES];
  for (const f of files) {
    const rel = overrides[`fonts/${f}`] || `fonts/${f}`;
    copyFile(path.join(ROOT, rel), path.join(out, 'fonts', f));
  }
  return files;
}

function renderHtml(target) {
  let html = fs.readFileSync(TEMPLATE, 'utf8');
  const map = {
    '{{TITLE}}': target.title,
    '{{HEAD_MODE}}': target.headMode,
    '{{HEAD_ASSETS}}': target.headAssets,
    '{{BODY_SCRIPTS}}': target.bodyScripts,
    '{{CJK}}': effectiveCjk(target)
  };
  for (const [k, v] of Object.entries(map)) {
    if (!html.includes(k)) throw new Error(`Template missing ${k}`);
    html = html.split(k).join(v);
  }
  if (html.includes('{{')) {
    const left = html.match(/\{\{[^}]+\}\}/g);
    throw new Error(`Unreplaced placeholders: ${left && left.join(', ')}`);
  }
  return html;
}

function buildNativeBridge() {
  execSync('node scripts/build-native-bridge.js', { cwd: ROOT, stdio: 'inherit' });
}

function buildOne(name) {
  const target = TARGETS[name];
  if (!target) throw new Error(`Unknown target: ${name}`);
  const out = path.join(ROOT, target.outDir);
  console.log(`\n→ building ${name} → ${target.outDir}/`);
  rmrf(out);
  mkdirp(out);

  fs.writeFileSync(path.join(out, 'index.html'), renderHtml(target), 'utf8');

  if (target.copyLogic) {
    for (const f of ['app.js', 'i18n.js', 'style.css']) {
      copyFile(path.join(ROOT, f), path.join(out, f));
    }
  }

  if (target.copyNative || target.copyVendorFull) {
    mkdirp(path.join(out, 'vendor'));
  }
  if (target.copyNative) {
    copyFile(
      path.join(ROOT, 'vendor/draft-native.js'),
      path.join(out, 'vendor/draft-native.js')
    );
  }
  if (target.copyVendorFull) {
    copyDir(path.join(ROOT, 'vendor'), path.join(out, 'vendor'));
  }
  const fontFiles = copyFonts(target, out);
  if (fontFiles.length) console.log(`  fonts: ${fontFiles.length} local file(s), CJK=${effectiveCjk(target)}`);
  if (target.forceLatinFonts && effectiveCjk(target) !== 'local') {
    console.log(`  note: Latin fonts bundled, CJK from Google Fonts (this edition by design)`);
  }

  // Convenience: root index.html mirrors local (optional open-in-browser of source tree is discouraged)
  if (target.writeRootIndex) {
    fs.writeFileSync(path.join(ROOT, 'index.html'), renderHtml(target), 'utf8');
  }

  console.log(`  ok ${name} (mode=${target.assetMode}, v=${ASSET_VERSION})`);
}

// The Capacitor Android project is generated (not committed), so the custom
// native plugins are copied in after `npx cap add android` has run. Controlled by
// DRAFT_ANDROID_DIR (set in CI); silently skipped when the project is absent.
function installNativePlugins(names) {
  const androidDir = process.env.DRAFT_ANDROID_DIR;
  if (!androidDir || !fs.existsSync(androidDir)) return;
  const appId = process.env.DRAFT_APP_ID || 'com.kwiwi.draft';
  // The Print plugin is only referenced by the offline (fully local) edition.
  if (!names.includes('local') && !names.includes('offline')) return;
  const src = path.join(ROOT, 'android-plugin/PrintPlugin.kt');
  const dest = path.join(androidDir, 'app/src/main/java', ...appId.split('.'));
  if (!fs.existsSync(src)) return;
  mkdirp(dest);
  fs.copyFileSync(src, path.join(dest, 'PrintPlugin.kt'));
  console.log(`  native plugin: PrintPlugin.kt → ${path.relative(ROOT, dest)}`);
}

function main() {
  if (!fs.existsSync(TEMPLATE)) {
    console.error('Missing index.template.html');
    process.exit(1);
  }

  let names = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  if (names.length === 0) names = ['local', 'cdn', 'cdn-local', 'web'];
  for (const n of names) {
    if (!TARGETS[n]) {
      console.error(`Unknown target "${n}". Use: ${Object.keys(TARGETS).join(' | ')}`);
      process.exit(1);
    }
  }

  const needNative = names.some((n) => TARGETS[n].copyNative);
  if (needNative) buildNativeBridge();

  installNativePlugins(names);

  // Refuse to ship a build that promises local fonts it cannot find.
  const needsLatin = names.some((n) => TARGETS[n].forceLatinFonts);
  const needsCjk = names.some((n) => TARGETS[n].copyFonts === 'local' && effectiveCjk(TARGETS[n]) === 'local');
  if (needsLatin || needsCjk) {
    const args = ['node', 'scripts/check-fonts.js', '--strict'];
    if (!needsCjk) args.push('--latin-only');
    execSync(args.join(' '), { cwd: ROOT, stdio: 'inherit' });
  }
  execSync('node scripts/gen-cdn-fonts-css.js', { cwd: ROOT, stdio: 'inherit' });
  execSync('node scripts/gen-local-latin-css.js', { cwd: ROOT, stdio: 'inherit' });

  for (const n of names) buildOne(n);
  console.log('\nDone.');
}

main();
