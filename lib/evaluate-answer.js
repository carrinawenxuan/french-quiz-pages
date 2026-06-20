/**
 * 判题纯函数（浏览器 + Node 共用）。
 * 不读 DOM、不写存储；submitAnswer 收集用户答案后调用 evaluateAnswer。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof root !== 'undefined') {
    root.normalizeFrench = api.normalizeFrench;
    root.matchFrenchAnswer = api.matchFrenchAnswer;
    root.evaluateAnswer = api.evaluateAnswer;
    root.tokenizeFrenchText = api.tokenizeFrenchText;
    root.buildDictationHints = api.buildDictationHints;
    root.evaluateDictation = api.evaluateDictation;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
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
    return acceptList.some(function (c) { return c === val; })
      || acceptList.some(function (c) { return normalizeFrench(c) === normalizeFrench(val); });
  }

  function evaluateAnswer(q, userAnswer) {
    if (q.type === 'single_choice') {
      var correctIndex = Array.isArray(q.correct) ? q.correct[0] : q.correct;
      return { correct: userAnswer.single === correctIndex };
    }
    if (q.type === 'multiple_choice') {
      var correctSet = new Set(Array.isArray(q.correct) ? q.correct : [q.correct]);
      var selected = new Set(Array.isArray(userAnswer.multiple) ? userAnswer.multiple : []);
      var correct = selected.size === correctSet.size && Array.from(selected).every(function (i) { return correctSet.has(i); });
      return { correct: correct };
    }
    if (q.type === 'fill_blank') {
      var correctArr = Array.isArray(q.correct) ? q.correct : [q.correct];
      var blankCount = (q.stem.match(/_____/g) || []).length;
      if (blankCount >= 2 && (userAnswer.paragraph || []).length >= 2) {
        var answers = userAnswer.paragraph.slice(0, correctArr.length);
        var details = answers.map(function (val, i) {
          var accept = (Array.isArray(correctArr[i]) ? correctArr[i] : [correctArr[i]]).map(function (c) {
            return String(c).toLowerCase().trim();
          });
          return { ok: matchFrenchAnswer(val.trim().toLowerCase(), accept), val: val, accept: accept };
        });
        return { correct: details.every(function (d) { return d.ok; }), details: details };
      }
      var fillVal = (userAnswer.fill || '').trim().toLowerCase();
      var fillAccept = correctArr.map(function (c) { return String(c).toLowerCase().trim(); });
      return { correct: matchFrenchAnswer(fillVal, fillAccept) };
    }
    if (q.type === 'paragraph_fill_blank') {
      var paraCorrectArr = Array.isArray(q.correct) ? q.correct : [q.correct];
      var inputs = userAnswer.paragraph || [];
      var len = Math.min(paraCorrectArr.length, inputs.length);
      var paraDetails = [];
      var paraCorrect = true;
      for (var i = 0; i < len; i++) {
        var pVal = (inputs[i] || '').trim().toLowerCase();
        var pAccept = (Array.isArray(paraCorrectArr[i]) ? paraCorrectArr[i] : [paraCorrectArr[i]]).map(function (c) {
          return String(c).toLowerCase().trim();
        });
        var ok = matchFrenchAnswer(pVal, pAccept);
        paraDetails.push({ ok: ok, val: pVal, accept: pAccept });
        if (!ok) paraCorrect = false;
      }
      for (var j = len; j < paraCorrectArr.length; j++) {
        paraDetails.push({ ok: false, val: '', accept: [] });
        paraCorrect = false;
      }
      return { correct: paraCorrect, details: paraDetails };
    }
    if (q.type === 'writing_dictation') {
      var ref = q.reference != null ? String(q.reference) : '';
      var typed = userAnswer.dictation != null ? String(userAnswer.dictation) : '';
      return evaluateDictation(ref, typed);
    }
    return { correct: false };
  }

  function tokenizeFrenchText(text) {
    return String(text || '').trim().split(/\s+/).filter(Boolean);
  }

  function buildDictationHints(reference) {
    if (!reference || typeof reference !== 'string') return [];
    var trimmed = reference.trim();
    if (!trimmed) return [];
    var sentences = trimmed.split(/(?<=[.!?…])\s+/).filter(Boolean);
    if (sentences.length <= 1 && trimmed.indexOf('\n') >= 0) {
      sentences = trimmed.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
    }
    var words = tokenizeFrenchText(trimmed);
    var hints = [];
    hints.push({
      level: 1,
      type: 'structure',
      text: '共 ' + sentences.length + ' 句，约 ' + words.length + ' 词',
    });
    hints.push({
      level: 2,
      type: 'sentence_start',
      text: sentences.map(function (s) {
        var ws = tokenizeFrenchText(s);
        return ws.slice(0, Math.min(3, ws.length)).join(' ') + (ws.length > 3 ? ' …' : '');
      }).join(' / '),
    });
    hints.push({
      level: 3,
      type: 'partial',
      text: words.map(function (w, i) { return i % 3 === 0 ? w : '___'; }).join(' '),
    });
    hints.push({
      level: 4,
      type: 'first_letters',
      text: words.map(function (w) {
        var m = w.match(/[a-zA-ZÀ-ÿ]/);
        if (!m) return w;
        return m[0] + '---';
      }).join(' '),
    });
    return hints;
  }

  function normalizeDictationText(str) {
    return normalizeFrench(str)
      .replace(/'/g, '')
      .replace(/[^\p{L}\p{N}]/gu, '');
  }

  function evaluateDictation(reference, userText) {
    var normRef = normalizeDictationText(reference);
    var normUser = normalizeDictationText(userText);
    var correct = normRef === normUser;
    var refTokens = tokenizeFrenchText(normalizeFrench(reference).replace(/'/g, ' '));
    var userTokens = tokenizeFrenchText(normalizeFrench(userText).replace(/'/g, ' '));
    var matchCount = 0;
    var maxLen = Math.max(refTokens.length, userTokens.length);
    for (var i = 0; i < Math.min(refTokens.length, userTokens.length); i++) {
      if (refTokens[i] === userTokens[i]) matchCount++;
    }
    var similarity = maxLen ? matchCount / maxLen : (correct ? 1 : 0);
    return { correct: correct, similarity: similarity };
  }

  return {
    normalizeFrench: normalizeFrench,
    matchFrenchAnswer: matchFrenchAnswer,
    evaluateAnswer: evaluateAnswer,
    tokenizeFrenchText: tokenizeFrenchText,
    buildDictationHints: buildDictationHints,
    evaluateDictation: evaluateDictation,
  };
});
