// ========== 双语切换功能 ==========

const translations = {
  'zh': {
    'tab-home': '首页',
    'tab-editor': '编辑',
    'tab-view': '预览',
    'label-home': 'Drafts',
    'btn-new': '+ 新建草稿',
    'btn-drafts': '草稿',
    'btn-folders': '合集',
    'btn-folder': '合集',
    'btn-new-folder': '+ 新建',
    'btn-add-to-folder': '加入合集',
    'btn-manage': '管理',
    'manage-remove': '批量移出草稿',
    'manage-add': '批量加入草稿',
    'folder-empty': '暂无合集',
    'folder-name-title': '命名合集',
    'folder-delete-warning': '删除合集？',
    'including-drafts': '包括草稿',
    'including-folders': '包括合集',
    'folder-count': '{folders} 个合集 · {drafts} 个草稿',
    'drawer-folder-title': '合集设置',
    'empty-folders': '暂无合集',
    'pin-folder-title': '固定此合集？',
    'btn-back': '返回',
    'btn-edit': '编辑',
    'btn-copy': 'Copy',
    'btn-ok': '确定',
    'btn-cancel': '取消',
    'loading-text': '加载中...',
    'confirm-delete': '删除这个项目？',
    'copy-success': '已复制',
    'placeholder-title': '无题',
    'drawer-title': '草稿设置',
    'label-importance': '重要性',
    'pin-title': '固定此草稿？',
    'importance-hint': '输入0~99的数字，数字更大的draft将被固定在更上方。0为默认值，值为0时不固定，按时间排序。',
    'btn-close': '关闭',
    'btn-rename': '重命名',
    'btn-delete': '删除',
    'btn-export': '导出',
    'export-popup-blocked': '请允许打开新窗口以导出 PDF。',
    'export-failed': '导出失败，请重试。',
    'rename-title': '重命名草稿',
    'alert-select-project': '请先选择一个项目',
    'btn-ask-gemini': '问Gemini',
    'empty-projects': '暂无草稿',
    'btn-copy-all': '复制全部',
    'btn-back-to-top': '回到顶部',
    'btn-annotations': '注释',
    'annotations-title': '注释',
    'btn-add-annotation': '+ 新建注释',
    'annotation-name-placeholder': '注释名称',
    'annotation-content-placeholder': '在这里输入注释内容',
    'annotation-default-name': '注释',
    'annotation-empty': '暂无注释',
    'confirm-delete-annotation': '删除这条注释？',
    'char-count': '字符数',
    'last-edited': '最后编辑',
    'editor-settings-title': '设置',
    'font-family-label': '字体顺序',
    'font-placeholder': '输入字体名称',
    'font-add': '添加字体',
    'font-size-label': '字号',
    'settings-export-label': '导出',
    'selection-size-label': '字号',
    'selection-color-label': '颜色',
    'selection-color-placeholder': '输入十六进制颜色',
    'selection-apply': '应用',
    'magnifier-title': '放大镜',
    'btn-render-preview': '渲染预览',
    'render-preview-title': '渲染预览',
    'render-preview-pdf': '打印 / 保存为 PDF'
  },
  'en': {
    'tab-home': 'Home',
    'tab-editor': 'Edit',
    'tab-view': 'View',
    'label-home': 'Drafts',

    'btn-new': '+ Draft',
    'btn-drafts': 'Drafts',
    'btn-folders': 'Folders',
    'btn-folder': 'Folder',
    'btn-new-folder': '+ New',
    'btn-add-to-folder': 'Add to folder',
    'btn-manage': 'Manage',
    'manage-remove': 'Remove drafts',
    'manage-add': 'Add drafts',
    'folder-empty': 'No folders yet',
    'folder-name-title': 'Name folder',
    'folder-delete-warning': 'Delete folder?',
    'including-drafts': 'Including drafts',
    'including-folders': 'Including folders',
    'folder-count': '{folders} folders · {drafts} drafts',
    'drawer-folder-title': 'Folder Settings',
    'empty-folders': 'No folders yet',
    'pin-folder-title': 'Pin this folder?',
    'btn-back': 'Back',
    'btn-edit': 'Edit',
    'btn-copy': 'Copy',
    'btn-ok': 'OK',
    'btn-cancel': 'Cancel',
    'loading-text': 'Loading...',
    'confirm-delete': 'Delete this project?',
    'copy-success': 'Copied',
    'placeholder-title': 'Untitled',
    'drawer-title': 'Draft Settings',
    'label-importance': 'Importance',
    'pin-title': 'Pin this draft?',
    'importance-hint': 'Enter a number from 0 to 99. Higher numbers place the draft higher. 0 is the default; drafts with 0 are not pinned and are sorted by time.',
    'btn-close': 'Close',
    'btn-rename': 'Rename',
    'btn-delete': 'Delete',
    'btn-export': 'Export',
    'export-popup-blocked': 'Please allow pop-ups to export PDF.',
    'export-failed': 'Export failed. Please try again.',
    'rename-title': 'Rename draft',
    'alert-select-project': 'Please select a project first',
    'btn-ask-gemini': 'Ask Gemini',
    'empty-projects': 'No drafts yet',
    'btn-copy-all': 'Copy All',
    'btn-back-to-top': 'Back to top',
    'btn-annotations': 'Annotations',
    'annotations-title': 'Annotations',
    'btn-add-annotation': '+ Add annotation',
    'annotation-name-placeholder': 'Annotation name',
    'annotation-content-placeholder': 'Write your annotation here',
    'annotation-default-name': 'Annotation',
    'annotation-empty': 'No annotations yet',
    'confirm-delete-annotation': 'Delete this annotation?',
    'char-count': 'Characters',
    'last-edited': 'Last edited',
    'editor-settings-title': 'Settings',
    'font-family-label': 'Font fallback order',
    'font-placeholder': 'Type a font name',
    'font-add': 'Add font',
    'font-size-label': 'Font size',
    'settings-export-label': 'Export',
    'selection-size-label': 'Size',
    'selection-color-label': 'Color',
    'selection-color-placeholder': 'Hex color',
    'selection-apply': 'Apply',
    'magnifier-title': 'Magnifier',
    'btn-render-preview': 'Render preview',
    'render-preview-title': 'Rendered Preview',
    'render-preview-pdf': 'Print / Save as PDF'
  }
};

let currentLang = 'en';

function switchLanguage(lang) {
  if (!translations[lang]) return;

  currentLang = lang;
  const t = translations[lang];
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.documentElement.setAttribute('data-lang', lang);

  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    const key = el.getAttribute('data-i18n');
    if (key && t[key] !== undefined) {
      if (el.tagName === 'INPUT') {
        el.placeholder = t[key];
      } else {
        el.textContent = t[key];
      }
    }
  });

  document.querySelectorAll('.lang-bar button').forEach(function(btn) {
    btn.classList.remove('active');
    if (btn.getAttribute('data-lang') === lang) {
      btn.classList.add('active');
    }
  });

  localStorage.setItem('lang', lang);
  localStorage.setItem('lang-user-set', '1');
  if (typeof updateHomeControls === 'function') updateHomeControls();
  if (typeof renderProjects === 'function') renderProjects();
  if (typeof updateEditorMeta === 'function') updateEditorMeta();
  const annotationView = document.getElementById('annotationView');
  if (typeof renderAnnotations === 'function' && annotationView && annotationView.classList.contains('active')) renderAnnotations();
}

function initLanguage() {
  const langButtons = document.querySelectorAll('.lang-bar button');

  langButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      const lang = this.getAttribute('data-lang');
      if (lang) {
        switchLanguage(lang);
      }
    });
  });

  const savedLang = localStorage.getItem('lang');
  const hasUserPreference = localStorage.getItem('lang-user-set') === '1';
  const preferred = document.documentElement.getAttribute('data-lang');
  const initialLang = (hasUserPreference && translations[savedLang] && savedLang)
    || (translations[preferred] && preferred)
    || 'en';
  // Restore only; do not mark as user-set on cold start.
  if (!translations[initialLang]) return;
  currentLang = initialLang;
  const t = translations[initialLang];
  document.documentElement.lang = initialLang === 'zh' ? 'zh-CN' : 'en';
  document.documentElement.setAttribute('data-lang', initialLang);

  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    const key = el.getAttribute('data-i18n');
    if (key && t[key] !== undefined) {
      if (el.tagName === 'INPUT') el.placeholder = t[key];
      else el.textContent = t[key];
    }
  });

  document.querySelectorAll('.lang-bar button').forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('data-lang') === initialLang);
  });
}

// Script is at end of body: apply immediately so app.js can reveal without EN flash.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLanguage);
} else {
  initLanguage();
}
