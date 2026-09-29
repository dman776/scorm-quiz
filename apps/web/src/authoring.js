// @ts-check
/**
 * Zero-build authoring application. Reuses the shared validate.js and player.js
 * so authoring, preview and export never diverge. The library, SCORM export and
 * Excel import are delegated to the server (which uses the shared engines).
 *
 * The quiz being edited is kept as a local draft (localStorage) so a reload
 * never loses work; Save writes it to the server-side library.
 */
import { validateAssessment } from '../../../packages/export-service/src/validate.js';
import { AssessmentPlayer } from '../../../packages/scorm-runtime/src/player.js';
import { MAX_HOTSPOT_IMAGE_BYTES } from '../../../packages/engine/src/types.js';
import { MockLMS } from '../../../packages/mock-lms/mock-lms.js';

// The server that serves this page also serves the API.
const API = location.protocol.startsWith('http') ? '' : 'http://localhost:4000';
const SERVER_DOWN = 'Could not reach the server. Start it with: npm start';
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const nanoid = (n = 6) => Array.from({ length: n }, () => ALPHABET[(Math.random() * ALPHABET.length) | 0]).join('');
const uid = (p) => `${p}-${nanoid(6)}`;

const KIND_PRESET = {
  single_select: { kind: 'single_select', presentation: 'radio' },
  single_select_pill: { kind: 'single_select', presentation: 'single_pill' },
  multiple_select: { kind: 'multiple_select', presentation: 'checkbox', scoringStrategy: 'all_or_nothing' },
  multiple_select_pill: { kind: 'multiple_select', presentation: 'multi_pill', scoringStrategy: 'partial' },
  true_false: { kind: 'true_false' },
  single_checkbox: { kind: 'single_checkbox' },
  matching: { kind: 'matching', scoringStrategy: 'partial' },
  sequence: { kind: 'sequence', scoringStrategy: 'all_or_nothing' },
  numeric: { kind: 'numeric' },
  short_answer: { kind: 'short_answer' },
  hotspot: { kind: 'hotspot', multiple: false, scoringStrategy: 'all_or_nothing' },
};

const draft = load();
let model = draft || blankQuiz();
/** True when the editor holds changes the library does not have. */
let dirty = draft ? localStorage.getItem('sqb-dirty') === '1' : false;
let activeId = model.questions[0]?.id || null;

function blankQuiz() {
  return {
    schemaVersion: 1, id: uid('assessment'), title: 'New Assessment',
    lmsTitle: 'New Assessment', description: '', version: '1.0', author: '', language: 'en-US', status: 'draft',
    settings: {
      passingPercent: 80, maxAttempts: 2, scoreRetention: 'highest',
      shuffleQuestions: false, shuffleAnswers: false, seed: 12345, allowBackward: true, requireAnswer: false,
      passMessage: 'Congratulations, you passed.', failMessage: 'You did not reach the passing score.',
      results: { showScore: true, showPassFail: true, showCorrectCount: true, showCorrectAnswers: true, delayUntilFinalAttempt: true, showMissedOnly: false },
    },
    questions: [],
  };
}
/** Store the local draft. Failures (private mode, quota) only cost the draft. */
function save() {
  try {
    localStorage.setItem('sqb-project', JSON.stringify(model));
    localStorage.setItem('sqb-dirty', dirty ? '1' : '0');
  } catch { /* the library copy is unaffected */ }
}
function load() { try { return JSON.parse(localStorage.getItem('sqb-project') || 'null'); } catch { return null; } }
let saveTimer;
function touch() { setDirty(true); clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); }
function setDirty(d) {
  dirty = d;
  const pill = $('#save-state');
  // updatedAt is stamped by the server, so its absence means never saved.
  pill.textContent = d ? 'Unsaved changes' : model.updatedAt ? 'Saved to library' : 'Not saved';
  pill.classList.toggle('dirty', d);
}
/** Unsaved work worth warning about before it is replaced. */
function hasUnsaved() { return dirty && model.questions.length > 0; }

const $ = (s, r = document) => r.querySelector(s);
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v != null && v !== false) n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return n;
}
function newQuestion(presetKey) {
  const base = { id: uid('q'), points: 1, prompt: 'New question', objective: '', section: '',
    correctFeedback: '', incorrectFeedback: '', rationale: '', status: 'draft', ...KIND_PRESET[presetKey] };
  if (['single_select', 'multiple_select'].includes(base.kind))
    base.options = [{ id: 'a', label: 'Option A', correct: true }, { id: 'b', label: 'Option B' }, { id: 'c', label: 'Option C' }, { id: 'd', label: 'Option D' }];
  else if (base.kind === 'true_false') base.options = [{ id: 'true', label: 'True', correct: true }, { id: 'false', label: 'False' }];
  else if (base.kind === 'single_checkbox') base.options = [{ id: 'ack', label: 'I acknowledge the statement is true', correct: true }];
  else if (base.kind === 'matching') base.pairs = [{ prompt: 'Term 1', match: 'Def 1' }, { prompt: 'Term 2', match: 'Def 2' }];
  else if (base.kind === 'sequence') { base.items = [{ id: 's1', label: 'First' }, { id: 's2', label: 'Second' }, { id: 's3', label: 'Third' }]; base.correctOrder = ['s1', 's2', 's3']; }
  else if (base.kind === 'numeric') { base.exact = 0; base.tolerance = 0; base.units = ''; }
  else if (base.kind === 'short_answer') { base.accepted = ['answer']; base.caseSensitive = false; }
  else if (base.kind === 'hotspot') { base.image = { src: '', alt: '' }; base.options = []; }
  return base;
}

function renderList() {
  const list = $('#q-list');
  list.innerHTML = '';
  if (model.questions.length === 0) list.append(el('p', { class: 'empty' }, 'No questions yet. Add one above, or Import Excel.'));
  model.questions.forEach((q, i) => {
    const item = el('li', { class: 'q-item' + (q.id === activeId ? ' active' : ''), onclick: () => { activeId = q.id; render(); } },
      el('div', {}, el('div', { class: 'q-kind' }, q.kind.replace('_', ' ')), el('div', { class: 'q-prompt' }, (q.prompt || '').slice(0, 40))),
      el('div', { class: 'q-move' },
        el('button', { 'aria-label': 'Move up', disabled: i === 0, onclick: (e) => { e.stopPropagation(); move(i, -1); } }, '\u2191'),
        el('button', { 'aria-label': 'Move down', disabled: i === model.questions.length - 1, onclick: (e) => { e.stopPropagation(); move(i, 1); } }, '\u2193')));
    list.append(item);
  });
}
function move(i, d) {
  const j = i + d;
  if (j < 0 || j >= model.questions.length) return;
  [model.questions[i], model.questions[j]] = [model.questions[j], model.questions[i]];
  touch(); render();
}

function field(label, control, hint) { return el('div', { class: 'field' }, el('label', {}, label), control, hint ? el('div', { class: 'hint' }, hint) : null); }
function textInput(value, on, type = 'text') { return el('input', { type, value: value ?? '', oninput: (e) => on(type === 'number' ? parseFloat(e.target.value) : e.target.value) }); }
function textArea(value, on) { return el('textarea', { oninput: (e) => on(e.target.value) }, value || ''); }
function selectInput(value, options, on) { return el('select', { onchange: (e) => on(e.target.value) }, ...options.map(([v, l]) => el('option', { value: v, selected: v === value }, l))); }

/** What the center pane shows: 'question', 'settings' or 'library'. */
let view = 'question';

function renderEditor() {
  view = 'question';
  const c = $('#editor');
  c.innerHTML = '';
  const q = model.questions.find((x) => x.id === activeId);
  if (!q) { c.append(el('p', { class: 'empty' }, 'Select or add a question to begin editing.')); return; }
  c.append(el('div', { class: 'editor-head' }, el('h2', {}, 'Edit question'),
    el('span', { class: 'inline' }, el('span', { class: 'badge' }, q.kind.replace('_', ' ')),
      el('button', { class: 'btn', onclick: () => duplicate(q) }, 'Duplicate'),
      el('button', { class: 'btn', onclick: () => remove(q) }, 'Delete'))));
  c.append(field('Prompt', textArea(q.prompt, (v) => { q.prompt = v; touch(); renderList(); })));
  c.append(el('div', { class: 'row-2' },
    field('Points', textInput(q.points, (v) => { q.points = v || 0; touch(); }, 'number')),
    field('Learning objective', textInput(q.objective, (v) => { q.objective = v; touch(); }))));
  if (['single_select', 'multiple_select', 'true_false', 'single_checkbox'].includes(q.kind)) c.append(optionsEditor(q));
  else if (q.kind === 'matching') c.append(pairsEditor(q));
  else if (q.kind === 'sequence') c.append(sequenceEditor(q));
  else if (q.kind === 'numeric') c.append(numericEditor(q));
  else if (q.kind === 'short_answer') c.append(shortAnswerEditor(q));
  else if (q.kind === 'hotspot') c.append(hotspotEditor(q));
  if (q.kind === 'multiple_select' || (q.kind === 'hotspot' && q.multiple))
    c.append(field('Scoring strategy', selectInput(q.scoringStrategy || 'all_or_nothing',
      [['all_or_nothing', 'All or nothing'], ['partial', 'Partial credit'], ['weighted', 'Weighted (per-answer scores)']],
      (v) => { q.scoringStrategy = v; touch(); })));
  c.append(el('div', { class: 'row-2' },
    field('Correct feedback', textArea(q.correctFeedback, (v) => { q.correctFeedback = v; touch(); })),
    field('Incorrect feedback', textArea(q.incorrectFeedback, (v) => { q.incorrectFeedback = v; touch(); }))));
  c.append(field('Rationale', textArea(q.rationale, (v) => { q.rationale = v; touch(); })));
}

function optionsEditor(q) {
  const multi = q.kind === 'multiple_select';
  const wrap = el('div', { class: 'field' }, el('label', {}, 'Answer options'));
  q.options.forEach((o) => {
    wrap.append(el('div', { class: 'opt-row' },
      el('input', { type: multi ? 'checkbox' : 'radio', name: 'correct-' + q.id, checked: !!o.correct, 'aria-label': 'Correct',
        onchange: (e) => { if (!multi) q.options.forEach((x) => (x.correct = false)); o.correct = e.target.checked; touch(); } }),
      el('input', { type: 'text', class: 'opt-label', value: o.label, placeholder: 'Answer or distractor text',
        'aria-label': 'Answer or distractor text', oninput: (e) => { o.label = e.target.value; touch(); } }),
      el('input', { type: 'number', class: 'w-score', value: o.score ?? '', placeholder: 'score', 'aria-label': 'Option score',
        oninput: (e) => { o.score = e.target.value === '' ? undefined : parseFloat(e.target.value); touch(); } }),
      el('button', { class: 'del', 'aria-label': 'Remove option', onclick: () => { q.options = q.options.filter((x) => x !== o); touch(); renderEditor(); } }, '\u00d7')));
  });
  if (['single_select', 'multiple_select'].includes(q.kind))
    wrap.append(el('button', { class: 'btn', onclick: () => { q.options.push({ id: uid('o').slice(0, 8), label: 'New option' }); touch(); renderEditor(); } }, 'Add option'));
  return wrap;
}
function pairsEditor(q) {
  const wrap = el('div', { class: 'field' }, el('label', {}, 'Matching pairs'));
  q.pairs.forEach((p) => wrap.append(el('div', { class: 'opt-row' },
    el('input', { type: 'text', class: 'opt-label', value: p.prompt, placeholder: 'Prompt', 'aria-label': 'Prompt', oninput: (e) => { p.prompt = e.target.value; touch(); } }),
    el('span', {}, '\u2192'),
    el('input', { type: 'text', class: 'opt-label', value: p.match, placeholder: 'Match', 'aria-label': 'Match', oninput: (e) => { p.match = e.target.value; touch(); } }),
    el('button', { class: 'del', 'aria-label': 'Remove pair', onclick: () => { q.pairs = q.pairs.filter((x) => x !== p); touch(); renderEditor(); } }, '\u00d7'))));
  wrap.append(el('button', { class: 'btn', onclick: () => { q.pairs.push({ prompt: 'Term', match: 'Def' }); touch(); renderEditor(); } }, 'Add pair'));
  return wrap;
}
function sequenceEditor(q) {
  const wrap = el('div', { class: 'field' }, el('label', {}, 'Sequence items (top = first)'));
  q.correctOrder.forEach((id, i) => {
    const item = q.items.find((x) => x.id === id);
    wrap.append(el('div', { class: 'opt-row' },
      el('input', { type: 'text', class: 'opt-label', value: item.label, placeholder: 'Item label', 'aria-label': 'Item label', oninput: (e) => { item.label = e.target.value; touch(); } }),
      el('button', { 'aria-label': 'Up', disabled: i === 0, onclick: () => { [q.correctOrder[i], q.correctOrder[i - 1]] = [q.correctOrder[i - 1], q.correctOrder[i]]; touch(); renderEditor(); } }, '\u2191'),
      el('button', { 'aria-label': 'Down', disabled: i === q.correctOrder.length - 1, onclick: () => { [q.correctOrder[i], q.correctOrder[i + 1]] = [q.correctOrder[i + 1], q.correctOrder[i]]; touch(); renderEditor(); } }, '\u2193')));
  });
  return wrap;
}
function numericEditor(q) {
  return el('div', { class: 'row-2' },
    field('Exact value', textInput(q.exact, (v) => { q.exact = v; touch(); }, 'number')),
    field('Tolerance (\u00b1)', textInput(q.tolerance, (v) => { q.tolerance = v; touch(); }, 'number')));
}
function shortAnswerEditor(q) {
  const wrap = el('div', { class: 'field' }, el('label', {}, 'Accepted answers (one per line)'),
    el('textarea', { oninput: (e) => { q.accepted = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean); touch(); } }, (q.accepted || []).join('\n')));
  wrap.append(el('label', { class: 'inline' }, el('input', { type: 'checkbox', checked: !!q.caseSensitive, onchange: (e) => { q.caseSensitive = e.target.checked; touch(); } }), ' Case sensitive'));
  return wrap;
}

function hotspotEditor(q) {
  const wrap = el('div', { class: 'field' }, el('label', {}, 'Hotspot image and regions'));
  const picker = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml', class: 'sr-only',
    onchange: (e) => { const f = e.target.files[0]; if (f) loadHotspotImage(q, f); e.target.value = ''; } });
  wrap.append(el('div', { class: 'opt-row' },
    el('button', { class: 'btn', onclick: () => picker.click() }, q.image.src ? 'Replace image' : 'Upload image'),
    picker));

  if (!q.image.src) {
    wrap.append(el('p', { class: 'hint' }, 'Upload an image, then drag on it to draw each clickable region.'));
    return wrap;
  }

  wrap.append(field('Image alt text', textInput(q.image.alt, (v) => { q.image.alt = v; touch(); }),
    'Describe the image for learners using a screen reader.'));

  const canvas = el('div', { class: 'hs-canvas' });
  const img = el('img', { class: 'hs-img', src: q.image.src, alt: q.image.alt || '', draggable: 'false' });
  canvas.append(img);
  const pct = (n) => `${(n * 100).toFixed(4)}%`;
  q.options.forEach((o, i) => {
    canvas.append(el('div', { class: 'hs-rect' + (o.correct ? ' hs-correct' : ''),
      style: `left:${pct(o.rect.x)};top:${pct(o.rect.y)};width:${pct(o.rect.w)};height:${pct(o.rect.h)}` },
      el('span', { class: 'hs-rect-num' }, String(i + 1))));
  });
  attachHotspotDraw(q, canvas);
  wrap.append(canvas);
  wrap.append(el('p', { class: 'hint' }, 'Drag on the image to add a region. Regions are stored as fractions of the image, so they scale with it.'));

  q.options.forEach((o, i) => {
    wrap.append(el('div', { class: 'opt-row' },
      el('span', { class: 'hs-badge' }, String(i + 1)),
      el('label', { class: 'inline' },
        el('input', { type: q.multiple ? 'checkbox' : 'radio', name: 'hs-correct-' + q.id, checked: !!o.correct,
          onchange: (e) => { if (!q.multiple) q.options.forEach((x) => (x.correct = false)); o.correct = e.target.checked; touch(); renderEditor(); } }),
        ' Correct'),
      el('input', { type: 'text', class: 'opt-label', value: o.label, placeholder: 'Region label (read to screen readers)',
        'aria-label': 'Region label', oninput: (e) => { o.label = e.target.value; touch(); } }),
      el('input', { type: 'number', class: 'w-score', value: o.score ?? '', placeholder: 'score', 'aria-label': 'Region score',
        oninput: (e) => { o.score = e.target.value === '' ? undefined : parseFloat(e.target.value); touch(); } }),
      el('button', { class: 'del', 'aria-label': `Remove region ${i + 1}`,
        onclick: () => { q.options = q.options.filter((x) => x !== o); touch(); renderEditor(); } }, '×')));
  });
  if (!q.options.length) wrap.append(el('p', { class: 'hint' }, 'No regions yet. Drag on the image above to add one.'));

  wrap.append(el('label', { class: 'inline' },
    el('input', { type: 'checkbox', checked: !!q.multiple,
      onchange: (e) => {
        q.multiple = e.target.checked;
        if (!q.multiple) { let seen = false; for (const o of q.options) { if (o.correct && seen) o.correct = false; else if (o.correct) seen = true; } }
        touch(); renderEditor();
      } }),
    ' Allow the learner to select more than one region'));
  return wrap;
}

function loadHotspotImage(q, file) {
  if (file.size > MAX_HOTSPOT_IMAGE_BYTES) {
    alert(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB. Images are embedded in the SCORM package, so keep them under ${MAX_HOTSPOT_IMAGE_BYTES / 1024 / 1024}MB.`);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    q.image.src = String(reader.result);
    const probe = new Image();
    probe.onload = () => { q.image.width = probe.naturalWidth; q.image.height = probe.naturalHeight; touch(); };
    probe.src = q.image.src;
    touch(); renderEditor();
  };
  reader.onerror = () => alert('Could not read that image file.');
  reader.readAsDataURL(file);
}

/** Drag a box on the image to create a normalized hotspot rect. */
function attachHotspotDraw(q, canvas) {
  let start = null;
  let ghost = null;
  const at = (e) => {
    const b = canvas.getBoundingClientRect();
    return { x: clamp01((e.clientX - b.left) / b.width), y: clamp01((e.clientY - b.top) / b.height) };
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    start = at(e);
    ghost = el('div', { class: 'hs-rect hs-ghost' });
    canvas.append(ghost);
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!start || !ghost) return;
    const r = rectFrom(start, at(e));
    Object.assign(ghost.style, { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` });
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!start) return;
    const r = rectFrom(start, at(e));
    start = null;
    if (ghost) { ghost.remove(); ghost = null; }
    if (r.w < 0.01 || r.h < 0.01) return;
    const n = q.options.length + 1;
    q.options.push({ id: uid('hs').slice(0, 10), label: `Region ${n}`, correct: !q.options.some((o) => o.correct), rect: r });
    touch(); renderEditor();
  });
}
function clamp01(n) { return Math.max(0, Math.min(1, n)); }
function rectFrom(a, b) {
  return { x: round4(Math.min(a.x, b.x)), y: round4(Math.min(a.y, b.y)),
    w: round4(Math.abs(a.x - b.x)), h: round4(Math.abs(a.y - b.y)) };
}
function round4(n) { return Math.round(n * 1e4) / 1e4; }

function duplicate(q) {
  const copy = JSON.parse(JSON.stringify(q));
  copy.id = uid('q');
  model.questions.splice(model.questions.indexOf(q) + 1, 0, copy);
  activeId = copy.id; touch(); render();
}
function remove(q) {
  if (!confirm('Delete this question?')) return;
  model.questions = model.questions.filter((x) => x !== q);
  activeId = model.questions[0]?.id || null; touch(); render();
}

function renderIssues() {
  const panel = $('#issues');
  panel.innerHTML = '';
  panel.append(el('h2', { class: 'issues-head' }, 'Validation'));
  const { errors, warnings } = validateAssessment(model);
  if (!errors.length && !warnings.length) { panel.append(el('p', { class: 'empty' }, 'No issues found.')); return; }
  errors.forEach((e) => panel.append(el('div', { class: 'issue error' }, `Error: ${e.message}`)));
  warnings.forEach((w) => panel.append(el('div', { class: 'issue warn' }, `Warning: ${w.message}`)));
}

function openSettings() {
  activeId = null;
  view = 'settings';
  renderList();
  const c = $('#editor');
  c.innerHTML = '';
  const s = model.settings;
  c.append(el('h2', {}, 'Assessment settings'));
  c.append(field('Title', textInput(model.title, (v) => { model.title = v; model.lmsTitle = v; touch(); renderList(); })));
  c.append(field('Description', textArea(model.description, (v) => { model.description = v; touch(); })));
  c.append(el('div', { class: 'row-2' },
    field('Passing score (%)', textInput(s.passingPercent, (v) => { s.passingPercent = v; touch(); }, 'number')),
    field('Max attempts', textInput(s.maxAttempts, (v) => { s.maxAttempts = v; touch(); }, 'number'))));
  c.append(field('Score retention', selectInput(s.scoreRetention || 'highest', [['highest', 'Highest'], ['latest', 'Latest'], ['first', 'First']], (v) => { s.scoreRetention = v; touch(); })));
  c.append(el('div', { class: 'field' },
    el('label', { class: 'inline' }, el('input', { type: 'checkbox', checked: !!s.shuffleQuestions, onchange: (e) => { s.shuffleQuestions = e.target.checked; touch(); } }), ' Shuffle questions'),
    el('label', { class: 'inline' }, el('input', { type: 'checkbox', checked: !!s.shuffleAnswers, onchange: (e) => { s.shuffleAnswers = e.target.checked; touch(); } }), ' Shuffle answers')));
  const r = s.results;
  c.append(el('div', { class: 'field' }, el('label', {}, 'Results display'),
    ...[['showScore', 'Show score'], ['showPassFail', 'Show pass/fail'], ['showCorrectCount', 'Show number correct'],
      ['showCorrectAnswers', 'Show correct answers'], ['delayUntilFinalAttempt', 'Delay answers until final attempt'], ['showMissedOnly', 'Show missed only']]
      .map(([k, l]) => el('label', { class: 'inline' }, el('input', { type: 'checkbox', checked: !!r[k], onchange: (e) => { r[k] = e.target.checked; touch(); } }), ' ' + l))));
}

function openPreview() {
  const dlg = /** @type {HTMLDialogElement} */ ($('#preview-dialog'));
  const root = $('#preview-root');
  root.innerHTML = '';
  // A fresh in-memory LMS per preview, so the author sees exactly what a real
  // LMS would be sent, including every cmi.interactions record.
  const lms = new MockLMS();
  const refresh = () => renderLmsPanel(lms);
  new AssessmentPlayer({ root, assessment: JSON.parse(JSON.stringify(model)), preview: true, api: lms,
    logger: (e) => { if (e.fn === 'SetValue' || e.fn === 'Terminate') refresh(); } }).start();
  refresh();
  setLmsPanel(false); // off by default on every preview
  dlg.showModal();
}

function setLmsPanel(on) {
  /** @type {HTMLInputElement} */ ($('#preview-lms-toggle')).checked = on;
  $('#preview-lms').hidden = !on;
  $('#preview-body').classList.toggle('with-lms', on);
}

function renderLmsPanel(lms) {
  const body = $('#preview-lms-body');
  const v = (k) => lms.data[k] || '';
  const status = el('dl', { class: 'lms-status' },
    ...[['completion', 'cmi.completion_status'], ['success', 'cmi.success_status'], ['score.raw', 'cmi.score.raw'],
      ['score.max', 'cmi.score.max'], ['score.scaled', 'cmi.score.scaled']]
      .flatMap(([label, k]) => [el('dt', {}, label), el('dd', {}, v(k) || '\u2014')]));
  const items = lms.interactions.map((it, i) => el('div', { class: 'lms-ix' },
    el('div', { class: 'lms-ix-head' }, el('span', {}, `${i}. ${it.id} (${it.type})`), el('span', { class: it.result }, it.result || '')),
    el('div', {}, it.description || ''),
    el('div', {}, 'Answer: ', el('code', {}, it.learner_response || '(none)')),
    el('div', {}, 'Correct: ', el('code', {}, it.correct_responses || '')),
    el('div', { class: 'hint' }, `weighting ${it.weighting || ''} \u00b7 latency ${it.latency || ''}`)));
  const rejected = lms.errors.map((e) => el('div', { class: 'issue error' }, `Rejected ${e.el} = "${e.val}" (error ${e.code})`));
  body.replaceChildren(status, el('h4', {}, `cmi.interactions (${lms.interactions.length})`),
    items.length ? el('div', {}, items) : el('p', { class: 'hint' }, 'Each question is reported as the learner moves past it, and all of them on submit.'),
    ...rejected);
}

async function exportScorm() {
  const { errors } = validateAssessment(model);
  if (errors.length) { alert(`Cannot export: ${errors.length} validation error(s). See the Validation panel.`); renderIssues(); return; }
  try {
    const res = await fetch(`${API}/api/assessments/${encodeURIComponent(model.id)}/export`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(model) });
    if (!res.ok) { alert('Export failed. ' + SERVER_DOWN); return; }
    download(await res.blob(), `${model.id}_SCORM2004_4thEd.zip`);
  } catch (_e) { alert('Export failed. ' + SERVER_DOWN); }
}
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportProjectJson() { download(new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' }), `${model.id}.project.json`); }
function importProject(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      if (data.schemaVersion !== 1 || !Array.isArray(data.questions)) throw new Error('bad');
    } catch { alert('Invalid or unsupported project file.'); return; }
    if (hasUnsaved() && !confirm('Import this project? The current quiz has unsaved changes that will be lost.')) return;
    replaceModel(JSON.parse(String(reader.result)), { isDirty: true });
  };
  reader.readAsText(file);
}

/* --------------------------- Excel import (new) --------------------------- */
async function importExcel(file) {
  if (hasUnsaved() && !confirm('Import this workbook? The current quiz has unsaved changes that will be lost.')) return;
  const bytes = await file.arrayBuffer();
  try {
    const res = await fetch(`${API}/api/import-xlsx`, {
      method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.assessment) {
      alert('Excel import failed. ' + ((data && data.error) || SERVER_DOWN));
      return;
    }
    replaceModel(data.assessment, { isDirty: true });
    const v = data.validation || { errors: [], warnings: [] };
    const n = model.questions.length;
    alert(`Imported ${n} question${n === 1 ? '' : 's'} from Excel.` +
      (v.errors.length ? `\n${v.errors.length} error(s) need attention.` : '') +
      (v.warnings.length ? `\n${v.warnings.length} warning(s).` : ''));
  } catch (_e) {
    alert('Excel import failed. ' + SERVER_DOWN);
  }
}

/* --------------------------------- Library -------------------------------- */
async function api(pathname, init) {
  let res;
  try { res = await fetch(`${API}${pathname}`, init); } catch { throw new Error(SERVER_DOWN); }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

function replaceModel(next, { isDirty }) {
  model = next;
  activeId = model.questions[0]?.id || null;
  setDirty(isDirty); save(); render();
}

async function saveToLibrary() {
  try {
    const saved = await api(`/api/assessments/${encodeURIComponent(model.id)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(model) });
    model.updatedAt = saved.updatedAt;
    setDirty(false); save();
    if (view === 'library') openLibrary();
  } catch (err) { alert('Save failed. ' + err.message); }
}

function newQuiz() {
  if (hasUnsaved() && !confirm('Start a new quiz? The current quiz has unsaved changes that will be lost.')) return;
  model = blankQuiz();
  activeId = null;
  setDirty(true); save(); render(); openSettings();
}

async function openFromLibrary(id) {
  if (id !== model.id && hasUnsaved() && !confirm('Open another quiz? The current quiz has unsaved changes that will be lost.')) return;
  try { replaceModel(await api(`/api/assessments/${encodeURIComponent(id)}`), { isDirty: false }); }
  catch (err) { alert('Could not open that quiz. ' + err.message); }
}

async function deleteFromLibrary(item) {
  if (!confirm(`Delete "${item.title}" from the library? This cannot be undone.`)) return;
  try {
    await api(`/api/assessments/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
    // Still open in the editor, but no longer saved anywhere.
    if (item.id === model.id) setDirty(true);
    openLibrary();
  } catch (err) { alert('Delete failed. ' + err.message); }
}

async function openLibrary() {
  view = 'library';
  activeId = null;
  renderList();
  const c = $('#editor');
  c.innerHTML = '';
  const listEl = el('div', {}, el('p', { class: 'hint' }, 'Loading...'));
  const fileBtn = (label, accept, onFile) => {
    const input = el('input', { type: 'file', accept, class: 'sr-only',
      onchange: (e) => { if (e.target.files[0]) onFile(e.target.files[0]); e.target.value = ''; } });
    return [el('button', { class: 'btn', onclick: () => input.click() }, label), input];
  };
  c.append(el('div', { class: 'lib' },
    el('h2', {}, 'Library'),
    el('p', { class: 'lib-sub' }, 'Open a saved quiz, start a new one, or import from Excel or a project file.'),
    el('div', { class: 'card' }, el('h3', {}, 'Start'),
      el('div', { class: 'lib-actions' },
        el('button', { class: 'btn btn-primary', onclick: newQuiz }, '+ New quiz'),
        ...fileBtn('Import Excel (.xlsx)', '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', importExcel),
        ...fileBtn('Import project JSON', 'application/json,.json', importProject),
        el('button', { class: 'btn', onclick: exportProjectJson }, 'Export project JSON'),
        el('a', { class: 'btn btn-link', href: '../../examples/template.xlsx', download: '' }, 'Download Excel template'))),
    el('div', { class: 'card' }, el('h3', {}, 'Saved quizzes'), listEl)));

  let items;
  try { items = (await api('/api/assessments')).assessments; }
  catch (err) { listEl.replaceChildren(el('p', { class: 'issue error' }, err.message)); return; }
  if (view !== 'library') return;
  if (!items.length) { listEl.replaceChildren(el('p', { class: 'hint' }, 'No saved quizzes yet. Use Save in the top bar to add the current quiz.')); return; }
  listEl.replaceChildren(el('ul', { class: 'lib-items' }, items.map((it) => {
    const current = it.id === model.id;
    const n = it.questionCount;
    const updated = it.updatedAt ? new Date(it.updatedAt).toLocaleString() : '';
    return el('li', { class: 'lib-item' + (current ? ' current' : '') },
      el('div', { class: 'lib-item-main' },
        el('div', { class: 'lib-name' }, it.title || 'Untitled', current ? el('span', { class: 'badge', style: 'margin-left:8px' }, dirty ? 'Open, unsaved changes' : 'Open') : null),
        el('div', { class: 'lib-meta' }, [`v${it.version || '1.0'}`, `${n} question${n === 1 ? '' : 's'}`,
          `pass ${it.passingPercent}%`, updated && `saved ${updated}`].filter(Boolean).join(' \u00b7 '))),
      el('div', { class: 'lib-item-actions' },
        el('button', { class: 'btn btn-small', onclick: () => openFromLibrary(it.id) }, 'Open'),
        el('button', { class: 'btn btn-small btn-danger', 'aria-label': `Delete ${it.title}`, onclick: () => deleteFromLibrary(it) }, 'Delete')));
  })));
}

function render() { renderList(); renderEditor(); renderIssues(); }
async function showVersion() {
  try { $('#app-version').textContent = 'v' + (await api('/api/version')).version; }
  catch { /* the credit simply shows no version */ }
}
$('#btn-add').addEventListener('click', () => { const q = newQuestion($('#add-kind').value); model.questions.push(q); activeId = q.id; touch(); render(); });
$('#btn-library').addEventListener('click', openLibrary);
$('#btn-save').addEventListener('click', saveToLibrary);
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveToLibrary(); }
});
$('#btn-validate').addEventListener('click', renderIssues);
$('#btn-preview').addEventListener('click', openPreview);
$('#btn-export').addEventListener('click', exportScorm);
$('#btn-settings').addEventListener('click', openSettings);
$('#preview-lms-toggle').addEventListener('change', (e) => setLmsPanel(e.target.checked));
$('#preview-close').addEventListener('click', () => /** @type {HTMLDialogElement} */ ($('#preview-dialog')).close());
window.addEventListener('beforeunload', (e) => {
  save();
  if (hasUnsaved()) e.preventDefault();
});
setDirty(dirty);
render();
// First visit, or nothing to edit yet: start in the library.
if (!draft || (!model.questions.length && !dirty)) openLibrary();
showVersion();
