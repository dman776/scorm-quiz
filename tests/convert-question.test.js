// @ts-check
/** Changing a question's type in the authoring UI keeps as much content as it can. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KIND_PRESET, blankQuestion, convertQuestion } from '../apps/web/src/convert-question.js';
import { validateAssessment } from '../packages/export-service/src/validate.js';

const IMG = { src: 'data:image/png;base64,iVBORw0KGgo=', alt: 'Diagram', width: 400, height: 200 };
const common = { prompt: 'Which?', points: 3, objective: 'obj', correctFeedback: 'yes', incorrectFeedback: 'no', rationale: 'because' };
const make = (key, over = {}) => ({ ...blankQuestion(key, 'q1'), ...common, ...over });

const hotspot = () => make('hotspot', { image: { ...IMG }, multiple: true, options: [
  { id: 'r1', label: 'Router', correct: true, rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
  { id: 'r2', label: 'Switch', correct: false, rect: { x: 0.5, y: 0.5, w: 0.2, h: 0.2 } }] });
const dragDrop = () => make('drag_drop', { image: { ...IMG },
  zones: [{ id: 'z1', label: 'Layer 3', rect: { x: 0, y: 0, w: 0.4, h: 0.4 } }, { id: 'z2', label: 'Layer 2', rect: { x: 0.5, y: 0.5, w: 0.4, h: 0.4 } }],
  items: [{ id: 'i1', label: 'Router', zones: ['z1'] }, { id: 'i2', label: 'Switch', zones: ['z2'] }, { id: 'i3', label: 'Hub', zones: [] }] });

const sources = [...Object.keys(KIND_PRESET).map((k) => [k, make(k)]), ['hotspot+image', hotspot()], ['drag_drop+image', dragDrop()]];

test('every type converts to every other type, keeping the common fields', () => {
  for (const [name, src] of sources) for (const key of Object.keys(KIND_PRESET)) {
    const { question: q } = convertQuestion(src, key);
    const at = `${name} -> ${key}`;
    assert.equal(q.kind, KIND_PRESET[key].kind, at);
    assert.equal(q.id, 'q1', at);
    for (const [k, v] of Object.entries(common)) assert.equal(q[k], v, `${at}: ${k}`);
    // Only expected gap: a hotspot made from a question without an image has no image or regions yet.
    const allowed = key === 'hotspot' && !src.image?.src ? ['NO_HOTSPOT_IMAGE', 'NO_OPTIONS', 'NO_CORRECT'] : [];
    const errors = validateAssessment({ title: 't', questions: [q] }).errors.filter((e) => !allowed.includes(e.code));
    assert.deepEqual(errors, [], at);
  }
});

test('the source question is not modified', () => {
  const src = hotspot();
  const before = JSON.stringify(src);
  convertQuestion(src, 'drag_drop');
  assert.equal(JSON.stringify(src), before);
});

test('same kind, different presentation keeps everything', () => {
  const src = make('multiple_select', { scoringStrategy: 'weighted', options: [{ id: 'a', label: 'A', correct: true, score: 2 }] });
  const { question, dropped } = convertQuestion(src, 'multiple_select_pill');
  assert.equal(question.presentation, 'multi_pill');
  assert.equal(question.scoringStrategy, 'weighted');
  assert.deepEqual(question.options, src.options);
  assert.deepEqual(dropped, []);
});

test('choice options carry over between single, multiple and short answer', () => {
  const multi = make('multiple_select', { scoringStrategy: 'partial', options: [
    { id: 'a', label: 'Paris', correct: true, score: 1 }, { id: 'b', label: 'Lyon' }, { id: 'c', label: 'Nice', correct: true }] });
  const single = convertQuestion(multi, 'single_select');
  assert.deepEqual(single.question.options.map((o) => [o.id, o.label, o.correct]), [['a', 'Paris', true], ['b', 'Lyon', false], ['c', 'Nice', false]]);
  assert.equal(single.question.options[0].score, 1);
  assert.ok(single.dropped.some((d) => /correct/.test(d)));
  const short = convertQuestion(multi, 'short_answer');
  assert.deepEqual(short.question.accepted, ['Paris', 'Nice']);
  assert.equal(convertQuestion(multi, 'hotspot').question.scoringStrategy, 'partial', 'strategy kept where allowed');
});

test('matching and drag and drop map pairs onto zones and back', () => {
  const m = make('matching', { pairs: [{ prompt: 'Router', match: 'L3' }, { prompt: 'Switch', match: 'L2' }, { prompt: 'Bridge', match: 'L2' }] });
  const { question: dd } = convertQuestion(m, 'drag_drop');
  assert.deepEqual(dd.zones.map((z) => z.label), ['L3', 'L2']);
  assert.deepEqual(dd.items.map((it) => [it.label, it.zones]), [['Router', ['z1']], ['Switch', ['z2']], ['Bridge', ['z2']]]);
  const { question: back, dropped } = convertQuestion(dd, 'matching');
  assert.deepEqual(back.pairs, m.pairs);
  assert.deepEqual(dropped, []);
});

test('hotspot regions and drag-and-drop zones keep the image and rects', () => {
  const { question: dd } = convertQuestion(hotspot(), 'drag_drop');
  assert.deepEqual(dd.image, IMG);
  assert.deepEqual(dd.zones.map((z) => [z.label, z.rect]), [['Router', { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }], ['Switch', { x: 0.5, y: 0.5, w: 0.2, h: 0.2 }]]);
  assert.deepEqual(dd.items.map((it) => [it.label, it.zones]), [['Router', ['r1']]]);
  const { question: hs } = convertQuestion(dragDrop(), 'hotspot');
  assert.deepEqual(hs.image, IMG);
  assert.equal(hs.multiple, true);
  assert.deepEqual(hs.options.map((o) => [o.label, o.correct]), [['Layer 3', true], ['Layer 2', true]]);
});

test('sequence keeps its items in order; numeric keeps a numeric answer', () => {
  const seq = make('sequence', { items: [{ id: 'x', label: 'B' }, { id: 'y', label: 'A' }], correctOrder: ['y', 'x'] });
  const { question: ms } = convertQuestion(seq, 'multiple_select');
  assert.deepEqual(ms.options.map((o) => o.label), ['A', 'B']);
  const { question: back } = convertQuestion(ms, 'sequence');
  assert.deepEqual(back.correctOrder.map((id) => back.items.find((i) => i.id === id).label), ['A', 'B']);
  const sa = make('short_answer', { accepted: ['42'] });
  assert.equal(convertQuestion(sa, 'numeric').question.exact, 42);
  assert.deepEqual(convertQuestion(make('numeric', { exact: 7.5 }), 'short_answer').question.accepted, ['7.5']);
});

test('lost content is reported so the author can confirm', () => {
  assert.ok(convertQuestion(hotspot(), 'single_select').dropped.includes('the image'));
  assert.ok(convertQuestion(make('numeric', { units: 'kg' }), 'short_answer').dropped.includes('the units'));
  assert.deepEqual(convertQuestion(make('single_select'), 'multiple_select').dropped, []);
});
