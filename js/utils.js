'use strict';
// ── Utility Functions ──

const _escapeDiv = document.createElement('div');

const _domCache = new Map();
function $(id) {
  if (!_domCache.has(id)) {
    const el = document.getElementById(id);
    if (el) _domCache.set(id, el);
    return el;
  }
  return _domCache.get(id);
}
function clearDomCache() { _domCache.clear(); }

/* ── Error Handling ── */
function handleError(error, context = '') {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[Error' + (context ? ' in ' + context : '') + ']', error);
  showToast('操作失败：' + message);
  if (typeof performance !== 'undefined' && performance.mark) {
    try { performance.mark('error-' + (context || 'unknown')); } catch (_) {}
  }
}
function safeCall(fn, context = '', fallback = null) {
  try {
    return fn();
  } catch (error) {
    handleError(error, context);
    return fallback;
  }
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeFrench(str) {
  return str
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0153/g, 'oe')
    .replace(/\u00e6/g, 'ae')
    .replace(/\s+/g, ' ');
}
function matchFrenchAnswer(val, acceptList) {
  return acceptList.some(c => c === val) || acceptList.some(c => normalizeFrench(c) === normalizeFrench(val));
}

/**
 * 判题纯函数：不读 DOM、不写存储，仅根据题目和用户答案返回对错（及填空的 details）。
 * 用于可测试性与后续题型扩展；submitAnswer 中收集 DOM 答案后调用此函数。
 */

function evaluateAnswer(q, userAnswer) {
  if (q.type === 'single_choice') {
    const correctIndex = Array.isArray(q.correct) ? q.correct[0] : q.correct;
    return { correct: userAnswer.single === correctIndex };
  }
  if (q.type === 'multiple_choice') {
    const correctSet = new Set(Array.isArray(q.correct) ? q.correct : [q.correct]);
    const selected = new Set(Array.isArray(userAnswer.multiple) ? userAnswer.multiple : []);
    const correct = selected.size === correctSet.size && [...selected].every(i => correctSet.has(i));
    return { correct };
  }
  if (q.type === 'fill_blank') {
    const correctArr = Array.isArray(q.correct) ? q.correct : [q.correct];
    const blankCount = (q.stem.match(/_____/g) || []).length;
    if (blankCount >= 2 && (userAnswer.paragraph || []).length >= 2) {
      const answers = userAnswer.paragraph.slice(0, correctArr.length);
      const details = answers.map((val, i) => {
        const accept = (Array.isArray(correctArr[i]) ? correctArr[i] : [correctArr[i]]).map(c => String(c).toLowerCase().trim());
        return { ok: matchFrenchAnswer(val.trim().toLowerCase(), accept), val, accept };
      });
      return { correct: details.every(d => d.ok), details };
    }
    const val = (userAnswer.fill || '').trim().toLowerCase();
    const accept = correctArr.map(c => String(c).toLowerCase().trim());
    return { correct: matchFrenchAnswer(val, accept) };
  }
  if (q.type === 'paragraph_fill_blank') {
    const correctArr = Array.isArray(q.correct) ? q.correct : [q.correct];
    const inputs = userAnswer.paragraph || [];
    const len = Math.min(correctArr.length, inputs.length);
    const details = [];
    let correct = true;
    for (let i = 0; i < len; i++) {
      const val = (inputs[i] || '').trim().toLowerCase();
      const accept = (Array.isArray(correctArr[i]) ? correctArr[i] : [correctArr[i]]).map(c => String(c).toLowerCase().trim());
      const ok = matchFrenchAnswer(val, accept);
      details.push({ ok, val, accept });
      if (!ok) correct = false;
    }
    for (let i = len; i < correctArr.length; i++) details.push({ ok: false, val: '', accept: [] });
    return { correct, details };
  }
  return { correct: false };
}


function getSelectedTypeFilter() {
  const single = document.getElementById('filter-type-single');
  const multiple = document.getElementById('filter-type-multiple');
  const fill = document.getElementById('filter-type-fill');
  const paragraph = document.getElementById('filter-type-paragraph');
  const types = [];
  if (single && single.checked) types.push('single_choice');
  if (multiple && multiple.checked) types.push('multiple_choice');
  if (fill && fill.checked) types.push('fill_blank');
  if (paragraph && paragraph.checked) types.push('paragraph_fill_blank');
  return types.length === 0 ? null : types;
}
function filterQuestionsByType(questions, typeFilter) {
  if (!questions || !typeFilter || typeFilter.length === 0) return questions || [];
  return questions.filter(q => q && typeFilter.includes(q.type));
}
function shuffleQuestionOptions(q) {
  if (!q || (q.type !== 'single_choice' && q.type !== 'multiple_choice') || !q.options || !q.options.length) return q;
  const perm = shuffleArray(q.options.map((_, i) => i));
  const newOptions = perm.map(i => q.options[i]);
  const oldCorrect = Array.isArray(q.correct) ? q.correct : [q.correct];
  const newCorrect = q.type === 'single_choice'
    ? perm.indexOf(oldCorrect[0])
    : oldCorrect.map(c => perm.indexOf(c)).sort((a, b) => a - b);
  return Object.assign({}, q, { options: newOptions, correct: newCorrect });
}

function escapeHtml(s) {
  if (s == null) return '';
  _escapeDiv.textContent = s;
  return _escapeDiv.innerHTML;
}
function escapeAttr(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function safeHref(href) {
  const u = (href || '').trim();
  if (!/^https?:\/\//i.test(u) && !/^\/[^/]/.test(u) && u !== '#') return '#';
  return escapeAttr(u);
}
function safeImageSrc(url) {
  const u = (url || '').trim();
  if (!/^data:image\//i.test(u)) return '';
  return escapeAttr(u);
}


function formatSavedSetDate(iso) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return y + '-' + m + '-' + day + ' ' + h + ':' + min;
}

function debounce(fn, ms) {
  let t = null;
  return function() {
    if (t) clearTimeout(t);
    t = setTimeout(fn, ms);
  };
}

function normalizeJsonPaste(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/\uFEFF/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\u200B|\u200C|\u200D|\u2060/g, '')
    .replace(/\u201C/g, '"')
    .replace(/\u201D/g, '"')
    .replace(/\u2018/g, "'")
    .replace(/\u2019/g, "'")
    .replace(/\uFF3B/g, '[')
    .replace(/\uFF3D/g, ']')
    .replace(/\uFF5B/g, '{')
    .replace(/\uFF5D/g, '}')
    .replace(/,(\s*[\]}])/g, '$1')
    .trim();
}
function parsePastedText(text) {
  const questions = [];
  // 按「套路 N」或「题型：」分块，保证每块里有一道题
  const chunks = text.split(/(?=套路\s*\d|题型[：:])/i).filter(b => b.trim());
  for (const chunk of chunks) {
    // 题型：后面到 A) 之前为题干（可多行）
    const stemMatch = chunk.match(/题型[：:]\s*([\s\S]*?)(?=A\)\s)/i);
    if (!stemMatch) continue;
    const stem = stemMatch[1].replace(/\s+/g, ' ').trim();
    // A) ... B) ... C) ... D) ...（允许同一行或换行）
    const optMatch = chunk.match(/A\)\s*([\s\S]*?)\s*B\)\s*([\s\S]*?)\s*C\)\s*([\s\S]*?)\s*D\)\s*([\s\S]*?)(?=\n|正确|$)/);
    if (!optMatch) continue;
    const options = [optMatch[1], optMatch[2], optMatch[3], optMatch[4]].map(s => s.trim());
    const correctMatch = chunk.match(/正确[：:]\s*([A-D])/i);
    if (!correctMatch) continue;
    const correct = LETTERS.indexOf(correctMatch[1].toUpperCase());
    if (correct === -1) continue;
    let category = '';
    const catMatch = chunk.match(/套路\s*\d+[：:]\s*([^\n（(]+)/);
    if (catMatch) category = catMatch[1].trim();
    let explanation = '';
    const expMatch = chunk.match(/(?:干扰项分析|解释|出题人想考|记忆口诀)[：:]\s*([\s\S]+?)(?=套路\s*\d|题型[：:]|$)/i);
    if (expMatch) explanation = expMatch[1].trim().split(/\n/).slice(0, 8).join('\n');
    questions.push({
      type: 'single_choice',
      category,
      stem,
      options,
      correct,
      explanation: explanation || `正确答案：${LETTERS[correct]}`
    });
  }
  return questions;
}


let _toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  if (_toastTimer) clearTimeout(_toastTimer);
  el.textContent = msg;
  el.classList.add('show');
  _toastTimer = setTimeout(() => {
    el.classList.remove('show');
    _toastTimer = null;
  }, 2200);
}

let _modalLastFocus = null;
let _openModalOverlay = null;

function getFocusableIn(container) {
  if (!container) return [];
  const nodes = container.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
  return Array.prototype.filter.call(nodes, function(el) { return el.offsetParent != null; });
}
function setModalFocusTrap(overlayEl) {
  _openModalOverlay = overlayEl;
  _modalLastFocus = document.activeElement;
  var focusable = getFocusableIn(overlayEl);
  if (focusable.length) requestAnimationFrame(function() { focusable[0].focus(); });
}
function clearModalFocusTrap() {
  if (_modalLastFocus && typeof _modalLastFocus.focus === 'function') _modalLastFocus.focus();
  _modalLastFocus = null;
  _openModalOverlay = null;
}
