#!/usr/bin/env node
/**
 * Multi-target web build from one source tree (draft_app).
 *
 * Targets:
 *   local — Capacitor offline APK (www/)
 *   cdn   — Capacitor light APK (dist/cdn/)
 *   web   — Browser / Pages (dist/web/), no native bridge
 *
 * Usage:
 *   node scripts/build-targets.js            # all
 *   node scripts/build-targets.js local cdn
 *   DRAFT_ASSET_VERSION=0.9.17 node scripts/build-targets.js web
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE = path.join(ROOT, 'index.template.html');
const ASSET_VERSION = process.env.DRAFT_ASSET_VERSION || '0.9.17';

const GOOGLE_FONTS =
  'https://fonts.googleapis.com/css2?family=Cardo:ital,wght@0,400;0,700;1,400&family=Lora:ital,wght@0,400;0,700;1,400&family=Merriweather:ital,wght@0,400;0,700;1,400&family=Noto+Serif+HK:wght@400;700&family=Noto+Serif+SC:wght@400;700&family=Open+Sans:ital,wght@0,400;0,700;1,400&family=Roboto:ital,wght@0,400;0,500;0,700;1,400&family=Source+Serif+4:opsz,wght@8..60,400;8..60,700&display=swap';
const KATEX_CDN = 'https://cdn.jsdelivr.net/npm/katex@0.19.1/dist';
const MARKED_CDN = 'https://cdn.jsdelivr.net/npm/marked/lib/marked.umd.js';

const TARGETS = {
  local: {
    title: 'Draft',
    assetMode: 'local',
    outDir: 'www',
    headMode: `  <!-- Local fonts + KaTeX (offline-friendly). -->
  <script>window.DRAFT_ASSET_MODE = 'local';</script>`,
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
    copyFonts: true
  },
  cdn: {
    title: 'Draft CDN',
    assetMode: 'cdn',
    outDir: 'dist/cdn',
    headMode: `  <!-- CDN fonts + KaTeX (smaller package; needs network). -->
  <script>window.DRAFT_ASSET_MODE = 'cdn';</script>`,
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
    copyFonts: false
  },
  web: {
    title: 'Draft',
    assetMode: 'cdn',
    outDir: 'dist/web',
    headMode: `  <!-- Web / Pages: CDN assets, no native bridge. -->
  <script>window.DRAFT_ASSET_MODE = 'cdn';</script>`,
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
    copyFonts: false
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

function renderHtml(target) {
  let html = fs.readFileSync(TEMPLATE, 'utf8');
  const map = {
    '{{TITLE}}': target.title,
    '{{HEAD_MODE}}': target.headMode,
    '{{HEAD_ASSETS}}': target.headAssets,
    '{{BODY_SCRIPTS}}': target.bodyScripts
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
  if (target.copyFonts) {
    copyDir(path.join(ROOT, 'fonts'), path.join(out, 'fonts'));
  }

  // Convenience: root index.html mirrors local (optional open-in-browser of source tree is discouraged)
  if (name === 'local') {
    fs.writeFileSync(path.join(ROOT, 'index.html'), renderHtml(target), 'utf8');
  }

  console.log(`  ok ${name} (mode=${target.assetMode}, v=${ASSET_VERSION})`);
}

function main() {
  if (!fs.existsSync(TEMPLATE)) {
    console.error('Missing index.template.html');
    process.exit(1);
  }

  let names = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  if (names.length === 0) names = ['local', 'cdn', 'web'];
  for (const n of names) {
    if (!TARGETS[n]) {
      console.error(`Unknown target "${n}". Use: ${Object.keys(TARGETS).join(' | ')}`);
      process.exit(1);
    }
  }

  const needNative = names.some((n) => TARGETS[n].copyNative);
  if (needNative) buildNativeBridge();

  for (const n of names) buildOne(n);
  console.log('\nDone.');
}

main();
