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
    return { correct: false };
  }

  return {
    normalizeFrench: normalizeFrench,
    matchFrenchAnswer: matchFrenchAnswer,
    evaluateAnswer: evaluateAnswer,
  };
});
