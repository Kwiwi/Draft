#!/usr/bin/env node
/**
 * Generate fonts/app-fonts.cdn.css from fonts/app-fonts.css by dropping the
 * @font-face blocks of fonts we only ship in full-local builds (CJK).
 *
 * Usage: node scripts/gen-cdn-fonts-css.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const FONTS = path.resolve(__dirname, '..', 'fonts');
const LOCAL_ONLY = new Set(['Noto Serif HK', 'Noto Serif SC']);

const source = fs.readFileSync(path.join(FONTS, 'app-fonts.css'), 'utf8');
const blocks = source.match(/@font-face\s*\{[^}]*\}/g) || [];
const kept = blocks.filter((block) => {
  const family = (block.match(/font-family:\s*'([^']+)'/) || [])[1];
  return !LOCAL_ONLY.has(family);
});

const header = `/* GENERATED from app-fonts.css — do not edit by hand.
 * Regenerate with: node scripts/gen-cdn-fonts-css.js
 * Used when a build ships Latin fonts only (CJK comes from Google Fonts). */
`;
fs.writeFileSync(path.join(FONTS, 'app-fonts.cdn.css'), `${header}\n${kept.join('\n\n')}\n`, 'utf8');
console.log(`app-fonts.cdn.css: kept ${kept.length}/${blocks.length} @font-face blocks`);
