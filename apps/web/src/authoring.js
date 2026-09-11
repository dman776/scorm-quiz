// @ts-check
/**
 * Zero-build authoring application. Reuses the shared validate.js and player.js
 * so authoring, preview and export never diverge. SCORM export and Excel import
 * are delegated to the API server (which uses the shared engines).
 */
import { validateAssessment } from '../../../packages/export-service/src/validate.js';
import { AssessmentPlayer } from '../../../packages/scorm-runtime/src/player.js';
import { MAX_HOTSPOT_IMAGE_BYTES } from '../../../packages/engine/src/types.js';

const API = location.origin.startsWith('http') ? `${location.protocol}//${location.hostname}:4000` : 'http://localhost:4000';
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

let model = load() || blankQuiz();
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
function save() { localStorage.setItem('sqb-project', JSON.stringify(model)); setSaveState('Saved'); }
function load() { try { return JSON.parse(localStorage.getItem('sqb-project') || 'null'); } catch { return null; } }
let saveTimer;
function touch() { setSaveState('Saving...'); clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); }
function setSaveState(t) { $('#save-state').textContent = t; }

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

function renderEditor() {
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
  new AssessmentPlayer({ root, assessment: JSON.parse(JSON.stringify(model)), preview: true }).start();
  dlg.showModal();
}

async function exportScorm() {
  const { errors } = validateAssessment(model);
  if (errors.length) { alert(`Cannot export: ${errors.length} validation error(s). See the Validation panel.`); renderIssues(); return; }
  try {
    const res = await fetch(`${API}/api/assessments/${encodeURIComponent(model.id)}/export`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(model) });
    if (!res.ok) { alert('Export failed. Is the API server running on port 4000?'); return; }
    download(await res.blob(), `${model.id}_SCORM2004_4thEd.zip`);
  } catch (_e) { alert('Export failed. Start the API server: npm run server'); }
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
      model = data; activeId = model.questions[0]?.id || null; touch(); render();
    } catch { alert('Invalid or unsupported project file.'); }
  };
  reader.readAsText(file);
}

/* --------------------------- Excel import (new) --------------------------- */
async function importExcel(file) {
  const bytes = await file.arrayBuffer();
  try {
    const res = await fetch(`${API}/api/import-xlsx`, {
      method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.assessment) {
      alert('Excel import failed. ' + ((data && data.error) || 'Is the API server running on port 4000?'));
      return;
    }
    model = data.assessment;
    activeId = model.questions[0]?.id || null;
    touch(); render();
    const v = data.validation || { errors: [], warnings: [] };
    const n = model.questions.length;
    alert(`Imported ${n} question${n === 1 ? '' : 's'} from Excel.` +
      (v.errors.length ? `\n${v.errors.length} error(s) need attention.` : '') +
      (v.warnings.length ? `\n${v.warnings.length} warning(s).` : ''));
  } catch (_e) {
    alert('Excel import failed. Start the API server: npm run server');
  }
}

/* -------------------------------- New Quiz (new) -------------------------- */
function newQuiz() {
  if (model.questions.length && !confirm('Start a new quiz? This clears the current quiz from the editor. Export first if you want to keep it.')) return;
  model = blankQuiz();
  activeId = null;
  save(); render(); openSettings();
}

function render() { renderList(); renderEditor(); renderIssues(); }
$('#btn-add').addEventListener('click', () => { const q = newQuestion($('#add-kind').value); model.questions.push(q); activeId = q.id; touch(); render(); });
$('#btn-new').addEventListener('click', newQuiz);
$('#btn-validate').addEventListener('click', renderIssues);
$('#btn-preview').addEventListener('click', openPreview);
$('#btn-export').addEventListener('click', exportScorm);
$('#btn-settings').addEventListener('click', openSettings);
$('#btn-save-file').addEventListener('click', exportProjectJson);
$('#btn-load').addEventListener('click', () => $('#file-input').click());
$('#file-input').addEventListener('change', (e) => { if (e.target.files[0]) importProject(e.target.files[0]); e.target.value = ''; });
$('#btn-import-xlsx').addEventListener('click', () => $('#xlsx-input').click());
$('#xlsx-input').addEventListener('change', (e) => { if (e.target.files[0]) importExcel(e.target.files[0]); e.target.value = ''; });
$('#preview-close').addEventListener('click', () => /** @type {HTMLDialogElement} */ ($('#preview-dialog')).close());
window.addEventListener('beforeunload', save);
render();
