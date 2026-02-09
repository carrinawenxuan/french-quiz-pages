'use strict';
// ── Home Screen UI ──

function isDataImageUrl(s) { return typeof s === 'string' && /^data:image\//i.test(s.trim()); }
function isLikelyUrl(str) {
  const s = (str || '').trim();
  if (!s) return false;
  if (/^data:image\//i.test(s)) return false;
  let toTry = /^https?:\/\//i.test(s) ? s : ('https://' + s);
  try {
    const u = new URL(toTry);
    const host = (u.hostname || '').toLowerCase();
    return host.length > 0 && (host.includes('.') || host === 'localhost');
  } catch (_) { return false; }
}
function getReviewMaterials(set) {
  if (!set) return { texts: [], links: [], images: [] };
  const hasNew = (set.reviewTexts && set.reviewTexts.length) || (set.reviewLinks && set.reviewLinks.length) || (set.reviewImages && set.reviewImages.length);
  if (hasNew) {
    return {
      texts: Array.isArray(set.reviewTexts) ? set.reviewTexts : [],
      links: Array.isArray(set.reviewLinks) ? set.reviewLinks : [],
      images: Array.isArray(set.reviewImages) ? set.reviewImages : []
    };
  }
  const urls = Array.isArray(set.reviewUrls) ? set.reviewUrls : [];
  const texts = [], links = [], images = [];
  urls.forEach(u => {
    const s = (u || '').trim();
    if (!s) return;
    if (isDataImageUrl(s)) images.push(s);
    else if (isLikelyUrl(s)) links.push(/^https?:\/\//i.test(s) ? s : 'https://' + s);
    else texts.push(s);
  });
  return { texts, links, images };
}
function hasReviewMaterial(set) {
  const m = getReviewMaterials(set);
  return m.texts.length > 0 || m.links.length > 0 || m.images.length > 0;
}

function renderSavedSets() {
  const sets = getSavedSets();
  const folders = getFolders();
  const folderIds = new Set(folders.map(f => String(f.id)));
  const searchEl = $('saved-sets-search');
  const query = (searchEl && searchEl.value ? searchEl.value : '').trim().toLowerCase();
  const filtered = query ? sets.filter(s => (s.name || '').toLowerCase().includes(query)) : sets;
  const listEl = $('saved-sets-list');
  const emptyEl = $('saved-sets-empty');
  const tagsEl = $('saved-sets-folder-tags');
  if (!listEl || !emptyEl) return;
  renderFolderTags();
  function itemHtml(s) {
    const count = s.practiceCount || 0;
    const lastStr = s.lastPracticedAt ? '最近 ' + formatSavedSetDate(s.lastPracticedAt) : '未练习';
    return '<li class="saved-sets-item" data-id="' + escapeAttr(String(s.id)) + '">' +
      '<div class="saved-sets-item-content">' +
      '<span class="name">' + escapeHtml(s.name) + '</span>' +
      '<div class="meta">' +
      '<span>' + escapeHtml(formatSavedSetDate(s.createdAt)) + '</span><span class="dot">·</span><span>' + s.questions.length + ' 题</span><span class="dot">·</span><span>练习 ' + count + ' 次</span><span class="dot">·</span><span>' + lastStr + '</span>' +
      '</div></div>' +
      '<div class="actions"><button type="button" class="btn btn-primary" data-action="start" aria-haspopup="dialog">开始</button><button type="button" class="btn btn-secondary" data-action="edit" aria-haspopup="dialog">编辑</button></div>' +
      '</li>';
  }
  if (filtered.length === 0) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'block';
    emptyEl.textContent = query ? '没有匹配的习题集' : '还没有习题集，去「开始练习」里粘贴题目并填写名称，即可保存到这里。';
    return;
  }
  emptyEl.style.display = 'none';
  if (query) _savedSetsDisplayLimit = SAVED_SETS_DISPLAY_LIMIT;
  const orderedSets = [];
  folders.forEach(f => {
    orderedSets.push(...filtered.filter(s => String(s.folderId || '') === String(f.id)));
  });
  orderedSets.push(...filtered.filter(s => !s.folderId || !folderIds.has(String(s.folderId))));
  const limit = _savedSetsDisplayLimit;
  const toShow = orderedSets.slice(0, limit);
  const toShowSet = new Set(toShow.map(s => String(s.id)));
  const hasMore = orderedSets.length > limit;
  let collapsedState = {};
  try {
    const raw = localStorage.getItem(FOLDER_COLLAPSED_KEY);
    if (raw) collapsedState = JSON.parse(raw) || {};
  } catch (_) {}
  const folderIconSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>';
  let html = '';
  folders.forEach(f => {
    const inFolder = filtered.filter(s => String(s.folderId || '') === String(f.id));
    const inFolderShow = inFolder.filter(s => toShowSet.has(String(s.id)));
    if (inFolderShow.length === 0) return;
    const fid = String(f.id);
    const collapsed = collapsedState[fid];
    const collapsedClass = collapsed ? ' saved-sets-folder-collapsed' : '';
    html += '<div class="saved-sets-folder' + collapsedClass + '" data-folder-id="' + escapeAttr(fid) + '" data-is-uncategorized="false">' +
      '<div class="saved-sets-folder-header">' +
      '<button type="button" class="saved-sets-folder-toggle">' +
      '<span class="folder-icon-wrap">' + folderIconSvg + '</span>' +
      '<span class="saved-sets-folder-name">' + escapeHtml(f.name) + '</span>' +
      '<span class="folder-chevron" aria-hidden="true">▼</span>' +
      '</button>' +
      '<button type="button" class="folder-header-edit" aria-label="重命名">✎</button>' +
      '<button type="button" class="folder-header-delete" aria-label="删除">×</button>' +
      '</div>' +
      '<div class="saved-sets-folder-body"><ul class="saved-sets-list">' + inFolderShow.map(itemHtml).join('') + '</ul></div></div>';
  });
  const uncategorized = filtered.filter(s => !s.folderId || !folderIds.has(String(s.folderId)));
  const uncategorizedShow = uncategorized.filter(s => toShowSet.has(String(s.id)));
  if (uncategorizedShow.length > 0) {
    const collapsed = collapsedState['__uncategorized__'];
    const collapsedClass = collapsed ? ' saved-sets-folder-collapsed' : '';
    html += '<div class="saved-sets-folder' + collapsedClass + '" data-folder-id="__uncategorized__" data-is-uncategorized="true">' +
      '<div class="saved-sets-folder-header">' +
      '<button type="button" class="saved-sets-folder-toggle">' +
      '<span class="folder-icon-wrap">' + folderIconSvg + '</span>' +
      '<span class="saved-sets-folder-name">未分类</span>' +
      '<span class="folder-chevron" aria-hidden="true">▼</span>' +
      '</button>' +
      '</div>' +
      '<div class="saved-sets-folder-body"><ul class="saved-sets-list">' + uncategorizedShow.map(itemHtml).join('') + '</ul></div></div>';
  }
  if (hasMore) {
    html += '<div class="saved-sets-show-more-wrap"><button type="button" class="btn btn-secondary saved-sets-show-more" id="btn-saved-sets-show-more">显示更多（共 ' + orderedSets.length + ' 套）</button></div>';
  }
  requestAnimationFrame(() => {
  listEl.innerHTML = html;
  listEl.querySelectorAll('.saved-sets-folder-toggle').forEach(toggleBtn => {
    toggleBtn.addEventListener('click', function() {
      const block = this.closest('.saved-sets-folder');
      const fid = block.dataset.folderId;
      block.classList.toggle('saved-sets-folder-collapsed');
      const collapsed = block.classList.contains('saved-sets-folder-collapsed');
      try {
        const raw = localStorage.getItem(FOLDER_COLLAPSED_KEY);
        const state = raw ? JSON.parse(raw) : {};
        state[fid] = collapsed;
        localStorage.setItem(FOLDER_COLLAPSED_KEY, JSON.stringify(state));
      } catch (_) {}
    });
  });
  listEl.querySelectorAll('.folder-header-edit').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const block = this.closest('.saved-sets-folder');
      const id = block.dataset.folderId;
      if (id === '__uncategorized__') return;
      const folders = getFolders();
      const folder = folders.find(f => String(f.id) === id);
      if (!folder) return;
      const name = prompt('重命名文件夹', folder.name || '');
      if (name == null || !name.trim()) return;
      setFolders(folders.map(f => String(f.id) === id ? Object.assign({}, f, { name: name.trim() }) : f));
    });
  });
  listEl.querySelectorAll('.folder-header-delete').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const block = this.closest('.saved-sets-folder');
      const id = block.dataset.folderId;
      if (id === '__uncategorized__') return;
      if (!confirm('删除该文件夹？其下习题集会移到「未分类」。')) return;
      setFolders(getFolders().filter(f => String(f.id) !== id));
      const sets = getSavedSets();
      const updated = sets.map(s => String(s.folderId || '') === id ? Object.assign({}, s, { folderId: undefined }) : s);
      setSavedSets(updated);
    });
  });
  var showMoreBtn = listEl.querySelector('#btn-saved-sets-show-more');
  if (showMoreBtn) showMoreBtn.addEventListener('click', function() {
    _savedSetsDisplayLimit = Infinity;
    renderSavedSets();
  });
  });
}

function renderFolderTags() {
  const tagsEl = document.getElementById('saved-sets-folder-tags');
  if (!tagsEl) return;
  const folders = getFolders();
  const folderIconSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>';
  tagsEl.innerHTML = folders.map(f => {
    return '<span class="folder-tag" data-folder-id="' + escapeAttr(String(f.id)) + '">' +
      '<span class="folder-tag-icon">' + folderIconSvg + '</span>' +
      '<span class="folder-tag-name" title="' + escapeAttr(f.name) + '">' + escapeHtml(f.name) + '</span>' +
      '<button type="button" class="folder-tag-edit" aria-label="重命名">✎</button>' +
      '<button type="button" class="folder-tag-delete" aria-label="删除">×</button>' +
      '</span>';
  }).join('');
  tagsEl.querySelectorAll('.folder-tag-edit').forEach(btn => {
    btn.addEventListener('click', function() {
      const tag = this.closest('.folder-tag');
      const id = tag.dataset.folderId;
      const folders = getFolders();
      const folder = folders.find(f => String(f.id) === id);
      if (!folder) return;
      const name = prompt('重命名文件夹', folder.name || '');
      if (name == null || (name && !name.trim())) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      setFolders(folders.map(f => String(f.id) === id ? Object.assign({}, f, { name: trimmed }) : f));
    });
  });
  tagsEl.querySelectorAll('.folder-tag-delete').forEach(btn => {
    btn.addEventListener('click', function() {
      const tag = this.closest('.folder-tag');
      const id = tag.dataset.folderId;
      if (!confirm('删除该文件夹？其下习题集会移到「未分类」。')) return;
      const folders = getFolders().filter(f => String(f.id) !== id);
      setFolders(folders);
      const sets = getSavedSets();
      const updated = sets.map(s => String(s.folderId || '') === id ? Object.assign({}, s, { folderId: undefined }) : s);
      setSavedSets(updated);
    });
  });
}

function handleSavedSetsAction(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const item = btn.closest('.saved-sets-item');
  if (!item) return;
  const id = item.dataset.id;
  const sets = getSavedSets();
  const set = sets.find(s => String(s.id) === id);
  switch (btn.dataset.action) {
    case 'start':
      if (set && set.questions && set.questions.length) {
        if (set.questions.length > SEQUENTIAL_MODE_THRESHOLD) openStartModeModal(set);
        else if (hasReviewMaterial(set)) showReviewModal(set, set.questions, false, set.id);
        else startQuiz(set.questions, false, set.id);
      }
      break;
    case 'edit':
      if (set) openEditSetModal(id);
      break;
  }
}

let _editingSetId = null;
let _editModalPastedImages = [];

function renderEditModalPastedImages() {
  const listEl = document.getElementById('edit-set-pasted-list');
  if (!listEl) return;
  listEl.innerHTML = _editModalPastedImages.map((dataUrl, i) =>
    '<div class="edit-set-pasted-item" data-index="' + i + '">' +
    '<img src="' + safeImageSrc(dataUrl) + '" alt="" loading="lazy" />' +
    '<button type="button" class="edit-set-pasted-remove" aria-label="删除该图片">×</button></div>'
  ).join('');
  listEl.querySelectorAll('.edit-set-pasted-remove').forEach(btn => {
    btn.addEventListener('click', function() {
      const i = parseInt(this.closest('.edit-set-pasted-item').dataset.index, 10);
      _editModalPastedImages.splice(i, 1);
      renderEditModalPastedImages();
    });
  });
}
function openEditSetModal(setId) {
  const sets = getSavedSets();
  const set = sets.find(s => String(s.id) === setId);
  if (!set) return;
  _editingSetId = setId;
  const nameEl = document.getElementById('edit-set-name');
  const textsEl = document.getElementById('edit-set-review-texts');
  const linksEl = document.getElementById('edit-set-review-links');
  const metaEl = document.getElementById('edit-set-meta');
  if (nameEl) nameEl.value = set.name || '';
  const folderEl = document.getElementById('edit-set-folder');
  if (folderEl) folderEl.value = set.folderId != null ? String(set.folderId) : '';
  const m = getReviewMaterials(set);
  if (textsEl) textsEl.value = m.texts.join('\n');
  if (linksEl) linksEl.value = m.links.join('\n');
  _editModalPastedImages = m.images.slice();
  if (metaEl) metaEl.textContent = set.questions ? set.questions.length + ' 题 · 练习 ' + (set.practiceCount || 0) + ' 次' : '';
  renderEditModalPastedImages();
  const appendEl = document.getElementById('edit-set-append-text');
  if (appendEl) appendEl.value = '';
  const editOverlay = document.getElementById('edit-set-modal-overlay');
  editOverlay.classList.add('show');
  setModalFocusTrap(editOverlay);
}
function closeEditSetModal() {
  _editingSetId = null;
  clearModalFocusTrap();
  document.getElementById('edit-set-modal-overlay').classList.remove('show');
}
function formatQuestionForPreview(q, index) {
  const typeLabel = QUESTION_TYPES[q.type] || q.type || '题目';
  const head = '第 ' + (index + 1) + ' 题 · ' + typeLabel + (q.category ? ' · ' + escapeHtml(q.category) : '');
  const stem = '<div class="preview-q-stem">' + escapeHtml(q.stem || '') + '</div>';
  let options = '';
  if (q.options && q.options.length) {
    const opts = q.options.map((opt, i) => LETTERS[i] + ') ' + escapeHtml(opt)).join('<br/>');
    options = '<div class="preview-q-options">' + opts + '</div>';
  }
  let correctStr = '';
  if (q.type === 'single_choice' && q.options && q.options.length) {
    const idx = Array.isArray(q.correct) ? q.correct[0] : q.correct;
    if (idx >= 0 && idx < q.options.length) correctStr = '正确答案：' + LETTERS[idx] + ') ' + escapeHtml(q.options[idx]);
  } else if (q.type === 'multiple_choice' && q.options && Array.isArray(q.correct)) {
    const labels = q.correct.map(i => LETTERS[i] + ') ' + (q.options[i] ? escapeHtml(q.options[i]) : '')).filter(Boolean);
    correctStr = '正确答案：' + (labels.length ? labels.join('；') : escapeHtml(String(q.correct)));
  } else if ((q.type === 'fill_blank' || q.type === 'paragraph_fill_blank') && q.correct != null) {
    const arr = Array.isArray(q.correct) ? q.correct : [q.correct];
    correctStr = '正确答案：' + arr.map(c => Array.isArray(c) ? c.join(' / ') : escapeHtml(String(c))).join('；');
  }
  const correct = correctStr ? '<div class="preview-q-correct">' + correctStr + '</div>' : '';
  const explanation = (q.explanation && q.explanation.trim()) ? '<div class="preview-q-explanation">解析：' + escapeHtml(q.explanation.trim()) + '</div>' : '';
  return '<div class="preview-q"><div class="preview-q-head">' + head + '</div>' + stem + options + correct + explanation + '</div>';
}
function showPreviewQuestions(set) {
  if (!set || !set.questions || !set.questions.length) {
    showToast('本题集暂无题目，无法预览');
    return;
  }
  const titleEl = document.getElementById('preview-questions-title');
  const bodyEl = document.getElementById('preview-questions-body');
  if (titleEl) titleEl.textContent = '习题预览：' + (set.name || '未命名');
  if (bodyEl) bodyEl.innerHTML = set.questions.map((q, i) => formatQuestionForPreview(q, i)).join('');
  const prevOverlay = document.getElementById('preview-questions-overlay');
  prevOverlay.classList.add('show');
  setModalFocusTrap(prevOverlay);
}
function closePreviewQuestions() {
  clearModalFocusTrap();
  document.getElementById('preview-questions-overlay').classList.remove('show');
}
function saveEditSetModal() {
  if (_editingSetId == null) return;
  const nameEl = document.getElementById('edit-set-name');
  const textsEl = document.getElementById('edit-set-review-texts');
  const linksEl = document.getElementById('edit-set-review-links');
  const name = nameEl ? String(nameEl.value).trim() : '';
  if (!name) {
    showToast('请填写习题集名称');
    if (nameEl) nameEl.focus();
    return;
  }
  const reviewTexts = (textsEl && textsEl.value ? textsEl.value.trim().split(/\n/) : []).map(s => s.trim()).filter(s => s.length > 0);
  const linkLines = (linksEl && linksEl.value ? linksEl.value.trim().split(/\n/) : []).map(s => s.trim()).filter(s => s.length > 0);
  const reviewLinks = linkLines.map(s => (/^https?:\/\//i.test(s) || isLikelyUrl(s)) ? (/^https?:\/\//i.test(s) ? s : 'https://' + s) : s);
  const reviewImages = _editModalPastedImages.slice();
  const sets = getSavedSets();
  const folderEl = document.getElementById('edit-set-folder');
  const folderId = (folderEl && folderEl.value) ? folderEl.value : null;
  const updated = sets.map(s => String(s.id) === String(_editingSetId) ? Object.assign({}, s, { name: name, folderId: folderId || undefined, reviewTexts: reviewTexts, reviewLinks: reviewLinks, reviewImages: reviewImages }) : s);
  setSavedSets(updated);
  closeEditSetModal();
}
function exportFromEditModal() {
  if (_editingSetId == null) return;
  const sets = getSavedSets();
  const set = sets.find(s => String(s.id) === String(_editingSetId));
  if (!set || !set.questions) return;
  const name = (set.name || '习题集').replace(/[\\/:*?"<>|]/g, '_').slice(0, 50);
  const blob = new Blob([JSON.stringify(set.questions, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (name || 'export') + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
function appendToEditSetModal() {
  if (_editingSetId == null) return;
  const textEl = document.getElementById('edit-set-append-text');
  let text = textEl ? textEl.value.trim() : '';
  if (!text) {
    showToast('请先粘贴要追加的题目（JSON 或含题型/选项的文本）');
    if (textEl) textEl.focus();
    return;
  }
  text = normalizeJsonPaste(text);
  const appendBtn = document.getElementById('btn-edit-set-append');
  const origAppendText = appendBtn ? appendBtn.textContent : '';
  if (appendBtn) { appendBtn.disabled = true; appendBtn.textContent = '解析中…'; }
  let parsed = [];
  let appendParseError = '';
  if (/^\s*[\[{]/.test(text)) {
    try {
      const data = JSON.parse(text);
      parsed = Array.isArray(data) ? data : (data.questions || []);
    } catch (e) {
      appendParseError = (e && (e.message || String(e))) || '';
    }
  }
  if (parsed.length === 0) parsed = parsePastedText(text);
  if (appendBtn) { appendBtn.disabled = false; appendBtn.textContent = origAppendText; }
  if (parsed.length === 0) {
    showToast(appendParseError ? 'JSON 解析失败：' + appendParseError : '未能解析出题目，请检查格式');
    return;
  }
  const sets = getSavedSets();
  const set = sets.find(s => String(s.id) === String(_editingSetId));
  if (!set || !Array.isArray(set.questions)) return;
  const existingFps = new Set(set.questions.map(q => wrongBookItemId(q)));
  const toAdd = [];
  let dupCount = 0;
  for (let i = 0; i < parsed.length; i++) {
    const fp = wrongBookItemId(parsed[i]);
    if (existingFps.has(fp)) dupCount++; else { existingFps.add(fp); toAdd.push(parsed[i]); }
  }
  const newQuestions = set.questions.concat(toAdd);
  const updated = sets.map(s => String(s.id) === String(_editingSetId) ? Object.assign({}, s, { questions: newQuestions }) : s);
  setSavedSets(updated);
  const metaEl = document.getElementById('edit-set-meta');
  if (metaEl) metaEl.textContent = newQuestions.length + ' 题 · 练习 ' + (set.practiceCount || 0) + ' 次';
  if (textEl) textEl.value = '';
  showToast('已追加 ' + toAdd.length + ' 题' + (dupCount ? '，跳过 ' + dupCount + ' 道重复' : '') + '，当前共 ' + newQuestions.length + ' 题');
}
function deleteFromEditModal() {
  if (_editingSetId == null) return;
  if (!confirm('确定删除该习题集？删除后无法恢复。')) return;
  const sets = getSavedSets().filter(s => String(s.id) !== String(_editingSetId));
  setSavedSets(sets);
  closeEditSetModal();
}

