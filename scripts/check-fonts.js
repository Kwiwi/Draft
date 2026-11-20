#!/usr/bin/env node
/**
 * Guard against a missing CJK TTF silently falling back to a system font.
 * Runs on postinstall (non-fatal) and as part of the local / cdn-local builds.
 *
 *   node scripts/check-fonts.js               # warn only
 *   node scripts/check-fonts.js --strict      # exit 1 when a file is missing
 *   node scripts/check-fonts.js --strict --latin-only   # Latin files only (editions
 *                                             where Chinese comes from the CDN)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const FONTS = path.resolve(__dirname, '..', 'fonts');
// Mirrors fonts/app-fonts.css (source of truth for what the app loads).
const REQUIRED = [
  'app-fonts.css',
  'Cardo-Regular.ttf',
  'NotoSerifHK-Variable.ttf',
  'SourceHanSerifSC-Regular.ttf',
  'SourceSerif4-Regular.ttf',
  'SourceSerif4-Bold.ttf',
  'SourceSerif4-Italic.ttf',
  'SourceSerif4-BoldItalic.ttf'
];

const LATIN = ['app-fonts.css', 'Cardo-Regular.ttf', 'SourceSerif4-Regular.ttf', 'SourceSerif4-Bold.ttf', 'SourceSerif4-Italic.ttf', 'SourceSerif4-BoldItalic.ttf'];
const latinOnly = process.argv.includes('--latin-only');
const required = latinOnly ? LATIN : REQUIRED;

const strict = process.argv.includes('--strict');
const missing = required.filter((f) => {
  try {
    return !fs.statSync(path.join(FONTS, f)).isFile();
  } catch (e) {
    return true;
  }
});

if (!missing.length) {
  if (latinOnly) {
    console.log(`latin fonts ok (${required.length} files)`);
    process.exit(0);
  }
  const cjkMb = ['NotoSerifHK-Variable.ttf', 'SourceHanSerifSC-Regular.ttf']
    .reduce((sum, f) => sum + fs.statSync(path.join(FONTS, f)).size, 0) / (1024 * 1024);
  console.log(`fonts ok (${required.length} files, CJK ${cjkMb.toFixed(1)} MB)`);
  process.exit(0);
}

const message = `Missing local fonts: ${missing.join(', ')} — Chinese text may fall back to a system font.`;
if (strict) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}
console.warn(`WARN: ${message}`);
