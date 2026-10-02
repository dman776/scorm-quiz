// @ts-check
/** Drag-and-drop question type: scoring, SCORM reporting, validation, Excel import, packaging. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { scoreQuestion } from '../packages/engine/src/scoring.js';
import { buildResponsePatterns, buildInteraction } from '../packages/scorm-runtime/src/interactions.js';
import { ScormAdapter } from '../packages/scorm-runtime/src/adapter.js';
import { MockLMS } from '../packages/mock-lms/mock-lms.js';
import { validateAssessment } from '../packages/export-service/src/validate.js';
import { sheetsToAssessment } from '../packages/export-service/src/xlsx-import.js';
import { buildScormPackage, buildAnswerKey } from '../packages/export-service/src/package.js';

const dd = (over = {}) => ({
  id: 'dd1', kind: 'drag_drop', prompt: 'Place each device on its OSI layer.', points: 4, scoringStrategy: 'partial',
  correctFeedback: 'Yes', rationale: 'r', objective: 'OSI',
  zones: [{ id: 'z1', label: 'Network layer' }, { id: 'z2', label: 'Data link layer' }],
  items: [
    { id: 'i1', label: 'Router', zones: ['z1'] },
    { id: 'i2', label: 'Switch', zones: ['z2'] },
    { id: 'i3', label: 'Layer 3 switch', zones: ['z1', 'z2'] },
    { id: 'i4', label: 'Hub', zones: [] }, // distractor
  ],
  ...over,
});

test('all items in accepted zones and distractor left in the bank is correct', () => {
  const r = scoreQuestion(dd(), { i1: 'z1', i2: 'z2', i3: 'z2' });
  assert.equal(r.outcome, 'correct'); assert.equal(r.score, 4);
});
test('partial credit per item; a placed distractor cancels one correct item', () => {
  assert.equal(scoreQuestion(dd(), { i1: 'z1', i2: 'z1' }).score, round(4 / 3));
  const r = scoreQuestion(dd(), { i1: 'z1', i2: 'z2', i3: 'z1', i4: 'z1' });
  assert.equal(r.outcome, 'partial'); assert.equal(r.score, round(4 * 2 / 3));
});
test('all-or-nothing and unanswered', () => {
  const q = dd({ scoringStrategy: 'all_or_nothing' });
  assert.equal(scoreQuestion(q, { i1: 'z1', i2: 'z2' }).score, 0);
  assert.equal(scoreQuestion(q, {}).answered, false);
  assert.equal(scoreQuestion(q, { i1: 'gone' }).answered, false, 'placements in deleted zones are ignored');
});

test('reports as a readable matching interaction a strict LMS accepts', () => {
  const q = dd();
  const p = buildResponsePatterns(q, { i1: 'z1', i4: 'z2' });
  assert.equal(p.type, 'matching');
  assert.equal(p.learner, 'Router[.]Network_layer[,]Hub[.]Data_link_layer');
  assert.equal(p.correct, 'Router[.]Network_layer[,]Switch[.]Data_link_layer[,]Layer_3_switch[.]Network_layer');
  const lms = new MockLMS();
  const adapter = new ScormAdapter({ api: lms });
  adapter.initialize();
  adapter.writeInteraction(0, buildInteraction(q, { i1: 'z1', i4: 'z2' }, scoreQuestion(q, { i1: 'z1', i4: 'z2' })));
  assert.deepEqual(lms.errors, []);
  assert.equal(lms.GetValue('cmi.interactions.0.type'), 'matching');
});

test('validation: valid question has no drag-and-drop errors', () => {
  const { errors } = validateAssessment({ title: 't', questions: [dd()] });
  assert.deepEqual(errors, []);
});
test('validation: missing zones/items, distractor-only, bad refs, labels', () => {
  const codes = (q) => validateAssessment({ title: 't', questions: [q] }).errors.map((e) => e.code);
  assert.ok(codes(dd({ zones: [], items: [] })).includes('NO_DD_ZONES'));
  assert.ok(codes(dd({ items: [] })).includes('NO_DD_ITEMS'));
  assert.ok(codes(dd({ items: [{ id: 'a', label: 'x', zones: [] }] })).includes('NO_DD_CORRECT'));
  assert.ok(codes(dd({ items: [{ id: 'a', label: 'x', zones: ['nope'] }] })).includes('DD_BAD_REF'));
  assert.ok(codes(dd({ zones: [{ id: 'z1', label: ' ' }], items: [{ id: 'a', label: 'x', zones: ['z1'] }] })).includes('DD_ZONE_LABEL'));
});
test('validation: capacity must leave room for every correct item', () => {
  const codes = (q) => validateAssessment({ title: 't', questions: [q] }).errors.map((e) => e.code);
  const tight = { zones: [{ id: 'z1', label: 'A', capacity: 1 }, { id: 'z2', label: 'B' }] };
  // Two items only fit A; capacity 1 cannot hold both.
  assert.ok(codes(dd({ ...tight, items: [{ id: 'a', label: 'a', zones: ['z1'] }, { id: 'b', label: 'b', zones: ['z1'] }] })).includes('DD_CAPACITY'));
  // b may also go in B, so it fits.
  assert.ok(!codes(dd({ ...tight, items: [{ id: 'a', label: 'a', zones: ['z1'] }, { id: 'b', label: 'b', zones: ['z1', 'z2'] }] })).includes('DD_CAPACITY'));
  assert.ok(codes(dd({ zones: [{ id: 'z1', label: 'A', capacity: 0.5 }] })).includes('DD_BAD_CAPACITY'));
});
test('validation: image zones need valid, non-overlapping regions', () => {
  const image = { src: 'data:image/png;base64,AAAA', alt: 'diagram' };
  const codes = (zones) => validateAssessment({ title: 't', questions: [dd({ image, zones,
    items: [{ id: 'a', label: 'a', zones: ['z1'] }] })] }).errors.map((e) => e.code);
  assert.deepEqual(codes([{ id: 'z1', label: 'A', rect: { x: 0, y: 0, w: 0.5, h: 0.5 } },
    { id: 'z2', label: 'B', rect: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 } }]), []);
  assert.ok(codes([{ id: 'z1', label: 'A', rect: { x: 0, y: 0, w: 0.5, h: 0.5 } },
    { id: 'z2', label: 'B', rect: { x: 0.4, y: 0.4, w: 0.5, h: 0.5 } }]).includes('DD_OVERLAP'));
  assert.ok(codes([{ id: 'z1', label: 'A' }]).includes('BAD_DD_RECT'));
});

test('Excel import builds zones, multi-zone items, distractors and capacities', () => {
  const a = sheetsToAssessment({ sheets: { Questions: [['Type', 'Prompt', 'Options'],
    ['Drag and drop', 'Sort devices', 'Router=Network | L3 switch=Network ; Data Link | Hub= | =Session[2]']] } });
  const q = a.questions[0];
  assert.equal(q.kind, 'drag_drop'); assert.equal(q.scoringStrategy, 'partial');
  assert.deepEqual(q.zones, [{ id: 'z1', label: 'Network' }, { id: 'z2', label: 'Data Link' }, { id: 'z3', label: 'Session', capacity: 2 }]);
  assert.deepEqual(q.items.map((it) => it.zones), [['z1'], ['z1', 'z2'], []]);
  assert.deepEqual(validateAssessment(a).errors, []);
});

test('package ships the drag-and-drop runtime; answer key lists placements', async () => {
  const a = { schemaVersion: 1, id: 'dd-pkg', title: 'DD', settings: { passingPercent: 80 }, questions: [dd()] };
  const { zip } = await buildScormPackage({ assessment: a });
  const files = Object.keys((await JSZip.loadAsync(zip)).files);
  assert.ok(files.includes('runtime/scorm-runtime/src/dragdrop.js'));
  assert.ok(files.includes('runtime/scorm-runtime/src/sortable.js'));
  assert.match(buildAnswerKey(a), /Router -> Network layer; .*Layer 3 switch -> Network layer or Data link layer; Hub -> \(distractor/);
});

/* Reused items: an item can sit in several zones and must be in all of its zones. */
const reuse = (over = {}) => dd({ reuseItems: true,
  items: [
    { id: 'i1', label: 'Router', zones: ['z1'] },
    { id: 'i3', label: 'Layer 3 switch', zones: ['z1', 'z2'] },
    { id: 'i4', label: 'Hub', zones: [] }, // distractor
  ], ...over });

test('reused items: every required zone filled and nothing extra is correct', () => {
  const r = scoreQuestion(reuse(), { i1: ['z1'], i3: ['z1', 'z2'] });
  assert.equal(r.outcome, 'correct'); assert.equal(r.score, 4);
});
test('reused items: partial credit per placement; wrong placements cancel one each', () => {
  // 3 required placements; only one of the switch's two zones.
  assert.equal(scoreQuestion(reuse(), { i1: ['z1'], i3: ['z2'] }).score, round(4 * 2 / 3));
  // Everything everywhere: 3 right, 2 wrong (Router in z2, Hub in z1).
  const r = scoreQuestion(reuse(), { i1: ['z1', 'z2'], i3: ['z1', 'z2'], i4: ['z1'] });
  assert.equal(r.outcome, 'partial'); assert.equal(r.score, round(4 * 1 / 3));
  assert.equal(scoreQuestion(reuse({ scoringStrategy: 'all_or_nothing' }), { i1: ['z1'], i3: ['z1'] }).score, 0);
  assert.equal(scoreQuestion(reuse(), { i1: [] }).answered, false);
  assert.equal(scoreQuestion(reuse(), { i1: 'z1', i3: ['z1', 'z2'] }).outcome, 'correct', 'a single zone id is read too');
});
test('reused items: SCORM pattern lists every placement and every required pair', () => {
  const q = reuse();
  const p = buildResponsePatterns(q, { i1: ['z1'], i3: ['z1', 'z2'] });
  assert.equal(p.learner, 'Router[.]Network_layer[,]Layer_3_switch[.]Network_layer[,]Layer_3_switch[.]Data_link_layer');
  assert.equal(p.correct, p.learner);
  const lms = new MockLMS();
  const adapter = new ScormAdapter({ api: lms });
  adapter.initialize();
  adapter.writeInteraction(0, buildInteraction(q, { i3: ['z2'] }, scoreQuestion(q, { i3: ['z2'] })));
  assert.deepEqual(lms.errors, []);
});
test('reused items: each zone must have room for every item that belongs in it', () => {
  const codes = (q) => validateAssessment({ title: 't', questions: [q] }).errors.map((e) => e.code);
  const zones = [{ id: 'z1', label: 'A', capacity: 1 }, { id: 'z2', label: 'B' }];
  assert.ok(codes(reuse({ zones })).includes('DD_CAPACITY'), 'Router and the switch both belong in A');
  assert.deepEqual(codes(reuse({ zones: [{ id: 'z1', label: 'A', capacity: 2 }, { id: 'z2', label: 'B', capacity: 1 }] })), []);
});
test('reused items: Excel " + " requires every zone; "C++" stays a label', () => {
  const a = sheetsToAssessment({ sheets: { Questions: [['Type', 'Prompt', 'Options'],
    ['dnd', 'Sort', 'Router=Network | L3 switch=Network + Data Link | Hub='],
    ['dnd', 'Langs', 'Python=Scripting | Rust=C++ ; Systems']] } });
  const [q, q2] = a.questions;
  assert.equal(q.reuseItems, true);
  assert.deepEqual(q.items.map((it) => it.zones), [['z1'], ['z1', 'z2'], []]);
  assert.equal(q2.reuseItems, undefined);
  assert.deepEqual(q2.zones.map((z) => z.label), ['Scripting', 'C++', 'Systems']);
  assert.match(buildAnswerKey({ title: 't', questions: [q] }), /L3 switch -> Network and Data Link/);
});

function round(n) { return Math.round(n * 1e6) / 1e6; }
