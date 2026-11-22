// Harness: exercise the real app.js in a fake DOM to check
//   1. Back from a draft returns one level up (folder vs drafts home)
//   2. Folder manage "Add drafts" only lists unfiled drafts
// Run: node scripts/test-navigation.js (source tree, no build needed)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

// ---------- tiny DOM ----------
class ClassList {
  constructor(el) { this.el = el; this.set = new Set(); }
  _sync() { this.el._className = Array.from(this.set).join(' '); }
  add(...c) { c.forEach(x => x && this.set.add(x)); this._sync(); }
  remove(...c) { c.forEach(x => this.set.delete(x)); this._sync(); }
  contains(c) { return this.set.has(c); }
  toggle(c, force) {
    const on = force === undefined ? !this.set.has(c) : !!force;
    if (on) this.set.add(c); else this.set.delete(c);
    this._sync();
    return on;
  }
  get value() { return this.el._className; }
}

class El {
  constructor(tag = 'div', id = '') {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = { cssText: '', setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; } };
    this.attributes = {};
    this.listeners = {};
    this.classList = new ClassList(this);
    this._className = '';
    this._text = '';
    this._html = '';
    this.checked = false;
  }
  get className() { return this._className; }
  set className(v) {
    this._className = v || '';
    this.classList.set = new Set(String(v || '').split(/\s+/).filter(Boolean));
  }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get innerText() { return this._text; }
  set innerText(v) { this._text = String(v); }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.children = []; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  insertBefore(child, ref) {
    child.parentNode = this;
    const i = this.children.indexOf(ref);
    if (i < 0) this.children.push(child); else this.children.splice(i, 0, child);
    return child;
  }
  removeChild(child) {
    this.children = this.children.filter(c => c !== child);
    child.parentNode = null;
  }
  replaceChildren(...kids) {
    this.children.forEach(c => { c.parentNode = null; });
    this.children = [];
    kids.forEach(k => this.appendChild(k));
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  removeEventListener() {}
  dispatch(type, ev = {}) { (this.listeners[type] || []).forEach(fn => fn(ev)); }
  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k]; }
  removeAttribute(k) { delete this.attributes[k]; }
  hasAttribute(k) { return k in this.attributes; }
  closest() { return null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  scrollIntoView() {}
  scrollTo() {}
  focus() {}
  select() {}
  getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; }
  get firstChild() { return this.children[0] || null; }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  get offsetTop() { return 0; }
  get offsetHeight() { return 0; }
  get scrollHeight() { return 0; }
  get scrollTop() { return 0; }
  set scrollTop(v) {}
}

const registry = new Map();
function getEl(id) {
  if (!registry.has(id)) registry.set(id, new El('div', id));
  return registry.get(id);
}

const document = {
  body: new El('body'),
  documentElement: new El('html'),
  getElementById: id => (registry.has(id) ? registry.get(id) : null),
  createElement: tag => new El(tag),
  createTextNode: t => { const e = new El('#text'); e.textContent = t; return e; },
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  execCommand() {}
};
document.body.classList = new ClassList(document.body);

// Pre-register every element id that exists in index.template.html so the
// top-level lookups in app.js resolve.
const html = fs.readFileSync(path.join(ROOT, 'index.template.html'), 'utf8');
for (const m of html.matchAll(/\sid="([^"]+)"/g)) getEl(m[1]);

// ---------- storage ----------
let store = {};
const localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};

const sandbox = {
  console,
  document,
  window: { addEventListener() {}, location: { href: "https://localhost/" }, scrollTo() {}, print() {} },
  localStorage,
  navigator: {},
  location: { href: 'https://localhost/' },
  setTimeout: () => 0,
  clearTimeout() {},
  setInterval: () => 0,
  clearInterval() {},
  requestAnimationFrame: () => 0,
  MutationObserver: class { observe() {} disconnect() {} },
  alert() {},
  Blob: class {},
  FileReader: class {},
  URL,
  Promise,
  Date,
  Math,
  JSON,
  Set,
  Map,
  Array,
  Object,
  String,
  Number,
  Boolean,
  RegExp,
  Error,
  parseInt,
  parseFloat,
  isNaN,
  atob: s => Buffer.from(s, 'base64').toString('binary'),
  btoa: s => Buffer.from(s, 'binary').toString('base64'),
  fetch: () => Promise.reject(new Error('no network in harness'))
};
sandbox.window.document = document;
sandbox.window.localStorage = localStorage;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

// seed data
const FOLDER_A = 'fa';
const FOLDER_B = 'fb';
store['draft_folders'] = JSON.stringify([
  { id: FOLDER_A, title: 'Alpha', parentId: null, importance: 0 },
  { id: FOLDER_B, title: 'Beta', parentId: null, importance: 0 }
]);
store['draft_projects'] = JSON.stringify([
  { id: 'p1', title: 'In Alpha', content: '', folderIds: [FOLDER_A], updatedAt: 1 },
  { id: 'p2', title: 'Loose', content: '', folderIds: [], updatedAt: 2 },
  { id: 'p3', title: 'In Beta', content: '', folderIds: [FOLDER_B], updatedAt: 3 },
  { id: 'p4', title: 'Loose too', content: '', folderIds: [], updatedAt: 4 }
]);

const code = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8') + '\n;\n' +
  fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'app.js' });

const api = vm.runInContext('({ Draft, goHome, openProject, showDraftHome, renderManageDraftList, renderFolderPicker, getProjects })', sandbox);
const Draft = api.Draft;

// ---------- assertions ----------
let failures = 0;
function check(name, cond) {
  if (!cond) { failures += 1; console.log('FAIL ' + name); }
  else console.log('ok   ' + name);
}

// Viewer/editor/folder manage elements exist so class bookkeeping works
['viewer', 'viewerTitle', 'viewerContent', 'homeView', 'editorView', 'projectDrawer',
 'drawerOverlay', 'editorSettingsDrawer'].forEach(getEl);

// 1. Back from a draft opened inside a folder goes back to that folder.
Draft.homeType = 'folders';
Draft.folderId = FOLDER_B;
api.openProject('p3');
check('openProject keeps viewing origin folder', Draft.viewOrigin && Draft.viewOrigin.folderId === FOLDER_B);
api.goHome();
check('back from folder draft returns to folder', Draft.mode === 'home' && Draft.homeType === 'folders' && Draft.folderId === FOLDER_B);

// 2. Back from a draft opened on the drafts home goes to the drafts home.
Draft.homeType = 'drafts';
Draft.folderId = null;
api.openProject('p2');
api.goHome();
check('back from drafts-home draft returns to drafts home', Draft.mode === 'home' && Draft.homeType === 'drafts' && Draft.folderId === null);

// 3. A folder deleted while the draft was open does not resurrect it.
Draft.homeType = 'folders';
Draft.folderId = FOLDER_B;
api.openProject('p3');
store['draft_folders'] = JSON.stringify([{ id: FOLDER_A, title: 'Alpha', parentId: null }]);
api.goHome();
check('back after folder deletion falls back to folders root', Draft.mode === 'home' && Draft.homeType === 'folders' && Draft.folderId === null);
store['draft_folders'] = JSON.stringify([
  { id: FOLDER_A, title: 'Alpha', parentId: null },
  { id: FOLDER_B, title: 'Beta', parentId: null }
]);

// 4. Explicit tab navigation drops the cached origin.
Draft.homeType = 'folders';
Draft.folderId = FOLDER_B;
api.openProject('p3');
api.showDraftHome();
check('showDraftHome clears origin', Draft.viewOrigin === null);

// 5. Manage -> Add drafts lists only unfiled drafts.
const list = getEl('folderManageList');
getEl('folderManageListWrap');
getEl('folderManageOptions');
Draft.drawerFolderId = FOLDER_A;
api.renderManageDraftList('add');
let titles = list.children.map(c => (c.children[1] ? c.children[1].textContent : ''));
check('add list excludes drafts already in a folder', JSON.stringify(titles) === JSON.stringify(['Loose', 'Loose too']));

// checking one files it here and removes the row
const row = list.children[0];
const box = row.children[0];
box.checked = true;
box.dispatch('change');
check('checking a draft files it into the folder',
  JSON.parse(store['draft_projects']).find(p => p.id === 'p2').folderIds.join(',') === FOLDER_A);
check('checked row leaves the add list', !list.children.includes(row));

// 6. Remove drafts only lists drafts in this folder, and unchecking drops the row.
api.renderManageDraftList('remove');
titles = list.children.map(c => (c.children[1] ? c.children[1].textContent : ''));
check('remove list only shows folder drafts', JSON.stringify(titles) === JSON.stringify(['In Alpha', 'Loose']));
const rmRow = list.children[0];
const rmBox = rmRow.children[0];
rmBox.checked = false;
rmBox.dispatch('change');
check('unchecking removes from folder',
  JSON.parse(store['draft_projects']).find(p => p.id === 'p1').folderIds.length === 0);
check('unchecked row leaves the remove list', !list.children.includes(rmRow));

// 6b. Switching modes after a list was toggled rebuilds it cleanly (no stale
// placeholder left behind by the old markup or from the previous mode).
// p1 was just unfiled, so the add list now offers both loose drafts.
api.renderManageDraftList('add');
check('add list shows the remaining unfiled drafts',
  list.children.length === 2 &&
  list.children.map(c => c.children[1].textContent).join('|') === 'In Alpha|Loose too');
api.renderManageDraftList('remove');
check('remove list rebuilds after switching modes',
  list.children.length === 1 && list.children[0].children[1].textContent === 'Loose');

// 7. Folder picker ("Add to folder") still works for a draft.
api.renderFolderPicker(JSON.parse(store['draft_projects']).find(p => p.id === 'p3'), false);
check('folder picker renders without throwing', true);

console.log(failures ? 'NAVTEST_FAILED ' + failures : 'NAVTEST_OK');
process.exitCode = failures ? 1 : 0;
