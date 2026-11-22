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
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) {
    const want = sel.replace(/^\*/, '');
    const out = [];
    const walk = el => el.children.forEach(child => {
      if (!want || child.tagName === want.toUpperCase()) out.push(child);
      walk(child);
    });
    walk(this);
    return out;
  }
  contains(el) {
    let cur = el;
    while (cur) { if (cur === this) return true; cur = cur.parentNode; }
    return false;
  }
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
const FOLDER_A1 = 'fa1';
const FOLDER_A1A = 'fa1a';
store['draft_folders'] = JSON.stringify([
  { id: FOLDER_A, title: 'Alpha', parentId: null, importance: 0 },
  { id: FOLDER_B, title: 'Beta', parentId: null, importance: 0 },
  { id: FOLDER_A1, title: 'Alpha One', parentId: FOLDER_A, importance: 0 },
  { id: FOLDER_A1A, title: 'Alpha One Deep', parentId: FOLDER_A1, importance: 0 }
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

const api = vm.runInContext('({ Draft, goHome, openProject, showDraftHome, renderManageDraftList, renderFolderPicker, getFolders, isFolderExpanded, expandedTreeFolders, parseHexColor, hexInputText, hexToRgba, rtfColorValue, selectionCss })', sandbox);
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
  { id: FOLDER_B, title: 'Beta', parentId: null },
  { id: FOLDER_A1, title: 'Alpha One', parentId: FOLDER_A },
  { id: FOLDER_A1A, title: 'Alpha One Deep', parentId: FOLDER_A1 }
]);

// 4. Explicit tab navigation drops the cached origin.
Draft.homeType = 'folders';
Draft.folderId = FOLDER_B;
api.openProject('p3');
api.showDraftHome();
check('showDraftHome clears origin', Draft.viewOrigin === null);

// 5. Manage -> Add drafts: unattached drafts at the top, folders as a tree.
const list = getEl('folderManageList');
getEl('folderManageListWrap');
getEl('folderManageOptions');
getEl('projectDrawer');
const titlesOf = () => list.children.map(c => {
  const span = c.tagName === 'LABEL' ? c.children[1] : c.children[1];
  return span ? span.textContent : '';
});
Draft.drawerFolderId = FOLDER_A;
api.renderManageDraftList('add');
check('add list starts with the loose drafts',
  JSON.stringify(titlesOf().slice(0, 2)) === JSON.stringify(['Loose', 'Loose too']));
check('add list then shows only outermost folders',
  JSON.stringify(titlesOf().slice(2)) === JSON.stringify(['Alpha', 'Beta']));

// open Alpha: its nested folder and its drafts appear, Beta stays put
const caretFor = title => list.children.find(row => {
  const span = row.children[1];
  return span && span.textContent === title;
}).children[0];
caretFor('Alpha').dispatch('click', { stopPropagation() {}, preventDefault() {} });
check('opening a folder reveals its child folder',
  titlesOf().includes('Alpha One'));
// Alpha's only draft (p1) is already in Alpha, so its branch has just the
// nested folder; a *loose* draft is never nested (it is listed at the top).
check('a nested draft is listed under the folder it belongs to',
  titlesOf().slice(0, 5).join('|') === 'Loose|Loose too|Alpha|In Beta|Alpha One');
check('a closed branch shows nothing of its contents',
  titlesOf()[5] === 'Beta');
check('sibling top-level folder stays closed',
  !titlesOf().includes('Alpha One Deep'));

// second level needs a second open
caretFor('Alpha One').dispatch('click', { stopPropagation() {}, preventDefault() {} });
check('deeper folders nest another level', titlesOf().includes('Alpha One Deep'));

// checking a draft that already lives in Beta files it here too, and keeps Beta
// p3 lives in Beta, so it shows up nested under Beta once that branch is open.
caretFor('Beta').dispatch('click', { stopPropagation() {}, preventDefault() {} });
const nested = list.children.find(row => row.tagName === 'LABEL' && row.children[1].textContent === 'In Beta');
const nestedBox = nested.children[0];
nestedBox.checked = true;
nestedBox.dispatch('change');
const beta = JSON.parse(store['draft_projects']).find(p => p.id === 'p3');
check('checking a nested draft adds this folder', beta.folderIds.includes(FOLDER_A));
check('a cross-folder draft leaves the add tree', !list.children.some(r => r.tagName === 'LABEL' && r.children[1].textContent === 'In Beta'));
check('checking a nested draft keeps its other folder', beta.folderIds.includes(FOLDER_B));

// expansion survives the re-render that follows a toggle
check('open branches stay open after a toggle', titlesOf().includes('Alpha One Deep'));

// 6. Remove lists what is in this folder, flat.
api.renderManageDraftList('remove');
check('remove list only shows drafts in this folder',
  JSON.stringify(titlesOf()) === JSON.stringify(['In Alpha', 'In Beta']));
const rmRow = list.children.find(row => row.children[1].textContent === 'In Beta');
const rmBox = rmRow.children[0];
rmBox.checked = false;
rmBox.dispatch('change');
const betaAfter = JSON.parse(store['draft_projects']).find(p => p.id === 'p3');
check('unchecking removes only this folder',
  !betaAfter.folderIds.includes(FOLDER_A) && betaAfter.folderIds.includes(FOLDER_B));

// 7. Add-to-folder picker shows outermost folders only, with expandable branches.
const picker = getEl('folderPicker');
const p3 = JSON.parse(store['draft_projects']).find(p => p.id === 'p3');
api.renderFolderPicker(p3, false);
const pickerTitles = () => picker.children.map(row => row.children[1].children[1].textContent);
check('picker lists only outermost folders',
  JSON.stringify(pickerTitles()) === JSON.stringify(['Alpha', 'Beta']));
picker.children[0].children[0].dispatch('click', { stopPropagation() {}, preventDefault() {} });
check('picker caret reveals the nested folder', pickerTitles().includes('Alpha One'));
check('picker branch is indented', picker.children[1].style.paddingLeft === '26px');
// A folder being moved may not be dropped into its own subtree.
api.renderFolderPicker({ id: FOLDER_A, title: 'Alpha', parentId: null }, true);
check('picker hides the folder itself (no self-parenting)',
  !pickerTitles().includes('Alpha'));

// 8. Colour fields accept #RRGGBBAA (alpha last), while old values keep working.
const color = v => api.parseHexColor(v);
check('6-digit hex still parses as opaque',
  color('1F7FFF').hex === '#1f7fff' && color('1F7FFF').alphaHex === 'ff' && color('1F7FFF').alpha === 1);
check('8-digit hex splits rgb and alpha',
  JSON.stringify(color('#1F7FFF80').rgb) === '[31,127,255]' && color('#1F7FFF80').alphaHex === '80');
check('alpha 80 is about half transparent', Math.abs(color('#ff000080').alpha - 0.5019) < 0.001);
check('3- and 4-digit shorthand expand', color('#fff').hex === '#ffffff' && color('#f008').alphaHex === '88');
check('leading # is optional', color('1F7FFF80').hex === color('#1F7FFF80').hex);
check('unfinished input is rejected (live typing stays quiet)',
  ['', '1', '1F7FFF8', '1F7FZZ', 'GGGGGG', '1F7FFF80FF'].every(v => color(v) === null));
// Each length is a complete colour in its own right, so a 4th digit snaps the
// 3-digit value to its next valid form rather than being ignored.
check('shorthand lengths are all valid', color('1F7').hex === '#11ff77' && color('1F7F').hex === '#11ff77ff');
check('opaque input round-trips as 6 digits', api.hexInputText('#1F7FFF') === '1F7FFF');
check('translucent input round-trips as 8 digits', api.hexInputText('#1f7fff80') === '1F7FFF80');
check('rtf ignores the alpha', JSON.stringify(api.rtfColorValue('#1f7fff80')) === '[31,127,255]');
check('rtf still reads the old 6-digit form', JSON.stringify(api.rtfColorValue('#1f7fff')) === '[31,127,255]');
check('tool background keeps the rgb, not the alpha', api.hexToRgba('#1f7fff80', 0.3) === 'rgba(31,127,255,0.3)');

// 9. Applying a selection colour stores 6 digits when opaque, 8 when translucent.
sandbox.__apply = v => api.selectionCss(v);
check('opaque selection colour stores #rrggbb', sandbox.__apply('#1F7FFF') === '#1f7fff');
check('translucent selection colour stores #rrggbbaa', sandbox.__apply('1F7FFF80') === '#1f7fff80');
check('a fully-opaque alpha collapses to 6 digits', sandbox.__apply('#1F7FFFFF') === '#1f7fff');

console.log(failures ? 'NAVTEST_FAILED ' + failures : 'NAVTEST_OK');
process.exitCode = failures ? 1 : 0;
