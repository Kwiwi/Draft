/**
 * Capacitor config selector.
 *
 * The Capacitor CLI has no --config flag (Cap 7) and always reads the config at
 * the project root, preferring .ts > .js > .json. This file exists so one tree
 * can target several editions:
 *
 *   DRAFT_EDITION=offline    → capacitor.config.json            (com.kwiwi.draft)
 *   DRAFT_EDITION=cdn        → capacitor.config.cdn.json        (com.kwiwi.draft.cdn)
 *   DRAFT_EDITION=cdn-local  → capacitor.config.cdn-local.json  (com.kwiwi.draft.cdnlocal)
 *
 * Unset behaves like `offline`, i.e. exactly what the CLI did before.
 * Useful for `npx cap sync`, and by the CI workflow for the light editions.
 *
 * The JSON files stay the source of truth; this only picks one of them.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const EDITION_FILES = {
  offline: 'capacitor.config.json',
  cdn: 'capacitor.config.cdn.json',
  'cdn-local': 'capacitor.config.cdn-local.json'
};

const edition = (process.env.DRAFT_EDITION || 'offline').trim();
const file = EDITION_FILES[edition];

if (!file) {
  throw new Error(
    `Unknown DRAFT_EDITION "${edition}". Use one of: ${Object.keys(EDITION_FILES).join(' | ')}`
  );
}

const config = JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
module.exports = config;
