'use strict';
// ── Quiz Engine: State, Timer, Rendering, Navigation ──

let state = {
  questions: [],
  index: 0,
  score: 0,
  answered: false,
  timerSeconds: 10,
  practicingWrongBook: false,
  practicedSetId: null,
  sequentialBatch: null
};
let timerId = null;
let _pendingTimers = [];  // Track pending setTimeout/setInterval for cleanup


function clearTimer() {
  if (timerId) clearInterval(timerId);
  timerId = null;
  const el = document.getElementById('quiz-timer');
  if (el) { el.style.display = 'none'; el.textContent = ''; el.classList.remove('low'); }
  const ring = document.getElementById('timer-ring');
  const ringFill = document.getElementById('timer-ring-fill');
  if (ring) ring.style.display = 'none';
  if (ringFill) { ringFill.style.strokeDashoffset = '0'; ringFill.classList.remove('low'); }
}
function startTimer(extraSeconds) {
  clearTimer();
  const base = state.timerSeconds || 0;
  const seconds = base + (extraSeconds || 0);
  if (!seconds) return;
  let remain = seconds;
  const el = document.getElementById('quiz-timer');
  const ring = document.getElementById('timer-ring');
  const ringFill = document.getElementById('timer-ring-fill');
  if (!el) return;
  el.style.display = 'inline';
  el.textContent = remain;
  el.classList.remove('low');
  if (ring) ring.style.display = 'block';
  if (ringFill) { ringFill.style.strokeDashoffset = '0'; ringFill.classList.remove('low'); }
  timerId = setInterval(() => {
    remain--;
    el.textContent = remain;
    if (ringFill) {
      const offset = TIMER_CIRCUMFERENCE * (1 - remain / seconds);
      ringFill.style.strokeDashoffset = offset;
    }
    if (remain <= 3) {
      el.classList.add('low');
      if (ringFill) ringFill.classList.add('low');
      if (remain > 0 && navigator.vibrate) navigator.vibrate(200);
    }
    if (remain <= 0) {
      clearTimer();
      submitAnswer();
    }
  }, 1000);
}


function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(id);
  screen.classList.add('active');
  requestAnimationFrame(() => {
    if (id === SCREEN.QUIZ) {
      const first = screen.querySelector('.option, input[type="text"], .btn-primary');
      if (first) first.focus();
    } else if (id === SCREEN.RESULT) {
      const scoreEl = screen.querySelector('.result-score');
      if (scoreEl) { scoreEl.setAttribute('tabindex', '-1'); scoreEl.focus(); }
    }
  });
}

function startQuiz(questions, fromWrongBook, setId, opts) {
  if (!questions || questions.length === 0) {
    showToast(fromWrongBook ? '没有到期需要复习的错题，明天再来' : '没有可用的题目，请检查导入或使用默认题目');
    return;
  }
  opts = opts || {};
  if (typeof performance !== 'undefined' && performance.mark) performance.mark('quiz-start');
  const timerInput = document.getElementById('timer-seconds');
  state.timerSeconds = timerInput ? Math.max(0, parseInt(timerInput.value, 10) || 10) : 10;
  const noShuffle = !!opts.noShuffle;
  let list = (noShuffle || !(document.getElementById('shuffle-questions') && document.getElementById('shuffle-questions').checked))
    ? questions.slice()
    : shuffleArray(questions);
  if (!noShuffle && document.getElementById('shuffle-options') && document.getElementById('shuffle-options').checked) {
    list = list.map(shuffleQuestionOptions);
  }
  state.questions = list;
  state.index = 0;
  state.score = 0;
  state.answered = false;
  state.answerResults = {};
  state.practicingWrongBook = !!fromWrongBook;
  state.practicedSetId = setId || null;
  state.sequentialBatch = opts.sequentialBatch || null;
  showScreen(SCREEN.QUIZ);
  if (typeof performance !== 'undefined' && performance.mark) performance.mark('quiz-first-render-start');
  renderQuestion();
  if (typeof performance !== 'undefined' && performance.mark) {
    performance.mark('quiz-first-render-end');
    try { performance.measure('quiz-first-render', 'quiz-first-render-start', 'quiz-first-render-end'); } catch (_) {}
  }
}
let _pendingReviewStart = null;
let _pendingStartSet = null;
function openStartModeModal(set) {
  _pendingStartSet = set;
  const total = set.questions.length;
  const nextIdx = Math.max(0, parseInt(set.sequentialNextIndex, 10) || 0);
  const remain = total - nextIdx;
  const overlay = document.getElementById('start-mode-modal-overlay');
  const seqBlock = document.getElementById('start-mode-sequential');
  const finishedBlock = document.getElementById('start-mode-finished');
  const fromEl = document.getElementById('start-mode-from');
  const remainEl = document.getElementById('start-mode-remain');
  const countInput = document.getElementById('start-mode-count');
  const reviewCard = document.getElementById('start-mode-review-card');
  const reviewCheck = document.getElementById('start-mode-review');
  if (remain <= 0) {
    if (seqBlock) seqBlock.style.display = 'none';
    if (finishedBlock) finishedBlock.style.display = 'flex';
    if (fromEl) fromEl.textContent = '1';
    if (remainEl) remainEl.textContent = total;
  } else {
    if (seqBlock) seqBlock.style.display = 'flex';
    if (finishedBlock) finishedBlock.style.display = 'none';
    if (fromEl) fromEl.textContent = nextIdx + 1;
    if (remainEl) remainEl.textContent = remain;
    if (countInput) {
      countInput.max = remain;
      countInput.value = Math.min(20, remain);
    }
  }
  const hasReview = hasReviewMaterial(set);
  if (reviewCard) reviewCard.style.display = hasReview ? 'flex' : 'none';
  if (reviewCheck) reviewCheck.checked = hasReview;
  if (overlay) { overlay.classList.add('show'); overlay.style.display = 'flex'; setModalFocusTrap(overlay); }
}
function closeStartModeModal() {
  _pendingStartSet = null;
  const overlay = document.getElementById('start-mode-modal-overlay');
  if (overlay) { overlay.classList.remove('show'); overlay.style.display = 'none'; clearModalFocusTrap(); }
}
function showReviewModal(set, questions, fromWrongBook, setId, startOpts) {
  const m = getReviewMaterials(set);
  const total = m.texts.length + m.links.length + m.images.length;
  if (total === 0) {
    startQuiz(questions, fromWrongBook, setId, startOpts);
    return;
  }
  _pendingReviewStart = { questions, fromWrongBook, setId, noShuffle: startOpts && startOpts.noShuffle };
  const textsWrap = document.getElementById('review-modal-texts');
  const linksEl = document.getElementById('review-modal-links');
  const imagesEl = document.getElementById('review-modal-images');
  const textsWrapParent = document.getElementById('review-modal-texts-wrap');
  if (textsWrap) {
    textsWrap.innerHTML = m.texts.length ? m.texts.map(t => '<div class="review-text-block">' + escapeHtml(t) + '</div>').join('') : '';
    if (textsWrapParent) textsWrapParent.style.display = m.texts.length ? 'block' : 'none';
  }
  if (linksEl) {
    linksEl.innerHTML = m.links.map(href => {
      const label = href.length > 80 ? href.slice(0, 77) + '…' : href;
      return '<a href="' + safeHref(href) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(label) + '</a>';
    }).join('');
    linksEl.style.display = m.links.length ? 'flex' : 'none';
  }
  if (imagesEl) {
    imagesEl.innerHTML = m.images.map(dataUrl => {
      const safeSrc = safeImageSrc(dataUrl);
      if (!safeSrc) return '';
      return '<div class="review-modal-msg"><img src="' + safeSrc + '" alt="复习图片" class="review-modal-img" title="点击放大" loading="lazy" /></div>';
    }).join('');
    imagesEl.style.display = m.images.length ? 'flex' : 'none';
  }
  const overlay = document.getElementById('review-modal-overlay');
  if (overlay) { overlay.classList.add('show'); setModalFocusTrap(overlay); }
}
function hideReviewModal() {
  clearModalFocusTrap();
  const overlay = document.getElementById('review-modal-overlay');
  if (overlay) overlay.classList.remove('show');
  _pendingReviewStart = null;
}
function openImageLightbox(src) {
  const el = document.getElementById('image-lightbox-overlay');
  const img = document.getElementById('image-lightbox-img');
  if (el && img && src) { img.src = src; el.classList.add('show'); setModalFocusTrap(el); }
}
function closeImageLightbox() {
  clearModalFocusTrap();
  const el = document.getElementById('image-lightbox-overlay');
  if (el) el.classList.remove('show');
}
function recordSavedSetPractice(setId) {
  if (!setId) return;
  const sets = getSavedSets();
  const idx = sets.findIndex(s => String(s.id) === String(setId));
  if (idx === -1) return;
  sets[idx] = Object.assign({}, sets[idx], {
    practiceCount: (sets[idx].practiceCount || 0) + 1,
    lastPracticedAt: new Date().toISOString()
  });
  setSavedSets(sets);
}


function renderParagraphBlanks(q, correctArr) {
  const parts = q.stem.split('_____');
  let stemHtml = '';
  for (let i = 0; i < parts.length; i++) {
    stemHtml += escapeHtml(parts[i]);
    if (i < parts.length - 1) stemHtml += '<span class="blank" data-blank="' + i + '">( ' + (i + 1) + ' )</span>';
  }
  document.getElementById('question-stem').innerHTML = stemHtml;
  const wrap = document.getElementById('paragraph-blanks-wrap');
  wrap.style.display = 'block';
  wrap.innerHTML = correctArr.map((_, i) =>
    '<label style="display:flex;align-items:center;gap:0.5rem;"><span style="min-width:2.5rem;">第' + (i + 1) + '空:</span><input type="text" data-blank="' + i + '" placeholder="..." autocomplete="off" aria-label="第' + (i + 1) + '空答案" disabled="false" /></label>'
  ).join('');
  wrap.querySelectorAll('input').forEach(inp => {
    /* Ensure input is enabled and reset state */
    inp.disabled = false;
    inp.classList.remove('correct-blank', 'wrong-blank');
    inp.value = '';
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') submitAnswer(); });
  });
}

function renderQuestion() {
  /* Clear any pending timers from previous question */
  _pendingTimers.forEach(timer => clearTimeout(timer));
  _pendingTimers = [];

  const q = state.questions[state.index];
  if (!q) {
    showResult();
    return;
  }

  state.answered = !!state.answerResults[state.index];
  const idx = state.index + 1;
  const total = state.questions.length;
  document.getElementById('progress-fill').style.width = (idx / total) * 100 + '%';
  document.getElementById('question-counter').textContent = `${idx} / ${total}`;
  const labelEl = document.getElementById('progress-label');
  if (labelEl) labelEl.textContent = '第 ' + idx + ' / ' + total + ' 题';
  const estimateEl = document.getElementById('progress-estimate');
  if (estimateEl && idx === 1) {
    estimateEl.textContent = '共 ' + total + ' 题' + (state.timerSeconds ? '，约 ' + Math.ceil(total * state.timerSeconds / 60) + ' 分钟' : '，不限时');
  }
  document.getElementById('question-meta').textContent = q.category ? `套路 · ${q.category}` : '';
  document.getElementById('question-stem').innerHTML = escapeHtml(q.stem);
  var explanationScrollWrap = document.getElementById('explanation-scroll-wrap');
  if (explanationScrollWrap) explanationScrollWrap.style.display = 'none';
  var wrongCountEl = document.getElementById('explanation-wrong-count');
  if (wrongCountEl) { wrongCountEl.textContent = ''; wrongCountEl.style.display = 'none'; }
  document.getElementById('explanation').textContent = q.explanation || '';
  var notesDisplay = document.getElementById('explanation-notes-display');
  if (notesDisplay) { notesDisplay.textContent = ''; notesDisplay.style.display = 'none'; }
  var notesEdit = document.getElementById('explanation-notes-edit');
  if (notesEdit) notesEdit.style.display = 'none';
  var notesTextarea = document.getElementById('explanation-notes-textarea');
  if (notesTextarea) notesTextarea.value = '';
  const removeWrapEl = document.getElementById('wrong-book-remove-wrap');
  if (removeWrapEl) removeWrapEl.style.display = 'none';
  const removeFromSetWrap = document.getElementById('remove-from-set-wrap');
  if (removeFromSetWrap) removeFromSetWrap.style.display = state.practicedSetId ? 'block' : 'none';
  document.getElementById('answer-feedback').className = 'answer-feedback';
  document.getElementById('answer-feedback').textContent = '';

  const optionsEl = document.getElementById('options-container');
  const fillWrap = document.getElementById('fill-input-wrap');
  const fillInput = document.getElementById('fill-input');

  if (q.type === 'fill_blank') {
    optionsEl.innerHTML = '';
    const blankCount = (q.stem.match(/_____/g) || []).length;
    const correctArr = Array.isArray(q.correct) ? q.correct : [q.correct];
    const isMultiBlank = blankCount >= 2 && correctArr.length >= 2;
    if (isMultiBlank) {
      fillWrap.style.display = 'none';
      renderParagraphBlanks(q, correctArr.slice(0, blankCount));
    } else {
      fillWrap.style.display = 'block';
      fillInput.value = '';
      fillInput.placeholder = '输入答案...';
      fillInput.setAttribute('aria-label', '输入答案');
      fillInput.disabled = false;
      fillInput.classList.remove('correct-blank', 'wrong-blank');
      document.getElementById('paragraph-blanks-wrap').style.display = 'none';
      document.getElementById('paragraph-blanks-wrap').innerHTML = '';
    }
    if (state.answerResults[state.index]) {
      applyAnsweredState(q, state.answerResults[state.index]);
      return;
    }
    const btnSubmit0 = document.getElementById('btn-submit');
    if (btnSubmit0) btnSubmit0.style.display = 'inline-flex';
    const btnNext0 = document.getElementById('btn-next');
    if (btnNext0) btnNext0.style.display = 'none';
    var btnPrev0 = document.getElementById('btn-prev-quiz');
    if (btnPrev0) btnPrev0.style.display = state.index > 0 ? 'inline-flex' : 'none';
    var fillExtra = (q.type === 'fill_blank' && isMultiBlank) ? blankCount * 5 : 0;
    startTimer(fillExtra);
    return;
  }

  if (q.type === 'paragraph_fill_blank') {
    optionsEl.innerHTML = '';
    fillWrap.style.display = 'none';
    const correctArr = Array.isArray(q.correct) ? q.correct : [q.correct];
    renderParagraphBlanks(q, correctArr);
    if (state.answerResults[state.index]) {
      applyAnsweredState(q, state.answerResults[state.index]);
      return;
    }
    const btnSubmit1 = document.getElementById('btn-submit');
    if (btnSubmit1) btnSubmit1.style.display = 'inline-flex';
    const btnNext1 = document.getElementById('btn-next');
    if (btnNext1) btnNext1.style.display = 'none';
    var btnPrev1 = document.getElementById('btn-prev-quiz');
    if (btnPrev1) btnPrev1.style.display = state.index > 0 ? 'inline-flex' : 'none';
    var paraBlanks = (correctArr && correctArr.length) ? correctArr.length : 1;
    startTimer(paraBlanks * 5);
    return;
  }

  fillWrap.style.display = 'none';
  if (fillInput) {
    fillInput.disabled = false;
    fillInput.classList.remove('correct-blank', 'wrong-blank');
  }
  const paragraphWrap = document.getElementById('paragraph-blanks-wrap');
  paragraphWrap.style.display = 'none';
  paragraphWrap.innerHTML = '';
  const isMulti = q.type === 'multiple_choice';
  const correctSet = Array.isArray(q.correct) ? new Set(q.correct) : new Set([q.correct]);
  optionsEl.setAttribute('role', isMulti ? 'group' : 'radiogroup');
  optionsEl.setAttribute('aria-label', isMulti ? '多选选项' : '单选选项');

  optionsEl.innerHTML = q.options.map((opt, i) => {
    const letter = LETTERS[i];
    const inputType = isMulti ? 'checkbox' : 'radio';
    const name = isMulti ? `opt-${state.index}` : 'option';
    return `
      <label class="option" data-index="${i}">
        <input type="${inputType}" name="${name}" value="${i}" />
        <span class="option-letter">${letter}</span>
        <span class="option-label">${escapeHtml(opt)}</span>
      </label>
    `;
  }).join('');

  optionsEl.querySelectorAll('.option').forEach(label => {
    label.addEventListener('click', () => {
      if (state.answered) return;
      const input = label.querySelector('input');
      if (isMulti) {
        input.checked = !input.checked;
      } else {
        optionsEl.querySelectorAll('.option').forEach(l => l.classList.remove('selected'));
        optionsEl.querySelectorAll('input').forEach(inp => { inp.checked = false; });
        input.checked = true;
        label.classList.add('selected');
      }
      label.classList.remove('just-selected');
      void label.offsetWidth;
      label.classList.add('just-selected');
    });
  });

  if (state.answerResults[state.index]) {
    applyAnsweredState(q, state.answerResults[state.index]);
    return;
  }
  const btnSubmit2 = document.getElementById('btn-submit');
  if (btnSubmit2) btnSubmit2.style.display = 'inline-flex';
  const btnNext2 = document.getElementById('btn-next');
  if (btnNext2) btnNext2.style.display = 'none';
  var btnPrev2 = document.getElementById('btn-prev-quiz');
  if (btnPrev2) btnPrev2.style.display = state.index > 0 ? 'inline-flex' : 'none';
  startTimer();
}


function submitAnswer() {
  clearTimer();
  if (state.answered) return;
  const q = state.questions[state.index];
  const optionsEl = document.getElementById('options-container');
  const fillWrap = document.getElementById('fill-input-wrap');
  const fillInput = document.getElementById('fill-input');

  let correct = false;
  if (q.type === 'fill_blank') {
    const paragraphWrap = document.getElementById('paragraph-blanks-wrap');
    const multiInputs = paragraphWrap && paragraphWrap.style.display !== 'none' ? paragraphWrap.querySelectorAll('input') : [];
    if (multiInputs.length >= 2) {
      const correctArr = Array.isArray(q.correct) ? q.correct : [q.correct];
      let allRight = true;
      const answers = [];
      for (let i = 0; i < correctArr.length && i < multiInputs.length; i++) {
        const val = (multiInputs[i].value || '').trim().toLowerCase();
        const accept = Array.isArray(correctArr[i]) ? correctArr[i].map(c => String(c).toLowerCase().trim()) : [String(correctArr[i]).toLowerCase().trim()];
        const ok = matchFrenchAnswer(val, accept);
        answers.push({ val, ok, accept });
        if (!ok) allRight = false;
      }
      state.answered = true;
      if (allRight) state.score++;
      else addToWrongBook(q);
      correct = allRight;
      multiInputs.forEach((inp, i) => {
        inp.disabled = true;
        inp.classList.add(answers[i].ok ? 'correct-blank' : 'wrong-blank');
      });
      const stemEl = document.getElementById('question-stem');
      stemEl.querySelectorAll('.blank').forEach((span, i) => {
        if (answers[i]) {
          span.classList.add(answers[i].ok ? 'filled' : 'wrong');
          span.textContent = answers[i].ok ? answers[i].val : (answers[i].val || '?') + ' → ' + (Array.isArray(q.correct[i]) ? q.correct[i][0] : q.correct[i]);
        }
      });
    } else {
      const answer = (fillInput.value || '').trim().toLowerCase();
      const accept = (Array.isArray(q.correct) ? q.correct : [q.correct]).map(c => String(c).toLowerCase().trim());
      correct = matchFrenchAnswer(answer, accept);
      state.answered = true;
      if (correct) state.score++;
      else addToWrongBook(q);
      fillInput.disabled = true;
      fillInput.classList.add(correct ? 'correct-blank' : 'wrong-blank');
    }
  } else if (q.type === 'paragraph_fill_blank') {
    const correctArr = Array.isArray(q.correct) ? q.correct : [q.correct];
    const inputs = document.querySelectorAll('#paragraph-blanks-wrap input');
    const len = Math.min(correctArr.length, inputs.length);
    let allRight = true;
    const answers = [];
    for (let i = 0; i < len; i++) {
      const val = (inputs[i] && inputs[i].value ? inputs[i].value : '').trim().toLowerCase();
      const accept = Array.isArray(correctArr[i]) ? correctArr[i].map(c => String(c).toLowerCase().trim()) : [String(correctArr[i]).toLowerCase().trim()];
      const ok = matchFrenchAnswer(val, accept);
      answers.push({ val, ok, accept });
      if (!ok) allRight = false;
    }
    for (let i = len; i < correctArr.length; i++) { allRight = false; answers.push({ val: '', ok: false, accept: [] }); }
    state.answered = true;
    if (allRight) state.score++;
    else addToWrongBook(q);
    inputs.forEach((inp, i) => {
      inp.disabled = true;
      if (answers[i]) inp.classList.add(answers[i].ok ? 'correct-blank' : 'wrong-blank');
    });
    const stemEl = document.getElementById('question-stem');
    stemEl.querySelectorAll('.blank').forEach((span, i) => {
      if (answers[i]) {
        span.classList.add(answers[i].ok ? 'filled' : 'wrong');
        span.textContent = answers[i].ok ? answers[i].val : (answers[i].val || '?') + ' → ' + (Array.isArray(q.correct[i]) ? q.correct[i][0] : q.correct[i]);
      }
    });
    correct = allRight;
  } else {
    const isMulti = q.type === 'multiple_choice';
    const selected = Array.from(optionsEl.querySelectorAll('input:checked')).map(inp => parseInt(inp.value, 10));
    const userAnswer = isMulti ? { multiple: selected } : { single: selected.length === 1 ? selected[0] : undefined };
    const result = evaluateAnswer(q, userAnswer);
    correct = result.correct;
    state.answered = true;
    if (correct) state.score++;
    else addToWrongBook(q);

    const correctSet = Array.isArray(q.correct) ? new Set(q.correct) : new Set([q.correct]);
    optionsEl.querySelectorAll('.option').forEach((label, i) => {
      label.classList.add('disabled');
      const inCorrect = correctSet.has(i);
      const wasSelected = label.querySelector('input').checked;
      if (inCorrect) label.classList.add('correct');
      else if (wasSelected) label.classList.add('wrong');
    });
  }

  if (state.practicingWrongBook) updateWrongBookAfterAnswer(q, correct);

  /* Add card feedback animation */
  const questionCard = document.querySelector('.question-card');
  if (questionCard) {
    const currentIndex = state.index;  // Capture current index
    const currentQuestion = q;  // Capture current question reference
    questionCard.classList.remove('answer-correct', 'answer-wrong');
    const timer1 = setTimeout(() => {
      if (state.index === currentIndex && state.questions[state.index] === currentQuestion) {
        questionCard.classList.add(correct ? 'answer-correct' : 'answer-wrong');
        const timer2 = setTimeout(() => {
          if (state.index === currentIndex && state.questions[state.index] === currentQuestion) {
            questionCard.classList.remove('answer-correct', 'answer-wrong');
          }
          _pendingTimers = _pendingTimers.filter(t => t !== timer2);
        }, 600);
        _pendingTimers.push(timer2);
      }
      _pendingTimers = _pendingTimers.filter(t => t !== timer1);
    }, 50);
    _pendingTimers.push(timer1);
  }

  const feedbackEl = document.getElementById('answer-feedback');
  if (feedbackEl) {
    feedbackEl.textContent = correct ? '正确！' : '错误';
    feedbackEl.className = 'answer-feedback ' + (correct ? 'correct-msg' : 'wrong-msg');
  }

  const explanationEl = document.getElementById('explanation');
  if (!explanationEl) return;  // 如果关键元素不存在，提前返回
  let explanationText = q.explanation || '';
  if (!explanationText && !correct) {
    if (q.type === 'fill_blank') {
      const ans = Array.isArray(q.correct) ? q.correct : [q.correct];
      explanationText = '正确答案：' + ans.map(a => String(a).trim()).join(' 或 ');
    } else if (q.type === 'single_choice') {
      explanationText = '正确答案：' + (q.options ? LETTERS[q.correct] + ') ' + q.options[q.correct] : LETTERS[q.correct]);
    } else if (q.type === 'multiple_choice' && q.options) {
      const indices = Array.isArray(q.correct) ? q.correct : [q.correct];
      explanationText = '正确答案：' + indices.map(i => LETTERS[i] + ') ' + q.options[i]).join('；');
    } else if (q.type === 'paragraph_fill_blank') {
      const arr = Array.isArray(q.correct) ? q.correct : [q.correct];
      explanationText = '正确答案：' + arr.map((c, i) => '第' + (i + 1) + '空 ' + (Array.isArray(c) ? c[0] : c)).join('；');
    }
  }
  if (explanationEl) explanationEl.textContent = explanationText;
  var scrollWrap = document.getElementById('explanation-scroll-wrap');
  if (scrollWrap) {
    scrollWrap.style.display = 'block';
    var wrongCountEl = document.getElementById('explanation-wrong-count');
    var wrongCount = getWrongCountForQuestion(q);
    if (wrongCountEl) {
      if (wrongCount > 0) {
        wrongCountEl.textContent = '本题已错 ' + wrongCount + ' 次';
        wrongCountEl.style.display = 'block';
      } else {
        wrongCountEl.textContent = '';
        wrongCountEl.style.display = 'none';
      }
    }
    var qid = wrongBookItemId(q);
    _currentQuestionIdForNotes = qid;
    var notes = getQuestionNotes(qid);
    var notesDisplayEl = document.getElementById('explanation-notes-display');
    var notesEditEl = document.getElementById('explanation-notes-edit');
    var btnEditNotes = document.getElementById('btn-edit-explanation-notes');
    if (notesDisplayEl) {
      if (notes) { notesDisplayEl.textContent = notes; notesDisplayEl.style.display = 'block'; } else { notesDisplayEl.style.display = 'none'; }
    }
    if (notesEditEl) notesEditEl.style.display = 'none';
    if (btnEditNotes) btnEditNotes.style.display = 'inline-flex';
  }

  const announcer = document.getElementById('sr-announcer');
  if (announcer) announcer.textContent = correct ? '回答正确' : '回答错误。' + (explanationText || '');

  const removeWrap = document.getElementById('wrong-book-remove-wrap');
  const btnRemove = document.getElementById('btn-remove-from-wrong');
  if (removeWrap && btnRemove) {
    if (state.practicingWrongBook) {
      removeWrap.style.display = 'block';
      btnRemove.textContent = '移出错题本';
      btnRemove.disabled = false;
      btnRemove.onclick = () => {
        const removedItem = JSON.parse(JSON.stringify(q));
        removeFromWrongBook(q);
        btnRemove.textContent = '已移出（5秒内可撤销）';
        btnRemove.disabled = false;
        const undoTimer = setTimeout(() => {
          if (state.index < state.questions.length && state.questions[state.index] === q) {
            btnRemove.textContent = '已移出';
            btnRemove.disabled = true;
          }
          _pendingTimers = _pendingTimers.filter(t => t !== undoTimer);
        }, 5000);
        _pendingTimers.push(undoTimer);
        btnRemove.onclick = () => {
          clearTimeout(undoTimer);
          _pendingTimers = _pendingTimers.filter(t => t !== undoTimer);
          addToWrongBookDirect(removedItem);
          btnRemove.textContent = '已撤销，仍在错题本';
          btnRemove.disabled = true;
        };
      };
    } else {
      removeWrap.style.display = 'none';
    }
  }

  var saved = { correct: correct, explanationText: explanationText };
  if (q.type === 'single_choice') {
    var sel = Array.from(optionsEl.querySelectorAll('input:checked')).map(function(inp) { return parseInt(inp.value, 10); });
    saved.selectedSingle = sel.length === 1 ? sel[0] : undefined;
  }
  if (q.type === 'multiple_choice') saved.selectedMultiple = Array.from(optionsEl.querySelectorAll('input:checked')).map(function(inp) { return parseInt(inp.value, 10); });
  state.answerResults[state.index] = saved;

  document.getElementById('btn-submit').style.display = 'none';
  const btnNext = document.getElementById('btn-next');
  btnNext.style.display = 'inline-flex';
  btnNext.textContent = state.index >= state.questions.length - 1 ? '查看结果' : '下一题';
  btnNext.setAttribute('aria-label', state.index >= state.questions.length - 1 ? '查看结果' : '下一题');
  var btnPrev = document.getElementById('btn-prev-quiz');
  if (btnPrev) btnPrev.style.display = state.index > 0 ? 'inline-flex' : 'none';
  saveQuizProgress();
}

function applyAnsweredState(q, saved) {
  state.answered = true;
  clearTimer();
  var feedbackEl = document.getElementById('answer-feedback');
  feedbackEl.textContent = saved.correct ? '正确！' : '错误';
  feedbackEl.className = 'answer-feedback ' + (saved.correct ? 'correct-msg' : 'wrong-msg');
  feedbackEl.style.display = 'block';
  var explanationEl = document.getElementById('explanation');
  explanationEl.textContent = saved.explanationText || '';
  var scrollWrap = document.getElementById('explanation-scroll-wrap');
  if (scrollWrap) {
    scrollWrap.style.display = 'block';
    var wrongCountEl = document.getElementById('explanation-wrong-count');
    var wrongCount = getWrongCountForQuestion(q);
    if (wrongCountEl) {
      if (wrongCount > 0) {
        wrongCountEl.textContent = '本题已错 ' + wrongCount + ' 次';
        wrongCountEl.style.display = 'block';
      } else {
        wrongCountEl.textContent = '';
        wrongCountEl.style.display = 'none';
      }
    }
    var qid = wrongBookItemId(q);
    _currentQuestionIdForNotes = qid;
    var notes = getQuestionNotes(qid);
    var notesDisplayEl = document.getElementById('explanation-notes-display');
    var notesEditEl = document.getElementById('explanation-notes-edit');
    var btnEditNotes = document.getElementById('btn-edit-explanation-notes');
    if (notesDisplayEl) {
      if (notes) { notesDisplayEl.textContent = notes; notesDisplayEl.style.display = 'block'; } else { notesDisplayEl.style.display = 'none'; }
    }
    if (notesEditEl) notesEditEl.style.display = 'none';
    if (btnEditNotes) btnEditNotes.style.display = 'inline-flex';
  }
  var optionsEl = document.getElementById('options-container');
  if (optionsEl && (q.type === 'single_choice' || q.type === 'multiple_choice') && q.options) {
    var correctSet = Array.isArray(q.correct) ? new Set(q.correct) : new Set([q.correct]);
    optionsEl.querySelectorAll('.option').forEach(function(label, i) {
      label.classList.add('disabled');
      var inCorrect = correctSet.has(i);
      var wasSelected = (q.type === 'single_choice' && saved.selectedSingle === i) || (q.type === 'multiple_choice' && saved.selectedMultiple && saved.selectedMultiple.indexOf(i) !== -1);
      if (inCorrect) label.classList.add('correct');
      else if (wasSelected) label.classList.add('wrong');
      var input = label.querySelector('input');
      if (input) { input.checked = wasSelected; input.disabled = true; }
    });
  }
  var fillWrap = document.getElementById('fill-input-wrap');
  var paragraphWrap = document.getElementById('paragraph-blanks-wrap');
  if (fillWrap) fillWrap.querySelectorAll('input').forEach(function(inp) { inp.disabled = true; });
  if (paragraphWrap) paragraphWrap.querySelectorAll('input').forEach(function(inp) { inp.disabled = true; });
  const btnSubmit = document.getElementById('btn-submit');
  if (btnSubmit) btnSubmit.style.display = 'none';
  var btnNext = document.getElementById('btn-next');
  if (btnNext) {
    btnNext.style.display = 'inline-flex';
    btnNext.textContent = state.index >= state.questions.length - 1 ? '查看结果' : '下一题';
    btnNext.setAttribute('aria-label', state.index >= state.questions.length - 1 ? '查看结果' : '下一题');
  }
  var btnPrev = document.getElementById('btn-prev-quiz');
  if (btnPrev) btnPrev.style.display = state.index > 0 ? 'inline-flex' : 'none';
}

function prevQuestion() {
  if (state.index <= 0) return;
  state.index--;
  state.answered = true;
  renderQuestion();
}

function nextQuestion() {
  if (state.answered !== true) return;  // Prevent rapid clicking
  state.index++;
  if (state.index >= state.questions.length) {
    showResult();
  } else {
    const card = document.querySelector('.question-card');
    if (card) {
      card.classList.add('animate-out');
      const animTimer = setTimeout(() => {
        const currentIndex = state.index;  // Capture current index
        if (typeof performance !== 'undefined' && performance.mark) performance.mark('next-question-start');
        card.classList.remove('animate-out');
        renderQuestion();
        if (typeof performance !== 'undefined' && performance.mark) {
          performance.mark('next-question-end');
          try { performance.measure('next-question', 'next-question-start', 'next-question-end'); } catch (_) {}
        }
        if (state.index === currentIndex) {  // Verify still on same question
          card.classList.add('animate-in');
          card.style.willChange = 'transform';
          card.addEventListener('animationend', () => {
            card.classList.remove('animate-in');
            card.style.willChange = '';
          }, { once: true });
        }
        _pendingTimers = _pendingTimers.filter(t => t !== animTimer);
      }, 200);
      _pendingTimers.push(animTimer);
    } else {
      renderQuestion();
    }
  }
}

function showResult() {
  clearQuizProgress();
  if (state.practicedSetId) {
    recordSavedSetPractice(state.practicedSetId);
    state.practicedSetId = null;
  }
  addTodayPractice(state.questions.length);
  document.getElementById('result-score').textContent = `${state.score} / ${state.questions.length}`;
  const pct = state.questions.length ? Math.round((state.score / state.questions.length) * 100) : 0;
  const pctEl = document.getElementById('result-pct');
  if (pctEl) pctEl.textContent = '正确率 ' + pct + '%';
  document.getElementById('result-desc').textContent = pct >= 80 ? 'Très bien !' : pct >= 60 ? 'Pas mal !' : 'Continuez à pratiquer !';
  const celebrationEl = document.getElementById('result-celebration');
  const isFull = state.score === state.questions.length && state.questions.length > 0;
  if (celebrationEl) celebrationEl.style.display = isFull ? 'block' : 'none';
  const confettiEl = document.getElementById('result-confetti');
  if (confettiEl) {
    confettiEl.innerHTML = '';
    if (isFull) {
      const colors = ['#8b5cf6', '#34d399', '#fbbf24', '#60a5fa', '#f87171'];
      for (let i = 0; i < 14; i++) {
        const s = document.createElement('span');
        s.style.left = (10 + Math.random() * 80) + '%';
        s.style.top = (60 + Math.random() * 35) + '%';
        s.style.background = colors[i % colors.length];
        s.style.animationDelay = (Math.random() * 0.6) + 's';
        s.style.animationDuration = (2 + Math.random() * 1.2) + 's';
        confettiEl.appendChild(s);
      }
    }
  }
  pushRecentSession(state.questions.length, state.score);
  if (state.sequentialBatch && state.practicedSetId) {
    const sets = getSavedSets();
    const nextIdx = state.sequentialBatch.startIndex + state.sequentialBatch.count;
    const updated = sets.map(s => String(s.id) === String(state.practicedSetId)
      ? Object.assign({}, s, { sequentialNextIndex: nextIdx })
      : s);
    setSavedSets(updated);
    state.sequentialBatch = null;
  }
  const recentEl = document.getElementById('result-recent');
  if (recentEl) {
    const sessions = getRecentSessions();
    const toShow = sessions.slice(-5).reverse();
    if (toShow.length <= 1) {
      recentEl.style.display = 'none';
    } else {
      recentEl.style.display = 'block';
      recentEl.innerHTML = '<div class="result-recent-title">最近练习</div><ul>' +
        toShow.map((s, i) => '<li>' + s.score + '/' + s.total + (i === 0 ? '（本次）' : '') + '</li>').join('') + '</ul>';
    }
  }
  const announcer = document.getElementById('sr-announcer');
  if (announcer) announcer.textContent = '练习完成，得分 ' + state.score + ' / ' + state.questions.length + '，正确率 ' + pct + '%';
  showScreen(SCREEN.RESULT);
  var firstBtn = document.getElementById('btn-restart');
  if (firstBtn) setTimeout(function () { firstBtn.focus(); }, 100);
}
function readAloudStem() {
  const q = state.questions[state.index];
  if (!q || !q.stem) return;
  const text = (q.stem || '').replace(/_____/g, ' ').trim();
  if (!text) return;
  if (typeof speechSynthesis === 'undefined') return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'fr-FR';
  u.rate = 0.9;
  speechSynthesis.speak(u);
}
function onQuizKeydown(e) {
  if (!document.getElementById('screen-quiz').classList.contains('active')) return;
  const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
  if (tag === 'INPUT' || tag === 'TEXTAREA') {
    if (e.key === 'Enter' && (e.target.id === 'explanation-notes-textarea' || e.target.closest('#explanation-notes-edit'))) return;
    if (e.key === 'Enter') { e.preventDefault(); if (state.answered) nextQuestion(); else submitAnswer(); }
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    if (state.answered) nextQuestion();
    else submitAnswer();
    return;
  }
  if (['1','2','3','4'].includes(e.key)) {
    const q = state.questions[state.index];
    if (!q || state.answered) return;
    if ((q.type === 'single_choice' || q.type === 'multiple_choice') && q.options && q.options.length > 0) {
      const idx = parseInt(e.key, 10) - 1;
      if (idx < 0 || idx >= q.options.length) return;
      const opts = document.querySelectorAll('#options-container .option');
      if (opts[idx]) opts[idx].click();
    }
  }
}

