// ===== 全局状态 =====
let Draft = {
  currentProjectId: null,
  dirty: false,
  mode: "home",
  homeType: 'drafts',
  folderId: null,
  drawerProjectId: null,
  drawerFolderId: null,
  deleteFolderId: null,
  nameModalMode: null,
};


// ===== Capacitor / native helpers =====
function getAssetMode() {
  const mode = (window.DRAFT_ASSET_MODE || 'local').toLowerCase();
  return mode === 'cdn' ? 'cdn' : 'local';
}

const KATEX_CDN_BASE = 'https://cdn.jsdelivr.net/npm/katex@0.19.1/dist';
const GOOGLE_FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Cardo:ital,wght@0,400;0,700;1,400&family=Lora:ital,wght@0,400;0,700;1,400&family=Merriweather:ital,wght@0,400;0,700;1,400&family=Noto+Serif+HK:wght@400;700&family=Noto+Serif+SC:wght@400;700&family=Open+Sans:ital,wght@0,400;0,700;1,400&family=Roboto:ital,wght@0,400;0,500;0,700;1,400&family=Source+Serif+4:opsz,wght@8..60,400;8..60,700&display=swap';

// True when Chinese fonts (Noto Serif HK / SC) are bundled in this package.
// Builds that ship them set window.DRAFT_CJK_FONTS = 'local'.
function hasLocalCjkFonts() {
  const flag = (window.DRAFT_CJK_FONTS || (getAssetMode() === 'local' ? 'local' : 'cdn')).toLowerCase();
  return flag === 'local';
}

function getDraftNative() {
  return window.DraftNative || null;
}

function isNativeApp() {
  const native = getDraftNative();
  try {
    return Boolean(native && native.Capacitor && native.Capacitor.isNativePlatform());
  } catch (error) {
    return false;
  }
}

function isShown(el) {
  return Boolean(el && el.classList.contains('show'));
}

function isUiActive(el) {
  return Boolean(el && el.classList.contains('active'));
}

function hideExportMenus() {
  document.querySelectorAll('.export-options').forEach(options => {
    if (options.id === 'folderManageList') return;
    options.classList.remove('show');
  });
  const manageListWrap = document.getElementById('folderManageListWrap');
  if (manageListWrap) manageListWrap.classList.add('hidden');
}

function closeConfirmModal() {
  const modal = document.getElementById('confirmModal');
  if (!modal) return;
  modal.classList.remove('show');
  const cancelBtn = document.getElementById('confirmCancel');
  if (cancelBtn) cancelBtn.onclick = null;
  const okBtn = document.getElementById('confirmOk');
  if (okBtn) okBtn.onclick = null;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('base64 failed'));
    reader.readAsDataURL(blob);
  });
}

// `data` must be base64 (Capacitor serialises plugin calls to JSON). `mimeType`
// only matters on Android, where the share sheet uses it to pick apps.
// Text exports go through Filesystem's `encoding` path, which writes the bytes
// as-is instead of running a Base64.decode() over them.
async function shareNativeFile(filename, data, encoding, mimeType) {
  const native = getDraftNative();
  if (!native) throw new Error('native bridge missing');
  const path = `exports/${filename}`;
  const written = await native.Filesystem.writeFile({
    path,
    data,
    directory: native.Directory.Cache,
    encoding,
    recursive: true
  });
  let uri = written && written.uri;
  if (!uri) {
    const result = await native.Filesystem.getUri({
      path,
      directory: native.Directory.Cache
    });
    uri = result.uri;
  }
  await shareNativeUri(native, filename, uri, mimeType);
}

// Share an already-written cache file. Never rejects on a user-cancelled sheet:
// throwing there used to surface "export failed" after a perfectly good export.
async function shareNativeUri(native, filename, uri, mimeType) {
  try {
    await native.Share.share({
      title: filename,
      url: uri,
      dialogTitle: filename,
      ...(mimeType ? { files: [uri], mimeType } : {})
    });
  } catch (error) {
    if (/cancel/i.test(String(error && error.message))) return;
    throw error;
  }
}


let state = {
  currentProjectId: null,
  theme: "light"
};

// ===== 先获取所有DOM元素 =====
const editor = document.getElementById("editor");
const titleInput = document.getElementById("titleInput");
const themeBtn = document.getElementById('themeToggle');
const html = document.documentElement;
const projectList = document.getElementById("projectList");
const editorCopyBtn = document.getElementById("editorCopyBtn");
const editorTopCopyBtn = document.getElementById("editorTopCopyBtn");
const editorBottomTopBtn = document.getElementById("editorBottomTopBtn");
const viewerCopyBtn = document.getElementById("viewerCopyBtn");
const editorMeta = document.getElementById("editorMeta");
const toolFloatButton = document.getElementById('toolFloatButton');
const toolPalette = document.getElementById('toolPalette');
const toolColorPanel = document.getElementById('toolColorPanel');
const magnifierWindow = document.getElementById('magnifierWindow');
const magnifierContent = document.getElementById('magnifierContent');
const renderPreviewWindow = document.getElementById('renderPreviewWindow');
const renderPreviewContent = document.getElementById('renderPreviewContent');
const annotationView = document.getElementById('annotationView');
const annotationWindow = document.getElementById('annotationWindow');
const annotationList = document.getElementById('annotationList');
const selectionToolbar = document.getElementById('selectionToolbar');
const selectionSizeSelect = document.getElementById('selectionSizeSelect');
const selectionColorInput = document.getElementById('selectionColorInput');
const selectionColorApply = document.getElementById('selectionColorApply');

let savedEditorSelection = null;

// ===== 自定义弹窗（替代 alert） =====
function showAlert(messageKey) {
  const modal = document.getElementById('alertModal');
  const text = document.getElementById('alertText');
  const okBtn = document.getElementById('alertOk');

  const t = translations[currentLang] || translations['zh'];
  // Reset any detail line / button label left by showExportError() or the
  // retry alert.
  text.textContent = t[messageKey] || messageKey;
  okBtn.textContent = t['btn-ok'] || 'OK';

  modal.classList.add('show');

  function cleanup() {
    modal.classList.remove('show');
    okBtn.onclick = null;
  }

  okBtn.onclick = cleanup;
}

// ===== 监听编辑器输入 =====
editor.addEventListener("input", () => {
  Draft.dirty = true;
  updateEditorMeta();
  updateMagnifier();
  if (renderPreviewWindow && renderPreviewWindow.classList.contains('show')) {
    const project = getProject(Draft.currentProjectId);
    if (project) {
      project.content = editor.innerHTML;
      project.title = titleInput.value;
      renderDraftPreview(project);
    }
  }
});

function isEditorRange(range) {
  return Boolean(range && editor.contains(range.commonAncestorContainer));
}

function getEditorTextOffset(container, offset) {
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.setEnd(container, offset);
  return range.toString().length;
}

function saveEditorSelection(range) {
  return {
    range: range.cloneRange(),
    start: getEditorTextOffset(range.startContainer, range.startOffset),
    end: getEditorTextOffset(range.endContainer, range.endOffset)
  };
}

function restoreEditorSelection(saved) {
  if (!saved) return null;
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let node;
  let position = 0;
  let startNode = null;
  let endNode = null;
  let startOffset = 0;
  let endOffset = 0;

  while ((node = walker.nextNode())) {
    const endPosition = position + node.nodeValue.length;
    if (!startNode && saved.start <= endPosition) {
      startNode = node;
      startOffset = Math.max(0, saved.start - position);
    }
    if (saved.end <= endPosition) {
      endNode = node;
      endOffset = Math.max(0, saved.end - position);
      break;
    }
    position = endPosition;
  }

  if (!startNode || !endNode) return isEditorRange(saved.range) ? saved.range.cloneRange() : null;
  const range = document.createRange();
  range.setStart(startNode, Math.min(startOffset, startNode.nodeValue.length));
  range.setEnd(endNode, Math.min(endOffset, endNode.nodeValue.length));
  return range;
}

function getActiveEditorRange() {
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    if (isEditorRange(range) && !range.collapsed) return range.cloneRange();
  }
  return restoreEditorSelection(savedEditorSelection);
}

function hideSelectionToolbar() {
  if (!selectionToolbar) return;
  selectionToolbar.classList.remove('show');
  selectionToolbar.setAttribute('aria-hidden', 'true');
}

function getSelectionScale(range) {
  if (!range || !range.startContainer) return 1;
  const element = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer
    : range.startContainer.parentElement;
  if (!element) return 1;
  const baseSize = parseFloat(getComputedStyle(editor).fontSize) || 10;
  const currentSize = parseFloat(getComputedStyle(element).fontSize) || baseSize;
  const scale = currentSize / baseSize;
  const options = Array.from(selectionSizeSelect.options).map(option => Number(option.value));
  return options.reduce((closest, option) =>
    Math.abs(option - scale) < Math.abs(closest - scale) ? option : closest, options[0] || 1);
}

function positionSelectionToolbar(range) {
  if (!selectionToolbar) return;
  const rect = range.getBoundingClientRect();
  const toolbarRect = selectionToolbar.getBoundingClientRect();
  const padding = 8;
  let left = rect.left + (rect.width / 2) - (toolbarRect.width / 2);
  let top = rect.top - toolbarRect.height - 8;
  if (left < padding) left = padding;
  if (left + toolbarRect.width > window.innerWidth - padding) {
    left = window.innerWidth - toolbarRect.width - padding;
  }
  if (top < padding) top = rect.bottom + 8;
  selectionToolbar.style.left = `${Math.max(padding, left)}px`;
  selectionToolbar.style.top = `${Math.max(padding, top)}px`;
}

function showSelectionToolbar(range) {
  if (!selectionToolbar || !selectionSizeSelect || !isEditorRange(range)) return;
  selectionSizeSelect.value = String(getSelectionScale(range));
  selectionToolbar.classList.add('show');
  selectionToolbar.setAttribute('aria-hidden', 'false');
  positionSelectionToolbar(range);
}

function selectedTextNodes(range) {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  const nodes = [];
  const selectionStart = getEditorTextOffset(range.startContainer, range.startOffset);
  const selectionEnd = getEditorTextOffset(range.endContainer, range.endOffset);
  let node;
  let position = 0;
  while ((node = walker.nextNode())) {
    const nodeEnd = position + node.nodeValue.length;
    if (selectionEnd <= position) {
      position = nodeEnd;
      continue;
    }
    if (selectionStart >= nodeEnd) {
      position = nodeEnd;
      continue;
    }
    const start = Math.max(0, selectionStart - position);
    const end = Math.min(node.nodeValue.length, selectionEnd - position);
    if (end > start) nodes.push({ node, start, end });
    position = nodeEnd;
  }
  return nodes;
}

function applySelectionStyle(styleName, value) {
  const range = getActiveEditorRange();
  if (!range) return false;
  const nodes = selectedTextNodes(range);
  if (!nodes.length) return false;

  const project = getProject(Draft.currentProjectId);
  const baseSize = getFontSettings(project || {}).size;
  nodes.forEach(({ node, start, end }) => {
    const selectedNode = start > 0 ? node.splitText(start) : node;
    if (end - start < selectedNode.nodeValue.length) selectedNode.splitText(end - start);
    const wrapper = document.createElement('span');
    if (styleName === 'fontSize') {
      const scale = Number(value);
      wrapper.dataset.relativeSize = String(scale);
      wrapper.style.fontSize = `${baseSize * scale}px`;
    } else {
      wrapper.style[styleName] = value;
    }
    selectedNode.parentNode.insertBefore(wrapper, selectedNode);
    wrapper.appendChild(selectedNode);
  });

  editor.normalize();
  Draft.dirty = true;
  updateEditorMeta();
  updateMagnifier();
  savedEditorSelection = null;
  window.getSelection().removeAllRanges();
  hideSelectionToolbar();
  return true;
}

function updateSelectionColor(value) {
  let color = String(value || '').trim();
  if (!color.startsWith('#')) color = '#' + color;
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return false;
  return applySelectionStyle('color', color);
}

function handleEditorSelectionChange() {
  const selection = window.getSelection();
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  if (range && isEditorRange(range) && !range.collapsed && selection.toString().trim()) {
    savedEditorSelection = saveEditorSelection(range);
    setTimeout(() => {
      const activeRange = getActiveEditorRange();
      if (activeRange) showSelectionToolbar(activeRange);
    }, 0);
    return;
  }
  if (selectionToolbar && selectionToolbar.contains(document.activeElement)) return;
  hideSelectionToolbar();
}

document.addEventListener('selectionchange', handleEditorSelectionChange);
editor.addEventListener('mouseup', () => setTimeout(handleEditorSelectionChange, 0));
editor.addEventListener('touchend', () => setTimeout(handleEditorSelectionChange, 50));

// ===== 数据操作函数 =====

function getProjects() {
  return JSON.parse(localStorage.getItem("draft_projects") || "[]");
}

function getFolders() {
  return JSON.parse(localStorage.getItem('draft_folders') || '[]');
}

function saveFolders(list) {
  localStorage.setItem('draft_folders', JSON.stringify(list));
}

function getFolder(id) {
  return getFolders().find(folder => folder.id === id);
}

function folderPath(folderId) {
  const folders = getFolders();
  const names = [];
  let current = folders.find(folder => folder.id === folderId);
  const seen = new Set();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.title);
    current = folders.find(folder => folder.id === current.parentId);
  }
  return names.join('/');
}

function descendants(folderId) {
  const folders = getFolders();
  const result = [];
  const visit = id => folders.filter(folder => folder.parentId === id).forEach(folder => {
    result.push(folder.id);
    visit(folder.id);
  });
  visit(folderId);
  return result;
}

function folderDraftCount(folderId) {
  const ids = new Set([folderId, ...descendants(folderId)]);
  return getProjects().filter(project => (project.folderIds || []).some(id => ids.has(id))).length;
}

function allFolderIds(folderId) {
  return [folderId, ...descendants(folderId)];
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function saveProjects(list) {
  localStorage.setItem("draft_projects", JSON.stringify(list));
}

function getProject(id) {
  return getProjects().find(p => p.id === id);
}

function getFontSettings(project) {
  const stack = Array.isArray(project.fontStack) && project.fontStack.length
    ? project.fontStack
    : ['Noto Serif HK', 'Cardo'];
  const size = Math.max(8, Math.min(12, Number(project.fontSize) || 10));
  return { stack, size };
}

function applyRelativeFontSizes(root, baseSize) {
  if (!root) return;
  root.querySelectorAll('[data-relative-size]').forEach(element => {
    const scale = Number(element.dataset.relativeSize);
    if (Number.isFinite(scale) && scale > 0) {
      element.style.fontSize = `${baseSize * scale}px`;
    }
  });
}

function applyEditorFontSettings(project) {
  if (!project) return;
  const settings = getFontSettings(project);
  const fallbackStack = [...settings.stack, 'Noto Serif HK', 'Noto Serif SC', 'Cardo', 'serif'];
  const family = [...new Set(fallbackStack)].map(name => `'${String(name).replace(/'/g, '')}'`).join(', ');
  editor.style.fontFamily = family;
  editor.style.fontSize = settings.size + 'px';
  editor.style.setProperty('--draft-base-size', settings.size + 'px');
  applyRelativeFontSizes(editor, settings.size);
  const viewerContent = document.getElementById('viewerContent');
  viewerContent.style.fontFamily = family;
  viewerContent.style.fontSize = settings.size + 'px';
  viewerContent.style.setProperty('--draft-base-size', settings.size + 'px');
  applyRelativeFontSizes(viewerContent, settings.size);
  updateMagnifier();
}

function markdownSourceFromHtml(html) {
  const container = document.createElement('div');
  container.innerHTML = html || '';
  const source = container.innerHTML
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:p|div|section|article|blockquote|h[1-6]|ul|ol|li)[^>]*>/gi, tag => /^<\//.test(tag) ? '\n' : '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const visibleText = source.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ');
  const hasMarkdown = /(^|\n|\s)#{1,6}\s|(^|\n)\s{0,3}([-*+]\s|>\s|```)|\*\*[^*]+\*\*|__[^_]+__|\[[^\]]+\]\([^\)]+\)/m.test(visibleText);
  const hasMath = /\$\$[\s\S]+?\$\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|\$[^$\n]+\$/m.test(visibleText);
  return hasMarkdown || hasMath ? source : null;
}

function sanitizeRenderedHtml(html) {
  const container = document.createElement('div');
  container.innerHTML = html;
  container.querySelectorAll('script,style,iframe,object,embed,form').forEach(element => element.remove());
  container.querySelectorAll('*').forEach(element => {
    Array.from(element.attributes).forEach(attribute => {
      if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
      if (/^(href|src)$/i.test(attribute.name) && /^\s*javascript:/i.test(attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    });
  });
  return container.innerHTML;
}

function renderMarkdownAndMath(html) {
  const source = markdownSourceFromHtml(html);
  const parsed = source !== null && window.marked
    ? window.marked.parse(source, { gfm: true, breaks: true })
    : (html || '<p><br></p>');
  return sanitizeRenderedHtml(parsed);
}

function renderMath(root) {
  if (!root || typeof window.renderMathInElement !== 'function') return;
  try {
    window.renderMathInElement(root, {
      throwOnError: false,
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
        { left: '$', right: '$', display: false }
      ]
    });
  } catch (error) {
    console.warn('Math rendering failed:', error);
  }
}

function getRenderedDraftHtml(project) {
  const settings = getFontSettings(project || {});
  return {
    title: escapeHtml((project && project.title) || 'Untitled'),
    content: renderMarkdownAndMath(project && project.content ? project.content : '<p><br></p>'),
    family: getProjectFontFamily(project || {}),
    size: settings.size
  };
}

function renderDraftPreview(project) {
  if (!renderPreviewContent || !project) return;
  const rendered = getRenderedDraftHtml(project);
  renderPreviewContent.innerHTML = `<h1>${rendered.title}</h1><div class="render-preview-body">${rendered.content}</div>`;
  renderPreviewContent.style.fontFamily = rendered.family;
  renderPreviewContent.style.fontSize = `${rendered.size}px`;
  renderPreviewContent.style.lineHeight = '1.6';
  applyRelativeFontSizes(renderPreviewContent, rendered.size);
  renderMath(renderPreviewContent);
}

function openRenderPreview() {
  if (!Draft.currentProjectId || Draft.mode !== 'edit') return;
  persistEditorDraft();
  const project = getProject(Draft.currentProjectId);
  if (!project || !renderPreviewWindow) return;
  renderDraftPreview(project);
  renderPreviewWindow.classList.add('show');
}

function closeRenderPreview() {
  if (renderPreviewWindow) renderPreviewWindow.classList.remove('show');
}

function updateMagnifier() {
  if (!magnifierContent) return;
  magnifierContent.innerHTML = editor.innerHTML || '<span class="magnifier-empty"> </span>';
  magnifierContent.style.fontFamily = editor.style.fontFamily;
  magnifierContent.style.fontSize = ((parseFloat(editor.style.fontSize) || 10) * 1.6) + 'px';
  syncMagnifierToPosition();
}

function syncMagnifierToPosition() {
  if (!magnifierWindow || !magnifierWindow.classList.contains('show')) return;
  const editorRect = editor.getBoundingClientRect();
  // offsetTop excludes entrance/exit transforms, keeping the text steady.
  const sourceY = Math.max(0, editor.scrollTop + magnifierWindow.offsetTop - editorRect.top);
  magnifierContent.scrollTop = sourceY * 1.6;
}

function scrollEditorTo(position) {
  const target = position === 'bottom' ? editor.scrollHeight : 0;
  editor.scrollTo({ top: target, behavior: 'smooth' });
  window.scrollTo({ top: position === 'bottom' ? document.body.scrollHeight : 0, behavior: 'smooth' });
}

function toggleToolPalette() {
  toolPalette.classList.toggle('show');
  toolColorPanel.classList.remove('show');
}

function setToolColor(value, persist = true, syncInput = true) {
  let color = String(value || '').trim();
  if (!color.startsWith('#')) color = '#' + color;
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    color = '#' + color.slice(1).split('').map(char => char + char).join('');
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return false;
  const red = parseInt(color.slice(1, 3), 16);
  const green = parseInt(color.slice(3, 5), 16);
  const blue = parseInt(color.slice(5, 7), 16);
  document.documentElement.style.setProperty('--tool-color', color);
  document.documentElement.style.setProperty('--tool-color-bg', `rgba(${red},${green},${blue},.3)`);
  const colorButton = document.querySelector('.tool-color-btn');
  if (colorButton) colorButton.style.color = color;
  if (persist) localStorage.setItem('tool-color-custom', color);
  if (syncInput) document.getElementById('toolColorInput').value = color.slice(1);
  return true;
}

// CSS owns the motion; no delayed callbacks can hide a reopened panel.
function setFloatingPanelOpen(panel, host, className, open) {
  if (!panel || !host) return;
  if (open && !host.classList.contains(className)) {
    panel.classList.remove('motion-settled');
  }
  panel.inert = !open;
  host.classList.toggle(className, open);
}

// Capture before header drag handlers read bounds; also covers native resize.
[annotationWindow, magnifierWindow].forEach(panel => {
  if (!panel) return;
  panel.addEventListener('pointerdown', () => {
    panel.classList.add('motion-settled');
  }, true);
});

function closeMagnifier() {
  setFloatingPanelOpen(magnifierWindow, magnifierWindow, 'show', false);
}

function closeFloatingPanels() {
  setFloatingPanelOpen(annotationWindow, annotationView, 'active', false);
  closeMagnifier();
}

function toggleMagnifier() {
  const open = !magnifierWindow.classList.contains('show');
  setFloatingPanelOpen(magnifierWindow, magnifierWindow, 'show', open);
  if (open) updateMagnifier();
}

function positionToolPalette() {
  const rect = toolFloatButton.getBoundingClientRect();
  const padding = 8;
  const gap = 10;
  const paletteWidth = Math.min(240, window.innerWidth - padding * 2);
  const paletteHeight = 40;
  const leftSpace = rect.left - padding;
  const rightSpace = window.innerWidth - rect.right - padding;
  let left;
  let top;

  if (leftSpace >= paletteWidth + gap) {
    left = rect.left - paletteWidth - gap;
    top = rect.top + (rect.height - paletteHeight) / 2;
  } else if (rightSpace >= paletteWidth + gap) {
    left = rect.right + gap;
    top = rect.top + (rect.height - paletteHeight) / 2;
  } else {
    left = padding;
    top = rect.bottom + gap;
    if (top + paletteHeight > window.innerHeight - padding) top = rect.top - paletteHeight - gap;
  }

  toolPalette.style.left = Math.max(padding, Math.min(left, window.innerWidth - paletteWidth - padding)) + 'px';
  toolPalette.style.top = Math.max(padding, Math.min(top, window.innerHeight - paletteHeight - padding)) + 'px';
}

function updateEditorMeta() {
  if (!editorMeta || !Draft.currentProjectId) return;
  const p = getProject(Draft.currentProjectId);
  if (!p) return;
  const t = translations[currentLang] || translations.zh;
  const count = editor.innerText.length;
  const edited = p.updatedAt ? new Date(p.updatedAt).toLocaleString(currentLang === 'zh' ? 'zh-CN' : 'en-US') : '-';
  editorMeta.textContent = `${t['char-count'] || 'Characters'}: ${count} · ${t['last-edited'] || 'Last edited'}: ${edited}`;
}

function renderFontList(stack) {
  const list = document.getElementById('fontList');
  list.innerHTML = '';
  stack.forEach((font, index) => {
    const row = document.createElement('div');
    row.className = 'font-list-item';
    row.innerHTML = `<span>${escapeHtml(font)}</span>`;
    const controls = document.createElement('span');
    controls.className = 'font-list-controls';
    [['↑', -1], ['↓', 1], ['×', 0]].forEach(([label, direction]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.disabled = direction === -1 ? index === 0 : direction === 1 ? index === stack.length - 1 : false;
      button.addEventListener('click', () => {
        const p = getProject(Draft.currentProjectId);
        if (!p) return;
        const fonts = [...getFontSettings(p).stack];
        if (direction === 0) fonts.splice(index, 1);
        else [fonts[index], fonts[index + direction]] = [fonts[index + direction], fonts[index]];
        p.fontStack = fonts;
        saveProject(p);
        renderFontList(fonts);
        applyEditorFontSettings(p);
      });
      controls.appendChild(button);
    });
    row.appendChild(controls);
    list.appendChild(row);
  });
}

function openEditorSettings() {
  const p = getProject(Draft.currentProjectId);
  if (!p) return;
  savedEditorSelection = null;
  hideSelectionToolbar();
  const settings = getFontSettings(p);
  document.getElementById('fontSizeInput').value = settings.size;
  document.getElementById('fontSizeRange').value = settings.size;
  renderFontList(settings.stack);
  document.getElementById('editorSettingsDrawer').classList.add('show');
  document.getElementById('editorSettingsOverlay').classList.add('show');
}

function closeEditorSettings() {
  document.getElementById('editorSettingsDrawer').classList.remove('show');
  document.getElementById('editorSettingsOverlay').classList.remove('show');
}

function setEditorFontSize(value) {
  const p = getProject(Draft.currentProjectId);
  if (!p) return;
  const size = Math.max(8, Math.min(12, Number(value) || 10));
  p.fontSize = size;
  saveProject(p);
  document.getElementById('fontSizeInput').value = size;
  document.getElementById('fontSizeRange').value = size;
  applyEditorFontSettings(p);
}

// ===== 删除项目 =====
function deleteProject(id) {
  let projects = getProjects();
  projects = projects.filter(p => p.id !== id);

  if (Draft.currentProjectId === id) {
    Draft.currentProjectId = null;
    Draft.mode = "home";
    Draft.dirty = false;
  }

  saveProjects(projects);
  renderProjects();
}

// ===== 自定义确认弹窗 =====
// options (all optional, existing calls unaffected):
//   title       – heading text (the modal only shows the message by default)
//   confirmText – label for the OK button (defaults to the i18n "确定")
//   cancelText  – label for the cancel button
//   onDismiss   – called when the user cancels
function showConfirm(messageKey, onConfirm, options = {}) {
  const modal = document.getElementById('confirmModal');
  const text = document.getElementById('confirmText');
  const okBtn = document.getElementById('confirmOk');
  const cancelBtn = document.getElementById('confirmCancel');

  const t = translations[currentLang] || translations['zh'];
  const defaultOk = okBtn.textContent;
  const defaultCancel = cancelBtn.textContent;
  // Plain text by default; a title (if given) becomes its own bold line.
  text.textContent = t[messageKey] || messageKey;
  if (options.title) {
    const heading = document.createElement('strong');
    heading.textContent = options.title;
    heading.style.display = 'block';
    heading.style.marginBottom = '8px';
    text.insertBefore(heading, text.firstChild);
  }
  okBtn.textContent = options.confirmText || t['btn-ok'] || defaultOk;
  cancelBtn.textContent = options.cancelText || t['btn-cancel'] || defaultCancel;

  modal.classList.add('show');

  function cleanup() {
    modal.classList.remove('show');
    okBtn.onclick = null;
    cancelBtn.onclick = null;
    okBtn.textContent = defaultOk;
    cancelBtn.textContent = defaultCancel;
  }

  okBtn.onclick = () => {
    cleanup();
    onConfirm();
  };

  cancelBtn.onclick = () => {
    cleanup();
    if (typeof options.onDismiss === 'function') options.onDismiss();
  };
}

// ===== 公共删除逻辑 =====
function deleteFolder(id, includeDrafts, includeFolders) {
  const target = getFolder(id);
  if (!target) return;
  const removed = new Set([id]);
  if (includeFolders) descendants(id).forEach(childId => removed.add(childId));
  let folders = getFolders();
  const parentId = target.parentId || null;
  if (!includeFolders) {
    folders = folders.map(folder => folder.parentId === id ? Object.assign({}, folder, { parentId }) : folder);
  }
  folders = folders.filter(folder => !removed.has(folder.id));
  let projects = getProjects();
  if (includeDrafts) {
    projects = projects.filter(project => !(project.folderIds || []).some(folderId => removed.has(folderId)));
  } else {
    projects = projects.map(project => Object.assign({}, project, {
      folderIds: (project.folderIds || []).filter(folderId => !removed.has(folderId))
    }));
  }
  saveFolders(folders);
  saveProjects(projects);
  if (Draft.folderId && removed.has(Draft.folderId)) {
    Draft.folderId = parentId;
    Draft.homeType = 'folders';
  }
  if (Draft.folderId && !getFolder(Draft.folderId)) Draft.folderId = null;
  updateHomeControls();
  renderProjects();
}

function openFolderDeleteModal(id) {
  Draft.deleteFolderId = id;
  const text = document.getElementById('folderDeleteText');
  if (text) text.textContent = tKey('folder-delete-warning', 'Delete this folder?');
  const drafts = document.querySelector('label[for="deleteIncludingDrafts"] span, #deleteIncludingDrafts + span');
  const folders = document.querySelector('label[for="deleteIncludingFolders"] span, #deleteIncludingFolders + span');
  if (drafts) drafts.textContent = tKey('including-drafts', 'Including drafts');
  if (folders) folders.textContent = tKey('including-folders', 'Including folders');
  document.getElementById('deleteIncludingDrafts').checked = false;
  document.getElementById('deleteIncludingFolders').checked = false;
  document.getElementById('folderDeleteModal').classList.add('show');
}

function closeFolderDeleteModal() {
  document.getElementById('folderDeleteModal').classList.remove('show');
  Draft.deleteFolderId = null;
}

function handleProjectDelete(id) {
  showConfirm('confirm-delete', () => { deleteProject(id); });
}

// ===== 长按相关的全局状态 =====
let pressTimer = null;
let longPressTriggered = false;
let pinProjectId = null;
let renameProjectId = null;
let importanceHintTimer = null;
let touchStartX = 0;
let touchStartY = 0;
const MOVE_THRESHOLD = 10;

// ===== 渲染项目列表 =====
function isFiledInFolder(project) {
  return (project && project.folderIds ? project.folderIds.length : 0) > 0;
}

function draftStatText(count, inFolder) {
  if (inFolder) {
    const key = count === 1 ? 'folder-draft-count-one' : 'folder-draft-count';
    return tKey(key, '{n} drafts in this folder').replace('{n}', String(count));
  }
  const key = count === 1 ? 'filed-count-one' : 'filed-count';
  return tKey(key, '{n} drafts in folders').replace('{n}', String(count));
}

function renderProjects() {
  const t = translations[currentLang] || translations.en || {};
  const folders = getFolders();
  const inFolder = Draft.folderId;
  const showFolders = Draft.homeType === 'folders';
  projectList.innerHTML = '';

  // Filed drafts live under their folders, so the drafts home only lists the rest.
  const allProjects = getProjects();
  const unfiledProjects = allProjects.filter(project => !isFiledInFolder(project));
  const statCount = inFolder
    ? allProjects.filter(project => (project.folderIds || []).includes(inFolder)).length
    : allProjects.filter(isFiledInFolder).length;

  if (!showFolders || inFolder) {
    const summary = document.createElement('div');
    summary.className = 'project-summary';
    summary.textContent = draftStatText(statCount, Boolean(inFolder));
    projectList.appendChild(summary);
  }

  const visibleFolders = showFolders
    ? folders.filter(folder => (folder.parentId || null) === (inFolder || null))
        .sort((a, b) => {
          const d = (b.importance || 0) - (a.importance || 0);
          return d !== 0 ? d : String(a.title || '').localeCompare(String(b.title || ''));
        })
    : [];

  visibleFolders.forEach(folder => {
    const childFolderCount = folders.filter(item => item.parentId === folder.id).length;
    const draftCount = getProjects().filter(project => (project.folderIds || []).includes(folder.id)).length;
    const card = document.createElement('div');
    card.className = 'card folder-card';
    card.dataset.folderId = folder.id;
    const titleSpan = document.createElement('span');
    titleSpan.className = 'card-title';
    titleSpan.textContent = folder.title || '';
    card.appendChild(titleSpan);
    const meta = document.createElement('span');
    meta.className = 'folder-count';
    meta.textContent = (t['folder-count'] || '{folders} folders · {drafts} drafts')
      .replace('{folders}', String(childFolderCount))
      .replace('{drafts}', String(draftCount));
    card.appendChild(meta);
    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'card-settings-btn';
    settingsBtn.type = 'button';
    settingsBtn.innerHTML = '&#9881;';
    settingsBtn.addEventListener('click', event => {
      event.stopPropagation();
      openFolderDrawer(folder.id);
    });
    card.appendChild(settingsBtn);
    projectList.appendChild(card);
  });

  const projects = !showFolders
    ? unfiledProjects
    : (inFolder ? allProjects.filter(p => (p.folderIds || []).includes(inFolder)) : []);

  projects.sort((a, b) => {
    const d = (b.importance || 0) - (a.importance || 0);
    return d !== 0 ? d : (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
  });

  if (!visibleFolders.length && !projects.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:20px;color:#999;text-align:center;';
    if (showFolders) {
      empty.textContent = t['empty-folders'] || t['folder-empty'] || 'No folders yet';
    } else {
      // The leftovers are empty but some drafts may be sitting in folders.
      empty.textContent = statCount > 0
        ? tKey('empty-projects-filed', 'Nothing left here — see Folders')
        : (t['empty-projects'] || '');
    }
    projectList.appendChild(empty);
    return;
  }

  projects.forEach(p => {
    const div = document.createElement('div');
    div.className = 'card';
    div.dataset.projectId = p.id;
    const titleSpan = document.createElement('span');
    titleSpan.className = 'card-title';
    titleSpan.innerText = p.title;
    div.appendChild(titleSpan);
    const editedSpan = document.createElement('span');
    editedSpan.className = 'card-edited-time';
    const editedAt = p.updatedAt || p.createdAt;
    editedSpan.innerText = editedAt ? new Date(editedAt).toLocaleString(currentLang === 'zh' ? 'zh-CN' : 'en-US') : '';
    div.appendChild(editedSpan);
    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'card-settings-btn';
    settingsBtn.type = 'button';
    settingsBtn.innerHTML = '&#9881;';
    settingsBtn.addEventListener('click', e => { e.stopPropagation(); openDrawer(p.id); });
    div.appendChild(settingsBtn);
    projectList.appendChild(div);
  });
}

// ===== 事件代理 =====
projectList.addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  if (card.dataset.folderId) {
    Draft.folderId = card.dataset.folderId;
    Draft.homeType = 'folders';
    updateHomeControls();
    renderProjects();
    return;
  }

  if (longPressTriggered) {
    longPressTriggered = false;
    return;
  }
  openProject(card.dataset.projectId);
});

projectList.addEventListener('touchstart', (e) => {
  const card = e.target.closest('.card');
  if (!card || e.touches.length > 1) return;

  longPressTriggered = false;
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;

  pressTimer = setTimeout(() => {
    longPressTriggered = true;
    if (card.dataset.folderId) openPinModal(card.dataset.folderId, 'folder');
    else openPinModal(card.dataset.projectId, 'draft');
  }, 600);
}, { passive: true });

projectList.addEventListener('touchmove', (e) => {
  if (!pressTimer) return;

  const moveX = Math.abs(e.touches[0].clientX - touchStartX);
  const moveY = Math.abs(e.touches[0].clientY - touchStartY);

  if (moveX > MOVE_THRESHOLD || moveY > MOVE_THRESHOLD) {
    clearTimeout(pressTimer);
    pressTimer = null;
  }
});

projectList.addEventListener('touchend', () => {
  clearTimeout(pressTimer);
  pressTimer = null;
});

projectList.addEventListener('contextmenu', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;

  e.preventDefault();

  if (longPressTriggered) {
    longPressTriggered = false;
    return;
  }

  if (card.dataset.folderId) openPinModal(card.dataset.folderId, 'folder');
  else openPinModal(card.dataset.projectId, 'draft');
});

// ===== 创建新项目 =====
function tKey(key, fallback) {
  const t = translations[currentLang] || translations.en || {};
  return t[key] || fallback;
}

function updateHomeControls() {
  const path = document.getElementById('homePath');
  const draftActions = document.getElementById('draftActions');
  const folderActions = document.getElementById('folderActions');
  const draftTab = document.getElementById('draftTabBtn');
  const folderTab = document.getElementById('folderTabBtn');
  const showFolders = Draft.homeType === 'folders';
  if (path) {
    path.textContent = showFolders
      ? (Draft.folderId ? folderPath(Draft.folderId) : tKey('label-folders', 'Folders'))
      : tKey('label-home', 'Drafts');
  }
  if (draftActions) draftActions.classList.toggle('hidden', showFolders);
  if (folderActions) folderActions.classList.toggle('hidden', !showFolders);
  // Underlined-tab look: the active section also gets the underline.
  if (draftTab) draftTab.classList.toggle('is-active', !showFolders);
  if (folderTab) folderTab.classList.toggle('is-active', showFolders);
  syncTabs();
}

function showDraftHome() {
  Draft.homeType = 'drafts';
  Draft.folderId = null;
  Draft.mode = 'home';
  updateHomeControls();
  renderProjects();
}

function showFolderHome() {
  Draft.homeType = 'folders';
  Draft.folderId = null;
  Draft.mode = 'home';
  updateHomeControls();
  renderProjects();
}

function openNameModal(mode, titleKey, initialValue) {
  Draft.nameModalMode = mode;
  const modal = document.getElementById('nameModal');
  const title = document.getElementById('nameModalTitle');
  const input = document.getElementById('nameModalInput');
  if (!modal || !input) return;
  if (title) title.textContent = tKey(titleKey, 'Name folder');
  input.value = initialValue || '';
  modal.classList.add('show');
  setTimeout(() => input.focus(), 0);
}

function closeNameModal() {
  const modal = document.getElementById('nameModal');
  if (modal) modal.classList.remove('show');
  Draft.nameModalMode = null;
}

function saveNameModal() {
  const input = document.getElementById('nameModalInput');
  const name = input ? input.value.trim() : '';
  if (!name) return;
  if (Draft.nameModalMode === 'create-folder') {
    const now = Date.now();
    const folders = getFolders();
    folders.push({
      id: now + '-' + Math.random().toString(36).slice(2, 8),
      title: name,
      parentId: Draft.homeType === 'folders' ? (Draft.folderId || null) : null,
      importance: 0,
      createdAt: now,
      updatedAt: now
    });
    saveFolders(folders);
    Draft.homeType = 'folders';
    closeNameModal();
    updateHomeControls();
    renderProjects();
    return;
  }
  closeNameModal();
}

function createFolder() {
  openNameModal('create-folder', 'folder-name-title', '');
}

function createProject() {
  const projects = getProjects();
  const t = translations[currentLang] || translations['zh'];
  const now = Date.now();

  const p = {
    id: now.toString(),
    title: t['placeholder-title'] || 'Untitled',
    content: "",
    createdAt: now,
    updatedAt: now,
    openCount: 0,
    importance: 0,
    fontStack: ['Noto Serif HK', 'Cardo'],
    fontSize: 10,
    lastOpenedAt: null,
    annotations: [],
    folderIds: Draft.folderId ? [Draft.folderId] : []
  };

  projects.push(p);
  saveProjects(projects);
  renderProjects();
}

function openPinModal(id, kind) {
  const isFolder = kind === 'folder' || (Boolean(getFolder(id)) && !getProject(id));
  const folder = isFolder ? getFolder(id) : null;
  const project = !isFolder ? getProject(id) : null;
  if (!folder && !project) return;
  pinProjectId = isFolder ? ('folder:' + id) : id;
  const titleEl = document.querySelector('#pinModal [data-i18n="pin-title"]');
  if (titleEl) {
    titleEl.textContent = isFolder ? tKey('pin-folder-title', 'Pin this folder?') : tKey('pin-title', 'Pin this draft?');
  }
  document.getElementById('pinImportance').value = (folder || project).importance || 0;
  document.getElementById('importanceHint').classList.remove('show');
  document.getElementById('pinModal').classList.add('show');
}

function closePinModal() {
  document.getElementById('pinModal').classList.remove('show');
  pinProjectId = null;
}

function openRenameModal(projectId) {
  const p = getProject(projectId);
  if (!p) return;
  renameProjectId = projectId;
  const input = document.getElementById('renameInput');
  input.value = p.title;
  document.getElementById('renameModal').classList.add('show');
  setTimeout(() => input.focus(), 0);
}

function closeRenameModal() {
  document.getElementById('renameModal').classList.remove('show');
  renameProjectId = null;
}

function saveRename() {
  if (!renameProjectId) return;
  if (String(renameProjectId).startsWith('folder:')) {
    const folderId = String(renameProjectId).slice(7);
    const name = document.getElementById('renameInput').value.trim();
    const folders = getFolders();
    const folder = folders.find(item => item.id === folderId);
    if (!folder || !name) return;
    folder.title = name;
    folder.updatedAt = Date.now();
    saveFolders(folders);
    closeRenameModal();
    closeDrawer();
    updateHomeControls();
    renderProjects();
    return;
  }
  const p = getProject(renameProjectId);
  const name = document.getElementById('renameInput').value.trim();
  if (!p || !name) return;
  p.title = name;
  p.updatedAt = Date.now();
  saveProject(p);
  if (Draft.currentProjectId === p.id) {
    document.getElementById('viewerTitle').innerText = p.title;
    titleInput.value = p.title;
  }
  closeRenameModal();
  renderProjects();
}

function savePin() {
  if (!pinProjectId) return;
  const value = parseInt(document.getElementById('pinImportance').value, 10);
  const importance = isNaN(value) ? 0 : Math.max(0, Math.min(99, value));
  if (String(pinProjectId).startsWith('folder:')) {
    const folderId = String(pinProjectId).slice(7);
    const folders = getFolders();
    const folder = folders.find(item => item.id === folderId);
    if (!folder) return;
    folder.importance = importance;
    folder.updatedAt = Date.now();
    saveFolders(folders);
    closePinModal();
    renderProjects();
    return;
  }
  const projects = getProjects();
  const p = projects.find(x => x.id === pinProjectId);
  if (!p) return;
  p.importance = importance;
  p.updatedAt = Date.now();
  saveProjects(projects);
  closePinModal();
  renderProjects();
}

// ===== 保存单个项目 =====
function saveProject(updated) {
  const projects = getProjects();
  const idx = projects.findIndex(p => p.id === updated.id);
  if (idx !== -1) {
    projects[idx] = updated;
    saveProjects(projects);
  }
}

// ===== 注释工作区 =====
function getProjectAnnotations(project) {
  if (!Array.isArray(project.annotations)) project.annotations = [];
  return project.annotations;
}

function getAnnotationText(annotation) {
  return `[${annotation.name || ''}]\n\n${annotation.content || ''}`;
}

function renderAnnotations() {
  if (!annotationList) return;
  const project = getProject(Draft.currentProjectId);
  if (!project) return;

  const t = translations[currentLang] || translations.zh;
  const annotations = getProjectAnnotations(project);
  annotationList.innerHTML = '';

  if (!annotations.length) {
    const empty = document.createElement('div');
    empty.className = 'annotation-empty';
    empty.textContent = t['annotation-empty'] || (currentLang === 'zh' ? '暂无注释' : 'No annotations yet');
    annotationList.appendChild(empty);
    return;
  }

  annotations.forEach((annotation, index) => {
    const card = document.createElement('article');
    card.className = 'annotation-card';
    card.dataset.annotationId = annotation.id;

    const header = document.createElement('div');
    header.className = 'annotation-card-header';

    const nameInput = document.createElement('input');
    nameInput.className = 'annotation-name';
    nameInput.type = 'text';
    nameInput.value = annotation.name || `${t['annotation-default-name'] || 'Annotation'} ${index + 1}`;
    nameInput.placeholder = t['annotation-name-placeholder'] || 'Annotation name';

    const deleteButton = document.createElement('button');
    deleteButton.className = 'annotation-delete';
    deleteButton.type = 'button';
    deleteButton.textContent = '×';
    deleteButton.title = t['btn-delete'] || 'Delete';

    const content = document.createElement('textarea');
    content.className = 'annotation-content';
    content.value = annotation.content || '';
    content.placeholder = t['annotation-content-placeholder'] || 'Write your annotation here';
    content.spellcheck = false;

    const saveField = (field, value) => {
      const currentProject = getProject(Draft.currentProjectId);
      if (!currentProject) return;
      const currentAnnotation = getProjectAnnotations(currentProject).find(item => item.id === annotation.id);
      if (!currentAnnotation) return;
      currentAnnotation[field] = value;
      currentAnnotation.updatedAt = Date.now();
      currentProject.updatedAt = currentAnnotation.updatedAt;
      saveProject(currentProject);
    };

    nameInput.addEventListener('input', () => saveField('name', nameInput.value));
    content.addEventListener('input', () => saveField('content', content.value));
    deleteButton.addEventListener('click', () => deleteAnnotation(annotation.id));

    header.appendChild(nameInput);
    header.appendChild(deleteButton);
    card.appendChild(header);
    card.appendChild(content);
    annotationList.appendChild(card);
  });
}

function addAnnotation() {
  const project = getProject(Draft.currentProjectId);
  if (!project) return;
  const t = translations[currentLang] || translations.zh;
  const now = Date.now();
  const annotations = getProjectAnnotations(project);
  const annotation = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    name: `${t['annotation-default-name'] || 'Annotation'} ${annotations.length + 1}`,
    content: '',
    createdAt: now,
    updatedAt: now
  };
  annotations.push(annotation);
  project.updatedAt = now;
  saveProject(project);
  renderAnnotations();
  const added = annotationList.querySelector(`[data-annotation-id="${annotation.id}"] .annotation-name`);
  if (added) added.focus();
}

function deleteAnnotation(annotationId) {
  const project = getProject(Draft.currentProjectId);
  if (!project) return;
  showConfirm('confirm-delete-annotation', () => {
    project.annotations = getProjectAnnotations(project).filter(annotation => annotation.id !== annotationId);
    project.updatedAt = Date.now();
    saveProject(project);
    renderAnnotations();
  });
}

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
  return Promise.resolve();
}

function copyAnnotations() {
  const project = getProject(Draft.currentProjectId);
  if (!project) return;
  const text = getProjectAnnotations(project).map(getAnnotationText).join('\n\n');
  copyText(text).then(() => showAlert('copy-success')).catch(() => {});
}

function persistEditorDraft() {
  if (!Draft.currentProjectId || Draft.mode !== 'edit') return;
  const project = getProject(Draft.currentProjectId);
  if (!project) return;
  project.content = editor.innerHTML;
  project.title = titleInput.value;
  project.updatedAt = Date.now();
  saveProject(project);
  Draft.dirty = false;
}

function openAnnotationPage() {
  if (!Draft.currentProjectId) return;
  persistEditorDraft();
  savedEditorSelection = null;
  hideSelectionToolbar();
  Draft.mode = 'edit';
  document.body.classList.add('edit-page');
  toolPalette.classList.remove('show');
  toolColorPanel.classList.remove('show');
  document.getElementById('editorView').classList.add('active');
  renderAnnotations();
  setFloatingPanelOpen(annotationWindow, annotationView, 'active', true);
  syncTabs();
}

function closeAnnotationPage() {
  persistEditorDraft();
  setFloatingPanelOpen(annotationWindow, annotationView, 'active', false);
  annotationView.classList.remove('active');
  document.getElementById('editorView').classList.add('active');
  Draft.mode = 'edit';
  syncTabs();
}

// ===== 页面加载时先渲染一次列表 =====
updateHomeControls();
renderProjects();

// ===== 同步 mode-tab 高亮状态 =====
function syncTabs() {
  const tabs = document.querySelectorAll('.mode-tab');
  if (!tabs.length) return;
  const t = translations[currentLang] || translations.en || {};
  const onHome = Draft.mode === 'home';
  const inFolderMode = onHome && Draft.homeType === 'folders';
  tabs[0].classList.toggle('active', onHome);
  if (tabs[1]) {
    tabs[1].classList.toggle('active', !onHome);
    tabs[1].classList.toggle('hidden', onHome);
  }
  tabs[0].textContent = inFolderMode ? (t['btn-back'] || 'Back') : (t['tab-home'] || 'Home');
  if (!tabs[1]) return;
  if (Draft.mode === 'view') tabs[1].textContent = t['tab-editor'] || 'Edit';
  else if (Draft.mode === 'edit') tabs[1].textContent = t['tab-view'] || 'View';
  else tabs[1].textContent = t['tab-editor'] || 'Edit';
}

function handleHomeTabClick() {
  if (Draft.mode !== 'home') {
    goHome();
    return;
  }
  if (Draft.homeType === 'folders') {
    if (Draft.folderId) {
      const current = getFolder(Draft.folderId);
      Draft.folderId = current && current.parentId ? current.parentId : null;
      updateHomeControls();
      renderProjects();
      return;
    }
    showDraftHome();
    return;
  }
  showDraftHome();
}

// ===== 打开项目 =====
function openProject(id) {
  const projects = getProjects();
  const p = projects.find(x => x.id === id);
  if (!p) return;

  p.openCount = (p.openCount || 0) + 1;
  p.lastOpenedAt = Date.now();
  saveProjects(projects);

  Draft.currentProjectId = id;
  savedEditorSelection = null;
  hideSelectionToolbar();
  Draft.mode = "view";
  Draft.dirty = false;
  document.body.classList.remove('edit-page');
  toolFloatButton.classList.remove('visible');
  toolPalette.classList.remove('show');

  closeFloatingPanels();
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('viewer').classList.add('active');

  document.getElementById('viewerTitle').innerText = p.title;
  const renderedViewer = getRenderedDraftHtml(p);
  document.getElementById('viewerContent').innerHTML = renderedViewer.content;
  renderMath(document.getElementById('viewerContent'));
  applyEditorFontSettings(p);

  syncTabs();
}

// ===== 从预览进入编辑模式 =====
function enterEditMode() {
  const id = Draft.currentProjectId;
  if (!id) return;

  const projects = getProjects();
  const p = projects.find(x => x.id === id);
  if (!p) return;

  Draft.mode = "edit";
  document.body.classList.add('edit-page');
  toolFloatButton.classList.add('visible');
  toolPalette.classList.remove('show');
  toolColorPanel.classList.remove('show');

  titleInput.value = p.title;
  editor.innerHTML = p.content;
  applyEditorFontSettings(p);
  updateEditorMeta();

  closeFloatingPanels();
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('editorView').classList.add('active');

  syncTabs();
}

// ===== 从编辑返回预览模式 =====
function enterViewMode() {
  const id = Draft.currentProjectId;
  if (!id) return;

  const projects = getProjects();
  const p = projects.find(x => x.id === id);
  if (!p) return;

  Draft.mode = "view";
  savedEditorSelection = null;
  hideSelectionToolbar();
  document.body.classList.remove('edit-page');
  toolFloatButton.classList.remove('visible');
  toolPalette.classList.remove('show');

  p.content = editor.innerHTML;
  p.title = titleInput.value;
  p.updatedAt = Date.now();
  saveProjects(projects);
  Draft.dirty = false;

  closeFloatingPanels();
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('viewer').classList.add('active');

  document.getElementById('viewerTitle').innerText = p.title;
  const renderedViewer = getRenderedDraftHtml(p);
  document.getElementById('viewerContent').innerHTML = renderedViewer.content;
  renderMath(document.getElementById('viewerContent'));
  applyEditorFontSettings(p);

  syncTabs();
}

// ===== 标题输入实时保存 =====
titleInput.addEventListener("input", () => {
  const projects = getProjects();
  const p = projects.find(x => x.id === Draft.currentProjectId);
  if (!p) return;

  p.title = titleInput.value;
  p.updatedAt = Date.now();
  saveProjects(projects);
  renderProjects();
  updateEditorMeta();
  if (renderPreviewWindow && renderPreviewWindow.classList.contains('show')) {
    const previewProject = getProject(Draft.currentProjectId);
    if (previewProject) {
      previewProject.content = editor.innerHTML;
      previewProject.title = titleInput.value;
      renderDraftPreview(previewProject);
    }
  }
});

// ===== 复制按钮通用逻辑 =====
function setupCopyBtn(btn, sourceEl) {
  btn.addEventListener('click', () => {
    const text = sourceEl.innerText;
    navigator.clipboard.writeText(text).then(() => {
      const t = translations[currentLang] || translations['zh'];
      const originalText = btn.textContent;
      btn.textContent = t['copy-success'] || 'Copied';
      btn.classList.add('copied');

      setTimeout(() => {
        btn.textContent = originalText;
        btn.classList.remove('copied');
      }, 1500);
    }).catch(() => {
      const range = document.createRange();
      range.selectNode(sourceEl);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      document.execCommand('copy');
      window.getSelection().removeAllRanges();
    });
  });
}

setupCopyBtn(editorCopyBtn, editor);
setupCopyBtn(editorTopCopyBtn, editor);
setupCopyBtn(viewerCopyBtn, document.getElementById('viewerContent'));

function getExportFilename(title, extension) {
  const safeTitle = String(title || 'draft')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim() || 'draft';
  return `${safeTitle}.${extension}`;
}

async function downloadExport(filename, content, type) {
  const blob = content instanceof Blob
    ? content
    : new Blob([content], { type: type || 'application/octet-stream' });

  if (isNativeApp()) {
    try {
      const base64 = await blobToBase64(blob);
      await shareNativeFile(filename, base64, undefined, type || blob.type || '');
      return;
    } catch (error) {
      console.error('native export failed', error);
      showExportError(error);
      return;
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function markdownFromNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue.replace(/\u00a0/g, ' ');
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const tag = node.tagName.toLowerCase();
  if (tag === 'br') return '\n';
  if (tag === 'ul' || tag === 'ol') {
    const ordered = tag === 'ol';
    const items = Array.from(node.children).map((item, index) => {
      const marker = ordered ? `${index + 1}.` : '-';
      return `${marker} ${markdownFromNode(item).trim()}`;
    });
    return items.join('\n') + '\n\n';
  }
  if (tag === 'a') {
    const label = Array.from(node.childNodes).map(markdownFromNode).join('').trim();
    return node.href ? `[${label}](${node.href})` : label;
  }

  const content = Array.from(node.childNodes).map(markdownFromNode).join('');
  if (tag === 'strong' || tag === 'b') return `**${content}**`;
  if (tag === 'em' || tag === 'i') return `*${content}*`;
  if (tag === 'code') return `\`${content}\``;
  if (/^h[1-6]$/.test(tag)) return `${'#'.repeat(Number(tag.slice(1)))} ${content.trim()}\n\n`;
  if (tag === 'li') return content;
  if (['p', 'div', 'section', 'article', 'blockquote', 'pre'].includes(tag)) {
    return `${content.trimEnd()}\n\n`;
  }
  return content;
}

function projectMarkdown(project) {
  const container = document.createElement('div');
  container.innerHTML = project.content || '';
  const body = Array.from(container.childNodes).map(markdownFromNode).join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return `# ${project.title || 'Untitled'}\n\n${body}${body ? '\n' : ''}`;
}

function projectPlainText(project) {
  const container = document.createElement('div');
  container.innerHTML = project.content || '';
  return (container.innerText || container.textContent || '').replace(/\u00a0/g, ' ').trim();
}

function rtfText(text) {
  let result = '';
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 10) {
      result += '\\par\n';
    } else if (code === 13) {
      // Ignore CR; LF handles the paragraph break.
    } else if (code === 92 || code === 123 || code === 125) {
      result += `\\${String.fromCharCode(code)}`;
    } else if (code >= 32 && code <= 126) {
      result += String.fromCharCode(code);
    } else {
      result += `\\u${code > 32767 ? code - 65536 : code}?`;
    }
  }
  return result;
}

function rtfColorValue(value) {
  const match = String(value || '').match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (match) return [Number(match[1]), Number(match[2]), Number(match[3])];
  const hex = String(value || '').trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) return [
    parseInt(hex[1].slice(0, 2), 16),
    parseInt(hex[1].slice(2, 4), 16),
    parseInt(hex[1].slice(4, 6), 16)
  ];
  return [17, 17, 17];
}

function projectRtf(project) {
  const settings = getFontSettings(project);
  const renderRoot = document.createElement('div');
  renderRoot.innerHTML = project.content || '';
  renderRoot.style.position = 'fixed';
  renderRoot.style.left = '-100000px';
  renderRoot.style.top = '0';
  renderRoot.style.fontFamily = getProjectFontFamily(project);
  renderRoot.style.fontSize = `${settings.size}px`;
  renderRoot.style.color = '#111';
  document.body.appendChild(renderRoot);

  const fonts = ['Serif'];
  const colors = [[17, 17, 17]];
  const fontIndexes = new Map([['serif', 0]]);
  const colorIndexes = new Map([['17,17,17', 1]]);
  const blockTags = new Set(['address', 'article', 'aside', 'blockquote', 'div', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul']);

  const getFontIndex = computed => {
    const name = (computed.fontFamily || 'Serif').split(',')[0].trim().replace(/^['"]|['"]$/g, '') || 'Serif';
    const key = name.toLowerCase();
    if (!fontIndexes.has(key)) {
      fontIndexes.set(key, fonts.length);
      fonts.push(name.replace(/[{}\\;]/g, ''));
    }
    return fontIndexes.get(key);
  };
  const getColorIndex = computed => {
    const rgb = rtfColorValue(computed.color);
    const key = rgb.join(',');
    if (!colorIndexes.has(key)) {
      colors.push(rgb);
      colorIndexes.set(key, colors.length);
    }
    return colorIndexes.get(key);
  };
  const styleControls = element => {
    const computed = getComputedStyle(element || renderRoot);
    const size = Math.max(8, parseFloat(computed.fontSize) || settings.size);
    const halfPoints = Math.max(8, Math.round(size * 1.5));
    const controls = [`\\f${getFontIndex(computed)}`, `\\fs${halfPoints}`, `\\cf${getColorIndex(computed)}`];
    if (Number(computed.fontWeight) >= 600 || computed.fontWeight === 'bold') controls.push('\\b');
    if (computed.fontStyle === 'italic') controls.push('\\i');
    return controls.join('');
  };
  const renderNode = node => {
    if (node.nodeType === Node.TEXT_NODE) {
      return `{${styleControls(node.parentElement || renderRoot)} ${rtfText(node.nodeValue)}}`;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.tagName.toLowerCase();
    if (tag === 'br') return '\\line\n';
    const content = Array.from(node.childNodes).map(renderNode).join('');
    return blockTags.has(tag) ? `${content}\\par\n` : content;
  };

  const body = Array.from(renderRoot.childNodes).map(renderNode).join('');
  const titleFontIndex = getFontIndex(getComputedStyle(renderRoot));
  const titleStyle = `\\f${titleFontIndex}\\fs36\\cf1\\b`;
  const title = `{${titleStyle} ${rtfText(project.title || 'Untitled')}\\b0}`;
  const fontTable = fonts.map((font, index) => `{\\f${index}\\fnil ${rtfText(font)};}`).join('');
  const colorTable = colors.map(rgb => `\\red${rgb[0]}\\green${rgb[1]}\\blue${rgb[2]};`).join('');
  document.body.removeChild(renderRoot);

  return `{\\rtf1\\ansi\\deff0\\uc1\n{\\fonttbl${fontTable}}\n{\\colortbl;${colorTable}}\n\\viewkind4\n${title}\\par\\par\n${body}}`;
}

function wrapPdfText(context, text, maxWidth) {
  const lines = [];
  String(text || '').split(/\r?\n/).forEach(paragraph => {
    if (!paragraph) {
      lines.push('');
      return;
    }
    let line = '';
    for (const character of paragraph) {
      const candidate = line + character;
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = character;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  });
  return lines;
}


async function fetchTextAsset(relativePath) {
  const response = await fetch(new URL(relativePath, window.location.href));
  if (!response.ok) throw new Error(`Failed to fetch ${relativePath}`);
  return response.text();
}

async function fetchDataUrlAsset(relativePath) {
  const response = await fetch(new URL(relativePath, window.location.href));
  if (!response.ok) throw new Error(`Failed to fetch ${relativePath}`);
  const blob = await response.blob();
  return blobToDataUrl(blob);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('data-url failed'));
    reader.readAsDataURL(blob);
  });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function fetchBase64Asset(relativePath) {
  const response = await fetch(new URL(relativePath, window.location.href));
  if (!response.ok) throw new Error(`Failed to fetch ${relativePath}`);
  return arrayBufferToBase64(await response.arrayBuffer());
}

// Assets are needed for their *bytes*, and the Android WebView cannot hand a
// large one to JS intact:
//  - fetch() goes through WebViewLocalServer.handleLocalRequest(), which passes
//    the stream to a Reader, so every invalid UTF-8 byte becomes U+FFFD and the
//    font gains megabytes of garbage (measured: +7,155,357 bytes on the 16 MB
//    CJK face — that is what produced blank PDFs).
//  - CapacitorHttp dials a real socket to https://localhost, which the WebView
//    serves in-process only, so it fails outright.
//  - Returning the bytes from a plugin call is capped by the bridge itself: the
//    result goes back as evaluateJavascript("window.Capacitor.fromNative(…)")
//    and the WebView drops scripts of a few MB. The CJK face is 21.3 MB of
//    base64, so it never arrived — while the 0.5 MB Cardo face did, which is
//    exactly why only the CJK embed reported "could not be read".
//
// So native code *copies* the asset into the app cache (one small result), and
// the page fetches that file: fetching a cache file keeps the body a Blob, so
// arrayBuffer() yields every byte with no UTF-8 decoding. fetch() of the
// original URL stays as the browser fallback.
const assetBase64Cache = new Map();
const stagedAssetUrls = new Map();

function getAssetStager() {
  const native = getDraftNative();
  const bridge = native && native.Print;
  return bridge && typeof bridge.stageAsset === 'function' ? bridge : null;
}

async function fetchAssetBase64(relativePath) {
  const url = new URL(relativePath, window.location.href).href;
  if (assetBase64Cache.has(url)) return assetBase64Cache.get(url);
  let base64 = '';
  const stager = getAssetStager();
  if (stager && isNativeApp()) {
    // Stage once per asset; the staged copy is stable for this session.
    if (!stagedAssetUrls.has(url)) {
      const staged = await stager.stageAsset({ path: relativePath });
      if (!staged || !staged.url) throw new Error(`Failed to stage ${relativePath}`);
      stagedAssetUrls.set(url, staged.url);
    }
    const response = await fetch(stagedAssetUrls.get(url));
    if (!response.ok) throw new Error(`Failed to read staged ${relativePath} (HTTP ${response.status})`);
    base64 = arrayBufferToBase64(await response.arrayBuffer());
  } else {
    base64 = await fetchBase64Asset(relativePath);
  }
  assertBinaryAsset(relativePath, base64);
  assetBase64Cache.set(url, base64);
  return base64;
}

// A corrupted or empty font would be embedded as a broken @font-face and the
// exported page could print with no text at all. Fail loudly instead.
function base64ByteLength(base64) {
  const clean = String(base64).replace(/[^A-Za-z0-9+/=]/g, '');
  if (!clean) return 0;
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

function assertBinaryAsset(relativePath, base64) {
  const decodedLength = base64ByteLength(base64);
  if (!decodedLength) throw new Error(`${relativePath} is empty`);
  const clean = String(base64).replace(/[^A-Za-z0-9+/=]/g, '');
  const head = atob(clean.slice(0, 8));
  const signature = [0, 1, 2, 3].map(i => head.charCodeAt(i)).join(',');
  // TrueType "true" / OpenType 1.0, OpenType "OTTO", TrueType 1.0
  const ok = signature === '0,1,0,0' || signature === '79,84,84,79' || signature === '0,0,1,0';
  if (!ok) throw new Error(`${relativePath} is not a TTF/OTF font (corrupted download)`);
}

// Local font files usable inside the app. Large CJK files are skipped in
// standalone export and replaced with system font fallbacks so shared HTML
// stays openable outside Capacitor.
// Filled by every standalone export so the UI can tell the user when the
// document depends on system fonts (Chinese).
let lastExportFontReport = { embedded: [], needsSystemFonts: [], tooBig: [] };

// maxBytes guards against a broken/oversized file; the CJK TTFs are ~14-16 MB
// and must pass on the Android WebView too, or Chinese text would print in an
// unknown font. Exports are only "standalone" (self-contained) when the CJK
// file is actually embedded — see `needsSystemFonts`.
const EXPORT_FONT_FILES = {
  'Cardo': [{ path: 'fonts/Cardo-Regular.ttf', weight: '400 700', style: 'normal', maxBytes: 2_000_000 }],
  'Source Serif 4': [
    { path: 'fonts/SourceSerif4-Regular.ttf', weight: '400', style: 'normal', maxBytes: 2_000_000 },
    { path: 'fonts/SourceSerif4-Bold.ttf', weight: '700', style: 'normal', maxBytes: 2_000_000 },
    { path: 'fonts/SourceSerif4-Italic.ttf', weight: '400', style: 'italic', maxBytes: 2_000_000 },
    { path: 'fonts/SourceSerif4-BoldItalic.ttf', weight: '700', style: 'italic', maxBytes: 2_000_000 }
  ],
  'Lora': null,
  'Merriweather': null,
  'Open Sans': null,
  'Roboto': null,
  // CJK: embedding is opt-in in the export dialog (base64 adds ~33%).
  // 'Noto Serif HK' uses the variable Noto Serif HK file.
  'Noto Serif HK': [{ path: 'fonts/NotoSerifHK-Variable.ttf', weight: '200 900', style: 'normal', maxBytes: 20_000_000 }],
  // There is no standalone Noto Serif SC file: Source Han Serif SC stands in
  // for it (subset of Noto Serif CJK SC, same design).
  'Noto Serif SC': [{ path: 'fonts/SourceHanSerifSC-Regular.ttf', weight: '400', style: 'normal', maxBytes: 20_000_000 }]
};

const EXPORT_SYSTEM_FONT_FALLBACKS = {
  'Noto Serif HK': ["'Noto Serif CJK HK'", "'Noto Serif CJK TC'", "'Source Han Serif HK'", "'Source Han Serif TC'", 'serif'],
  'Noto Serif SC': ["'Noto Serif CJK SC'", "'Source Han Serif SC'", "'Songti SC'", "'SimSun'", 'serif'],
  'Cardo': ["'Cardo'", 'Georgia', 'serif'],
  'Source Serif 4': ["'Source Serif 4'", 'Georgia', 'serif'],
  'Lora': ["'Lora'", 'Georgia', 'serif'],
  'Merriweather': ["'Merriweather'", 'Georgia', 'serif'],
  'Open Sans': ["'Open Sans'", 'Arial', 'sans-serif'],
  'Roboto': ["'Roboto'", 'Arial', 'sans-serif']
};

// Families whose glyphs come from the bundled CJK TTFs / Google CJK CSS.
function isCjkFamily(name) {
  return /^(Noto Serif (HK|SC|CJK|TC)|Source Han Serif (HK|SC|TC|CN))$/i.test(String(name || '').trim());
}

// The CJK families the export would add on top of the project's stack.
// `embedCjk` may be true / false / an explicit family name.
function cjkExportFamilies(project, embedCjk) {
  const stack = getFontSettings(project || {}).stack;
  const wanted = [];
  if (typeof embedCjk === 'string') wanted.push(embedCjk);
  for (const name of ['Noto Serif HK', 'Noto Serif SC']) {
    const saved = stack.find(f => f === name);
    if (saved) wanted.push(saved);
  }
  // Fall back to the HK face for any other CJK family name in the stack.
  for (const name of stack) if (isCjkFamily(name)) wanted.push(name);
  return [...new Set(wanted)];
}

// Collects the exact bytes of every @font-face the export will contain. The
// `css` string is only produced by `serializeFontPack`, i.e. once, right before
// the document is handed to the platform — the CJK face alone is ~22 MB of
// base64, and every extra copy of it (chunks joined twice, TemplateStrings, the
// plugin-call JSON string) is another ~22–66 MB on a phone.
async function buildEmbeddedFontCss(project, options = {}) {
  const family = getProjectFontFamily(project || {});
  // CDN edition without bundled CJK fonts: let Google Fonts serve everything.
  if (getAssetMode() === 'cdn' && !hasLocalCjkFonts()) {
    return { css: '', faces: [], family, headLinks: [`<link rel="stylesheet" href="${GOOGLE_FONTS_CSS}">`], embedded: [], needsSystemFonts: [], tooBig: [] };
  }

  const settings = getFontSettings(project || {});
  // Each entry: { name, head, base64, tail } — one @font-face per entry.
  const faces = [];
  const familyNames = [];
  const seen = new Set();
  // Which CJK families to pull in this time: false = none (default: exports
  // stay text-only and rely on system fonts), true = the project's CJK fonts,
  // or an explicit family name from the export dialog.
  const cjkWanted = options.embedCjk ? cjkExportFamilies(project, options.embedCjk) : [];
  const tooBig = [];
  const classicNames = settings.stack.filter(name => !isCjkFamily(name));
  const quote = name => `'${String(name).replace(/'/g, '')}'`;

  for (const name of [...classicNames, 'Noto Serif HK', 'Noto Serif SC', 'Cardo']) {
    if (!name || seen.has(name)) continue;
    if (isCjkFamily(name) && !cjkWanted.includes(name)) continue;
    seen.add(name);
    familyNames.push(name);
    const specs = Object.prototype.hasOwnProperty.call(EXPORT_FONT_FILES, name)
      ? EXPORT_FONT_FILES[name]
      : (isCjkFamily(name) ? EXPORT_FONT_FILES['Noto Serif HK'] : null);
    if (!specs) continue;
    for (const spec of specs) {
      try {
        const base64 = await fetchAssetBase64(spec.path);
        const bytes = base64ByteLength(base64);
        if (bytes > (spec.maxBytes || 2_000_000)) {
          if (isCjkFamily(name)) tooBig.push({ family: name, reason: 'too-big' });
          continue;
        }
        const format = spec.path.endsWith('.woff2') ? 'woff2' : spec.path.endsWith('.woff') ? 'woff' : 'truetype';
        // font-display:block — a `swap` face paints nothing until it loads, and
        // the PDF snapshot may be taken before that.
        const head = `@font-face{font-family:'${String(name).replace(/'/g, '')}';font-style:${spec.style};font-weight:${spec.weight};font-display:block;src:url(data:font/${format === 'truetype' ? 'ttf' : format};base64,`;
        const tail = `) format('${format}');}`;
        faces.push({ name, head, base64, tail });
      } catch (error) {
        console.warn('embed font failed', name, error);
        if (isCjkFamily(name)) tooBig.push({ family: name, reason: 'unreadable', detail: String((error && error.message) || error) });
      }
    }
  }

  // Font stack for the exported document: the embedded families first (so the
  // font that actually ships in the file wins), then system fallbacks for
  // whatever was not embedded. CJK faces go after the Latin faces: Latin fonts
  // have no CJK glyphs, so the browser falls through per character.
  const embeddedNames = new Set(faces.map(face => face.name));
  const latinOrder = [...new Set([...familyNames.filter(n => !isCjkFamily(n)), 'Cardo'])];
  const cjkOrder = [...new Set([...familyNames.filter(isCjkFamily),
    ...(options.embedCjk ? ['Noto Serif HK', 'Noto Serif SC'] : [])])];
  const stackParts = [];
  const push = value => { if (value && !stackParts.includes(value)) stackParts.push(value); };
  for (const name of latinOrder) push(embeddedNames.has(name) ? null : (EXPORT_SYSTEM_FONT_FALLBACKS[name] || [])[0] || quote(name));
  for (const name of latinOrder) if (embeddedNames.has(name)) push(quote(name));
  for (const name of cjkOrder) push(embeddedNames.has(name) ? quote(name) : null);
  for (const name of cjkOrder) for (const fallback of EXPORT_SYSTEM_FONT_FALLBACKS[name] || []) push(fallback);
  push('serif');
  const stackedFamily = stackParts.join(', ');

  // CJK families that the document will need but that are NOT inside it.
  const cjkRequired = options.embedCjk ? cjkExportFamilies(project, options.embedCjk) : [];
  const needsSystemFonts = cjkRequired.filter(name => !embeddedNames.has(name));

  return {
    css: '',
    faces,
    family: stackedFamily || family,
    headLinks: [],
    embedded: [...embeddedNames],
    needsSystemFonts,
    tooBig
  };
}

// The @font-face rules as text. Only call this once per export, as late as
// possible: it materialises the full base64 of every embedded font.
function serializeFontCss(fontPack) {
  const faces = (fontPack && fontPack.faces) || [];
  if (!faces.length) return (fontPack && fontPack.css) || '';
  // Sequential concatenation: V8 flattens cons strings on the first index
  // access / parse of the result, so one pass is enough.
  let css = '';
  for (let i = 0; i < faces.length; i += 1) {
    const face = faces[i];
    css += face.head + face.base64 + face.tail;
    if (i < faces.length - 1) css += '\n';
  }
  return css;
}

// Turn the export into HTML pieces: template chunks separated by the base64 of
// each embedded font. Used by the native print path, which writes the export to
// a file through the Filesystem plugin instead of passing a ~22 MB string
// through one Capacitor plugin call (Jenkins hash + JSON string + JSON parse on
// the native side, all doubling the memory).
function splitExportHtmlForChunks(html, fontPack) {
  const faces = (fontPack && fontPack.faces) || [];
  if (!faces.length) return [html];
  const pieces = [];
  let cursor = 0;
  for (const face of faces) {
    const at = html.indexOf(face.base64, cursor);
    if (at < 0) return [html]; // unexpected: fall back to the plain document
    pieces.push(html.slice(cursor, at), face.base64);
    cursor = at + face.base64.length;
  }
  pieces.push(html.slice(cursor));
  return pieces;
}

async function buildInlinedKatexCss() {
  if (getAssetMode() === 'cdn') {
    try {
      const response = await fetch(`${KATEX_CDN_BASE}/katex.min.css`);
      if (!response.ok) throw new Error('katex css fetch failed');
      let css = await response.text();
      css = css.replace(/url\((fonts\/[^)]+)\)/g, `url(${KATEX_CDN_BASE}/$1)`);
      return { css, headLinks: [] };
    } catch (error) {
      console.warn('cdn katex css failed', error);
      return {
        css: '',
        headLinks: [`<link rel="stylesheet" href="${KATEX_CDN_BASE}/katex.min.css">`]
      };
    }
  }

  let css = await fetchTextAsset('vendor/katex/katex.min.css');
  const urls = Array.from(css.matchAll(/url\((fonts\/[^)]+)\)/g)).map(match => match[1]);
  const unique = [...new Set(urls)];
  for (const rel of unique) {
    try {
      const dataUrl = await fetchDataUrlAsset(`vendor/katex/${rel}`);
      css = css.split(`url(${rel})`).join(`url(${dataUrl})`);
    } catch (error) {
      console.warn('katex font embed failed', rel, error);
    }
  }
  return { css, headLinks: [] };
}



function buildExportDom(project, options = {}) {
  const renderedMode = options.rendered === true;
  const settings = getFontSettings(project || {});
  const titleText = (project && project.title) || 'Untitled';
  const family = getProjectFontFamily(project || {});
  const size = settings.size;
  const bodySource = renderedMode
    ? getRenderedDraftHtml(project).content
    : (project && project.content ? project.content : '<p><br></p>');

  const host = document.createElement('div');
  host.className = 'export-render-root';
  host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;';
  host.style.fontFamily = family;
  host.style.fontSize = `${size}px`;
  host.style.lineHeight = '1.6';
  host.innerHTML = `<div class="export-body">${bodySource}</div>`;
  document.body.appendChild(host);
  applyRelativeFontSizes(host, size);
  if (renderedMode) renderMath(host);
  const bodyHtml = host.querySelector('.export-body').innerHTML;
  const plainText = (host.innerText || host.textContent || '').replace(/\u00a0/g, ' ').trim();
  document.body.removeChild(host);

  return {
    title: escapeHtml(titleText),
    titleText,
    bodyHtml,
    plainText,
    family,
    size,
    rendered: renderedMode
  };
}

async function buildStandaloneExportHtml(project, options = {}) {
  const renderedMode = options.rendered === true;
  const snapshot = buildExportDom(project, { rendered: renderedMode });
  const fontPack = await buildEmbeddedFontCss(project, { embedCjk: options.embedCjk });
  const family = fontPack.family || snapshot.family;
  const fontCss = fontPack.css || '';
  const headLinks = [...(fontPack.headLinks || [])];
  // Not serialised here: the CJK base64 is ~22 MB and only gets joined when the
  // document is actually assembled (see the end of this function).
  const faces = fontPack.faces || [];
  // Only pull KaTeX CSS when the export actually contains rendered math markup.
  let katexCss = '';
  if (renderedMode) {
    const katexPack = await buildInlinedKatexCss();
    katexCss = katexPack.css || '';
    headLinks.push(...(katexPack.headLinks || []));
  }
  const printable = options.printable === true;
  const toolbar = printable ? `
  <div class="preview-toolbar">
    <button id="printButton" type="button">Print / Save as PDF</button>
  </div>` : '';
  const toolbarScript = printable ? `
  <script>
    var printButton = document.getElementById('printButton');
    if (printButton) printButton.addEventListener('click', function () { window.print(); });
  <\/script>` : '';
  const modeNote = renderedMode ? 'rendered' : 'source';
  lastExportFontReport = {
    embedded: fontPack.embedded || [],
    needsSystemFonts: fontPack.needsSystemFonts || [],
    tooBig: fontPack.tooBig || []
  };

  const documentHtml = (embeddedCss, answer) => `<!DOCTYPE html>
<html lang="${currentLang === 'zh' ? 'zh-CN' : 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="draft-export" content="${modeNote}">
  <title>${snapshot.title}</title>
  ${headLinks.join('\n  ')}
  <style>
${embeddedCss}
${katexCss}
    @page { size: A4; margin: 18mm 16mm; }
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #eef2f7;
      color: #111;
      font-family: ${family};
    }
    .preview-toolbar {
      position: sticky;
      top: 0;
      z-index: 1;
      display: flex;
      gap: 8px;
      padding: 12px 16px;
      background: rgba(255, 255, 255, .96);
      border-bottom: 1px solid #d7dee8;
    }
    .preview-toolbar button {
      border: 1px solid #1F7FFF;
      border-radius: 0;
      padding: 7px 12px;
      background: #1F7FFF;
      color: #fff;
      font: inherit;
      cursor: pointer;
    }
    .pdf-page {
      max-width: 210mm;
      min-height: 297mm;
      margin: 24px auto;
      padding: 18mm 16mm;
      background: #fff;
      box-shadow: 0 2px 14px rgba(0, 0, 0, .12);
    }
    h1 {
      margin: 0 0 24px;
      font-size: 2em;
      line-height: 1.2;
      font-weight: 700;
      overflow-wrap: anywhere;
      font-family: ${family};
    }
    .pdf-content {
      font-family: ${family};
      font-size: ${snapshot.size}px;
      line-height: 1.6;
      overflow-wrap: anywhere;
    }
    .pdf-content img { max-width: 100%; }
    @media print {
      body { background: #fff; }
      .preview-toolbar { display: none !important; }
      .pdf-page {
        max-width: none;
        min-height: 0;
        margin: 0;
        padding: 0;
        box-shadow: none;
      }
    }
  </style>
</head>
<body>
  ${toolbar}
  <main class="pdf-page">
    <h1>${snapshot.title}</h1>
    <div class="pdf-content">${snapshot.bodyHtml}</div>
  </main>
  ${toolbarScript}
</body>
</html>`;

  if (options.chunks === true) {
    // Native print path: it writes the file itself, so return the document in
    // pieces (template + text answers, then one base64 chunk per font). No step
    // then has to build or transmit a ~22 MB string.
    const html = documentHtml(serializeFontCss(fontPack));
    return {
      pieces: splitExportHtmlForChunks(html, fontPack),
      faceCount: faces.length,
      family,
      report: lastExportFontReport
    };
  }
  return documentHtml(serializeFontCss(fontPack));
}


function getProjectFontFamily(project) {
  const settings = getFontSettings(project || {});
  const fallbackStack = [...settings.stack, 'Noto Serif HK', 'Noto Serif SC', 'Cardo', 'serif'];
  return [...new Set(fallbackStack)]
    .map(name => `'${String(name).replace(/'/g, '')}'`)
    .join(', ');
}

// ---------------------------------------------------------------------------
// PDF export on device
// 1. Preferred: the native PrintBridge (offline edition) hands the exact HTML
//    to Android's print framework, which renders with the bundled CJK font and
//    offers "Save as PDF". No iframe, no WebView print() quirks.
// 2. Otherwise: share the standalone HTML file (works everywhere).
// Every failure path must tell the user — silent no-ops are the bug we are
// fixing.
// ---------------------------------------------------------------------------

function getPrintBridge() {
  const native = getDraftNative();
  const bridge = native && native.Print;
  return bridge && typeof bridge.printHtml === 'function' ? bridge : null;
}

// The native side keeps a hidden WebView alive while the system print dialog is
// open; give the user time to choose, then let it go.
function releasePrintBridge(bridge) {
  if (!bridge || typeof bridge.cleanup !== 'function') return;
  setTimeout(() => {
    bridge.cleanup().catch(error => console.warn('print cleanup failed', error));
  }, 120000);
}

// Visible progress while the (possibly 20 MB) export is built in memory.
let exportBusyCount = 0;
function setExportBusy(busy) {
  exportBusyCount = Math.max(0, exportBusyCount + (busy ? 1 : -1));
  const el = document.querySelector('.loading');
  if (!el) return;
  el.classList.toggle('show', exportBusyCount > 0);
}

// Always visible feedback on failure; the reason stays in the console.
function showExportError(error) {
  const message = String((error && (error.message || error)) || '').slice(0, 300);
  console.error('export error:', error);
  if (message) {
    const text = document.getElementById('alertText');
    if (text) {
      const t = translations[currentLang] || translations['zh'];
      const reason = document.createElement('span');
      reason.textContent = message;
      reason.style.display = 'block';
      reason.style.marginTop = '6px';
      reason.style.fontSize = '0.85em';
      reason.style.opacity = '0.75';
      reason.style.wordBreak = 'break-word';
      text.textContent = t['export-failed-detail'] || '导出失败';
      text.appendChild(reason);
      const modal = document.getElementById('alertModal');
      const okBtn = document.getElementById('alertOk');
      if (modal && okBtn) {
        modal.classList.add('show');
        okBtn.onclick = () => modal.classList.remove('show');
        return;
      }
    }
  }
  showAlert('export-failed-detail');
}

// Failure alert with a "retry" button (same markup as showExportError).
function showExportRetryAlert(key) {
  const t = translations[currentLang] || translations['zh'];
  const text = document.getElementById('alertText');
  const modal = document.getElementById('alertModal');
  const okBtn = document.getElementById('alertOk');
  if (text && modal && okBtn) {
    text.textContent = t[key] || key;
    modal.classList.add('show');
    okBtn.textContent = t['btn-retry'] || 'Retry';
    okBtn.onclick = () => {
      modal.classList.remove('show');
      okBtn.textContent = t['btn-ok'] || t['btn-close'] || 'OK';
      retryLastExport();
    };
    return;
  }
  showAlert(key);
}

// Filesystem.writeFile only accepts a plain base64 string. Passing raw HTML
// makes Capacitor fail JSON.stringify on the plugin call → bare "Data cannot be
// converted to a JSON value" and no share sheet. Always hand it base64.
function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(String(text));
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Keep a copy of the last export so a failure can be retried after the big
// embedded HTML has been dropped from memory.
let lastExportPayload = null;

// Strips line breaks and spaces only. Never route an exported document through
// atob()/decodeURIComponent: that is quadratic and hangs on a 22 MB payload.
function normalizeBase64(base64) {
  return String(base64 || '').replace(/[\r\n\t ]+/g, '');
}

// Filesystems.writeFile({ data }) runs every byte of `data` through
// Base64.decode() *and* the plugin call through a Jenkins hash before the call
// leaves the WebView. Skipping base64 entirely is only possible for text, so the
// export is written as base64 — but straight to the cache dir, without the extra
// copy shareNativeFile() makes for the share sheet.
async function writeCacheFile(filename, base64) {
  const native = getDraftNative();
  if (!native) throw new Error('native bridge missing');
  const path = `exports/${filename}`;
  await native.Filesystem.writeFile({
    path,
    data: base64Payload(base64),
    directory: native.Directory.Cache,
    recursive: true
  });
  const uri = await native.Filesystem.getUri({ path, directory: native.Directory.Cache });
  return uri.uri;
}

// Same file, shared through the Android share sheet.
async function shareCacheFile(filename, base64, mimeType) {
  const native = getDraftNative();
  if (!native) throw new Error('native bridge missing');
  const path = `exports/${filename}`;
  const written = await native.Filesystem.writeFile({
    path,
    data: base64Payload(base64),
    directory: native.Directory.Cache,
    recursive: true
  });
  let uri = written && written.uri;
  if (!uri) uri = await writeCacheFile(filename, base64);
  try {
    await native.Share.share({ title: filename, url: uri, dialogTitle: filename, ...(mimeType ? { files: [uri], mimeType } : {}) });
  } catch (error) {
    if (/cancel/i.test(String((error && error.message) || ''))) return;
    throw error;
  }
}

// One piece of splitExportHtmlForChunks() → plain base64 of its bytes. Odd
// pieces are already the base64 of an embedded font and pass through untouched;
// even pieces are template/text and get encoded individually (utf8 → base64).
function pieceToBase64(piece, index) {
  return index % 2 === 1 ? normalizeBase64(piece) : utf8ToBase64(piece);
}

// Joins the per-piece base64 so that Filesystem decodes it back to the exact
// bytes of the document. Two pieces can only be concatenated directly when the
// bytes seen so far end on a 3-byte boundary (and the next piece carries no '='
// padding); anywhere else the boundary is rebuilt from the decoded bytes (see
// base64Payload()).
function piecesToBase64(pieces) {
  // each piece's base64, plus whether it is a binary (font) piece
  return pieces.map((piece, index) => ({ index, text: pieceToBase64(piece, index), binary: index % 2 === 1 }));
}

// Filesystem.writeFile({data}) base64-decodes exactly one string, so the pieces
// of an export have to be handed over as a single base64 payload *string*.
// Base64 packs 3 bytes into 4 characters, so two encoded pieces can only be glued
// as characters while the earlier one ends on a 3-byte boundary (length % 4 === 0
// and no padding). Anywhere else the boundary has to be re-encoded, and the only
// correct way to do that is over the *bytes* the pieces stand for:
//
//   bytes(base64(a) + base64(b)) == bytes(a) ++ bytes(b)
//
// `tail` holds the < 3 leftover bytes of the last partial 3-byte group. Its
// length — not the character count of the last piece — is the only reliable
// "is the stream aligned?" signal: a piece whose base64 ended in '=' has had
// that padding stripped here, so it contributes a partial group while its text
// may still look aligned. The leftover bytes are prepended to the next piece
// (which is decoded and re-encoded) or flushed on their own at the very end.
// The ~22 MB font piece is copied as characters only when the stream really is
// on a 3-byte boundary; otherwise it is decoded like any other piece.
//
// The payload is returned without trailing '=', because those bytes are implied
// by the pieces themselves; Android's Base64 decoder restores them.
const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Alphabet index of a base64 character code, or -1 for anything else.
function base64Value(code) {
  if (code >= 65 && code <= 90) return code - 65; // A-Z
  if (code >= 97 && code <= 122) return code - 71; // a-z
  if (code >= 48 && code <= 57) return code + 4; // 0-9
  if (code === 43) return 62; // +
  if (code === 47) return 63; // /
  return -1;
}

// base64 (no padding required) → bytes. Used for the tiny text pieces only; the
// multi-megabyte font piece is copied as characters and never decoded here.
function base64ToBytes(base64) {
  const clean = normalizeBase64(base64).replace(/=+$/, '');
  const out = new Uint8Array(Math.floor(clean.length * 6 / 8));
  let at = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const value = base64Value(clean.charCodeAt(i));
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[at] = (buffer >> bits) & 0xff;
      at += 1;
    }
  }
  return out.subarray(0, at);
}

// bytes → base64, without the trailing '=' padding (the payload never carries
// it; Android's decoder restores the missing bytes on its own).
function bytesToBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64_ALPHABET[b0 >> 2];
    out += B64_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    if (i + 1 < bytes.length) out += B64_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)];
    if (i + 2 < bytes.length) out += B64_ALPHABET[b2 & 0x3f];
  }
  return out;
}

function base64Payload(parts) {
  if (typeof parts === 'string') return normalizeBase64(parts).replace(/=+$/, '');
  // [{ text, binary }] — every `text` is already base64.
  const list = (parts || []).filter(part => part && part.text);
  if (list.length === 0) return '';
  if (list.length === 1) return normalizeBase64(list[0].text).replace(/=+$/, '');
  // Decode each piece to raw bytes and concatenate. Text pieces are tiny, and a
  // phase-aligned font piece is copied as characters instead (see below).
  let out = '';
  let tail = new Uint8Array(0); // bytes of a not-yet-emitted 3-byte group (0..2 bytes)
  const flushTail = () => {
    if (tail.length > 0) { out += bytesToBase64(tail); tail = new Uint8Array(0); }
  };
  for (const part of list) {
    const text = normalizeBase64(part.text).replace(/=+$/, '');
    // A font piece can be copied as characters only when the *byte* stream is on
    // a 3-byte boundary. A previous piece whose base64 ended in '=' leaves a
    // partial group behind even though the character count looks aligned, so the
    // padding has to be tracked separately from the tail bytes.
    if (part.binary && tail.length === 0 && text.length % 4 === 0) {
      out += text;
      continue;
    }
    const bytes = base64ToBytes(text);
    if (tail.length === 0) {
      // Aligned stream: complete 3-byte groups are identical before and after
      // base64, so a (large) font piece can be copied as characters and only
      // its last partial group has to go through bytes.
      const aligned = bytes.length - (bytes.length % 3);
      if (aligned > 0) {
        out += part.binary ? text.slice(0, (aligned / 3) * 4) : bytesToBase64(bytes.subarray(0, aligned));
      }
      // Whatever is left over (< 3 bytes) must wait for the next piece, or be
      // flushed at the very end — never emitted on its own.
      tail = bytes.slice(aligned);
      continue;
    }
    // Unaligned: glue the pending 0..2 bytes in front of this piece's bytes.
    const merged = new Uint8Array(tail.length + bytes.length);
    merged.set(tail, 0);
    merged.set(bytes, tail.length);
    const aligned = merged.length - (merged.length % 3);
    out += bytesToBase64(merged.subarray(0, aligned));
    tail = merged.slice(aligned);
  }
  flushTail();
  return out;
}

// Share the standalone HTML document. `pieces` is the chunked form from
// buildStandaloneExportHtml({ chunks: true }): the utf8→base64 conversion is
// done piece by piece, so the WebView never holds two 22 MB copies at once.
async function shareExportPieces(pieces, filename) {
  await shareCacheFile(filename, piecesToBase64(pieces), 'text/html');
}

function htmlFromPieces(pieces) {
  return pieces.join('');
}

// Print through the native PrintPlugin: the export HTML is written to
// /data/data/<pkg>/cache/print/html/ through Filesystem (base64, piece by piece)
// and the plugin loads that file in a hidden WebView, handing its
// PrintDocumentAdapter to Android's print framework.
async function printHtmlAsPdf(htmlOrPieces, filename) {
  const pieces = Array.isArray(htmlOrPieces) ? htmlOrPieces : [htmlOrPieces];
  lastExportPayload = { pieces, filename };
  const bridge = getPrintBridge();
  if (bridge) {
    try {
      // 22 MB of base64 as a plugin *argument* means Jenkins hash + JSON string
      // + JSON parse + a second copy on the native side; writing the file
      // directly keeps a single encoded copy alive.
      await writeCacheFile(`print/${filename}`, piecesToBase64(pieces));
      await bridge.printHtml({ fileName: filename, cachePath: `print/${filename}` });
      // The native side owns its WebView until the print job is done; releasing
      // it earlier is what produced truncated / blank PDFs.
      releasePrintBridge(bridge);
      return;
    } catch (error) {
      console.error('native print failed, falling back to sharing the HTML', error);
      if (await shareExportPieces(pieces, filename).then(() => true, (e) => {
        console.error('share fallback failed', e);
        return false;
      })) {
        showAlert('export-print-fallback');
        return;
      }
      showAlert('export-failed-detail');
      return;
    }
  }

  try {
    await shareExportPieces(pieces, filename);
    showAlert('export-shared-html');
  } catch (error) {
    console.error('share export failed', error);
    showExportError(error);
  }
}

// Retry entry point used by the failure alert.
async function retryLastExport() {
  const payload = lastExportPayload;
  if (!payload) return;
  await printHtmlAsPdf(payload.pieces, payload.filename);
}

const CJK_EMBED_COPY = {
  zh: {
    title: '导出 PDF',
    message: '是否把中文字体一起写进文件？内嵌后任何设备都能正确显示中文，但文件会大约增加 %SIZE%，导出也更慢。',
    embed: '内嵌中文字体',
    system: '不内嵌（仅依赖系统字体）',
    cancel: '取消'
  },
  en: {
    title: 'Export PDF',
    message: 'Embed the Chinese font into the file? Embedded text renders everywhere, but the file grows by about %SIZE% and export takes longer.',
    embed: 'Embed Chinese font',
    system: 'Do not embed (system fonts only)',
    cancel: 'Cancel'
  }
};

// Asks the user once, before anything is built, whether the Chinese font should
// travel inside the file. Resolves true (embed), false (system fonts) or null
// (cancelled — the caller must then do nothing at all).
async function chooseCjkEmbedding(project) {
  const forced = isCjkEmbeddingForced();
  if (forced) return forced === 'embed';
  const stack = getFontSettings(project || {}).stack;
  const usesCjk = stack.some(isCjkFamily);
  const canEmbed = getAssetMode() === 'local' || hasLocalCjkFonts();
  if (!usesCjk || !canEmbed) return false; // nothing to embed / no file to embed
  if (!document.getElementById('exportChoiceModal')) return true; // headless: be safe

  const copy = CJK_EMBED_COPY[currentLang === 'zh' ? 'zh' : 'en'];
  const sizeHint = getAssetMode() === 'local' ? '15–20 MB' : '20–27 MB';
  return new Promise(resolve => {
    openExportChoice({
      title: copy.title,
      message: copy.message.replace('%SIZE%', sizeHint),
      actions: [
        { label: copy.embed, value: true, variant: 'primary' },
        { label: copy.system, value: false },
        { label: copy.cancel, value: null, variant: 'ghost' }
      ]
    }).then(resolve);
  });
}

// Generic in-app decision sheet (works without prompt()/confirm(), which are
// unreliable in the Android WebView). Resolves the chosen value, or null when a
// 'ghost'/dismiss action is used. Content and buttons are plain DOM nodes, so no
// i18n keys are required for one-off messages.
function openExportChoice({ title, message, actions }) {
  return new Promise(resolve => {
    const modal = document.getElementById('exportChoiceModal');
    const titleEl = document.getElementById('exportChoiceTitle');
    const textEl = document.getElementById('exportChoiceText');
    const buttonsEl = document.getElementById('exportChoiceButtons');
    if (!modal || !titleEl || !textEl || !buttonsEl) {
      resolve(true);
      return;
    }
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      modal.classList.remove('show');
      buttonsEl.innerHTML = '';
      resolve(value);
    };
    titleEl.textContent = title || '';
    textEl.textContent = message || '';
    buttonsEl.innerHTML = '';
    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `export-choice-btn${action.variant ? ' ' + action.variant : ''}`;
      button.textContent = action.label;
      button.addEventListener('click', () => finish(action.value));
      buttonsEl.appendChild(button);
    }
    modal.classList.add('show');
  });
}

// Test/support hook: window.DRAFT_CJK_EMBED = 'embed' | 'system' skips the prompt.
function isCjkEmbeddingForced() {
  const forced = String(window.DRAFT_CJK_EMBED || '').toLowerCase();
  return forced === 'embed' || forced === 'system' ? forced : '';
}

async function exportPdf(project, options = {}) {
  if (!project) {
    showAlert('alert-select-project');
    return;
  }

  if (Draft.currentProjectId === project.id && Draft.mode === 'edit') {
    persistEditorDraft();
    project = getProject(project.id) || project;
  }

  // rendered:true  => Render Preview export (markdown + math)
  // rendered:false => direct export (editor source, no markdown/math pass)
  const renderedMode = options.rendered === true;

  // Ask BEFORE building: a 20 MB embed (or a cancelled export) must not sit
  // behind a long silent build or leave the UI half-open.
  setExportBusy(true);
  let embedCjk = false;
  // Native: the document stays split (chunks) so no single ~22 MB string is
  // ever handed from one layer to the next. Browser: one HTML string.
  const nativeApp = isNativeApp();
  let html = '';
  let pieces = [];
  let faceCount = 0;
  try {
    embedCjk = await chooseCjkEmbedding(project);
    if (embedCjk === null) return; // user cancelled — nothing happens
    const built = await buildStandaloneExportHtml(project, {
      rendered: renderedMode,
      printable: !nativeApp,
      embedCjk,
      chunks: nativeApp
    });
    if (nativeApp) {
      pieces = built.pieces;
      faceCount = built.faceCount;
    } else {
      html = built;
    }
    // Remember the choice so the next export is one tap.
    Draft.cjkEmbedPref = embedCjk;
  } catch (error) {
    console.error('export build failed', error);
    showExportError(error);
    return;
  } finally {
    setExportBusy(false);
  }

  if (nativeApp) {
    // Only jump to the in-app preview when exporting the rendered version.
    if (renderedMode && renderPreviewWindow) {
      renderDraftPreview(project);
      renderPreviewWindow.classList.add('show');
    }
    const filename = getExportFilename(project.title, 'html').replace(/\.html$/i, '.rendered.html');
    // A document that failed to embed its fonts must not silently become a
    // blank-looking PDF: say so, and put a retry on the alert.
    const unreadable = (lastExportFontReport.tooBig || []).filter(item => item.reason === 'unreadable');
    if (unreadable.length && faceCount === 0) {
      console.warn('CJK font embed failed', unreadable);
      lastExportPayload = { pieces, filename };
      showExportRetryAlert('export-embed-failed');
      return;
    }
    // Offline PrintBridge writes a real PDF; browsers keep print + share the HTML.
    await printHtmlAsPdf(pieces, filename);
    // Be explicit about a font that was asked for but could not be embedded:
    // that is exactly how a "blank looking" PDF used to be produced silently.
    if ((lastExportFontReport.needsSystemFonts || []).length) showAlert('export-needs-system-fonts');
    return;
  }

  const preview = window.open('', '_blank', 'width=900,height=1000');
  if (!preview) {
    const filename = renderedMode
      ? getExportFilename(project.title, 'html').replace(/\.html$/i, '.rendered.html')
      : getExportFilename(project.title, 'html').replace(/\.html$/i, '.source.html');
    await downloadExport(filename, html, 'text/html;charset=utf-8');
    showAlert('export-popup-blocked');
    return;
  }
  preview.document.open();
  preview.document.write(html);
  preview.document.close();
}

async function exportProject(format, projectId = Draft.drawerProjectId || Draft.currentProjectId) {
  if (projectId === Draft.currentProjectId && Draft.mode === 'edit') persistEditorDraft();
  const project = getProject(projectId);
  if (!project) {
    showAlert('alert-select-project');
    return;
  }

  try {
    // Direct export = editor source (no markdown/math rendering).
    // Render Preview has its own export button for the rendered snapshot.
    if (format === 'md') {
      await downloadExport(getExportFilename(project.title, 'md'), `\uFEFF${projectMarkdown(project)}`, 'text/markdown;charset=utf-8');
    } else if (format === 'rtf') {
      await downloadExport(getExportFilename(project.title, 'rtf'), projectRtf(project), 'application/rtf');
    } else if (format === 'txt') {
      await downloadExport(
        getExportFilename(project.title, 'txt'),
        `${project.title || 'Untitled'}\n\n${projectPlainText(project)}`,
        'text/plain;charset=utf-8'
      );
    } else if (format === 'pdf') {
      await exportPdf(project, { rendered: false });
    }
  } catch (error) {
    console.error('export failed', error);
    showAlert('export-failed');
  }
}

editorBottomTopBtn.addEventListener('click', () => {
  document.getElementById('editorView').scrollIntoView({ behavior: 'smooth', block: 'start' });
});



function handleAndroidBackButton() {
  hideExportMenus();

  const alertModal = document.getElementById('alertModal');
  if (isShown(alertModal)) {
    alertModal.classList.remove('show');
    return true;
  }

  const confirmModal = document.getElementById('confirmModal');
  if (isShown(confirmModal)) {
    closeConfirmModal();
    return true;
  }

  if (isShown(document.getElementById('pinModal'))) {
    closePinModal();
    return true;
  }

  if (isShown(document.getElementById('renameModal'))) {
    closeRenameModal();
    return true;
  }
  if (isShown(document.getElementById('nameModal'))) {
    closeNameModal();
    return true;
  }
  if (isShown(document.getElementById('folderDeleteModal'))) {
    closeFolderDeleteModal();
    return true;
  }
  if (Draft.mode === 'home' && Draft.homeType === 'folders') {
    handleHomeTabClick();
    return true;
  }

  if (isShown(document.getElementById('projectDrawer'))) {
    closeDrawer();
    return true;
  }

  if (isShown(document.getElementById('editorSettingsDrawer'))) {
    closeEditorSettings();
    return true;
  }

  if (toolPalette && toolPalette.classList.contains('show')) {
    toolPalette.classList.remove('show');
    if (toolColorPanel) toolColorPanel.classList.remove('show');
    return true;
  }

  if (selectionToolbar && selectionToolbar.classList.contains('show')) {
    hideSelectionToolbar();
    return true;
  }

  if (isShown(renderPreviewWindow)) {
    closeRenderPreview();
    return true;
  }

  if (isShown(magnifierWindow)) {
    closeMagnifier();
    return true;
  }

  if (annotationView && annotationView.classList.contains('active')) {
    closeAnnotationPage();
    return true;
  }

  if (Draft.mode === 'edit') {
    enterViewMode();
    return true;
  }

  if (Draft.mode === 'view') {
    goHome();
    return true;
  }

  return false;
}

let androidBackButtonBound = false;

function setupAndroidBackButton() {
  if (androidBackButtonBound) return;
  const native = getDraftNative();
  if (!isNativeApp() || !native || !native.App || typeof native.App.addListener !== 'function') return;
  androidBackButtonBound = true;
  native.App.addListener('backButton', () => {
    if (handleAndroidBackButton()) return;
    // On home: leave the app (Android recent-tasks), instead of a random exit mid-flow.
    if (typeof native.App.minimizeApp === 'function') {
      native.App.minimizeApp();
    }
  });
}

// ===== 返回首页 =====
function goHome() {
  Draft.currentProjectId = null;
  Draft.mode = 'home';
  Draft.dirty = false;
  Draft.homeType = 'drafts';
  Draft.folderId = null;
  savedEditorSelection = null;
  hideSelectionToolbar();
  document.body.classList.remove('edit-page');
  if (toolFloatButton) toolFloatButton.classList.remove('visible');
  if (toolPalette) toolPalette.classList.remove('show');
  closeFloatingPanels();
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('homeView').classList.add('active');
  if (titleInput) titleInput.value = '';
  updateHomeControls();
  syncTabs();
  renderProjects();
}

// ===== 自动保存 =====
setInterval(() => {
  if (!Draft.currentProjectId) return;
  if (Draft.mode !== "edit") return;
  if (!Draft.dirty) return;

  const projects = getProjects();
  const p = projects.find(x => x.id === Draft.currentProjectId);
  if (!p) return;

  p.content = editor.innerHTML;
  p.title = titleInput.value;
  p.updatedAt = Date.now();
  saveProjects(projects);

  Draft.dirty = false;
  updateEditorMeta();
}, 1000);

// ========== 主题切换 ==========

const themeButtons = [themeBtn, document.getElementById('toolThemeBtn')];
const themeFaces = themeButtons.map(button => {
  const face = document.createElement('span');
  face.className = 'theme-face';
  face.setAttribute('aria-hidden', 'true');
  button.replaceChildren(face);
  button.setAttribute('aria-label', 'Dark mode');
  return face;
});
let themeFolding = false;

function applyTheme(isDark) {
  if (isDark) html.setAttribute('data-theme', 'dark');
  else html.removeAttribute('data-theme');
  themeButtons.forEach((button, index) => {
    button.setAttribute('aria-pressed', String(isDark));
    themeFaces[index].textContent = isDark ? '\u263e' : '\u263c';
  });
}

applyTheme(localStorage.getItem('theme') === 'dark');

function revealBootUi() {
  const root = document.documentElement;
  if (!root.classList.contains('boot-pending')) return;
  // One frame with final theme/lang styles, then show (avoids transition flash).
  requestAnimationFrame(() => {
    root.classList.remove('boot-pending');
  });
}
revealBootUi();

async function toggleTheme() {
  // Keep both entry points in sync; do not queue folds on rapid taps.
  if (themeFolding) return;
  themeFolding = true;
  const isDark = html.getAttribute('data-theme') !== 'dark';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canAnimate = !reduceMotion && themeFaces.every(face => typeof face.animate === 'function');
  const animations = [];
  const crease = isDark ? 6 : -6;
  const fold = async (frames, duration) => {
    const phase = themeFaces.map(face => face.animate(frames, {
      duration, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards'
    }));
    animations.push(...phase);
    await Promise.all(phase.map(animation => animation.finished.catch(() => {})));
  };
  try {
    if (canAnimate) {
      await fold([
        { transform: 'scaleX(1) skewY(0deg)', opacity: 1 },
        { transform: `scaleX(.5) skewY(${crease}deg)`, opacity: .8 },
        { transform: 'scaleX(0) skewY(0deg)', opacity: .4 }
      ], 120);
    }
    // Change the theme at the crease, never display the two blues side by side.
    applyTheme(isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) themeColorMeta.content = isDark ? '#111111' : '#ffffff';
    if (!localStorage.getItem('tool-color-custom')) {
      setToolColor(isDark ? '#0046BF' : '#1F7FFF', false);
    }
    if (canAnimate) {
      await fold([
        { transform: 'scaleX(0) skewY(0deg)', opacity: .4 },
        { transform: `scaleX(.5) skewY(${-crease}deg)`, opacity: .8 },
        { transform: 'scaleX(1) skewY(0deg)', opacity: 1 }
      ], 160);
    }
  } finally {
    animations.forEach(animation => animation.cancel());
    themeFolding = false;
  }
}

themeBtn.addEventListener('click', toggleTheme);

// ========== 模式切换 ==========
document.querySelectorAll('.mode-tab').forEach((tab, index) => {
  tab.addEventListener('click', () => {
    if (index === 0) {
      handleHomeTabClick();
      return;
    }
    if (index === 1) {
      if (!Draft.currentProjectId) {
        showAlert('alert-select-project');
        return;
      }
      if (Draft.mode === 'view') enterEditMode();
      else enterViewMode();
      syncTabs();
    }
  });
});

// ===== 抽屉面板 =====
function hideDrawerMenus() {
  document.querySelectorAll('#projectDrawer .export-options').forEach(el => {
    if (el.id === 'folderManageList') return;
    el.classList.remove('show');
  });
  const wrap = document.getElementById('folderManageListWrap');
  if (wrap) wrap.classList.add('hidden');
}

function renderFolderPicker(item, isFolder) {
  if (isFolder === void 0) isFolder = false;
  const picker = document.getElementById('folderPicker');
  if (!picker) return;
  picker.innerHTML = '';
  picker.classList.remove('show');
  const folders = getFolders();
  const blocked = new Set();
  if (isFolder) {
    blocked.add(item.id);
    descendants(item.id).forEach(id => blocked.add(id));
  }
  const candidates = folders.filter(folder => !blocked.has(folder.id))
    .sort((a, b) => folderPath(a.id).localeCompare(folderPath(b.id)));
  if (!candidates.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:8px 10px;color:#999;font-size:12px;';
    empty.textContent = tKey('empty-folders', 'No folders yet');
    picker.appendChild(empty);
    return;
  }
  candidates.forEach(folder => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isFolder ? item.parentId === folder.id : (item.folderIds || []).includes(folder.id);
    checkbox.addEventListener('change', () => {
      if (isFolder) {
        const foldersNow = getFolders();
        const current = foldersNow.find(entry => entry.id === item.id);
        if (!current) return;
        if (checkbox.checked) {
          current.parentId = folder.id;
          picker.querySelectorAll('input[type="checkbox"]').forEach(other => {
            if (other !== checkbox) other.checked = false;
          });
        } else if (current.parentId === folder.id) {
          current.parentId = null;
        }
        current.updatedAt = Date.now();
        saveFolders(foldersNow);
        item.parentId = current.parentId;
      } else {
        const projects = getProjects();
        const current = projects.find(entry => entry.id === item.id);
        if (!current) return;
        const ids = new Set(current.folderIds || []);
        if (checkbox.checked) ids.add(folder.id); else ids.delete(folder.id);
        current.folderIds = Array.from(ids);
        current.updatedAt = Date.now();
        saveProjects(projects);
        item.folderIds = current.folderIds;
      }
      renderProjects();
      updateHomeControls();
    });
    const text = document.createElement('span');
    text.textContent = folderPath(folder.id) || folder.title;
    label.appendChild(checkbox);
    label.appendChild(text);
    picker.appendChild(label);
  });
}

function openFolderDrawer(folderId) {
  const folder = getFolder(folderId);
  if (!folder) return;
  Draft.drawerFolderId = folderId;
  Draft.drawerProjectId = null;
  hideDrawerMenus();
  const t = translations[currentLang] || translations.en || {};
  document.getElementById('drawerTitle').textContent = (t['drawer-folder-title'] || 'Folder Settings') + ' — ' + folder.title;
  const exportBtn = document.getElementById('drawerExport');
  const exportWrap = exportBtn && exportBtn.closest('.export-wrap');
  if (exportWrap) exportWrap.classList.add('hidden');
  const addWrap = document.getElementById('folderAddWrap');
  const manageWrap = document.getElementById('folderManageWrap');
  const manageListWrap = document.getElementById('folderManageListWrap');
  if (addWrap) addWrap.classList.remove('hidden');
  if (manageWrap) manageWrap.classList.remove('hidden');
  if (manageListWrap) manageListWrap.classList.add('hidden');
  document.getElementById('drawerRename').dataset.folder = '1';
  renderFolderPicker(folder, true);
  document.getElementById('projectDrawer').classList.add('show');
  document.getElementById('drawerOverlay').classList.add('show');
}

function openDrawer(projectId) {
  const p = getProject(projectId);
  if (!p) return;
  Draft.drawerProjectId = projectId;
  Draft.drawerFolderId = null;
  hideDrawerMenus();
  const drawer = document.getElementById('projectDrawer');
  const overlay = document.getElementById('drawerOverlay');
  const titleEl = document.getElementById('drawerTitle');
  const t = translations[currentLang] || translations.zh;
  titleEl.textContent = (t['drawer-title'] || 'Draft Settings') + ' — ' + p.title;
  const exportBtn = document.getElementById('drawerExport');
  const exportWrap = exportBtn && exportBtn.closest('.export-wrap');
  if (exportWrap) exportWrap.classList.remove('hidden');
  if (exportBtn) exportBtn.classList.remove('hidden');
  const addWrap = document.getElementById('folderAddWrap');
  const manageWrap = document.getElementById('folderManageWrap');
  const manageListWrap = document.getElementById('folderManageListWrap');
  if (addWrap) addWrap.classList.remove('hidden');
  if (manageWrap) manageWrap.classList.add('hidden');
  if (manageListWrap) manageListWrap.classList.add('hidden');
  document.getElementById('drawerRename').dataset.folder = '0';
  renderFolderPicker(p, false);
  drawer.classList.add('show');
  overlay.classList.add('show');
}

function closeDrawer() {
  const drawer = document.getElementById('projectDrawer');
  const overlay = document.getElementById('drawerOverlay');
  if (drawer) drawer.classList.remove('show');
  if (overlay) overlay.classList.remove('show');
  Draft.drawerProjectId = null;
  Draft.drawerFolderId = null;
  hideDrawerMenus();
}

function renderManageDraftList(mode) {
  const folderId = Draft.drawerFolderId;
  if (!folderId) return;
  const listWrap = document.getElementById('folderManageListWrap');
  const list = document.getElementById('folderManageList');
  if (!listWrap || !list) return;
  list.innerHTML = '';
  const projects = getProjects().slice().sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
  const rows = mode === 'remove' ? projects.filter(project => (project.folderIds || []).includes(folderId)) : projects;
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:8px 10px;color:#999;font-size:12px;';
    empty.textContent = tKey('empty-projects', 'No drafts yet');
    list.appendChild(empty);
  } else {
    rows.forEach(project => {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = mode === 'remove' ? true : (project.folderIds || []).includes(folderId);
      checkbox.addEventListener('change', () => {
        const all = getProjects();
        const current = all.find(entry => entry.id === project.id);
        if (!current) return;
        const ids = new Set(current.folderIds || []);
        if (checkbox.checked) ids.add(folderId); else ids.delete(folderId);
        current.folderIds = Array.from(ids);
        current.updatedAt = Date.now();
        saveProjects(all);
        renderProjects();
        if (mode === 'remove' && !checkbox.checked) label.remove();
      });
      const text = document.createElement('span');
      text.textContent = project.title || tKey('placeholder-title', 'Untitled');
      label.appendChild(checkbox);
      label.appendChild(text);
      list.appendChild(label);
    });
  }
  const manageOptions = document.getElementById('folderManageOptions');
  if (manageOptions) manageOptions.classList.remove('show');
  listWrap.classList.remove('hidden');
  list.classList.add('show');
}

function saveDrawerSettings() {
  const projectId = Draft.drawerProjectId;
  if (!projectId) return;

  const projects = getProjects();
  const p = projects.find(x => x.id === projectId);
  if (!p) return;

  saveProjects(projects);
  closeDrawer();
  renderProjects();
}

document.addEventListener('DOMContentLoaded', function() {
  const overlay = document.getElementById('drawerOverlay');
  const closeBtn = document.getElementById('drawerClose');
  const saveBtn = document.getElementById('drawerSave');
  const pinClose = document.getElementById('pinClose');
  const pinSave = document.getElementById('pinSave');
  const renameCancel = document.getElementById('renameCancel');
  const renameSaveBtn = document.getElementById('renameSave');
  const importanceHelp = document.getElementById('importanceHelp');
  const drawerDelete = document.getElementById('drawerDelete');
  const drawerExport = document.getElementById('drawerExport');
  const drawerAddFolder = document.getElementById('drawerAddFolder');
  const drawerManage = document.getElementById('drawerManage');
  const drawerRename = document.getElementById('drawerRename');
  const exportOptions = document.getElementById('exportOptions');
  const editorSettingsBtn = document.getElementById('editorSettingsBtn');
  const editorSettingsClose = document.getElementById('editorSettingsClose');
  const editorSettingsOverlay = document.getElementById('editorSettingsOverlay');
  const fontAddBtn = document.getElementById('fontAddBtn');
  const fontInput = document.getElementById('fontInput');
  const fontSelect = document.getElementById('fontSelect');
  const fontSizeInput = document.getElementById('fontSizeInput');
  const fontSizeRange = document.getElementById('fontSizeRange');
  const toolColorInput = document.getElementById('toolColorInput');
  const toolColorSave = document.getElementById('toolColorSave');
  const settingsExport = document.getElementById('settingsExport');
  const magnifierClose = document.getElementById('magnifierClose');
  const magnifierHeader = document.getElementById('magnifierHeader');
  const renderPreviewBtn = document.getElementById('renderPreviewBtn');
  const renderPreviewClose = document.getElementById('renderPreviewClose');
  const renderPreviewHeader = document.getElementById('renderPreviewHeader');
  const renderPreviewPdf = document.getElementById('renderPreviewPdf');
  const annotationsBtn = document.getElementById('annotationsBtn');
  const annotationHeader = document.getElementById('annotationHeader');
  const annotationBackBtn = document.getElementById('annotationBackBtn');
  const annotationAddBtn = document.getElementById('annotationAddBtn');
  const annotationCopyBtn = document.getElementById('annotationCopyBtn');
  const annotationGeminiBtn = document.getElementById('annotationGeminiBtn');
  const annotationChatgptBtn = document.getElementById('annotationChatgptBtn');
  const annotationTranslatorBtn = document.getElementById('annotationTranslatorBtn');

  const savedToolColor = localStorage.getItem('tool-color-custom');
  setToolColor(savedToolColor || (html.getAttribute('data-theme') === 'dark' ? '#0046BF' : '#1F7FFF'), Boolean(savedToolColor));

  let toolPressTimer = null;
  let toolDragging = false;
  let toolMoved = false;
  let toolStartX = 0;
  let toolStartY = 0;
  let toolOffsetX = 0;
  let toolOffsetY = 0;
  let toolPaletteWasOpen = false;
  let magnifierDragging = false;
  let magnifierOffsetX = 0;
  let magnifierOffsetY = 0;
  let annotationDragging = false;
  let annotationOffsetX = 0;
  let annotationOffsetY = 0;
  let renderPreviewDragging = false;
  let renderPreviewOffsetX = 0;
  let renderPreviewOffsetY = 0;

  if (toolFloatButton) {
    toolFloatButton.addEventListener('pointerdown', (e) => {
      toolPaletteWasOpen = toolPalette.classList.contains('show');
      if (toolPaletteWasOpen) {
        e.preventDefault();
        return;
      }
      toolMoved = false;
      toolStartX = e.clientX;
      toolStartY = e.clientY;
      const rect = toolFloatButton.getBoundingClientRect();
      toolOffsetX = e.clientX - rect.left;
      toolOffsetY = e.clientY - rect.top;
      toolPressTimer = setTimeout(() => {
      toolDragging = true;
        toolFloatButton.classList.add('is-moving');
        toolFloatButton.setPointerCapture(e.pointerId);
      }, 500);
    });
    toolFloatButton.addEventListener('pointermove', (e) => {
      if (!toolDragging) return;
      toolMoved = true;
      toolFloatButton.style.left = Math.max(0, e.clientX - toolOffsetX) + 'px';
      toolFloatButton.style.top = Math.max(0, e.clientY - toolOffsetY) + 'px';
      toolFloatButton.style.right = 'auto';
      toolFloatButton.style.bottom = 'auto';
      if (toolPalette.classList.contains('show')) positionToolPalette();
    });
    toolFloatButton.addEventListener('pointerup', () => {
      if (toolPaletteWasOpen) {
        toolPalette.classList.remove('show');
        toolColorPanel.classList.remove('show');
        toolPaletteWasOpen = false;
        return;
      }
      clearTimeout(toolPressTimer);
      if (!toolDragging && !toolMoved) {
        positionToolPalette();
        toolPalette.classList.toggle('show');
        toolColorPanel.classList.remove('show');
      }
      toolDragging = false;
      toolFloatButton.classList.remove('is-moving');
    });
    toolFloatButton.addEventListener('pointercancel', () => {
      toolPaletteWasOpen = false;
      clearTimeout(toolPressTimer);
      toolDragging = false;
      toolFloatButton.classList.remove('is-moving');
    });
  }

  if (magnifierHeader) {
    magnifierHeader.addEventListener('pointerdown', (e) => {
      if (e.target === magnifierClose) return;
      const rect = magnifierWindow.getBoundingClientRect();
      magnifierDragging = true;
      magnifierOffsetX = e.clientX - rect.left;
      magnifierOffsetY = e.clientY - rect.top;
      magnifierHeader.setPointerCapture(e.pointerId);
      magnifierWindow.style.right = 'auto';
      magnifierWindow.style.bottom = 'auto';
      magnifierWindow.style.left = rect.left + 'px';
      magnifierWindow.style.top = rect.top + 'px';
      syncMagnifierToPosition();
    });
    magnifierHeader.addEventListener('pointermove', (e) => {
      if (!magnifierDragging) return;
      magnifierWindow.style.left = Math.max(0, e.clientX - magnifierOffsetX) + 'px';
      magnifierWindow.style.top = Math.max(0, e.clientY - magnifierOffsetY) + 'px';
      syncMagnifierToPosition();
    });
    magnifierHeader.addEventListener('pointerup', () => { magnifierDragging = false; });
    magnifierHeader.addEventListener('pointercancel', () => { magnifierDragging = false; });
  }

  if (annotationHeader && annotationWindow) {
    annotationHeader.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, input, textarea')) return;
      const rect = annotationWindow.getBoundingClientRect();
      annotationDragging = true;
      annotationOffsetX = e.clientX - rect.left;
      annotationOffsetY = e.clientY - rect.top;
      annotationWindow.style.transform = 'none';
      annotationWindow.style.left = rect.left + 'px';
      annotationWindow.style.top = rect.top + 'px';
      annotationHeader.setPointerCapture(e.pointerId);
    });
    annotationHeader.addEventListener('pointermove', (e) => {
      if (!annotationDragging) return;
      const rect = annotationWindow.getBoundingClientRect();
      const left = Math.max(8, Math.min(window.innerWidth - rect.width - 8, e.clientX - annotationOffsetX));
      const top = Math.max(8, Math.min(window.innerHeight - rect.height - 8, e.clientY - annotationOffsetY));
      annotationWindow.style.left = left + 'px';
      annotationWindow.style.top = top + 'px';
    });
    annotationHeader.addEventListener('pointerup', () => { annotationDragging = false; });
    annotationHeader.addEventListener('pointercancel', () => { annotationDragging = false; });
  }

  if (renderPreviewHeader && renderPreviewWindow) {
    renderPreviewHeader.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const rect = renderPreviewWindow.getBoundingClientRect();
      renderPreviewDragging = true;
      renderPreviewOffsetX = e.clientX - rect.left;
      renderPreviewOffsetY = e.clientY - rect.top;
      renderPreviewWindow.style.transform = 'none';
      renderPreviewWindow.style.left = rect.left + 'px';
      renderPreviewWindow.style.top = rect.top + 'px';
      renderPreviewHeader.setPointerCapture(e.pointerId);
    });
    renderPreviewHeader.addEventListener('pointermove', (e) => {
      if (!renderPreviewDragging) return;
      const rect = renderPreviewWindow.getBoundingClientRect();
      const left = Math.max(8, Math.min(window.innerWidth - rect.width - 8, e.clientX - renderPreviewOffsetX));
      const top = Math.max(8, Math.min(window.innerHeight - rect.height - 8, e.clientY - renderPreviewOffsetY));
      renderPreviewWindow.style.left = left + 'px';
      renderPreviewWindow.style.top = top + 'px';
    });
    renderPreviewHeader.addEventListener('pointerup', () => { renderPreviewDragging = false; });
    renderPreviewHeader.addEventListener('pointercancel', () => { renderPreviewDragging = false; });
  }

  document.querySelectorAll('.tool-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = button.dataset.tool;
      if (action !== 'color') toolColorPanel.classList.remove('show');
      if (action === 'top') scrollEditorTo('top');
      if (action === 'bottom') scrollEditorTo('bottom');
      if (action === 'color') {
        toolColorPanel.style.left = toolPalette.style.left;
        toolColorPanel.style.top = (parseFloat(toolPalette.style.top) || 8) + 48 + 'px';
        const currentColor = localStorage.getItem('tool-color-custom') || (html.getAttribute('data-theme') === 'dark' ? '#0046BF' : '#1F7FFF');
        toolColorInput.value = currentColor.replace('#', '');
        toolColorPanel.classList.add('show');
      }
      if (action === 'settings') {
        toolPalette.classList.remove('show');
        openEditorSettings();
      }
      if (action === 'annotations') {
        toolPalette.classList.remove('show');
        openAnnotationPage();
      }
      if (action === 'magnifier') toggleMagnifier();
      if (action === 'theme') toggleTheme();
      if (action === 'gemini') window.open('https://gemini.google.com/', '_blank', 'noopener');
      if (action === 'chatgpt') window.open('https://chatgpt.com/', '_blank', 'noopener');
      if (action === 'translator') window.open('https://translator-5ry.pages.dev/translator', '_blank', 'noopener');
    });
  });
  if (toolColorSave) toolColorSave.addEventListener('click', () => {
    if (setToolColor(toolColorInput.value)) toolColorPanel.classList.remove('show');
  });
  if (toolColorInput) toolColorInput.addEventListener('input', () => setToolColor(toolColorInput.value, true, false));
  if (selectionToolbar) selectionToolbar.addEventListener('click', (e) => e.stopPropagation());
  if (selectionSizeSelect) selectionSizeSelect.addEventListener('change', () => {
    applySelectionStyle('fontSize', Number(selectionSizeSelect.value));
  });
  if (selectionColorApply) selectionColorApply.addEventListener('click', () => {
    if (updateSelectionColor(selectionColorInput.value)) selectionColorInput.value = '';
  });
  if (selectionColorInput) selectionColorInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (updateSelectionColor(selectionColorInput.value)) selectionColorInput.value = '';
    }
  });
  if (magnifierClose) magnifierClose.addEventListener('click', closeMagnifier);
  if (renderPreviewBtn) renderPreviewBtn.addEventListener('click', () => {
    closeEditorSettings();
    openRenderPreview();
  });
  if (renderPreviewClose) renderPreviewClose.addEventListener('click', closeRenderPreview);
  if (renderPreviewPdf) renderPreviewPdf.addEventListener('click', () => {
    const project = getProject(Draft.currentProjectId);
    if (project) exportPdf(project, { rendered: true });
  });
  if (annotationsBtn) annotationsBtn.addEventListener('click', openAnnotationPage);
  if (annotationBackBtn) annotationBackBtn.addEventListener('click', closeAnnotationPage);
  if (annotationAddBtn) annotationAddBtn.addEventListener('click', addAnnotation);
  if (annotationCopyBtn) annotationCopyBtn.addEventListener('click', copyAnnotations);
  if (annotationGeminiBtn) annotationGeminiBtn.addEventListener('click', () => window.open('https://gemini.google.com/', '_blank', 'noopener'));
  if (annotationChatgptBtn) annotationChatgptBtn.addEventListener('click', () => window.open('https://chatgpt.com/', '_blank', 'noopener'));
  if (annotationTranslatorBtn) annotationTranslatorBtn.addEventListener('click', () => window.open('https://translator-5ry.pages.dev/translator', '_blank', 'noopener'));
  window.addEventListener('scroll', syncMagnifierToPosition, { passive: true });
  document.addEventListener('click', (e) => {
    if (toolPalette && !toolPalette.contains(e.target) && !toolColorPanel.contains(e.target) && e.target !== toolFloatButton && !toolFloatButton.contains(e.target)) {
      toolPalette.classList.remove('show');
      toolColorPanel.classList.remove('show');
    }
  });

  if (overlay) overlay.addEventListener('click', closeDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (saveBtn) saveBtn.addEventListener('click', saveDrawerSettings);
  if (editorSettingsBtn) editorSettingsBtn.addEventListener('click', openEditorSettings);
  if (editorSettingsClose) editorSettingsClose.addEventListener('click', closeEditorSettings);
  if (editorSettingsOverlay) editorSettingsOverlay.addEventListener('click', closeEditorSettings);
  if (fontAddBtn) fontAddBtn.addEventListener('click', () => {
    const p = getProject(Draft.currentProjectId);
    if (!p) return;
    const name = fontInput.value.trim() || fontSelect.value;
    const fonts = [...getFontSettings(p).stack];
    if (name && !fonts.some(font => font.toLowerCase() === name.toLowerCase())) fonts.push(name);
    p.fontStack = fonts;
    saveProject(p);
    fontInput.value = '';
    renderFontList(fonts);
    applyEditorFontSettings(p);
  });
  if (fontSizeInput) fontSizeInput.addEventListener('input', () => setEditorFontSize(fontSizeInput.value));
  if (fontSizeRange) fontSizeRange.addEventListener('input', () => setEditorFontSize(fontSizeRange.value));
  if (settingsExport) settingsExport.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('settingsExportOptions').classList.toggle('show');
  });
  if (pinClose) pinClose.addEventListener('click', closePinModal);
  if (pinSave) pinSave.addEventListener('click', savePin);
  if (renameCancel) renameCancel.addEventListener('click', closeRenameModal);
  if (renameSaveBtn) renameSaveBtn.addEventListener('click', saveRename);
  if (importanceHelp) importanceHelp.addEventListener('click', (e) => {
    e.stopPropagation();
    const hint = document.getElementById('importanceHint');
    hint.classList.add('show');
    clearTimeout(importanceHintTimer);
    importanceHintTimer = setTimeout(() => hint.classList.remove('show'), 2500);
  });
  if (drawerAddFolder) drawerAddFolder.addEventListener('click', (e) => {
    e.stopPropagation();
    const manage = document.getElementById('folderManageOptions');
    if (manage) manage.classList.remove('show');
    const listWrap = document.getElementById('folderManageListWrap');
    if (listWrap) listWrap.classList.add('hidden');
    const picker = document.getElementById('folderPicker');
    if (picker) picker.classList.toggle('show');
  });
  if (drawerManage) drawerManage.addEventListener('click', (e) => {
    e.stopPropagation();
    const picker = document.getElementById('folderPicker');
    if (picker) picker.classList.remove('show');
    const listWrap = document.getElementById('folderManageListWrap');
    if (listWrap) listWrap.classList.add('hidden');
    const manage = document.getElementById('folderManageOptions');
    if (manage) manage.classList.toggle('show');
  });
  const manageRemove = document.getElementById('manageRemoveDrafts');
  const manageAdd = document.getElementById('manageAddDrafts');
  if (manageRemove) manageRemove.addEventListener('click', (e) => { e.stopPropagation(); renderManageDraftList('remove'); });
  if (manageAdd) manageAdd.addEventListener('click', (e) => { e.stopPropagation(); renderManageDraftList('add'); });
  if (drawerRename) drawerRename.addEventListener('click', () => {
    if (Draft.drawerFolderId) {
      const folder = getFolder(Draft.drawerFolderId);
      if (!folder) return;
      renameProjectId = 'folder:' + folder.id;
      document.getElementById('renameInput').value = folder.title;
      document.getElementById('renameModal').classList.add('show');
    } else openRenameModal(Draft.drawerProjectId);
  });
  if (drawerDelete) drawerDelete.addEventListener('click', () => {
    const folderId = Draft.drawerFolderId;
    const id = Draft.drawerProjectId;
    closeDrawer();
    if (folderId) openFolderDeleteModal(folderId);
    else if (id) handleProjectDelete(id);
  });
  const folderDeleteCancel = document.getElementById('folderDeleteCancel');
  const folderDeleteOk = document.getElementById('folderDeleteOk');
  if (folderDeleteCancel) folderDeleteCancel.addEventListener('click', closeFolderDeleteModal);
  if (folderDeleteOk) folderDeleteOk.addEventListener('click', () => {
    if (Draft.deleteFolderId) {
      deleteFolder(
        Draft.deleteFolderId,
        document.getElementById('deleteIncludingDrafts').checked,
        document.getElementById('deleteIncludingFolders').checked
      );
    }
    closeFolderDeleteModal();
  });
  const nameModalCancel = document.getElementById('nameModalCancel');
  const nameModalSave = document.getElementById('nameModalSave');
  const nameModalInput = document.getElementById('nameModalInput');
  if (nameModalCancel) nameModalCancel.addEventListener('click', closeNameModal);
  if (nameModalSave) nameModalSave.addEventListener('click', saveNameModal);
  if (nameModalInput) nameModalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); saveNameModal(); }
  });
  if (drawerExport) drawerExport.addEventListener('click', (e) => {
    e.stopPropagation();
    exportOptions.classList.toggle('show');
  });
  document.querySelectorAll('[data-export-format]').forEach(button => {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const wrap = button.closest('.export-wrap');
      const source = wrap && wrap.dataset.exportSource === 'current'
        ? Draft.currentProjectId
        : Draft.drawerProjectId;
      exportProject(button.dataset.exportFormat, source);
      if (wrap) wrap.querySelector('.export-options').classList.remove('show');
    });
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.export-wrap')) {
      document.querySelectorAll('.export-options').forEach(options => {
        if (options.id === 'folderManageList') return;
        options.classList.remove('show');
      });
      const listWrap = document.getElementById('folderManageListWrap');
      if (listWrap) listWrap.classList.add('hidden');
    }
  });
});

syncTabs();
setupAndroidBackButton();
revealBootUi();
