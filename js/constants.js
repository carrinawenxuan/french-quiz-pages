'use strict';
// ── Constants & Default Data ──

if (typeof performance !== 'undefined' && performance.mark) performance.mark('app-start');
const LETTERS = ['A', 'B', 'C', 'D'];
const WRONG_BOOK_KEY = 'french_quiz_wrong';
const SAVED_SETS_KEY = 'french_quiz_saved_sets';
const FOLDERS_KEY = 'french_quiz_folders';
const FOLDER_COLLAPSED_KEY = 'french_quiz_folder_collapsed';
const TIMER_SECONDS_KEY = 'french_quiz_timer_seconds';
const DAILY_STATS_KEY = 'french_quiz_daily_stats';
const RECENT_SESSIONS_KEY = 'french_quiz_recent_sessions';
const QUESTION_NOTES_KEY = 'french_quiz_question_notes';
const THEME_KEY = 'french_quiz_theme';
const DATA_FILE_NAME = 'french_quiz_data.json';
const IMPORT_PIN_HASH_KEY = 'french_quiz_import_pin_hash';
const IMPORT_ALLOWED_FINGERPRINT_KEY = 'french_quiz_import_allowed_device';
const RECENT_SESSIONS_MAX = 10;
const SAVED_SETS_DISPLAY_LIMIT = 30;
const SEQUENTIAL_MODE_THRESHOLD = 16;
const SCREEN = { HOME: 'screen-home', QUIZ: 'screen-quiz', RESULT: 'screen-result' };

const QUIZ_PROGRESS_KEY = 'french_quiz_progress';


const QUESTION_TYPES = { single_choice: '单选', multiple_choice: '多选', fill_blank: '填空', paragraph_fill_blank: '段落填空' };

const EBINGHAUS_INTERVALS = [1, 3, 7, 14, 30];

const DEFAULT_QUESTIONS = [
  { type: 'single_choice', stem: 'En ce moment, nous ______ un film intéressant.', options: ['voions', 'voyons', 'voyez', 'voient'], correct: 1, explanation: '【A2 拼写陷阱】Nous/Vous 变位时，词根 i 必须变为 y。Nous voyons 是唯一正确形式。', category: '直陈式现在时' },
  { type: 'single_choice', stem: 'Hier, est-ce que tu ______ tes amis ?', options: ['a vu', 'as vu', 'as vus', 'es vu'], correct: 1, explanation: '【A1 复合过去时】Tu 搭配助动词 avoir (as) + 过去分词 vu。此时没有宾语提前，vu 不配合，不用加 s。', category: '复合过去时' },
  { type: 'single_choice', stem: 'Les fleurs ? Oui, je les ai ______.', options: ['vu', 'vue', 'vus', 'vues'], correct: 3, explanation: '【B2 过去分词配合】核心考点！les 指代 les fleurs (阴性复数)，且放在了助动词 ai 之前。过去分词 vu 必须配合，加 es → vues。', category: '复合过去时' },
  { type: 'single_choice', stem: 'Demain, je ______ le médecin.', options: ['vais voir', 'vais vois', 'va voir', 'aller voir'], correct: 0, explanation: '【A1 最近将来时】结构：Aller (变位) +动词原形。Je vais + voir。', category: '最近将来时' },
  { type: 'single_choice', stem: 'Non, je ne ______ pas le voir ce soir.', options: ['vais', 'va', 'vois', 'ai'], correct: 0, explanation: '【A2 否定句结构】最近将来时的否定是 Ne + Aller + Pas + 原形。Je ne *vais* pas le voir。', category: '最近将来时' },
  { type: 'multiple_choice', stem: '下列哪些句子的变位形式在发音上完全相同（即 TCF 听力中的同音陷阱）？', options: ['Je vois', 'Tu vois', 'Il voit', 'Ils voient'], correct: [0, 1, 2, 3], explanation: '【A1 语音辨析】TCF 听力难点。vois, voit, voient 发音均为 /vwa/。只有上下文的主语能区分它们。', category: '直陈式现在时' },
  { type: 'multiple_choice', stem: '关于复合过去时 \'J\'ai vu\'，下列哪些说法是正确的？', options: ['助动词是 être', '助动词是 avoir', '过去分词是 vu', '过去分词是 voiré'], correct: [1, 2], explanation: '【A1 基础构成】Voir 的复合过去时由 Avoir + Vu 构成。', category: '复合过去时' },
  { type: 'multiple_choice', stem: '在最近将来时中，代词的位置哪里是正确的？', options: ['Je vais le voir.', 'Je le vais voir.', 'Nous allons les voir.', 'Nous les allons voir.'], correct: [0, 2], explanation: '【B1 代词位置】在最近将来时中，宾语代词（le, la, les, lui...）必须放在原形动词（voir）之前，不能放在 aller 之前。', category: '最近将来时' },
  { type: 'multiple_choice', stem: '选出下列句子中语法**错误**的选项：', options: ['Ils voyent la mer.', 'Nous voions la montagne.', 'Vous voyez le problème.', 'Elles voient le chat.'], correct: [0, 1], explanation: '【A2 拼写规则】Ils 后面应为 voient (i 不变 y)；Nous 后面应为 voyons (i 必须变 y)。', category: '直陈式现在时' },
  { type: 'multiple_choice', stem: '哪些时间标志词通常触发\'复合过去时\'？', options: ['Hier', 'La semaine dernière', 'Demain', 'Maintenant'], correct: [0, 1], explanation: '【A2 时间状语】Hier (昨天) 和 La semaine dernière (上周) 是过去时的典型标志。', category: '复合过去时' },
  { type: 'fill_blank', stem: 'Regarde ! Ils ______ (voir) un arc-en-ciel.', options: ['voient'], correct: ['voient'], explanation: '【A1 变位】Ils (复数第三人称) 变位为 voient。', category: '直陈式现在时' },
  { type: 'fill_blank', stem: 'C\'est la lettre que j\'ai ______ (voir).', options: ['vue'], correct: ['vue'], explanation: '【B2 配合】Que 指代 la lettre (阴性单数)，且在动词前，vu 需变成 vue。', category: '复合过去时' },
  { type: 'fill_blank', stem: 'Nous ______ (voir) que tu es fatigué.', options: ['voyons'], correct: ['voyons'], explanation: '【A2 拼写】Nous + voir = voyons (注意 y)。', category: '直陈式现在时' },
  { type: 'fill_blank', stem: 'Bientôt, on ______ (aller) voir le résultat.', options: ['va'], correct: ['va'], explanation: '【A1 最近将来时】On va voir。注意 On 的变位等同于 Il/Elle。', category: '最近将来时' },
  { type: 'fill_blank', stem: 'Où sont mes lunettes ? Je ne les ai pas ______ (voir).', options: ['vues'], correct: ['vues'], explanation: '【B2 配合+否定】Les 指代 lunettes (阴性复数)，放在 ai 之前，过去分词必须配合为 vues。否定词 ne...pas 不影响配合规则。', category: '复合过去时' },
  { type: 'paragraph_fill_blank', stem: 'Hier, j\'ai _____ un accident. Aujourd\'hui, je _____ que la police est là.', correct: ['vu', 'vois'], explanation: '【时态对比】第一空 Hier 触发复合过去时 (ai vu)；第二空 Aujourd\'hui 触发现在时 (vois)。', category: '时态综合' },
  { type: 'paragraph_fill_blank', stem: 'Tu _____ voir ce film demain ? Non, je l\'ai déjà _____.', correct: ['vas', 'vu'], explanation: '【语境辨析】第一空 Demain 触发最近将来时 (vas voir)；第二空 déjà 触发复合过去时。注意这里 le 指代 film (阳性)，所以 vu 不变。', category: '时态综合' },
  { type: 'paragraph_fill_blank', stem: 'Les photos ? Nous les _____ vues. Elles sont belles, vous _____ ?', correct: ['avons', 'voyez'], explanation: '【B2 助动词与变位】第一空：复合过去时助动词 nous avons (vues 已配合)；第二空：现在时 vous voyez (注意 y)。', category: '复合过去时 & 现在时' },
  { type: 'paragraph_fill_blank', stem: 'Elles _____ (voir) mal sans lunettes. Elles vont _____ (voir) le docteur.', correct: ['voient', 'voir'], explanation: '【形似词辨析】第一空是现在时变位 voient；第二空是最近将来时，Aller 后面必须跟原形 voir。', category: '直陈式现在时 & 最近将来时' },
  { type: 'paragraph_fill_blank', stem: 'C\'est la fille que tu as _____ ? Oui, je vais la _____ demain.', correct: ['vue', 'voir'], explanation: '【B2 综合难点】第一空：Que 指代 la fille (阴性)，as vue 需配合。第二空：最近将来时 la 放在原形 voir 之前。', category: '复合过去时 & 最近将来时' }
];

const TIMER_CIRCUMFERENCE = 2 * Math.PI * 17; // ~106.81

