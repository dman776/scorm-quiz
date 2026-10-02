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
import { makeSortable, moveIndex } from '../../../packages/scorm-runtime/src/sortable.js';
import { blankQuestion, convertQuestion } from './convert-question.js';

// The server that serves this page also serves the API.
const API = location.protocol.startsWith('http') ? '' : 'http://localhost:4000';
const SERVER_DOWN = 'Could not reach the server. Start it with: npm start';
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const nanoid = (n = 6) => Array.from({ length: n }, () => ALPHABET[(Math.random() * ALPHABET.length) | 0]).join('');
const uid = (p) => `${p}-${nanoid(6)}`;

const draft = load();
let model = draft || blankQuiz();
/** True when the editor holds changes the library does not have. */
let dirty = draft ? localStorage.getItem('sqb-dirty') === '1' : false;
/**
 * Library file (name without .json, in data/quizzes) the editor saves to, or
 * null if this quiz has never been saved; Save then creates a new file.
 * Drafts from before this was tracked were saved under their quiz id.
 */
let libraryFile = draft ? (localStorage.getItem('sqb-file') ?? (draft.updatedAt ? draft.id : null)) : null;
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
    if (libraryFile) localStorage.setItem('sqb-file', libraryFile); else localStorage.removeItem('sqb-file');
  } catch { /* the library copy is unaffected */ }
}
function load() { try { return JSON.parse(localStorage.getItem('sqb-project') || 'null'); } catch { return null; } }
let saveTimer;
function touch() { setDirty(true); clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); }
function setDirty(d) {
  dirty = d;
  const pill = $('#save-state');
  pill.textContent = d ? 'Unsaved changes' : libraryFile ? 'Saved to library' : 'Not saved';
  pill.title = libraryFile ? `data/quizzes/${libraryFile}.json` : 'Not in the library yet; Save creates a new file';
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

function newQuestion(presetKey) { return blankQuestion(presetKey, uid('q')); }

function renderList() {
  const list = $('#q-list');
  list.innerHTML = '';
  if (model.questions.length === 0) list.append(el('p', { class: 'empty' }, 'No questions yet. Add one above, or Import Excel.'));
  model.questions.forEach((q, i) => {
    const item = el('li', { class: 'q-item' + (q.id === activeId ? ' active' : ''), onclick: () => { activeId = q.id; render(); } },
      el('span', { class: 'q-grip', 'aria-hidden': 'true', title: 'Drag to reorder' }, '\u2807\u2807'),
      el('div', { class: 'q-main' }, el('div', { class: 'q-kind' }, q.kind.replace('_', ' ')), el('div', { class: 'q-prompt' }, (q.prompt || '').slice(0, 40))),
      el('div', { class: 'q-move' },
        el('button', { 'aria-label': 'Move up', disabled: i === 0, onclick: (e) => { e.stopPropagation(); move(i, -1); } }, '\u2191'),
        el('button', { 'aria-label': 'Move down', disabled: i === model.questions.length - 1, onclick: (e) => { e.stopPropagation(); move(i, 1); } }, '\u2193')));
    list.append(item);
  });
}
/** Drag a question to a new position (the arrows remain the keyboard way). */
makeSortable(/** @type {HTMLElement} */ ($('#q-list')), {
  itemSelector: '.q-item', handleSelector: '.q-grip', scrollEl: /** @type {HTMLElement} */ ($('.app-left')),
  onReorder: (from, to) => { model.questions = moveIndex(model.questions, from, to); touch(); renderList(); },
});

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
    el('span', { class: 'inline' }, typePicker(q),
      el('button', { class: 'btn', title: 'Try just this question as a learner', onclick: () => openPreview(q) }, 'Preview this question'),
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
  else if (q.kind === 'drag_drop') c.append(dragDropEditor(q));
  if (q.kind === 'multiple_select' || (q.kind === 'hotspot' && q.multiple))
    c.append(field('Scoring strategy', selectInput(q.scoringStrategy || 'all_or_nothing',
      [['all_or_nothing', 'All or nothing'], ['partial', 'Partial credit'], ['weighted', 'Weighted (per-answer scores)']],
      (v) => { q.scoringStrategy = v; touch(); })));
  if (q.kind === 'drag_drop')
    c.append(field('Scoring strategy', selectInput(q.scoringStrategy || 'partial',
      [['partial', q.reuseItems ? 'Partial credit (per placement; a wrong placement cancels one)' : 'Partial credit (per item; a placed distractor cancels one)'], ['all_or_nothing', 'All or nothing']],
      (v) => { q.scoringStrategy = v; touch(); })));
  c.append(el('div', { class: 'row-2' },
    field('Correct feedback', textArea(q.correctFeedback, (v) => { q.correctFeedback = v; touch(); })),
    field('Incorrect feedback', textArea(q.incorrectFeedback, (v) => { q.incorrectFeedback = v; touch(); }))));
  c.append(field('Rationale', textArea(q.rationale, (v) => { q.rationale = v; touch(); })));
}

/** The KIND_PRESET key a question currently matches. */
function presetKeyOf(q) {
  if (q.kind === 'single_select' && q.presentation === 'single_pill') return 'single_select_pill';
  if (q.kind === 'multiple_select' && q.presentation === 'multi_pill') return 'multiple_select_pill';
  return q.kind;
}
/** Question type dropdown (same choices as the Add menu); changing it converts the question. */
function typePicker(q) {
  const current = presetKeyOf(q);
  const options = [...$('#add-kind').options].map((o) => el('option', { value: o.value, selected: o.value === current }, o.textContent));
  return el('select', { class: 'control type-picker', 'aria-label': 'Question type', title: 'Change the question type',
    onchange: (e) => changeType(q, e.target.value) }, ...options);
}
function changeType(q, presetKey) {
  const { question, dropped } = convertQuestion(q, presetKey);
  if (dropped.length && !confirm(`Changing the type will keep what it can, but this will be lost:\n\n- ${dropped.join('\n- ')}\n\nChange the type?`)) {
    renderEditor();
    return;
  }
  model.questions[model.questions.indexOf(q)] = question;
  touch(); render();
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
  const reorder = (from, to) => { q.correctOrder = moveIndex(q.correctOrder, from, to); touch(); renderEditor(); };
  const rows = el('div', { class: 'seq-rows' });
  q.correctOrder.forEach((id, i) => {
    const item = q.items.find((x) => x.id === id);
    const name = () => item.label || `item ${i + 1}`;
    rows.append(el('div', { class: 'opt-row seq-row' },
      el('span', { class: 'q-grip', 'aria-hidden': 'true', title: 'Drag to reorder' }, '\u2807\u2807'),
      el('input', { type: 'text', class: 'opt-label', value: item.label, placeholder: 'Item label', 'aria-label': `Item ${i + 1} label`, oninput: (e) => { item.label = e.target.value; touch(); } }),
      el('button', { 'aria-label': `Move ${name()} up`, disabled: i === 0, onclick: () => reorder(i, i - 1) }, '\u2191'),
      el('button', { 'aria-label': `Move ${name()} down`, disabled: i === q.correctOrder.length - 1, onclick: () => reorder(i, i + 1) }, '\u2193')));
  });
  // Drag by the grip or the row edge; presses inside the text field still edit it.
  makeSortable(rows, { itemSelector: '.seq-row', handleSelector: '.q-grip', onReorder: reorder });
  return el('div', { class: 'field' }, el('label', {}, 'Sequence items (top = first, drag or use the arrows to reorder)'), rows);
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
    onchange: (e) => { const f = e.target.files[0]; if (f) loadQuestionImage(q, f); e.target.value = ''; } });
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
  attachRectDraw(canvas, (r) => {
    const n = q.options.length + 1;
    q.options.push({ id: uid('hs').slice(0, 10), label: `Region ${n}`, correct: !q.options.some((o) => o.correct), rect: r });
    touch(); renderEditor();
  });
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

/** Embed an uploaded image as q.image (hotspot and drag-and-drop backgrounds). */
function loadQuestionImage(q, file) {
  if (file.size > MAX_HOTSPOT_IMAGE_BYTES) {
    alert(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB. Images are embedded in the SCORM package, so keep them under ${MAX_HOTSPOT_IMAGE_BYTES / 1024 / 1024}MB.`);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    q.image = { alt: '', ...(q.image || {}), src: String(reader.result) };
    const probe = new Image();
    probe.onload = () => { q.image.width = probe.naturalWidth; q.image.height = probe.naturalHeight; touch(); };
    probe.src = q.image.src;
    touch(); renderEditor();
  };
  reader.onerror = () => alert('Could not read that image file.');
  reader.readAsDataURL(file);
}

/** Drag a box on the image to create a normalized rect, handed to onRect. */
function attachRectDraw(canvas, onRect) {
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
    onRect(r);
  });
}
/**
 * Drag-and-drop editor: zones (plain boxes, or regions drawn on an optional
 * background image) and items, each accepting zero or more zones. An item
 * with no accepted zone is a distractor.
 */
function dragDropEditor(q) {
  q.zones = q.zones || [];
  q.items = q.items || [];
  const hasImage = !!(q.image && q.image.src);
  const wrap = el('div', { class: 'field' });
  const rerender = () => { touch(); renderEditor(); };
  const newZoneId = () => { let n = q.zones.length + 1; while (q.zones.some((z) => z.id === `z${n}`)) n++; return `z${n}`; };

  // Background image (optional).
  const picker = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml', class: 'sr-only',
    onchange: (e) => { const f = e.target.files[0]; if (f) loadQuestionImage(q, f); e.target.value = ''; } });
  wrap.append(el('label', {}, 'Background image (optional)'),
    el('div', { class: 'opt-row' },
      el('button', { class: 'btn', onclick: () => picker.click() }, hasImage ? 'Replace image' : 'Upload image'),
      hasImage ? el('button', { class: 'btn', onclick: () => { q.image = null; rerender(); } }, 'Remove image') : null,
      picker),
    el('p', { class: 'hint' }, hasImage
      ? 'Drag on the image to draw each drop zone. Zones must not overlap.'
      : 'Without an image, zones show as labeled boxes (good for sorting into categories).'));
  if (hasImage) {
    wrap.append(field('Image alt text', textInput(q.image.alt, (v) => { q.image.alt = v; touch(); }),
      'Describe the image for learners using a screen reader.'));
    const canvas = el('div', { class: 'hs-canvas' }, el('img', { class: 'hs-img', src: q.image.src, alt: q.image.alt || '', draggable: 'false' }));
    const pct = (n) => `${(n * 100).toFixed(4)}%`;
    q.zones.forEach((z, i) => {
      if (z.rect) canvas.append(el('div', { class: 'hs-rect',
        style: `left:${pct(z.rect.x)};top:${pct(z.rect.y)};width:${pct(z.rect.w)};height:${pct(z.rect.h)}` },
        el('span', { class: 'hs-rect-num' }, String(i + 1))));
    });
    attachRectDraw(canvas, (r) => {
      // Fill the first zone still missing a region, else add a new zone.
      const blank = q.zones.find((z) => !z.rect);
      if (blank) blank.rect = r;
      else q.zones.push({ id: newZoneId(), label: `Zone ${q.zones.length + 1}`, rect: r });
      rerender();
    });
    wrap.append(canvas);
  }

  // Zones.
  wrap.append(el('label', { class: 'dd-sub' }, 'Drop zones'));
  q.zones.forEach((z, i) => {
    wrap.append(el('div', { class: 'opt-row' },
      el('span', { class: 'hs-badge' }, String(i + 1)),
      el('input', { type: 'text', class: 'opt-label', value: z.label, placeholder: 'Zone label (always announced to screen readers)',
        'aria-label': `Zone ${i + 1} label`, oninput: (e) => { z.label = e.target.value; touch(); } }),
      el('input', { type: 'number', class: 'w-score', min: '1', step: '1', value: z.capacity ?? '', placeholder: 'any',
        title: 'Most items this zone can hold (blank = no limit)', 'aria-label': `Zone ${i + 1} capacity`,
        oninput: (e) => { const v = parseInt(e.target.value, 10); if (v >= 1) z.capacity = v; else delete z.capacity; touch(); } }),
      hasImage && !z.rect ? el('span', { class: 'hint' }, 'draw its region') : null,
      el('button', { class: 'del', 'aria-label': `Remove zone ${i + 1}`, onclick: () => {
        q.zones = q.zones.filter((x) => x !== z);
        q.items.forEach((it) => { it.zones = (it.zones || []).filter((zid) => zid !== z.id); });
        rerender();
      } }, '\u00d7')));
  });
  wrap.append(el('p', { class: 'hint' }, 'Capacity (right-hand box) limits how many items a zone holds; leave blank for no limit.'));
  if (!hasImage) wrap.append(el('button', { class: 'btn', onclick: () => { q.zones.push({ id: newZoneId(), label: `Zone ${q.zones.length + 1}` }); rerender(); } }, 'Add zone'));

  // Items.
  wrap.append(el('label', { class: 'dd-sub' }, 'Items to drag'));
  wrap.append(el('label', { class: 'inline' },
    el('input', { type: 'checkbox', checked: !!q.reuseItems, onchange: (e) => {
      if (e.target.checked) q.reuseItems = true; else delete q.reuseItems;
      rerender();
    } }),
    ' Items can be placed in more than one zone (each item must be in every zone ticked for it)'));
  q.items.forEach((it, i) => {
    it.zones = it.zones || [];
    wrap.append(el('div', { class: 'dd-item-row' },
      el('div', { class: 'opt-row' },
        el('input', { type: 'text', class: 'opt-label', value: it.label, placeholder: 'Item text',
          'aria-label': `Item ${i + 1} text`, oninput: (e) => { it.label = e.target.value; touch(); } }),
        el('button', { class: 'del', 'aria-label': `Remove item ${i + 1}`, onclick: () => { q.items = q.items.filter((x) => x !== it); rerender(); } }, '\u00d7')),
      el('div', { class: 'dd-accepts', role: 'group', 'aria-label': `Zones that accept item ${i + 1}` },
        el('span', { class: 'hint' }, q.reuseItems ? 'Must be in:' : 'Correct in:'),
        ...q.zones.map((z, zi) => el('label', { class: 'inline dd-zone-check' },
          el('input', { type: 'checkbox', checked: it.zones.includes(z.id), onchange: (e) => {
            it.zones = e.target.checked ? [...new Set([...it.zones, z.id])] : it.zones.filter((zid) => zid !== z.id);
            touch(); renderEditor();
          } }), ` ${zi + 1}. ${z.label || '(unnamed)'}`)),
        it.zones.length ? null : el('span', { class: 'badge' }, 'Distractor'))));
  });
  wrap.append(el('p', { class: 'hint' }, q.reuseItems
    ? 'Tick every zone the item belongs in; the learner must place it in all of them. For partial credit, each placement in a zone it does not belong in cancels one correct placement. An item with no zones ticked is a distractor.'
    : 'Tick every zone where an item counts as correct (any one of them will do). An item with no zones ticked is a distractor: it is correct to leave it in the bank.'));
  wrap.append(el('button', { class: 'btn', onclick: () => {
    let n = q.items.length + 1; while (q.items.some((x) => x.id === `i${n}`)) n++;
    q.items.push({ id: `i${n}`, label: `Item ${q.items.length + 1}`, zones: [] }); rerender();
  } }, 'Add item'));
  return wrap;
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

/** Preview the whole quiz, or only `question` (in its current, unsaved state). */
function openPreview(question) {
  const dlg = /** @type {HTMLDialogElement} */ ($('#preview-dialog'));
  const root = $('#preview-root');
  root.innerHTML = '';
  const assessment = JSON.parse(JSON.stringify(model));
  if (question && question.id) {
    assessment.questions = assessment.questions.filter((x) => x.id === question.id);
    assessment.settings = { ...assessment.settings, shuffleQuestions: false };
  }
  $('#preview-title').textContent = question && question.id ? 'Question preview' : 'Learner preview';
  // A fresh in-memory LMS per preview, so the author sees exactly what a real
  // LMS would be sent, including every cmi.interactions record.
  const lms = new MockLMS();
  const refresh = () => renderLmsPanel(lms);
  new AssessmentPlayer({ root, assessment, preview: true, api: lms,
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

function replaceModel(next, { isDirty, file = null }) {
  model = next;
  libraryFile = file;
  activeId = model.questions[0]?.id || null;
  setDirty(isDirty); save(); render();
}

/**
 * Save updates the file this quiz was opened from. A quiz not yet in the
 * library (new or imported) goes to a NEW file named after its title, so
 * saving never overwrites a different quiz.
 */
async function saveToLibrary() {
  try {
    const body = JSON.stringify(model);
    const headers = { 'Content-Type': 'application/json' };
    const saved = libraryFile
      ? await api(`/api/assessments/${encodeURIComponent(libraryFile)}`, { method: 'PUT', headers, body })
      : await api('/api/assessments', { method: 'POST', headers, body });
    model.updatedAt = saved.assessment.updatedAt;
    libraryFile = saved.file;
    setDirty(false); save();
    if (view === 'library') openLibrary();
  } catch (err) { alert('Save failed. ' + err.message); }
}

/** Save a copy as a new quiz (new title, new quiz id, new file); the copy stays open. */
async function saveAsCopy() {
  const title = prompt('Save a copy as (quiz title):', `${model.title || 'Untitled'} (copy)`);
  if (title == null || !title.trim()) return;
  model.title = model.lmsTitle = title.trim();
  model.id = uid('assessment');
  libraryFile = null;
  await saveToLibrary();
  render();
}

function newQuiz() {
  if (hasUnsaved() && !confirm('Start a new quiz? The current quiz has unsaved changes that will be lost.')) return;
  model = blankQuiz();
  libraryFile = null;
  activeId = null;
  setDirty(true); save(); render(); openSettings();
}

async function openFromLibrary(file) {
  if (file !== libraryFile && hasUnsaved() && !confirm('Open another quiz? The current quiz has unsaved changes that will be lost.')) return;
  try { replaceModel(await api(`/api/assessments/${encodeURIComponent(file)}`), { isDirty: false, file }); }
  catch (err) { alert('Could not open that quiz. ' + err.message); }
}

async function deleteFromLibrary(item) {
  if (!confirm(`Delete "${item.title || item.file}" (${item.file}.json) from the library? This cannot be undone.`)) return;
  try {
    await api(`/api/assessments/${encodeURIComponent(item.file)}`, { method: 'DELETE' });
    // Still open in the editor, but no longer saved anywhere.
    if (item.file === libraryFile) { libraryFile = null; setDirty(true); save(); }
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
    el('div', { class: 'card' }, el('h3', {}, 'Saved quizzes'),
      el('p', { class: 'hint lib-dir' }, 'Every .json file in data/quizzes/'), listEl)));

  let items;
  try { items = (await api('/api/assessments')).assessments; }
  catch (err) { listEl.replaceChildren(el('p', { class: 'issue error' }, err.message)); return; }
  if (view !== 'library') return;
  if (!items.length) { listEl.replaceChildren(el('p', { class: 'hint' }, 'No saved quizzes yet. Use Save in the top bar to add the current quiz.')); return; }
  listEl.replaceChildren(el('ul', { class: 'lib-items' }, items.map((it) => {
    const current = it.file === libraryFile;
    const n = it.questionCount;
    const modified = new Date(it.modifiedAt).toLocaleString();
    const meta = it.error ? [it.error] : [`v${it.version || '1.0'}`, `${n} question${n === 1 ? '' : 's'}`,
      `pass ${it.passingPercent}%`, `saved ${modified}`];
    return el('li', { class: 'lib-item' + (current ? ' current' : '') + (it.error ? ' broken' : '') },
      el('div', { class: 'lib-item-main' },
        el('div', { class: 'lib-name' }, it.title || (it.error ? it.file : 'Untitled'),
          current ? el('span', { class: 'badge', style: 'margin-left:8px' }, dirty ? 'Open, unsaved changes' : 'Open') : null),
        el('div', { class: 'lib-file' }, `${it.file}.json`),
        el('div', { class: 'lib-meta' }, meta.join(' \u00b7 '))),
      el('div', { class: 'lib-item-actions' },
        it.error ? null : el('button', { class: 'btn btn-small', onclick: () => openFromLibrary(it.file) }, 'Open'),
        el('button', { class: 'btn btn-small btn-danger', 'aria-label': `Delete ${it.file}.json`, onclick: () => deleteFromLibrary(it) }, 'Delete')));
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
$('#btn-save-as').addEventListener('click', saveAsCopy);
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveToLibrary(); }
});
$('#btn-validate').addEventListener('click', renderIssues);
$('#btn-preview').addEventListener('click', () => openPreview());
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
