'use strict';

// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  folderPath: null,
  files: [],
  rules: [],
  previews: [],
  lastUndoMap: null,
  previewPending: false,
  ruleIdCounter: 0
};

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const btnOpenFolder = $('btn-open-folder');
const btnRefresh = $('btn-refresh');
const btnRename = $('btn-rename');
const btnClearRules = $('btn-clear-rules');
const undoBtnStatus = $('undo-btn-status');
const folderPathEl = $('folder-path');
const fileCountEl = $('file-count');
const rulesListEl = $('rules-list');
const previewBody = $('preview-body');
const previewTable = $('preview-table');
const emptyState = $('empty-state');
const statusDot = $('status-dot');
const statusMsg = $('status-message');
const progressBar = $('progress-bar');

// ─── Rule Templates ───────────────────────────────────────────────────────────
const RULE_TEMPLATES = {
  prefix: {
    label: 'Prefix',
    default: () => ({ type: 'prefix', value: '' }),
    render(rule) {
      return `<div class="form-row"><label class="form-label">Text</label><input class="form-control form-control-mono" data-key="value" placeholder="Enter prefix..." value="${esc(rule.value)}"></div>`;
    },
    summary(rule) { return rule.value ? `"${rule.value}" + name` : 'Add prefix'; }
  },
  suffix: {
    label: 'Suffix',
    default: () => ({ type: 'suffix', value: '' }),
    render(rule) {
      return `<div class="form-row"><label class="form-label">Text</label><input class="form-control form-control-mono" data-key="value" placeholder="Enter suffix..." value="${esc(rule.value)}"></div>`;
    },
    summary(rule) { return rule.value ? `name + "${rule.value}"` : 'Add suffix'; }
  },
  replace: {
    label: 'Replace',
    default: () => ({ type: 'replace', find: '', replace: '', caseSensitive: false, useRegex: false }),
    render(rule) {
      return `
        <div class="form-row"><label class="form-label">Find</label><input class="form-control form-control-mono" data-key="find" placeholder="Search text..." value="${esc(rule.find)}"></div>
        <div class="form-row"><label class="form-label">Replace</label><input class="form-control form-control-mono" data-key="replace" placeholder="Replace with..." value="${esc(rule.replace)}"></div>
        <div class="form-row" style="gap:14px">
          <label class="checkbox-row"><input type="checkbox" data-key="caseSensitive" ${rule.caseSensitive?'checked':''}><label>Case sensitive</label></label>
          <label class="checkbox-row"><input type="checkbox" data-key="useRegex" ${rule.useRegex?'checked':''}><label>Use regex</label></label>
        </div>`;
    },
    summary(rule) { return rule.find ? `"${rule.find}" → "${rule.replace}"` : 'Find & Replace'; }
  },
  removeChars: {
    label: 'Remove Chars',
    default: () => ({ type: 'removeChars', value: '' }),
    render(rule) {
      return `<div class="form-row"><label class="form-label">Chars</label><input class="form-control form-control-mono" data-key="value" placeholder="e.g. _-." value="${esc(rule.value)}"></div>`;
    },
    summary(rule) { return rule.value ? `Remove: "${rule.value}"` : 'Remove characters'; }
  },
  case: {
    label: 'Case',
    default: () => ({ type: 'case', value: 'title' }),
    render(rule) {
      const opts = [['upper','UPPERCASE'],['lower','lowercase'],['title','Title Case'],['camel','camelCase'],['snake','snake_case'],['kebab','kebab-case']];
      return `<div class="form-row"><label class="form-label">Mode</label><select class="form-control" data-key="value">${opts.map(([v,l])=>`<option value="${v}"${rule.value===v?' selected':''}>${l}</option>`).join('')}</select></div>`;
    },
    summary(rule) { return `→ ${rule.value}`; }
  },
  sequential: {
    label: 'Sequential',
    default: () => ({ type: 'sequential', start: 1, padding: 3, separator: '_', position: 'suffix' }),
    render(rule) {
      return `
        <div class="form-row"><label class="form-label">Start</label><input class="form-control" data-key="start" type="number" min="0" value="${rule.start}"></div>
        <div class="form-row"><label class="form-label">Padding</label><input class="form-control" data-key="padding" type="number" min="1" max="6" value="${rule.padding}"></div>
        <div class="form-row"><label class="form-label">Separator</label><input class="form-control form-control-mono" data-key="separator" placeholder="_" value="${esc(rule.separator)}"></div>
        <div class="form-row"><label class="form-label">Position</label>
          <select class="form-control" data-key="position">
            <option value="suffix"${rule.position==='suffix'?' selected':''}>Suffix (name_001)</option>
            <option value="prefix"${rule.position==='prefix'?' selected':''}>Prefix (001_name)</option>
            <option value="replace"${rule.position==='replace'?' selected':''}>Replace (001)</option>
          </select>
        </div>`;
    },
    summary(rule) { return `${rule.start}+ pad ${rule.padding} (${rule.position})`; }
  },
  insertAt: {
    label: 'Insert At',
    default: () => ({ type: 'insertAt', value: '', position: 0 }),
    render(rule) {
      return `
        <div class="form-row"><label class="form-label">Text</label><input class="form-control form-control-mono" data-key="value" placeholder="Text to insert..." value="${esc(rule.value)}"></div>
        <div class="form-row"><label class="form-label">Position</label><input class="form-control" data-key="position" type="number" value="${rule.position}" placeholder="0=start, -1=end"></div>`;
    },
    summary(rule) { return rule.value ? `Insert "${rule.value}" at ${rule.position}` : 'Insert at position'; }
  },
  removeAt: {
    label: 'Remove At',
    default: () => ({ type: 'removeAt', start: 0, count: 1 }),
    render(rule) {
      return `
        <div class="form-row"><label class="form-label">Start</label><input class="form-control" data-key="start" type="number" value="${rule.start}" placeholder="Character index"></div>
        <div class="form-row"><label class="form-label">Count</label><input class="form-control" data-key="count" type="number" min="1" value="${rule.count}" placeholder="# chars to remove"></div>`;
    },
    summary(rule) { return `Remove ${rule.count} char(s) at ${rule.start}`; }
  },
  changeExt: {
    label: 'Ext Change',
    default: () => ({ type: 'changeExt', value: '' }),
    render(rule) {
      return `<div class="form-row"><label class="form-label">New ext</label><input class="form-control form-control-mono" data-key="value" placeholder=".md (empty=remove)" value="${esc(rule.value)}"></div>`;
    },
    summary(rule) { return `→ ${rule.value || '(none)'}`; }
  },
  filterExt: {
    label: 'Filter Ext',
    default: () => ({ type: 'filterExt', value: '' }),
    render(rule) {
      return `<div class="form-row"><label class="form-label">Ext(s)</label><input class="form-control form-control-mono" data-key="value" placeholder="txt, jpg, png" value="${esc(rule.value)}"></div>`;
    },
    summary(rule) { return rule.value ? `Only: ${rule.value}` : 'Filter by ext'; }
  },
  trimSpaces: {
    label: 'Trim Spaces',
    default: () => ({ type: 'trimSpaces', value: 'trim' }),
    render(rule) {
      return `<div class="form-row"><label class="form-label">Mode</label>
        <select class="form-control" data-key="value">
          <option value="trim"${rule.value==='trim'?' selected':''}>Trim edges only</option>
          <option value="single"${rule.value==='single'?' selected':''}>Collapse to single space</option>
          <option value="remove"${rule.value==='remove'?' selected':''}>Remove all spaces</option>
        </select></div>`;
    },
    summary(rule) { return rule.value; }
  },
  removeSpecial: {
    label: 'Remove Special',
    default: () => ({ type: 'removeSpecial' }),
    render() { return `<p style="font-size:11px;color:var(--text-3)">Removes all characters except letters, numbers, spaces, hyphens, dots, underscores.</p>`; },
    summary() { return 'Remove special chars'; }
  },
  dateRename: {
    label: 'Date Rename',
    default: () => ({ type: 'dateRename', source: 'mtime', format: 'YYYY-MM-DD', position: 'prefix', separator: '_' }),
    render(rule) {
      return `
        <div class="form-row"><label class="form-label">Source</label>
          <select class="form-control" data-key="source">
            <option value="mtime"${rule.source==='mtime'?' selected':''}>Modified date</option>
            <option value="birthtime"${rule.source==='birthtime'?' selected':''}>Created date</option>
          </select>
        </div>
        <div class="form-row"><label class="form-label">Format</label><input class="form-control form-control-mono" data-key="format" value="${esc(rule.format)}" placeholder="YYYY-MM-DD"></div>
        <div class="form-row"><label class="form-label">Position</label>
          <select class="form-control" data-key="position">
            <option value="prefix"${rule.position==='prefix'?' selected':''}>Prefix</option>
            <option value="suffix"${rule.position==='suffix'?' selected':''}>Suffix</option>
            <option value="replace"${rule.position==='replace'?' selected':''}>Replace</option>
          </select>
        </div>
        <div class="form-row"><label class="form-label">Separator</label><input class="form-control form-control-mono" data-key="separator" value="${esc(rule.separator)}" placeholder="_"></div>
        <p style="font-size:10.5px;color:var(--text-3);margin-top:2px">Tokens: YYYY YY MM DD HH mm ss</p>`;
    },
    summary(rule) { return `${rule.source} → ${rule.format} (${rule.position})`; }
  },
  regex: {
    label: 'Regex',
    default: () => ({ type: 'regex', find: '', replace: '', caseSensitive: false }),
    render(rule) {
      return `
        <div class="form-row"><label class="form-label">Pattern</label><input class="form-control form-control-mono" data-key="find" placeholder="regex pattern..." value="${esc(rule.find)}"></div>
        <div class="form-row"><label class="form-label">Replace</label><input class="form-control form-control-mono" data-key="replace" placeholder="replacement ($1, $2...)" value="${esc(rule.replace)}"></div>
        <label class="checkbox-row"><input type="checkbox" data-key="caseSensitive" ${rule.caseSensitive?'checked':''}><label>Case sensitive</label></label>`;
    },
    summary(rule) { return rule.find ? `/${rule.find}/ → "${rule.replace}"` : 'Regex replace'; }
  }
};

// ─── Utilities ────────────────────────────────────────────────────────────────
function esc(str) { return (str||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

function setStatus(msg, type='ready') {
  statusMsg.textContent = msg;
  statusDot.className = 'status-dot ' + type;
}

function showProgress(pct) {
  progressBar.style.transform = `scaleX(${pct})`;
  if (pct >= 1) setTimeout(() => { progressBar.style.transform = 'scaleX(0)'; }, 400);
}

function toast(msg, type='info', duration=3500) {
  const icons = { success:'✓', error:'✕', info:'ℹ' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span style="font-weight:700;flex-shrink:0">${icons[type]||'·'}</span><span>${msg}</span>`;
  $('toast-container').appendChild(el);
  setTimeout(() => {
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 250);
  }, duration);
}

function updateStats() {
  const total = state.files.length;
  const changed = state.previews.filter(p => p.changed && !p.skip).length;
  const conflicts = state.previews.filter(p => p.conflict).length;

  fileCountEl.textContent = `${total} file${total !== 1 ? 's' : ''}`;

  $('stat-total').style.display = total ? '' : 'none';
  $('stat-total-val').textContent = `${total} files`;
  $('stat-changed').style.display = changed ? '' : 'none';
  $('stat-changed-val').textContent = `${changed} will rename`;
  $('stat-conflict').style.display = conflicts ? '' : 'none';
  $('stat-conflict-val').textContent = `${conflicts} conflict${conflicts !== 1 ? 's' : ''}`;

  btnRename.disabled = changed === 0 || conflicts > 0;
}

// ─── Rules Management ─────────────────────────────────────────────────────────
function getRuleTemplate(type) { return RULE_TEMPLATES[type]; }

function createRule(type) {
  const tpl = getRuleTemplate(type);
  if (!tpl) return null;
  const rule = tpl.default();
  rule._id = ++state.ruleIdCounter;
  rule._collapsed = false;
  return rule;
}

function renderRules() {
  rulesListEl.innerHTML = '';
  state.rules.forEach((rule, idx) => {
    const tpl = getRuleTemplate(rule.type);
    if (!tpl) return;
    const card = document.createElement('div');
    card.className = 'rule-card';
    card.dataset.ruleId = rule._id;
    card.innerHTML = `
      <div class="rule-header" data-rule-idx="${idx}">
        <span class="rule-drag" title="Drag to reorder">⠿</span>
        <span class="rule-type-badge">${tpl.label}</span>
        <span class="rule-summary">${tpl.summary(rule)}</span>
        <button class="rule-remove" data-rule-idx="${idx}" title="Remove rule">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="rule-body ${rule._collapsed ? 'collapsed' : ''}" data-rule-idx="${idx}">
        ${tpl.render(rule)}
      </div>`;
    rulesListEl.appendChild(card);
  });
  attachRuleEvents();
}

function attachRuleEvents() {
  // Toggle collapse
  rulesListEl.querySelectorAll('.rule-header').forEach(header => {
    header.addEventListener('click', e => {
      if (e.target.closest('.rule-remove')) return;
      const idx = parseInt(header.dataset.ruleIdx);
      state.rules[idx]._collapsed = !state.rules[idx]._collapsed;
      renderRules();
    });
  });

  // Remove rule
  rulesListEl.querySelectorAll('.rule-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.ruleIdx);
      state.rules.splice(idx, 1);
      renderRules();
      schedulePreview();
    });
  });

  // Input changes
  rulesListEl.querySelectorAll('.rule-body input, .rule-body select').forEach(input => {
    const body = input.closest('.rule-body');
    const idx = parseInt(body.dataset.ruleIdx);
    const key = input.dataset.key;
    if (!key) return;

    const updateRule = () => {
      if (input.type === 'checkbox') state.rules[idx][key] = input.checked;
      else if (input.type === 'number') state.rules[idx][key] = input.value === '' ? 0 : Number(input.value);
      else state.rules[idx][key] = input.value;
      // Update summary
      const header = rulesListEl.querySelector(`[data-rule-idx="${idx}"].rule-header`);
      if (header) {
        const tpl = getRuleTemplate(state.rules[idx].type);
        header.querySelector('.rule-summary').textContent = tpl.summary(state.rules[idx]);
      }
      schedulePreview();
    };
    input.addEventListener('input', updateRule);
    input.addEventListener('change', updateRule);
  });
}

// ─── Preview ──────────────────────────────────────────────────────────────────
let previewTimer = null;
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(runPreview, 120);
}

async function runPreview() {
  if (!state.files.length) return;
  setStatus('Generating preview...', 'working');
  showProgress(0.3);
  try {
    const previews = await window.api.previewRename({ files: state.files, rules: state.rules });
    state.previews = previews;
    renderPreviewTable(previews);
    showProgress(1);
    const changed = previews.filter(p => p.changed && !p.skip).length;
    const conflicts = previews.filter(p => p.conflict).length;
    setStatus(conflicts > 0 ? `${conflicts} conflict(s) detected` : `${changed} file(s) will be renamed`, conflicts > 0 ? 'error' : 'ready');
  } catch (err) {
    setStatus('Preview error: ' + err.message, 'error');
    showProgress(0);
  }
  updateStats();
}

const ROW_HEIGHT = 34;
const BUFFER = 20;
let scrollRaf = null;

function renderPreviewTable(previews) {
  if (!previews || !previews.length) {
    previewTable.style.display = 'none';
    emptyState.style.display = 'flex';
    return;
  }
  previewTable.style.display = '';
  emptyState.style.display = 'none';

  // Virtual render for large lists
  const wrap = $('preview-wrap');
  renderVisibleRows(previews, wrap);

  // Re-render on scroll
  wrap.onscroll = () => {
    if (scrollRaf) cancelAnimationFrame(scrollRaf);
    scrollRaf = requestAnimationFrame(() => renderVisibleRows(previews, wrap));
  };
}

function renderVisibleRows(previews, wrap) {
  const scrollTop = wrap.scrollTop;
  const viewHeight = wrap.clientHeight;
  const totalHeight = previews.length * ROW_HEIGHT;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER);
  const endIdx = Math.min(previews.length - 1, Math.ceil((scrollTop + viewHeight) / ROW_HEIGHT) + BUFFER);

  let html = '';
  // Spacer top
  html += `<tr style="height:${startIdx * ROW_HEIGHT}px"><td colspan="5"></td></tr>`;

  for (let i = startIdx; i <= endIdx; i++) {
    const p = previews[i];
    const rowClass = p.conflict ? 'style="background:rgba(239,68,68,0.04)"' : '';
    const newClass = p.changed && !p.conflict ? 'changed' : '';
    let statusTag;
    if (p.conflict) statusTag = '<span class="tag tag-conflict">Conflict</span>';
    else if (p.skip) statusTag = '<span class="tag tag-skip">Skip</span>';
    else if (p.changed) statusTag = '<span class="tag tag-changed">Rename</span>';
    else statusTag = '<span class="tag tag-same">—</span>';

    html += `<tr ${rowClass}>
      <td class="row-num">${i + 1}</td>
      <td class="col-orig" title="${esc(p.original)}">${esc(p.original)}</td>
      <td class="col-arrow">→</td>
      <td class="col-new ${newClass}" title="${esc(p.renamed)}">${esc(p.renamed)}</td>
      <td class="col-status">${statusTag}</td>
    </tr>`;
  }

  // Spacer bottom
  const bottomRows = previews.length - 1 - endIdx;
  if (bottomRows > 0) html += `<tr style="height:${bottomRows * ROW_HEIGHT}px"><td colspan="5"></td></tr>`;

  previewBody.innerHTML = html;

  // Set table container min-height
  previewBody.parentElement.style.minHeight = totalHeight + 48 + 'px';
}

// ─── Folder Loading ───────────────────────────────────────────────────────────
async function openFolder() {
  const folderPath = await window.api.openFolder();
  if (!folderPath) return;
  state.folderPath = folderPath;
  await loadFolder();
}

async function loadFolder() {
  if (!state.folderPath) return;
  setStatus('Loading files...', 'working');
  showProgress(0.2);
  folderPathEl.textContent = state.folderPath;
  folderPathEl.title = state.folderPath;
  const result = await window.api.readFolder(state.folderPath);
  if (result && result.error) {
    toast('Error reading folder: ' + result.error, 'error');
    setStatus('Error reading folder', 'error');
    return;
  }
  state.files = result || [];
  showProgress(0.7);
  btnRefresh.disabled = false;
  await runPreview();
  showProgress(1);
  toast(`Loaded ${state.files.length} files`, 'info', 2000);
}

// ─── Execute Rename ───────────────────────────────────────────────────────────
async function executeRename() {
  const hasConflicts = state.previews.some(p => p.conflict);
  if (hasConflicts) { toast('Fix conflicts before renaming', 'error'); return; }
  const willChange = state.previews.filter(p => p.changed && !p.skip);
  if (!willChange.length) { toast('No files will be renamed', 'info'); return; }

  btnRename.disabled = true;
  setStatus(`Renaming ${willChange.length} files...`, 'working');
  showProgress(0.4);

  const result = await window.api.executeRename({ folderPath: state.folderPath, previews: state.previews });
  showProgress(0.9);

  if (result.success > 0) {
    state.lastUndoMap = result.undoMap;
    undoBtnStatus.style.display = '';
    toast(`✓ Renamed ${result.success} file(s)${result.failed ? ` (${result.failed} failed)` : ''}`, 'success');
  }
  if (result.failed > 0) {
    toast(`${result.failed} file(s) failed: ${result.errors[0]?.error || ''}`, 'error');
  }

  await loadFolder();
  setStatus(`Done. ${result.success} renamed, ${result.failed} failed.`, result.failed > 0 ? 'error' : 'ready');
  showProgress(1);
}

// ─── Undo ─────────────────────────────────────────────────────────────────────
async function executeUndo() {
  if (!state.lastUndoMap || !state.lastUndoMap.length) { toast('Nothing to undo', 'info'); return; }
  setStatus('Undoing...', 'working');
  const result = await window.api.undoRename({ folderPath: state.folderPath, undoMap: state.lastUndoMap });
  state.lastUndoMap = null;
  undoBtnStatus.style.display = 'none';
  toast(`Undo: ${result.success} restored${result.failed ? `, ${result.failed} failed` : ''}`, result.failed > 0 ? 'error' : 'success');
  await loadFolder();
}

// ─── Event Bindings ───────────────────────────────────────────────────────────
btnOpenFolder.addEventListener('click', openFolder);
btnRefresh.addEventListener('click', loadFolder);
btnRename.addEventListener('click', executeRename);
undoBtnStatus.addEventListener('click', executeUndo);
btnClearRules.addEventListener('click', () => {
  state.rules = [];
  renderRules();
  schedulePreview();
});

$('btn-add-rule').addEventListener('click', () => {
  const type = $('rule-type-select').value;
  const rule = createRule(type);
  if (!rule) return;
  state.rules.push(rule);
  renderRules();
  schedulePreview();
});

// Drag & drop folder
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', async e => {
  e.preventDefault();
  const items = e.dataTransfer.files;
  if (items.length) {
    // We can't get folder path from dropped files in Electron renderer easily with contextIsolation,
    // so we prompt the open dialog instead
    toast('Use "Open Folder" button to select a folder', 'info', 2000);
  }
});

// Init
renderRules();
setStatus('Ready — open a folder to begin');
