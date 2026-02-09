'use strict';
// ── Event Bindings & Initialization ──

// Load fonts asynchronously (replaces inline onload handler)
(function loadFonts() {
  const fontLink = document.getElementById('fonts-stylesheet');
  if (fontLink) {
    // Use addEventListener instead of onload attribute to avoid CSP violation
    fontLink.addEventListener('load', function() {
      this.media = 'all';
    });
    // Fallback: if load event doesn't fire, set media after a short delay
    setTimeout(function() {
      if (fontLink && fontLink.media === 'print') {
        fontLink.media = 'all';
      }
    }, 100);
  }
})();

($('btn-start-practice') || document.getElementById('btn-start-practice')).addEventListener('click', () => {
  const typeFilter = getSelectedTypeFilter();
  const sel = $('start-practice-select');
  const val = sel ? sel.value : 'default';
  let questions = [];
  if (val === 'default') {
    questions = DEFAULT_QUESTIONS;
  } else {
    const sets = getSavedSets();
    const set = sets.find(s => String(s.id) === val);
    if (!set || !set.questions || !set.questions.length) {
      showToast('未找到该习题集，请重新选择');
      return;
    }
    questions = set.questions;
  }
  let filtered = filterQuestionsByType(questions, typeFilter);
  const categoryEl = $('filter-category');
  const categoryVal = categoryEl && categoryEl.value ? categoryEl.value.trim() : '';
  if (categoryVal) {
    filtered = filtered.filter(q => q && q.category === categoryVal);
  }
  if (filtered.length === 0) {
    const typeNames = typeFilter ? typeFilter.map(t => QUESTION_TYPES[t] || t).join('、') : '';
    showToast('当前选题型或分类下没有题目，请勾选更多题型或换习题集');
    return;
  }
  if (val !== 'default') {
    const sets = getSavedSets();
    const set = sets.find(s => String(s.id) === val);
    if (set) {
      // Check if we need sequential mode modal (for sets with many questions)
      if (filtered.length > SEQUENTIAL_MODE_THRESHOLD) {
        // Create a temporary set object with filtered questions for the modal
        const tempSet = Object.assign({}, set, { questions: filtered });
        openStartModeModal(tempSet);
      } else if (hasReviewMaterial(set)) {
        showReviewModal(set, filtered, false, set.id);
      } else {
        startQuiz(filtered, false, set.id);
      }
    } else {
      startQuiz(filtered);
    }
  } else {
    startQuiz(filtered);
  }
});

($('btn-import-show') || document.getElementById('btn-import-show')).addEventListener('click', async () => {
  if (!(await checkImportPin())) return;
  const sec = $('import-section');
  const btn = $('btn-import-show');
  const isExpanded = sec.style.display !== 'none';
  sec.style.display = isExpanded ? 'none' : 'block';
  if (btn) btn.setAttribute('aria-expanded', String(!isExpanded));
});

document.getElementById('btn-import-parse').addEventListener('click', () => {
  const parseBtn = document.getElementById('btn-import-parse');
  const origText = parseBtn ? parseBtn.textContent : '';
  if (parseBtn) { parseBtn.disabled = true; parseBtn.textContent = '解析中…'; }
  let text = document.getElementById('import-text').value.trim();
  text = normalizeJsonPaste(text);
  let parsed = [];
  let parseError = '';
  if (/^\s*[\[{]/.test(text)) {
    try {
      const data = JSON.parse(text);
      parsed = Array.isArray(data) ? data : (data.questions || []);
    } catch (e) {
      parseError = (e && (e.message || String(e))) || '';
    }
  }
  if (parsed.length === 0) parsed = parsePastedText(text);
  if (parsed.length === 0 && parseError) showToast('JSON 解析失败：' + parseError);
  if (parseBtn) { parseBtn.disabled = false; parseBtn.textContent = origText; }
  if (parsed.length > 0) {
    const seen = new Set();
    const deduped = [];
    let dupCount = 0;
    for (let i = 0; i < parsed.length; i++) {
      const fp = wrongBookItemId(parsed[i]);
      if (seen.has(fp)) dupCount++; else { seen.add(fp); deduped.push(parsed[i]); }
    }
    const nameInput = document.getElementById('import-set-name');
    const reviewInput = document.getElementById('import-review-urls');
    const name = (nameInput && nameInput.value ? nameInput.value.trim() : '') || ('未命名 ' + formatSavedSetDate(new Date().toISOString()));
    const rawLines = (reviewInput && reviewInput.value ? reviewInput.value.trim().split(/\n/) : [])
      .map(s => s.trim())
      .filter(s => s.length > 0);
    const reviewTexts = [];
    const reviewLinks = [];
    const reviewImages = [];
    rawLines.forEach(s => {
      if (/^data:image\//i.test(s)) reviewImages.push(s);
      else if (isLikelyUrl(s)) reviewLinks.push(/^https?:\/\//i.test(s) ? s : 'https://' + s);
      else reviewTexts.push(s);
    });
    const folderSel = document.getElementById('import-set-folder');
    const folderId = (folderSel && folderSel.value) ? folderSel.value : null;
    const saved = {
      id: Date.now(),
      name: name,
      folderId: folderId || undefined,
      createdAt: new Date().toISOString(),
      questions: deduped,
      practiceCount: 0,
      lastPracticedAt: null,
      reviewTexts,
      reviewLinks,
      reviewImages
    };
    const all = getSavedSets();
    all.unshift(saved);
    setSavedSets(all);
    startQuiz(deduped);
    showToast('已加入 ' + deduped.length + ' 道新题' + (dupCount ? '，跳过 ' + dupCount + ' 道重复' : ''));
    const importSec = $('import-section');
    if (importSec) importSec.style.display = 'none';
    const importText = $('import-text');
    if (importText) importText.value = '';
    if (nameInput) nameInput.value = '';
    if (reviewInput) reviewInput.value = '';
  } else {
    showToast('未能解析出题目，请检查格式');
  }
});

document.getElementById('btn-submit').addEventListener('click', submitAnswer);
document.getElementById('btn-next').addEventListener('click', nextQuestion);
document.getElementById('btn-prev-quiz').addEventListener('click', prevQuestion);
document.getElementById('btn-remove-from-set').addEventListener('click', () => {
  if (!state.practicedSetId) return;
  if (confirm('确定从本练习集中删除这道题？删除后本题将不再出现在该练习集中。')) removeCurrentQuestionFromSet();
});
document.getElementById('btn-exit-quiz').addEventListener('click', () => {
  if (confirm('确定要提前退出吗？')) {
    clearTimer();
    clearQuizProgress();
    showScreen(SCREEN.HOME);
    updateWrongCount();
    renderSavedSets();
  }
});
document.getElementById('fill-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (state.answered) nextQuestion();
    else submitAnswer();
  }
});
(function initExplanationNotesEdit() {
  var btnEdit = document.getElementById('btn-edit-explanation-notes');
  var btnSave = document.getElementById('btn-save-explanation-notes');
  var btnCancel = document.getElementById('btn-cancel-explanation-notes');
  var notesDisplay = document.getElementById('explanation-notes-display');
  var notesEdit = document.getElementById('explanation-notes-edit');
  var notesTextarea = document.getElementById('explanation-notes-textarea');
  if (!btnEdit || !notesEdit || !notesTextarea) return;
  btnEdit.addEventListener('click', function() {
    notesTextarea.value = _currentQuestionIdForNotes ? getQuestionNotes(_currentQuestionIdForNotes) : '';
    notesDisplay.style.display = 'none';
    btnEdit.style.display = 'none';
    notesEdit.style.display = 'block';
    notesTextarea.focus();
  });
  function closeNotesEdit() {
    notesEdit.style.display = 'none';
    btnEdit.style.display = 'inline-flex';
    if (_currentQuestionIdForNotes) {
      var notes = getQuestionNotes(_currentQuestionIdForNotes);
      if (notes) { notesDisplay.textContent = notes; notesDisplay.style.display = 'block'; } else { notesDisplay.style.display = 'none'; }
    }
  }
  if (btnSave) btnSave.addEventListener('click', function() {
    if (_currentQuestionIdForNotes != null) {
      setQuestionNotes(_currentQuestionIdForNotes, notesTextarea.value);
      var notes = getQuestionNotes(_currentQuestionIdForNotes);
      if (notes) { notesDisplay.textContent = notes; notesDisplay.style.display = 'block'; } else { notesDisplay.style.display = 'none'; }
      showToast('备注已保存');
    }
    closeNotesEdit();
  });
  if (btnCancel) btnCancel.addEventListener('click', closeNotesEdit);
})();
document.getElementById('btn-restart').addEventListener('click', () => {
  showScreen(SCREEN.HOME);
  updateWrongCount();
  renderSavedSets();
  updateStatsBar();
  updateStartPracticeSelect();
});
document.getElementById('btn-back-home').addEventListener('click', () => {
  showScreen(SCREEN.HOME);
  updateWrongCount();
  renderSavedSets();
  updateStatsBar();
  updateStartPracticeSelect();
});
document.getElementById('btn-share-result').addEventListener('click', () => {
  const scoreEl = document.getElementById('result-score');
  const scoreText = scoreEl ? scoreEl.textContent.trim() : '0/0';
  const st = getDailyStats();
  const streak = st.streak || 0;
  const text = 'Français Quiz ' + scoreText + '，连续 ' + streak + ' 天 ✨';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast('已复制到剪贴板')).catch(() => showToast('复制失败，请手动复制'));
  } else {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('已复制到剪贴板');
    } catch (_) { showToast('复制失败，请手动复制'); }
  }
});
/* ── Unified collapsible accordion helper ── */
function initCollapsible(toggleEl) {
  if (!toggleEl) return;
  const bodyId = toggleEl.getAttribute('aria-controls');
  const bodyEl = bodyId ? document.getElementById(bodyId) : null;
  if (!bodyEl) return;
  function toggle() {
    const isOpen = bodyEl.classList.contains('open');
    bodyEl.classList.toggle('open');
    toggleEl.setAttribute('aria-expanded', String(!isOpen));
  }
  toggleEl.addEventListener('click', toggle);
  toggleEl.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
  });
}
document.querySelectorAll('.collapsible-toggle').forEach(initCollapsible);
const readAloudBtn = document.getElementById('btn-read-aloud');
if (readAloudBtn) readAloudBtn.addEventListener('click', readAloudStem);
document.addEventListener('keydown', onQuizKeydown);
const searchInput = $('saved-sets-search') || document.getElementById('saved-sets-search');
if (searchInput) searchInput.addEventListener('input', debounce(renderSavedSets, 180));
const savedSetsList = $('saved-sets-list') || document.getElementById('saved-sets-list');
if (savedSetsList) savedSetsList.addEventListener('click', handleSavedSetsAction);
document.getElementById('btn-add-folder').addEventListener('click', () => {
  const name = prompt('输入文件夹名称', '');
  if (name == null || !name.trim()) return;
  const trimmed = name.trim();
  setFolders(getFolders().concat([{ id: String(Date.now()), name: trimmed }]));
});
function startWrongBookDuePractice() {
  const due = getWrongBookDue();
  if (due.length === 0) {
    const total = getWrongBook().length;
    if (total === 0) showToast('错题本还是空的，多做几道题会自动加入');
    else showToast('没有到期需要复习的错题，错题本共 ' + total + ' 题');
    return;
  }
  const typeFilter = getSelectedTypeFilter();
  const filtered = filterQuestionsByType(due, typeFilter);
  if (filtered.length === 0) { showToast('当前选题型下没有到期的错题，改天再试'); return; }
  startQuiz(filtered, true);
}
function startWrongBookFreePractice() {
  const book = getWrongBook();
  if (book.length === 0) { showToast('错题本还是空的，做错题后会自动加入'); return; }
  const typeFilter = getSelectedTypeFilter();
  const filtered = filterQuestionsByType(book, typeFilter);
  if (filtered.length === 0) { showToast('当前选题型下没有错题，请勾选更多题型'); return; }
  startQuiz(filtered, true);
}
document.getElementById('btn-wrong-book').addEventListener('click', startWrongBookDuePractice);
document.getElementById('btn-result-wrong').addEventListener('click', startWrongBookDuePractice);
document.getElementById('btn-wrong-free').addEventListener('click', startWrongBookFreePractice);
document.getElementById('btn-result-wrong-free').addEventListener('click', startWrongBookFreePractice);
document.getElementById('btn-clear-wrong').addEventListener('click', () => {
  if (getWrongBook().length === 0) {
    showToast('错题本已经是空的了');
    return;
  }
  if (confirm('确定要清空错题本吗？清空后无法恢复。')) {
    setWrongBook([]);
  }
});
(function initTimerInput() {
  const el = document.getElementById('timer-seconds');
  if (el) {
    const saved = localStorage.getItem(TIMER_SECONDS_KEY);
    if (saved !== null) { const n = parseInt(saved, 10); if (!isNaN(n) && n >= 0) el.value = n; }
    el.addEventListener('change', () => {
      const n = Math.max(0, Math.min(120, parseInt(el.value, 10) || 0));
      el.value = n;
      localStorage.setItem(TIMER_SECONDS_KEY, n);
    });
  }
})();

document.getElementById('btn-one-save').addEventListener('click', saveToProjectFolder);
document.getElementById('btn-copy-deploy-cmd').addEventListener('click', () => {
  const cmd = document.getElementById('save-deploy-cmd');
  const text = cmd ? cmd.textContent.trim() : './scripts/sync-and-push.sh ../french-quiz-pages';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast('复制成功')).catch(() => showToast('复制失败'));
  } else {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('复制成功');
    } catch (_) { showToast('复制失败'); }
  }
});
function confirmReviewStartQuiz() {
  if (_pendingReviewStart) {
    const p = _pendingReviewStart;
    hideReviewModal();
    startQuiz(p.questions, p.fromWrongBook, p.setId, p.noShuffle ? { noShuffle: true } : {});
  }
}
document.getElementById('btn-review-start-quiz').addEventListener('click', confirmReviewStartQuiz);
document.getElementById('review-modal-overlay').addEventListener('click', (e) => {
  if (e.target.closest('#review-modal-images') && e.target.classList.contains('review-modal-img')) {
    e.preventDefault();
    e.stopPropagation();
    openImageLightbox(e.target.src);
    return;
  }
  if (e.target.id === 'review-modal-overlay') confirmReviewStartQuiz();
});
(function initStartModeModal() {
  const overlay = document.getElementById('start-mode-modal-overlay');
  const btnFull = document.getElementById('btn-start-mode-full');
  const btnSequential = document.getElementById('btn-start-mode-sequential');
  const countInput = document.getElementById('start-mode-count');
  const btnCancel = document.getElementById('btn-start-mode-cancel');
  const btnReset = document.getElementById('btn-start-mode-reset');
  const btnFullAfter = document.getElementById('btn-start-mode-full-after');
  function doStartFull() {
    // 先保存 _pendingStartSet，因为 closeStartModeModal() 会清空它
    const set = _pendingStartSet;
    if (!set) {
      console.warn('_pendingStartSet is null, cannot start quiz');
      closeStartModeModal();
      showToast('无法开始练习，请重新选择习题集');
      return;
    }
    if (!set.questions || set.questions.length === 0) {
      console.warn('Set has no questions', set);
      closeStartModeModal();
      showToast('该习题集没有题目');
      return;
    }
    const shuffleEl = document.getElementById('start-mode-shuffle');
    const shuffle = shuffleEl ? shuffleEl.checked : false;
    const reviewCheck = document.getElementById('start-mode-review');
    const shouldReview = reviewCheck ? reviewCheck.checked : false;
    const opts = shuffle ? {} : { noShuffle: true };
    // 先关闭模态框（会清空 _pendingStartSet）
    closeStartModeModal();
    // 使用保存的 set 值
    if (shouldReview && hasReviewMaterial(set)) {
      showReviewModal(set, set.questions, false, set.id, opts);
    } else {
      // Ensure questions array is valid before starting
      if (!Array.isArray(set.questions) || set.questions.length === 0) {
        showToast('该习题集没有可用题目');
        return;
      }
      startQuiz(set.questions, false, set.id, opts);
    }
  }
  function doStartSequential() {
    // 先保存 _pendingStartSet，因为 closeStartModeModal() 会清空它
    const set = _pendingStartSet;
    if (!set) {
      console.warn('_pendingStartSet is null, cannot start sequential quiz');
      closeStartModeModal();
      showToast('无法开始练习，请重新选择习题集');
      return;
    }
    if (!countInput) {
      console.warn('countInput is null');
      return;
    }
    const nextIdx = Math.max(0, parseInt(set.sequentialNextIndex, 10) || 0);
    const remain = set.questions.length - nextIdx;
    let n = Math.max(1, Math.min(remain, parseInt(countInput.value, 10) || 20));
    if (n > remain) n = remain;
    const slice = set.questions.slice(nextIdx, nextIdx + n);
    const reviewCheck = document.getElementById('start-mode-review');
    const shouldReview = reviewCheck ? reviewCheck.checked : false;
    // 先关闭模态框（会清空 _pendingStartSet）
    closeStartModeModal();
    // 使用保存的 set 值
    const opts = { noShuffle: true, sequentialBatch: { startIndex: nextIdx, count: slice.length } };
    if (shouldReview && hasReviewMaterial(set)) showReviewModal(set, slice, false, set.id, opts);
    else startQuiz(slice, false, set.id, opts);
  }
  function doResetProgress() {
    if (!_pendingStartSet) return;
    const set = _pendingStartSet;
    const sets = getSavedSets();
    const updated = sets.map(s => String(s.id) === String(set.id) ? Object.assign({}, s, { sequentialNextIndex: 0 }) : s);
    setSavedSets(updated);
    closeStartModeModal();
    showToast('已重置进度，下次可从第 1 题起按顺序练习');
  }
  if (btnFull) btnFull.addEventListener('click', doStartFull);
  if (btnSequential) btnSequential.addEventListener('click', doStartSequential);
  if (btnCancel) btnCancel.addEventListener('click', closeStartModeModal);
  if (btnReset) btnReset.addEventListener('click', doResetProgress);
  if (btnFullAfter) btnFullAfter.addEventListener('click', function() {
    // 先保存 _pendingStartSet，因为 closeStartModeModal() 会清空它
    const set = _pendingStartSet;
    if (!set) {
      console.warn('_pendingStartSet is null, cannot start quiz');
      closeStartModeModal();
      showToast('无法开始练习，请重新选择习题集');
      return;
    }
    const shuffleEl = document.getElementById('start-mode-shuffle');
    const shuffle = shuffleEl ? shuffleEl.checked : false;
    const reviewCheck = document.getElementById('start-mode-review');
    const shouldReview = reviewCheck ? reviewCheck.checked : false;
    const opts = shuffle ? {} : { noShuffle: true };
    // 先关闭模态框（会清空 _pendingStartSet）
    closeStartModeModal();
    // 使用保存的 set 值
    if (shouldReview && hasReviewMaterial(set)) showReviewModal(set, set.questions, false, set.id, opts);
    else startQuiz(set.questions, false, set.id, opts);
  });
  if (overlay) overlay.addEventListener('click', function(e) {
    if (e.target.id === 'start-mode-modal-overlay') closeStartModeModal();
  });
})();
document.getElementById('image-lightbox-close').addEventListener('click', closeImageLightbox);
document.getElementById('image-lightbox-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'image-lightbox-overlay') closeImageLightbox();
});
document.querySelector('.image-lightbox-content').addEventListener('click', (e) => e.stopPropagation());
document.getElementById('btn-edit-set-save').addEventListener('click', saveEditSetModal);
document.getElementById('btn-edit-set-cancel').addEventListener('click', closeEditSetModal);
document.getElementById('btn-edit-set-export').addEventListener('click', exportFromEditModal);
document.getElementById('btn-edit-set-append').addEventListener('click', async () => {
  if (!(await checkImportPin())) return;
  appendToEditSetModal();
});
document.getElementById('btn-edit-set-preview').addEventListener('click', () => {
  if (_editingSetId == null) return;
  const sets = getSavedSets();
  const set = sets.find(s => String(s.id) === String(_editingSetId));
  if (set) showPreviewQuestions(set);
});
document.getElementById('btn-edit-set-delete').addEventListener('click', deleteFromEditModal);
document.getElementById('btn-preview-questions-close').addEventListener('click', closePreviewQuestions);
document.getElementById('preview-questions-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'preview-questions-overlay') closePreviewQuestions();
});
document.getElementById('edit-set-modal-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'edit-set-modal-overlay') closeEditSetModal();
});
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && _openModalOverlay) {
    var id = _openModalOverlay.id;
    if (id === 'review-modal-overlay') confirmReviewStartQuiz();
    else if (id === 'start-mode-modal-overlay') closeStartModeModal();
    else if (id === 'edit-set-modal-overlay') closeEditSetModal();
    else if (id === 'preview-questions-overlay') closePreviewQuestions();
    else if (id === 'image-lightbox-overlay') closeImageLightbox();
    e.preventDefault();
    return;
  }
  if (e.key !== 'Tab' || !_openModalOverlay) return;
  var focusable = getFocusableIn(_openModalOverlay);
  if (focusable.length === 0) return;
  var first = focusable[0], last = focusable[focusable.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
  } else {
    if (document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});
(function initEditSetPasteZone() {
  const zone = document.getElementById('edit-set-paste-zone');
  if (!zone) return;
  zone.addEventListener('paste', function(e) {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = function() {
          const dataUrl = reader.result;
          if (dataUrl && typeof dataUrl === 'string') {
            _editModalPastedImages.push(dataUrl);
            renderEditModalPastedImages();
          }
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  });
})();
document.getElementById('btn-load-cloud').addEventListener('click', loadFromCloud);
document.getElementById('btn-open-folder').addEventListener('click', pickFolderAndLoad);
document.getElementById('btn-save-to-folder').addEventListener('click', saveToProjectFolder);
document.getElementById('btn-export-data').addEventListener('click', saveToProjectFolder);
document.getElementById('btn-import-data').addEventListener('click', () => document.getElementById('file-import-data').click());
document.getElementById('link-download-json').addEventListener('click', (e) => { e.preventDefault(); exportDataDownload(); });
document.getElementById('file-import-data').addEventListener('change', function() {
  const file = this.files && this.files[0];
  if (file) importDataFromFile(file);
  this.value = '';
});

(function initImportLock() {
  updateImportLockUI();
  updateDeviceBindUI();
  const setBtn = document.getElementById('btn-import-lock-set');
  const changeBtn = document.getElementById('btn-import-lock-change');
  const disableBtn = document.getElementById('btn-import-lock-disable');
  if (setBtn) setBtn.addEventListener('click', async function() {
    if (!(window.crypto && crypto.subtle)) { showToast('当前浏览器不支持设置 PIN'); return; }
    const pin1 = prompt('请设定 4～12 位主人 PIN（由你自定，例如数字或字母，请牢记；仅本机保存）');
    if (pin1 == null) return;
    const pin2 = prompt('再次输入确认');
    if (pin1 !== pin2) { showToast('两次输入不一致'); return; }
    if (pin1.length < 4 || pin1.length > 12) { showToast('请设置 4～12 位'); return; }
    await setImportPin(pin1);
    updateImportLockUI();
    showToast('已启用导入保护');
  });
  if (changeBtn) changeBtn.addEventListener('click', async function() {
    if (!(window.crypto && crypto.subtle)) { showToast('当前浏览器不支持'); return; }
    const cur = prompt('输入当前 PIN');
    if (cur == null) return;
    if (!(await verifyImportPin(cur))) { showToast('当前 PIN 错误'); return; }
    const pin1 = prompt('输入新 PIN（4～12 位）');
    if (pin1 == null) return;
    const pin2 = prompt('再次输入新 PIN');
    if (pin1 !== pin2) { showToast('两次输入不一致'); return; }
    if (pin1.length < 4 || pin1.length > 12) { showToast('请设置 4～12 位'); return; }
    await setImportPin(pin1);
    updateImportLockUI();
    showToast('已修改 PIN');
  });
  if (disableBtn) disableBtn.addEventListener('click', async function() {
    const cur = prompt('输入当前 PIN 以关闭导入保护');
    if (cur == null) return;
    if (!(await verifyImportPin(cur))) { showToast('PIN 错误'); return; }
    localStorage.removeItem(IMPORT_PIN_HASH_KEY);
    updateImportLockUI();
    showToast('已关闭导入保护');
  });
  const bindBtn = document.getElementById('btn-device-bind');
  const unbindBtn = document.getElementById('btn-device-unbind');
  if (bindBtn) bindBtn.addEventListener('click', function() {
    setImportAllowedFingerprintToThisDevice();
    updateDeviceBindUI();
    showToast('已绑定本机。请「一键保存」并推送到云端，其他设备将无法导入');
  });
  if (unbindBtn) unbindBtn.addEventListener('click', function() {
    localStorage.removeItem(IMPORT_ALLOWED_FINGERPRINT_KEY);
    updateDeviceBindUI();
    showToast('已解除绑定。请「一键保存」并推送后，所有设备均可导入');
  });
})();

(function initTheme() {
  const theme = localStorage.getItem(THEME_KEY) || 'dark';
  if (theme === 'light') document.body.classList.add('theme-light');
  function setThemeColorMeta() {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = document.body.classList.contains('theme-light') ? '#f8f7fc' : '#0c0a14';
  }
  setThemeColorMeta();
  const btn = $('theme-toggle');
  if (btn) {
    btn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
    btn.addEventListener('click', () => {
      document.body.classList.toggle('theme-light');
      const isLight = document.body.classList.contains('theme-light');
      localStorage.setItem(THEME_KEY, isLight ? 'light' : 'dark');
      btn.setAttribute('aria-pressed', isLight ? 'true' : 'false');
      setThemeColorMeta();
    });
  }
})();
updateWrongCount();
renderSavedSets();
updateStatsBar();
updateStartPracticeSelect();
renderFolderSelects();
updateCategoryFilter();
if (typeof performance !== 'undefined' && performance.mark) {
  performance.mark('app-ready');
  try { performance.measure('app-init', 'app-start', 'app-ready'); } catch (_) {}
}
if (typeof PerformanceObserver !== 'undefined') {
  try {
    var lcpObserver = new PerformanceObserver(function (list) {
      var entries = list.getEntries();
      if (entries.length > 0 && typeof performance !== 'undefined' && performance.mark) performance.mark('lcp');
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (_) {}
}
const startSel = $('start-practice-select') || document.getElementById('start-practice-select');
if (startSel) startSel.addEventListener('change', updateCategoryFilter);

// Initialize: Ensure all modals are closed and show home screen
(function initializePage() {
  // Close all modals explicitly
  const modals = [
    'start-mode-modal-overlay',
    'review-modal-overlay',
    'edit-set-modal-overlay',
    'preview-questions-overlay',
    'image-lightbox-overlay'
  ];
  modals.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('show');
      el.style.display = 'none';
      // Also remove any inline styles that might override
      if (id === 'start-mode-modal-overlay') {
        el.style.display = 'none';
      }
    }
  });
  
  // Ensure import section is collapsed by default
  const importSection = document.getElementById('import-section');
  if (importSection) {
    importSection.style.display = 'none';
  }
  const importBtn = document.getElementById('btn-import-show');
  if (importBtn) {
    importBtn.setAttribute('aria-expanded', 'false');
  }
  
  // Ensure home screen is shown (will be overridden by checkSavedProgress if needed)
  showScreen(SCREEN.HOME);
})();

// Restore in-progress quiz
(function checkSavedProgress() {
  const saved = getQuizProgress();
  if (saved && saved.questions && saved.questions.length > 0 && saved.index < saved.questions.length) {
    if (confirm('检测到上次未完成的练习（第 ' + (saved.index + 1) + '/' + saved.questions.length + ' 题），是否继续？')) {
      state.questions = saved.questions;
      state.index = saved.index;
      state.score = saved.score;
      state.answered = false;
      state.timerSeconds = saved.timerSeconds;
      state.practicingWrongBook = saved.practicingWrongBook;
      state.practicedSetId = saved.practicedSetId;
      state.answerResults = saved.answerResults || {};  // Restore answer results if available
      showScreen(SCREEN.QUIZ);
      renderQuestion();
    } else {
      clearQuizProgress();
      // Ensure we're on home screen after clearing progress
      showScreen(SCREEN.HOME);
    }
  }
})();

