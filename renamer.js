'use strict';
const fs = require('fs');
const path = require('path');

// Apply a single rule to a filename object {base, ext, name, mtime, birthtime}
function applyRule(fileObj, rule) {
  let { base, ext } = fileObj;

  switch (rule.type) {
    case 'prefix':
      base = (rule.value || '') + base;
      break;

    case 'suffix':
      base = base + (rule.value || '');
      break;

    case 'replace':
      if (rule.useRegex) {
        try {
          const flags = rule.caseSensitive ? 'g' : 'gi';
          const re = new RegExp(rule.find, flags);
          base = base.replace(re, rule.replace || '');
        } catch { /* invalid regex, skip */ }
      } else {
        const find = rule.find || '';
        const rep = rule.replace || '';
        if (find) {
          if (rule.caseSensitive) {
            base = base.split(find).join(rep);
          } else {
            base = base.replace(new RegExp(escapeRegex(find), 'gi'), rep);
          }
        }
      }
      break;

    case 'removeChars':
      if (rule.value) {
        const chars = rule.value.split('').map(escapeRegex).join('|');
        base = base.replace(new RegExp(chars, 'g'), '');
      }
      break;

    case 'case':
      switch (rule.value) {
        case 'upper': base = base.toUpperCase(); break;
        case 'lower': base = base.toLowerCase(); break;
        case 'title': base = base.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase()); break;
        case 'camel': base = base.toLowerCase().replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase()); break;
        case 'snake': base = base.toLowerCase().replace(/\s+/g, '_'); break;
        case 'kebab': base = base.toLowerCase().replace(/\s+/g, '-'); break;
      }
      break;

    case 'sequential': {
      const start = parseInt(rule.start, 10) || 1;
      const pad = parseInt(rule.padding, 10) || 3;
      const pos = parseInt(rule.index, 10) || 0; // injected per-file index
      const num = String(start + pos).padStart(pad, '0');
      if (rule.position === 'prefix') base = num + (rule.separator || '') + base;
      else if (rule.position === 'replace') base = num;
      else base = base + (rule.separator || '') + num;
      break;
    }

    case 'insertAt': {
      const pos = parseInt(rule.position, 10) || 0;
      const val = rule.value || '';
      const idx = pos < 0 ? Math.max(0, base.length + pos) : Math.min(pos, base.length);
      base = base.slice(0, idx) + val + base.slice(idx);
      break;
    }

    case 'removeAt': {
      const start = parseInt(rule.start, 10) || 0;
      const count = parseInt(rule.count, 10) || 1;
      const from = start < 0 ? Math.max(0, base.length + start) : Math.min(start, base.length);
      base = base.slice(0, from) + base.slice(from + count);
      break;
    }

    case 'filterExt':
      // This rule is handled at preview generation level (filtering)
      break;

    case 'changeExt':
      if (rule.value !== undefined) {
        ext = rule.value ? (rule.value.startsWith('.') ? rule.value : '.' + rule.value) : '';
      }
      break;

    case 'trimSpaces':
      base = base.trim().replace(/\s+/g, rule.value === 'single' ? ' ' : rule.value === 'remove' ? '' : ' ');
      break;

    case 'removeSpecial':
      base = base.replace(/[^a-zA-Z0-9\s\-_.]/g, '');
      break;

    case 'dateRename': {
      const dateStr = getDateString(fileObj, rule.source || 'mtime', rule.format || 'YYYY-MM-DD');
      if (rule.position === 'prefix') base = dateStr + (rule.separator || '_') + base;
      else if (rule.position === 'replace') base = dateStr;
      else base = base + (rule.separator || '_') + dateStr;
      break;
    }

    case 'regex': {
      if (!rule.find) break;
      try {
        const flags = 'g' + (rule.caseSensitive ? '' : 'i');
        const re = new RegExp(rule.find, flags);
        base = base.replace(re, rule.replace || '');
      } catch { /* invalid regex */ }
      break;
    }
  }

  return { base, ext };
}

function getDateString(fileObj, source, format) {
  const isoStr = source === 'birthtime' ? fileObj.birthtime : fileObj.mtime;
  if (!isoStr) return 'unknown';
  const d = new Date(isoStr);
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return format
    .replace('YYYY', Y).replace('YY', String(Y).slice(2))
    .replace('MM', M).replace('DD', D)
    .replace('HH', h).replace('mm', m).replace('ss', s);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Generate preview: returns array of {original, renamed, conflict, skip}
function generatePreview(files, rules) {
  if (!rules || !rules.length) {
    return files.map(f => ({ original: f.name, renamed: f.name, conflict: false, skip: false, changed: false }));
  }

  // Filter by extension rule if present
  const extFilter = rules.find(r => r.type === 'filterExt');
  let filtered = files;
  if (extFilter && extFilter.value) {
    const allowed = extFilter.value.split(',').map(e => e.trim().toLowerCase().replace(/^\./, ''));
    filtered = files.filter(f => allowed.includes(f.ext.toLowerCase().replace(/^\./, '')));
  }

  // Inject index for sequential rules
  let seqIdx = 0;
  const previews = files.map(file => {
    const skip = extFilter && extFilter.value ? !filtered.includes(file) : false;
    if (skip) return { original: file.name, renamed: file.name, conflict: false, skip: true, changed: false };

    let state = { base: file.base, ext: file.ext, mtime: file.mtime, birthtime: file.birthtime };
    for (const rule of rules) {
      if (rule.type === 'filterExt') continue;
      if (rule.type === 'sequential') {
        rule.index = seqIdx;
      }
      const result = applyRule(state, rule);
      state.base = result.base;
      state.ext = result.ext;
    }
    if (rules.some(r => r.type === 'sequential')) seqIdx++;

    const renamed = state.base + state.ext;
    return { original: file.name, renamed, conflict: false, skip: false, changed: renamed !== file.name };
  });

  // Detect conflicts
  const renamedNames = new Map();
  previews.forEach((p, i) => {
    if (p.skip) return;
    const key = p.renamed.toLowerCase();
    if (renamedNames.has(key)) {
      previews[i].conflict = true;
      previews[renamedNames.get(key)].conflict = true;
    } else {
      renamedNames.set(key, i);
    }
  });

  // Conflict with existing files (originals not being renamed)
  const originalSet = new Set(files.map(f => f.name.toLowerCase()));
  previews.forEach(p => {
    if (p.skip || p.conflict) return;
    if (originalSet.has(p.renamed.toLowerCase()) && p.renamed !== p.original) {
      p.conflict = true;
    }
  });

  return previews;
}

// Execute rename with two-phase approach to avoid collisions
function executeRename(folderPath, previews) {
  const results = { success: 0, failed: 0, skipped: 0, errors: [], undoMap: [] };

  // Phase 1: rename to temp names
  const tempMap = [];
  for (const p of previews) {
    if (p.skip || !p.changed || p.conflict) {
      results.skipped++;
      continue;
    }
    const tempName = `__brtemp_${Date.now()}_${Math.random().toString(36).slice(2)}_${p.original}`;
    const src = path.join(folderPath, p.original);
    const tmp = path.join(folderPath, tempName);
    try {
      fs.renameSync(src, tmp);
      tempMap.push({ temp: tempName, final: p.renamed, original: p.original });
    } catch (err) {
      results.failed++;
      results.errors.push({ file: p.original, error: err.message });
    }
  }

  // Phase 2: rename temp to final
  for (const entry of tempMap) {
    const tmp = path.join(folderPath, entry.temp);
    const final = path.join(folderPath, entry.final);
    try {
      fs.renameSync(tmp, final);
      results.success++;
      results.undoMap.push({ from: entry.final, to: entry.original });
    } catch (err) {
      // Try to restore original
      try { fs.renameSync(tmp, path.join(folderPath, entry.original)); } catch {}
      results.failed++;
      results.errors.push({ file: entry.original, error: err.message });
    }
  }

  return results;
}

function executeUndo(folderPath, undoMap) {
  const results = { success: 0, failed: 0, errors: [] };
  for (const entry of undoMap) {
    const src = path.join(folderPath, entry.from);
    const dst = path.join(folderPath, entry.to);
    try {
      fs.renameSync(src, dst);
      results.success++;
    } catch (err) {
      results.failed++;
      results.errors.push({ file: entry.from, error: err.message });
    }
  }
  return results;
}

module.exports = { generatePreview, executeRename, executeUndo };
