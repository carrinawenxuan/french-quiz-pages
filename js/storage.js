'use strict';
// ── Data Storage & Persistence Layer ──

let projectFolderHandle = null;
let _savedSetsCache = null;
let _savedSetsCacheDirty = true;
let _wrongBookCache = null;
let _wrongBookCacheDirty = true;
const _wrongBookIdCache = new WeakMap();
let _savedSetsDisplayLimit = SAVED_SETS_DISPLAY_LIMIT;
let _currentQuestionIdForNotes = null;

async function hashPin(pin) {
  const enc = new TextEncoder();
  const data = enc.encode(String(pin));
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function isImportLockEnabled() { return !!localStorage.getItem(IMPORT_PIN_HASH_KEY); }
async function setImportPin(pin) { localStorage.setItem(IMPORT_PIN_HASH_KEY, await hashPin(pin)); }
async function verifyImportPin(pin) { return (await hashPin(pin)) === localStorage.getItem(IMPORT_PIN_HASH_KEY); }
function computeFingerprint() {
  const parts = [
    navigator.userAgent || '',
    (screen && (screen.width + 'x' + screen.height)) || '',
    new Date().getTimezoneOffset(),
    navigator.language || '',
    (navigator.hardwareConcurrency || '') + ''
  ].join('|');
  let h = 0;
  for (let i = 0; i < parts.length; i++) h = ((h << 5) - h) + parts.charCodeAt(i) | 0;
  return (h >>> 0).toString(36);
}
function getImportAllowedFingerprint() { return localStorage.getItem(IMPORT_ALLOWED_FINGERPRINT_KEY) || ''; }
function setImportAllowedFingerprintToThisDevice() { localStorage.setItem(IMPORT_ALLOWED_FINGERPRINT_KEY, computeFingerprint()); }
function canImportOnThisDevice() {
  const allowed = getImportAllowedFingerprint();
  if (!allowed) return true;
  return computeFingerprint() === allowed;
}
async function checkImportPin() {
  if (!canImportOnThisDevice()) {
    showToast('仅允许在已绑定的电脑上导入，当前设备未绑定');
    return false;
  }
  if (!isImportLockEnabled()) return true;
  const pin = prompt('请输入主人 PIN 以继续导入');
  if (pin === null) return false;
  const ok = await verifyImportPin(pin);
  if (!ok) showToast('PIN 错误');
  return ok;
}
function updateImportLockUI() {
  const statusText = document.getElementById('import-lock-status-text');
  const setBtn = document.getElementById('btn-import-lock-set');
  const changeBtn = document.getElementById('btn-import-lock-change');
  const disableBtn = document.getElementById('btn-import-lock-disable');
  if (!statusText) return;
  if (isImportLockEnabled()) {
    statusText.textContent = '已启用';
    if (setBtn) setBtn.style.display = 'none';
    if (changeBtn) changeBtn.style.display = 'inline-flex';
    if (disableBtn) disableBtn.style.display = 'inline-flex';
  } else {
    statusText.textContent = '未启用';
    if (setBtn) setBtn.style.display = 'inline-flex';
    if (changeBtn) changeBtn.style.display = 'none';
    if (disableBtn) disableBtn.style.display = 'none';
  }
}
function updateDeviceBindUI() {
  const statusText = document.getElementById('device-bind-status-text');
  const bindBtn = document.getElementById('btn-device-bind');
  const unbindBtn = document.getElementById('btn-device-unbind');
  if (!statusText) return;
  const allowed = getImportAllowedFingerprint();
  const isThisDevice = allowed && computeFingerprint() === allowed;
  if (allowed) {
    statusText.textContent = isThisDevice ? '已绑定本机（仅本机可导入）' : '已绑定其他设备（当前设备不可导入）';
    if (bindBtn) bindBtn.style.display = 'none';
    if (unbindBtn) unbindBtn.style.display = isThisDevice ? 'inline-flex' : 'none';
  } else {
    statusText.textContent = '未绑定';
    if (bindBtn) bindBtn.style.display = 'inline-flex';
    if (unbindBtn) unbindBtn.style.display = 'none';
  }
}


function getRecentSessions() {
  try {
    const raw = localStorage.getItem(RECENT_SESSIONS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.slice(-RECENT_SESSIONS_MAX) : [];
  } catch (_) { return []; }
}
function pushRecentSession(total, score) {
  const sessions = getRecentSessions();
  sessions.push({ total, score, at: new Date().toISOString() });
  localStorage.setItem(RECENT_SESSIONS_KEY, JSON.stringify(sessions.slice(-RECENT_SESSIONS_MAX)));
}

function saveQuizProgress() {
  try {
    sessionStorage.setItem(QUIZ_PROGRESS_KEY, JSON.stringify({
      questions: state.questions, index: state.index, score: state.score,
      timerSeconds: state.timerSeconds, practicingWrongBook: state.practicingWrongBook,
      practicedSetId: state.practicedSetId, answerResults: state.answerResults || {},
      savedAt: Date.now()
    }));
  } catch (_) {}
}
function clearQuizProgress() { try { sessionStorage.removeItem(QUIZ_PROGRESS_KEY); } catch (_) {} }
function getQuizProgress() {
  try {
    const raw = sessionStorage.getItem(QUIZ_PROGRESS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (Date.now() - p.savedAt > 2 * 60 * 60 * 1000) { clearQuizProgress(); return null; }
    return p;
  } catch (_) { return null; }
}

function getDailyStats() {
  try {
    const raw = localStorage.getItem(DAILY_STATS_KEY);
    const data = raw ? JSON.parse(raw) : {};
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    if (data.date !== today) {
      return {
        date: today,
        todayCount: 0,
        lastDate: data.lastDate || data.date,
        streak: data.streak || 0
      };
    }
    return {
      date: today,
      todayCount: data.todayCount || 0,
      lastDate: data.lastDate || data.date,
      streak: data.streak || 0
    };
  } catch (_) { return { date: new Date().toISOString().slice(0, 10), todayCount: 0, lastDate: null, streak: 0 }; }
}
function addTodayPractice(n) {
  const raw = localStorage.getItem(DAILY_STATS_KEY);
  const data = raw ? JSON.parse(raw) : {};
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  let streak = data.streak || 0;
  let todayCount = data.todayCount || 0;
  if (data.date === today) {
    todayCount += (n || 0);
  } else {
    todayCount = n || 0;
    const prevDate = data.lastDate || data.date;
    if (prevDate === yesterday) streak += 1;
    else if (prevDate !== today) streak = 1;
  }
  const st = { date: today, todayCount, lastDate: today, streak };
  localStorage.setItem(DAILY_STATS_KEY, JSON.stringify(st));
  updateStatsBar();
}
function animateStatChange(el, newValue) {
  if (!el) return;
  const oldText = el.textContent;
  el.textContent = newValue;
  if (oldText !== String(newValue)) {
    el.classList.remove('updated');
    void el.offsetWidth;
    el.classList.add('updated');
  }
}
function updateStatsBar() {
  const st = getDailyStats();
  const elToday = document.getElementById('stat-today');
  const elWrong = document.getElementById('stat-wrong');
  const elSets = document.getElementById('stat-sets');
  const elStreak = document.getElementById('stat-streak');
  animateStatChange(elToday, st.todayCount || 0);
  animateStatChange(elWrong, getWrongBook().length);
  animateStatChange(elSets, getSavedSets().length);
  animateStatChange(elStreak, st.streak || 0);
}

function getDataForExport() {
  const timerEl = document.getElementById('timer-seconds');
  let questionNotes = {};
  try {
    const raw = localStorage.getItem(QUESTION_NOTES_KEY);
    if (raw) questionNotes = JSON.parse(raw);
  } catch (_) {}
  const out = {
    savedSets: getSavedSets(),
    folders: getFolders(),
    wrongBook: getWrongBook(),
    questionNotes: questionNotes,
    timerSeconds: timerEl ? Math.max(0, parseInt(timerEl.value, 10) || 10) : 10,
    dailyStats: getDailyStats(),
    exportedAt: new Date().toISOString()
  };
  const fp = getImportAllowedFingerprint();
  if (fp) out.importAllowedDeviceFingerprint = fp;
  return out;
}
function sanitizeImportedData(data) {
  if (!data || typeof data !== 'object') return {};
  const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];
  function stripDangerousKeys(val) {
    if (val === null || typeof val !== 'object') return val;
    if (Array.isArray(val)) return val.map(stripDangerousKeys);
    const out = {};
    for (const k of Object.keys(val)) {
      if (DANGEROUS_KEYS.includes(k)) continue;
      out[k] = stripDangerousKeys(val[k]);
    }
    return out;
  }
  return stripDangerousKeys(data);
}
function loadDataFromObject(data) {
  const safe = sanitizeImportedData(data);
  if (safe.savedSets != null) setSavedSets(Array.isArray(safe.savedSets) ? safe.savedSets : []);
  if (safe.folders != null) setFolders(Array.isArray(safe.folders) ? safe.folders : []);
  if (safe.wrongBook != null) setWrongBook(Array.isArray(safe.wrongBook) ? safe.wrongBook : []);
  if (safe.questionNotes != null && typeof safe.questionNotes === 'object') {
    try {
      localStorage.setItem(QUESTION_NOTES_KEY, JSON.stringify(safe.questionNotes));
    } catch (_) {}
  }
  if (safe.timerSeconds != null) {
    const n = Math.max(0, Math.min(120, parseInt(safe.timerSeconds, 10) || 10));
    const el = document.getElementById('timer-seconds');
    if (el) { el.value = n; localStorage.setItem(TIMER_SECONDS_KEY, String(n)); }
  }
  if (safe.dailyStats != null && safe.dailyStats && safe.dailyStats.date) {
    try {
      localStorage.setItem(DAILY_STATS_KEY, JSON.stringify({
        date: safe.dailyStats.date,
        todayCount: safe.dailyStats.todayCount || 0,
        lastDate: safe.dailyStats.lastDate || safe.dailyStats.date,
        streak: safe.dailyStats.streak || 0
      }));
    } catch (_) {}
    updateStatsBar();
  }
  if (safe.importAllowedDeviceFingerprint != null && String(safe.importAllowedDeviceFingerprint)) {
    localStorage.setItem(IMPORT_ALLOWED_FINGERPRINT_KEY, String(safe.importAllowedDeviceFingerprint));
  } else {
    localStorage.removeItem(IMPORT_ALLOWED_FINGERPRINT_KEY);
  }
  updateImportLockUI();
  updateDeviceBindUI();
  updateWrongCount();
  renderSavedSets();
  updateStartPracticeSelect();
}
async function loadFromCloud() {
  let url = DATA_FILE_NAME;
  if (typeof location !== 'undefined' && location.origin) {
    const dir = location.pathname.replace(/\/[^/]*$/, '') || '/';
    const base = dir.endsWith('/') ? dir : dir + '/';
    url = location.origin + base + DATA_FILE_NAME;
  }
  const btn = $('btn-load-cloud') || document.getElementById('btn-load-cloud');
  if (btn) { btn.disabled = true; btn.textContent = '加载中…'; }
  try {
    const res = await fetch(url + '?t=' + Date.now());
    if (!res.ok) throw new Error(res.status === 404 ? '未找到云端数据' : '请求失败');
    const data = await res.json();
    if (!data || (data.savedSets == null && data.wrongBook == null)) throw new Error('数据格式无效');
    if (!confirm('云端数据将覆盖当前本地的习题集、文件夹和错题本。确定要加载并覆盖吗？')) return;
    loadDataFromObject(data);
    const setCount = data.savedSets && data.savedSets.length ? data.savedSets.length : 0;
    const wrongCount = data.wrongBook && data.wrongBook.length ? data.wrongBook.length : 0;
    showToast('已加载' + (setCount ? ' ' + setCount + ' 套习题集' : '') + (wrongCount ? '，' + wrongCount + ' 道错题' : ''));
  } catch (e) {
    showToast('加载失败，请检查网络或稍后再试。若仍失败可尝试「从文件导入」');
  }
  if (btn) { btn.disabled = false; btn.textContent = '从云端加载（手机同步习题集）'; }
}
async function pickFolderAndLoad() {
  if (!('showDirectoryPicker' in window)) {
    alert('当前浏览器不支持选择文件夹，请用 Chrome 或 Edge，或使用下方「从文件导入数据」选择 JSON 文件。');
    return;
  }
  const btn = document.getElementById('btn-open-folder');
  const titleEl = btn && btn.querySelector('.title');
  const origTitle = titleEl ? titleEl.textContent : '';
  try {
    const handle = await window.showDirectoryPicker();
    projectFolderHandle = handle;
    let fileHandle = await handle.getFileHandle(DATA_FILE_NAME, { create: false }).catch(() => null);
    if (!fileHandle) {
      fileHandle = await handle.getFileHandle(DATA_FILE_NAME, { create: true });
      const writable = await fileHandle.createWritable();
      const empty = { savedSets: [], folders: [], wrongBook: [], timerSeconds: 10 };
      await writable.write(JSON.stringify(empty, null, 2));
      await writable.close();
      loadDataFromObject(empty);
      showToast('已创建并加载空数据');
      return;
    }
    if (btn) { btn.disabled = true; if (titleEl) titleEl.textContent = '加载中…'; }
    const file = await fileHandle.getFile();
    const text = await file.text();
    const data = JSON.parse(text);
    loadDataFromObject(data);
    showToast('已从项目文件夹加载数据');
  } catch (e) {
    if (e.name === 'AbortError') return;
    console.error(e);
    showToast('加载失败：' + (e.message || String(e)));
  } finally {
    if (btn) { btn.disabled = false; if (titleEl) titleEl.textContent = origTitle; }
  }
}
async function saveToProjectFolder() {
  if (!projectFolderHandle) {
    if (!('showDirectoryPicker' in window)) {
      alert('当前浏览器不支持。请用 Chrome/Edge 选择文件夹，或使用「导出数据」下载 JSON 后手动放到 french-quiz 文件夹。');
      return;
    }
    try {
      projectFolderHandle = await window.showDirectoryPicker();
    } catch (e) {
      if (e.name === 'AbortError') return;
      throw e;
    }
  }
  const btn = document.getElementById('btn-one-save');
  if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }
  if (typeof performance !== 'undefined' && performance.mark) performance.mark('save-start');
  try {
    const fileHandle = await projectFolderHandle.getFileHandle(DATA_FILE_NAME, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(getDataForExport(), null, 2));
    await writable.close();
    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark('save-end');
      try { performance.measure('save-to-folder', 'save-start', 'save-end'); } catch (_) {}
    }
    const tipEl = document.getElementById('save-success-tip');
    if (tipEl) {
      tipEl.style.display = 'block';
      /* Auto-expand storage details so the tip is visible */
      const storageBody = document.getElementById('storage-details-body');
      if (storageBody && !storageBody.classList.contains('open')) {
        storageBody.classList.add('open');
        const storageToggle = document.querySelector('[aria-controls="storage-details-body"]');
        if (storageToggle) storageToggle.setAttribute('aria-expanded', 'true');
      }
      tipEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    showToast('已保存');
  } catch (e) {
    console.error(e);
    showToast('保存失败：' + (e.message || String(e)));
    projectFolderHandle = null;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '一键保存（覆盖到项目文件夹）'; }
  }
}
function exportDataDownload() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(getDataForExport(), null, 2)], { type: 'application/json' }));
  a.download = DATA_FILE_NAME;
  a.click();
  URL.revokeObjectURL(a.href);
}
function importDataFromFile(file) {
  const btn = document.getElementById('btn-import-data');
  const titleEl = btn && btn.querySelector('.title');
  const origTitle = titleEl ? titleEl.textContent : '';
  if (btn) { btn.disabled = true; if (titleEl) titleEl.textContent = '导入中…'; }
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const data = JSON.parse(fr.result);
      loadDataFromObject(data);
      showToast('已从文件导入数据');
    } catch (e) {
      showToast('文件格式错误，请确认是有效的 JSON：' + (e.message || String(e)));
    } finally {
      if (btn) { btn.disabled = false; if (titleEl) titleEl.textContent = origTitle; }
    }
  };
  fr.onerror = () => {
    showToast('文件读取失败');
    if (btn) { btn.disabled = false; if (titleEl) titleEl.textContent = origTitle; }
  };
  fr.readAsText(file);
}


function getSavedSets() {
  if (!_savedSetsCacheDirty && _savedSetsCache !== null) return _savedSetsCache;
  try {
    const raw = localStorage.getItem(SAVED_SETS_KEY);
    _savedSetsCache = raw ? JSON.parse(raw) : [];
    _savedSetsCacheDirty = false;
    return _savedSetsCache;
  } catch (_) { return []; }
}
function setSavedSets(arr) {
  _savedSetsCache = arr;
  _savedSetsCacheDirty = false;
  localStorage.setItem(SAVED_SETS_KEY, JSON.stringify(arr));
  renderSavedSets();
  updateStatsBar();
  updateStartPracticeSelect();
}
function getFolders() {
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (_) { return []; }
}
function setFolders(arr) {
  const list = Array.isArray(arr) ? arr : [];
  localStorage.setItem(FOLDERS_KEY, JSON.stringify(list));
  renderSavedSets();
  updateStartPracticeSelect();
  renderFolderSelects();
}
function renderFolderSelects() {
  const folders = getFolders();
  const opts = '<option value="">未分类</option>' + folders.map(f => '<option value="' + escapeAttr(String(f.id)) + '">' + escapeHtml(f.name) + '</option>').join('');
  const editSel = document.getElementById('edit-set-folder');
  if (editSel) { editSel.innerHTML = opts; }
  const importSel = document.getElementById('import-set-folder');
  if (importSel) { importSel.innerHTML = opts; }
}

function removeCurrentQuestionFromSet() {
  if (!state.practicedSetId) return;
  const q = state.questions[state.index];
  if (!q) return;
  const sets = getSavedSets();
  const setId = String(state.practicedSetId);
  const set = sets.find(s => String(s.id) === setId);
  if (!set || !set.questions) return;
  const currentId = wrongBookItemId(q);
  const newQuestions = set.questions.filter(qq => wrongBookItemId(qq) !== currentId);
  if (newQuestions.length === set.questions.length) return;
  const updated = sets.map(s => String(s.id) === setId ? Object.assign({}, s, { questions: newQuestions }) : s);
  setSavedSets(updated);
  const removedIndex = state.index;
  state.questions.splice(state.index, 1);
  /* Update answerResults: shift all entries after removed index */
  const newAnswerResults = {};
  Object.keys(state.answerResults || {}).forEach(key => {
    const idx = parseInt(key, 10);
    if (idx < removedIndex) {
      newAnswerResults[idx] = state.answerResults[idx];
    } else if (idx > removedIndex) {
      newAnswerResults[idx - 1] = state.answerResults[idx];
    }
  });
  state.answerResults = newAnswerResults;
  if (state.questions.length === 0) {
    showResult();
    return;
  }
  if (state.index >= state.questions.length) state.index = state.questions.length - 1;
  renderQuestion();
}

function updateStartPracticeSelect() {
  const sel = $('start-practice-select');
  if (!sel) return;
  const saved = getSavedSets();
  const folders = getFolders();
  const folderIds = new Set(folders.map(f => String(f.id)));
  let html = '<option value="default">默认题目</option>';
  folders.forEach(f => {
    const inFolder = saved.filter(s => String(s.folderId || '') === String(f.id));
    if (inFolder.length === 0) return;
    html += '<optgroup label="' + escapeHtml(f.name) + '">' +
      inFolder.map(s => '<option value="' + escapeAttr(String(s.id)) + '">' + escapeHtml(s.name) + ' (' + s.questions.length + ' 题)</option>').join('') + '</optgroup>';
  });
  const uncategorized = saved.filter(s => !s.folderId || !folderIds.has(String(s.folderId)));
  if (uncategorized.length > 0) {
    html += '<optgroup label="未分类">' +
      uncategorized.map(s => '<option value="' + escapeAttr(String(s.id)) + '">' + escapeHtml(s.name) + ' (' + s.questions.length + ' 题)</option>').join('') + '</optgroup>';
  }
  const currentVal = sel.value;
  sel.innerHTML = html;
  if (currentVal && (currentVal === 'default' || saved.some(s => String(s.id) === currentVal))) sel.value = currentVal;
}

function todayString() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function addDays(dayStr, days) {
  const d = new Date(dayStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function wrongBookItemId(item) {
  if (_wrongBookIdCache.has(item)) return _wrongBookIdCache.get(item);
  const id = (item.stem || '') + '|' + (item.options ? item.options.join('|') : '') + '|' + String(item.correct != null ? item.correct : '');
  _wrongBookIdCache.set(item, id);
  return id;
}
function getQuestionNotes(questionId) {
  try {
    const raw = localStorage.getItem(QUESTION_NOTES_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return (obj && obj[questionId] != null) ? String(obj[questionId]) : '';
  } catch (_) { return ''; }
}
function setQuestionNotes(questionId, text) {
  try {
    const raw = localStorage.getItem(QUESTION_NOTES_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    obj[questionId] = (text || '').trim();
    if (!obj[questionId]) delete obj[questionId];
    localStorage.setItem(QUESTION_NOTES_KEY, JSON.stringify(obj));
  } catch (_) {}
}
function getWrongBook() {
  if (!_wrongBookCacheDirty && _wrongBookCache !== null) return _wrongBookCache;
  try {
    const raw = localStorage.getItem(WRONG_BOOK_KEY);
    _wrongBookCache = raw ? JSON.parse(raw) : [];
    _wrongBookCacheDirty = false;
    return _wrongBookCache;
  } catch (_) { return []; }
}
function setWrongBook(arr) {
  _wrongBookCache = arr;
  _wrongBookCacheDirty = false;
  localStorage.setItem(WRONG_BOOK_KEY, JSON.stringify(arr));
  updateWrongCount();
  updateStatsBar();
}
function removeFromWrongBook(q) {
  const book = getWrongBook();
  const id = wrongBookItemId(q);
  const next = book.filter(item => wrongBookItemId(item) !== id);
  if (next.length < book.length) setWrongBook(next);
}
function getWrongBookDue() {
  const book = getWrongBook();
  const today = todayString();
  return book
    .filter(item => {
      const next = item.nextReview;
      if (!next) return true;
      return next <= today;
    })
    .sort((a, b) => (a.nextReview || '').localeCompare(b.nextReview || ''));
}
function addToWrongBook(q) {
  const book = getWrongBook();
  const id = wrongBookItemId(q);
  const idx = book.findIndex(item => wrongBookItemId(item) === id);
  if (idx >= 0) {
    book[idx] = Object.assign({}, book[idx], { wrongCount: (book[idx].wrongCount || 0) + 1 });
  } else {
    const nextReview = addDays(todayString(), 1);
    book.push(Object.assign({}, q, { nextReview: nextReview, interval: 1, repetitions: 0, wrongCount: 1 }));
  }
  setWrongBook(book);
}
function addToWrongBookDirect(item) {
  const book = getWrongBook();
  const id = wrongBookItemId(item);
  if (book.some(i => wrongBookItemId(i) === id)) return;
  book.push(item);
  setWrongBook(book);
}
function updateWrongBookAfterAnswer(item, correct) {
  const book = getWrongBook();
  const id = wrongBookItemId(item);
  const idx = book.findIndex(i => wrongBookItemId(i) === id);
  if (idx === -1) return;
  const today = todayString();
  if (correct) {
    const rep = (book[idx].repetitions || 0) + 1;
    if (rep >= 5) {
      book.splice(idx, 1);
    } else {
      const intervalDays = EBINGHAUS_INTERVALS[Math.min(rep, EBINGHAUS_INTERVALS.length - 1)];
      book[idx] = Object.assign({}, book[idx], {
        repetitions: rep,
        interval: intervalDays,
        nextReview: addDays(today, intervalDays)
      });
    }
  } else {
    book[idx] = Object.assign({}, book[idx], {
      nextReview: addDays(today, 1),
      repetitions: 0,
      interval: 1
    });
  }
  setWrongBook(book);
}
function getWrongCountForQuestion(q) {
  if (!q) return 0;
  const book = getWrongBook();
  const id = wrongBookItemId(q);
  const item = book.find(i => wrongBookItemId(i) === id);
  return (item && item.wrongCount != null) ? item.wrongCount : 0;
}
function updateWrongCount() {
  const el = document.getElementById('wrong-count');
  if (el) el.textContent = getWrongBook().length;
}

function getCurrentSetQuestions() {
  const sel = $('start-practice-select');
  const val = sel ? sel.value : 'default';
  if (val === 'default') return DEFAULT_QUESTIONS;
  const sets = getSavedSets();
  const set = sets.find(s => String(s.id) === val);
  return (set && set.questions) ? set.questions : [];
}
function updateCategoryFilter() {
  const questions = getCurrentSetQuestions();
  const categories = [...new Set(questions.map(q => q.category).filter(Boolean))].sort();
  const wrap = $('category-filter-wrap');
  const sel = $('filter-category');
  if (!wrap || !sel) return;
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">全部</option>' + categories.map(c => '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>').join('');
  if (categories.indexOf(currentVal) !== -1) sel.value = currentVal;
  else sel.value = '';
  wrap.style.display = categories.length > 0 ? 'block' : 'none';
}
