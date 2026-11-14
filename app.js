// ===== 全局状态 =====
let Draft = {
  currentProjectId: null,
  dirty: false,
  mode: "home",
};


// ===== Capacitor / native helpers =====
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
  document.querySelectorAll('.export-options').forEach(options => options.classList.remove('show'));
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

async function shareNativeFile(filename, data, encoding) {
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
  await native.Share.share({
    title: filename,
    url: uri,
    dialogTitle: filename
  });
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
  text.textContent = t[messageKey] || messageKey;

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
function showConfirm(messageKey, onConfirm) {
  const modal = document.getElementById('confirmModal');
  const text = document.getElementById('confirmText');
  const okBtn = document.getElementById('confirmOk');
  const cancelBtn = document.getElementById('confirmCancel');

  const t = translations[currentLang] || translations['zh'];
  text.textContent = t[messageKey] || messageKey;

  modal.classList.add('show');

  function cleanup() {
    modal.classList.remove('show');
    okBtn.onclick = null;
    cancelBtn.onclick = null;
  }

  okBtn.onclick = () => {
    cleanup();
    onConfirm();
  };

  cancelBtn.onclick = cleanup;
}

// ===== 公共删除逻辑 =====
function handleProjectDelete(id) {
  showConfirm('confirm-delete', () => {
    deleteProject(id);
  });
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
function renderProjects() {
  const projects = getProjects().sort((a, b) => {
    const importanceDiff = (b.importance || 0) - (a.importance || 0);
    if (importanceDiff !== 0) return importanceDiff;
    return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
  });

  projectList.innerHTML = "";

  if (projects.length === 0) {
    const t = translations[currentLang] || translations['zh'];
    projectList.innerHTML = '<div style="padding: 20px; color: #999; text-align: center;">' + (t['empty-projects'] || '') + '</div>';
    return;
  }

  const fragment = document.createDocumentFragment();

  projects.forEach(p => {
    const div = document.createElement("div");
    div.className = "card";
    div.dataset.projectId = p.id;

    const titleSpan = document.createElement("span");
    titleSpan.className = "card-title";
    titleSpan.innerText = p.title;
    div.appendChild(titleSpan);

    const editedSpan = document.createElement("span");
    editedSpan.className = "card-edited-time";
    const editedAt = p.updatedAt || p.createdAt;
    editedSpan.innerText = editedAt
      ? new Date(editedAt).toLocaleString(currentLang === 'zh' ? 'zh-CN' : 'en-US')
      : '';
    div.appendChild(editedSpan);

    const settingsBtn = document.createElement("button");
    settingsBtn.className = "card-settings-btn";
    settingsBtn.innerHTML = "&#9881;";
    settingsBtn.title = "Settings";
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDrawer(p.id);
    });
    div.appendChild(settingsBtn);

    fragment.appendChild(div);
  });

  projectList.appendChild(fragment);
}

// ===== 事件代理 =====
projectList.addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;

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
    openPinModal(card.dataset.projectId);
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

  openPinModal(card.dataset.projectId);
});

// ===== 创建新项目 =====
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
    annotations: []
  };

  projects.push(p);
  saveProjects(projects);
  renderProjects();
}

function openPinModal(projectId) {
  const p = getProject(projectId);
  if (!p) return;
  pinProjectId = projectId;
  document.getElementById('pinImportance').value = p.importance || 0;
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
  const projects = getProjects();
  const p = projects.find(x => x.id === pinProjectId);
  if (!p) return;
  const value = parseInt(document.getElementById('pinImportance').value, 10);
  p.importance = isNaN(value) ? 0 : Math.max(0, Math.min(99, value));
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
renderProjects();

// ===== 同步 mode-tab 高亮状态 =====
function syncTabs() {
  const tabs = document.querySelectorAll('.mode-tab');
  const t = translations[currentLang] || translations['zh'];

  tabs[0].classList.toggle('active', Draft.mode === "home");
  tabs[1].classList.toggle('active', Draft.mode !== "home");
  tabs[1].classList.toggle('hidden', Draft.mode === "home");

  if (Draft.mode === "view") {
    tabs[1].textContent = t['tab-editor'] || 'Edit';
  } else if (Draft.mode === "edit") {
    tabs[1].textContent = t['tab-view'] || 'View';
  } else {
    tabs[1].textContent = t['tab-editor'] || 'Edit';
  }
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
      await shareNativeFile(filename, base64);
      return;
    } catch (error) {
      console.error('native export failed', error);
      showAlert('export-failed');
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

// Local font files usable inside the app. Large CJK files are skipped in
// standalone export and replaced with system font fallbacks so shared HTML
// stays openable outside Capacitor.
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
  // CJK full fonts are huge; do not embed by default.
  'Noto Serif HK': null,
  'Noto Serif SC': null
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

async function buildEmbeddedFontCss(project) {
  const settings = getFontSettings(project || {});
  const faces = [];
  const familyNames = [];
  const seen = new Set();

  for (const name of [...settings.stack, 'Noto Serif HK', 'Noto Serif SC', 'Cardo']) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    familyNames.push(name);
    const specs = EXPORT_FONT_FILES[name];
    if (!specs) continue;
    for (const spec of specs) {
      try {
        const response = await fetch(new URL(spec.path, window.location.href));
        if (!response.ok) continue;
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > (spec.maxBytes || 2_000_000)) continue;
        const base64 = arrayBufferToBase64(buffer);
        const format = spec.path.endsWith('.woff2') ? 'woff2' : spec.path.endsWith('.woff') ? 'woff' : 'truetype';
        faces.push(`@font-face{font-family:'${String(name).replace(/'/g, '')}';font-style:${spec.style};font-weight:${spec.weight};font-display:swap;src:url(data:font/${format === 'truetype' ? 'ttf' : format};base64,${base64}) format('${format}');}`);
      } catch (error) {
        console.warn('embed font failed', name, error);
      }
    }
  }

  const family = familyNames
    .flatMap(name => EXPORT_SYSTEM_FONT_FALLBACKS[name] || [`'${String(name).replace(/'/g, '')}'`])
    .concat(['serif'])
    .filter((value, index, arr) => arr.indexOf(value) === index)
    .join(', ');

  return { css: faces.join('\n'), family };
}

async function buildInlinedKatexCss() {
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
  return css;
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
  const { css: fontCss, family: embeddedFamily } = await buildEmbeddedFontCss(project);
  const family = embeddedFamily || snapshot.family;
  // Only pull KaTeX CSS when the export actually contains rendered math markup.
  const katexCss = renderedMode ? await buildInlinedKatexCss() : '';
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

  return `<!DOCTYPE html>
<html lang="${currentLang === 'zh' ? 'zh-CN' : 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="draft-export" content="${modeNote}">
  <title>${snapshot.title}</title>
  <style>
${fontCss}
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
}


function getProjectFontFamily(project) {
  const settings = getFontSettings(project || {});
  const fallbackStack = [...settings.stack, 'Noto Serif HK', 'Noto Serif SC', 'Cardo', 'serif'];
  return [...new Set(fallbackStack)]
    .map(name => `'${String(name).replace(/'/g, '')}'`)
    .join(', ');
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
  const html = await buildStandaloneExportHtml(project, {
    rendered: renderedMode,
    printable: !isNativeApp()
  });

  if (isNativeApp()) {
    // Only jump to the in-app preview when exporting the rendered version.
    if (renderedMode && renderPreviewWindow) {
      renderDraftPreview(project);
      renderPreviewWindow.classList.add('show');
    }
    // Distinguish filenames so rendered vs source exports can coexist.
    const filename = renderedMode
      ? getExportFilename(project.title, 'html').replace(/\.html$/i, '.rendered.html')
      : getExportFilename(project.title, 'html').replace(/\.html$/i, '.source.html');
    await downloadExport(filename, html, 'text/html;charset=utf-8');
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

function setupAndroidBackButton() {
  const native = getDraftNative();
  if (!isNativeApp() || !native || !native.App) return;
  native.App.addListener('backButton', ({ canGoBack }) => {
    if (handleAndroidBackButton()) return;
    // On home: leave the app (Android recent-tasks), instead of a random exit mid-flow.
    native.App.minimizeApp();
  });
}

// ===== 返回首页 =====
function goHome() {
  Draft.currentProjectId = null;
  Draft.mode = "home";
  Draft.dirty = false;
  savedEditorSelection = null;
  hideSelectionToolbar();
  document.body.classList.remove('edit-page');
  toolFloatButton.classList.remove('visible');
  toolPalette.classList.remove('show');

  closeFloatingPanels();
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('homeView').classList.add('active');

  titleInput.value = "";

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
      goHome();
      Draft.mode = "home";
    }

    if (index === 1) {
      if (!Draft.currentProjectId) {
        showAlert('alert-select-project');
        return;
      }

      if (Draft.mode === "view") {
        enterEditMode();
      } else {
        enterViewMode();
      }
    }

    syncTabs();
  });
});

// ===== 抽屉面板 =====
function openDrawer(projectId) {
  const p = getProject(projectId);
  if (!p) return;

  Draft.drawerProjectId = projectId;

  const drawer = document.getElementById('projectDrawer');
  const overlay = document.getElementById('drawerOverlay');
  const titleEl = document.getElementById('drawerTitle');

  const t = translations[currentLang] || translations['zh'];
  titleEl.textContent = (t['drawer-title'] || 'Draft Settings') + ' \u2014 ' + p.title;
  drawer.classList.add('show');
  overlay.classList.add('show');
}

function closeDrawer() {
  const drawer = document.getElementById('projectDrawer');
  const overlay = document.getElementById('drawerOverlay');
  drawer.classList.remove('show');
  overlay.classList.remove('show');
  Draft.drawerProjectId = null;
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
  const drawerRename = document.getElementById('drawerRename');
  const drawerDelete = document.getElementById('drawerDelete');
  const drawerExport = document.getElementById('drawerExport');
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
  if (drawerRename) drawerRename.addEventListener('click', () => {
    openRenameModal(Draft.drawerProjectId);
  });
  if (drawerDelete) drawerDelete.addEventListener('click', () => {
    // Capture the target before closing clears the drawer's selection.
    const id = Draft.drawerProjectId;
    closeDrawer();
    if (id) handleProjectDelete(id);
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
      document.querySelectorAll('.export-options').forEach(options => options.classList.remove('show'));
    }
  });
});

syncTabs();
