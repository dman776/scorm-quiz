// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildResponsePatterns, buildInteractions, buildInteraction, formatLatency, safeInteractionId, labelIdentifier, responseIdentifiers } from '../packages/scorm-runtime/src/interactions.js';
import { scoreAssessment } from '../packages/engine/src/scoring.js';
import fs from 'node:fs';
import { serializeState, deserializeState, validateStateSize, seededShuffle } from '../packages/scorm-runtime/src/state.js';
import { generateManifest, xmlEscape, manifestId } from '../packages/export-service/src/manifest.js';
import { ScormAdapter } from '../packages/scorm-runtime/src/adapter.js';
import { MockLMS } from '../packages/mock-lms/mock-lms.js';
import { moveIndex } from '../packages/scorm-runtime/src/sortable.js';
import { QUESTION_KINDS } from '../packages/engine/src/types.js';

test('choice response patterns join with [,]', () => {
  const q = { id: 'q', kind: QUESTION_KINDS.MULTIPLE_SELECT, options: [{ id: 'a', correct: true }, { id: 'b', correct: true }, { id: 'c' }] };
  const p = buildResponsePatterns(q, ['a', 'b']);
  assert.equal(p.type, 'choice'); assert.equal(p.learner, 'a[,]b'); assert.equal(p.correct, 'a[,]b');
});
test('matching patterns use [.] and [,]', () => {
  const q = { id: 'q', kind: QUESTION_KINDS.MATCHING, pairs: [{ prompt: 'HTTPS', match: '443' }, { prompt: 'SSH', match: '22' }] };
  const p = buildResponsePatterns(q, { HTTPS: '443', SSH: '22' });
  assert.equal(p.type, 'matching'); assert.equal(p.correct, 'HTTPS[.]443[,]SSH[.]22');
});
test('numeric correct pattern is a range', () => {
  const p = buildResponsePatterns({ id: 'q', kind: QUESTION_KINDS.NUMERIC, exact: 254, tolerance: 0 }, 254);
  assert.equal(p.type, 'numeric'); assert.equal(p.correct, '254[:]254');
});
test('true-false pattern', () => {
  const q = { id: 'q', kind: QUESTION_KINDS.TRUE_FALSE, options: [{ id: 'true', label: 'True', correct: true }, { id: 'false', label: 'False' }] };
  const p = buildResponsePatterns(q, 'true');
  assert.equal(p.type, 'true-false'); assert.equal(p.learner, 'true'); assert.equal(p.correct, 'true');
});
test('formatLatency ISO 8601', () => {
  assert.equal(formatLatency(65.5), 'PT1M5.5S'); assert.equal(formatLatency(0), 'PT0S'); assert.equal(formatLatency(3661), 'PT1H1M1S');
});
test('safeInteractionId strips unsafe chars', () => { assert.equal(safeInteractionId('q 1/2:x'), 'q_1_2_x'); });
test('buildInteractions marks result', () => {
  const qs = [{ id: 'q1', kind: QUESTION_KINDS.SINGLE_SELECT, prompt: 'P', points: 1, options: [{ id: 'a', correct: true }, { id: 'b' }] }];
  const results = { q1: { questionId: 'q1', score: 1, max: 1, outcome: 'correct', answered: true } };
  const its = buildInteractions(qs, { q1: 'a' }, results, { q1: 5 });
  assert.equal(its[0].result, 'correct'); assert.equal(its[0].weighting, '1'); assert.equal(its[0].latency, 'PT5S');
});
test('state round-trips and reports size', () => {
  const st = { order: ['a', 'b'], answers: { a: 'x' }, flagged: ['b'], index: 1, submitted: false, attempt: 1, remainingTime: null, answerOrder: null };
  const s = serializeState(st);
  const back = deserializeState(s);
  assert.deepEqual(back.order, ['a', 'b']); assert.equal(back.index, 1); assert.equal(validateStateSize(s).ok, true);
});
test('seededShuffle deterministic', () => {
  assert.deepEqual(seededShuffle([1, 2, 3, 4, 5], 42), seededShuffle([1, 2, 3, 4, 5], 42));
});
test('manifest has 2004 4th Edition metadata and escapes title', () => {
  const m = generateManifest({ identifier: 'x', title: 'A & B <quiz>', version: '1.0', launch: 'index.html', files: ['index.html'], masteryScaled: 0.8 });
  assert.match(m, /2004 4th Edition/); assert.match(m, /adlcp:scormType="sco"/);
  assert.match(m, /A &amp; B &lt;quiz&gt;/); assert.match(m, /minNormalizedMeasure>0\.8000/);
});
test('xmlEscape and manifestId', () => {
  assert.equal(xmlEscape(`<a>&"'`), '&lt;a&gt;&amp;&quot;&apos;'); assert.equal(manifestId('9 bad id!'), 'ID_9_bad_id_');
});
test('adapter writes through mock LMS and survives forced fault', () => {
  const lms = new MockLMS({ faults: { SetValue: 'cmi.score.raw' } });
  const adapter = new ScormAdapter({ api: lms });
  assert.equal(adapter.initialize(), true);
  assert.equal(adapter.setValue('cmi.completion_status', 'completed'), true);
  assert.equal(adapter.setValue('cmi.score.raw', '5'), false);
  adapter.writeInteractions([{ id: 'q1', type: 'choice', timestamp: '2026-01-01T00:00:00Z', weighting: '1',
    correct_response: 'a', learner_response: 'a', result: 'correct', latency: 'PT3S', description: 'p' }]);
  assert.equal(lms.GetValue('cmi.completion_status'), 'completed');
  assert.equal(lms.GetValue('cmi.interactions.0.id'), 'q1');
  assert.equal(lms.GetValue('cmi.interactions.0.result'), 'correct');
  assert.equal(adapter.terminate(), true);
});
test('adapter standalone with no API', () => {
  const adapter = new ScormAdapter({ api: null });
  assert.equal(adapter.standalone, true);
  assert.equal(adapter.initialize(), false);
  assert.equal(adapter.setValue('cmi.location', '1'), false);
});

test('hotspot reports as a choice interaction', () => {
  const q = { id: 'q', kind: QUESTION_KINDS.HOTSPOT, multiple: true,
    options: [{ id: 'h1', correct: true }, { id: 'h2', correct: true }, { id: 'h3' }] };
  const p = buildResponsePatterns(q, ['h1', 'h3']);
  assert.equal(p.type, 'choice');
  assert.equal(p.learner, 'h1[,]h3');
  assert.equal(p.correct, 'h1[,]h2');
});

test('choice responses report readable answer text, not option ids', () => {
  const q = { id: 'q', kind: QUESTION_KINDS.MULTIPLE_SELECT, options: [
    { id: 'a', label: 'Physical layer', correct: true }, { id: 'b', label: 'Transport (L4)', correct: true }, { id: 'c', label: 'Kernel' }] };
  const p = buildResponsePatterns(q, ['a', 'c']);
  assert.equal(p.learner, 'Physical_layer[,]Kernel');
  assert.equal(p.correct, 'Physical_layer[,]Transport_L4');
});
test('duplicate and blank labels still get distinct identifiers', () => {
  assert.deepEqual(responseIdentifiers([{ id: 'a', label: 'Yes' }, { id: 'b', label: 'yes!' }, { id: 'c', label: 'Yes' }, { id: 'd', label: '  ' }]),
    { a: 'Yes', b: 'yes', c: 'Yes_2', d: 'd' });
  assert.equal(labelIdentifier('x'.repeat(100), 'f').length, 64);
});
test('sequence reports item labels in order', () => {
  const q = { id: 'q', kind: QUESTION_KINDS.SEQUENCE, items: [{ id: 's1', label: 'Plan' }, { id: 's2', label: 'Do' }], correctOrder: ['s1', 's2'] };
  const p = buildResponsePatterns(q, ['s2', 's1']);
  assert.equal(p.learner, 'Do[,]Plan'); assert.equal(p.correct, 'Plan[,]Do');
});
test('unanswered is neutral mid-attempt and incorrect once submitted', () => {
  const q = { id: 'q1', kind: QUESTION_KINDS.SINGLE_SELECT, prompt: 'P', points: 1, objective: 'Know topologies', options: [{ id: 'a', correct: true }] };
  const r = { questionId: 'q1', score: 0, max: 1, outcome: 'unanswered', answered: false };
  assert.equal(buildInteraction(q, undefined, r, 0, false).result, 'neutral');
  const fin = buildInteraction(q, undefined, r, 0, true);
  assert.equal(fin.result, 'incorrect'); assert.equal(fin.learner_response, ''); assert.equal(fin.objective, 'Know_topologies');
});
test('every demo question writes a valid interaction to a strict LMS', () => {
  const a = JSON.parse(fs.readFileSync(new URL('../examples/demo-assessment.json', import.meta.url), 'utf8'));
  const responses = { 'q1-topology': 'b', 'q3-osi': ['phys', 'app'], 'q5-poe': 'true', 'q6-match-ports': { HTTPS: '443', SSH: '53' },
    'q7-seq-osi': ['l2', 'l1', 'l3', 'l4'], 'q8-subnet': 254, 'q9-shortanswer': 'nat' };
  const scored = scoreAssessment(a.questions, responses, { passingPercent: 80 });
  const byId = Object.fromEntries(scored.results.map((r) => [r.questionId, r]));
  const lms = new MockLMS();
  const adapter = new ScormAdapter({ api: lms });
  adapter.initialize();
  adapter.writeInteractions(buildInteractions(a.questions, responses, byId, {}));
  assert.deepEqual(lms.errors, []);
  assert.equal(lms.GetValue('cmi.interactions._count'), String(a.questions.length));
  assert.equal(lms.GetValue('cmi.interactions.0.learner_response'), 'Each_device_connects_to_two_neighbors_in_a_closed_loop');
  assert.equal(lms.GetValue('cmi.interactions.0.result'), 'incorrect');
  assert.equal(lms.GetValue('cmi.interactions.0.description'), a.questions[0].prompt);
});
test('strict mock LMS rejects gaps, missing dependencies and bad patterns', () => {
  const lms = new MockLMS();
  lms.Initialize('');
  assert.equal(lms.SetValue('cmi.interactions.1.id', 'q2'), 'false'); assert.equal(lms.GetLastError(), '351');
  assert.equal(lms.SetValue('cmi.interactions.0.learner_response', 'a'), 'false'); assert.equal(lms.GetLastError(), '408');
  lms.SetValue('cmi.interactions.0.id', 'q1');
  assert.equal(lms.SetValue('cmi.interactions.0.learner_response', 'a'), 'false'); assert.equal(lms.GetLastError(), '408');
  lms.SetValue('cmi.interactions.0.type', 'choice');
  assert.equal(lms.SetValue('cmi.interactions.0.learner_response', 'has space'), 'false'); assert.equal(lms.GetLastError(), '406');
  assert.equal(lms.SetValue('cmi.interactions.0.learner_response', 'a[,]b'), 'true');
  assert.equal(lms.SetValue('cmi.interactions.0.result', 'partial'), 'false');
});
test('interaction index map survives suspend/resume', () => {
  const st = { order: ['a'], answers: {}, flagged: [], index: 0, submitted: false, attempt: 1, remainingTime: null, answerOrder: null, interactionIndex: { a: 0 } };
  assert.deepEqual(deserializeState(serializeState(st)).interactionIndex, { a: 0 });
});

test('moveIndex moves one element without mutating the input', () => {
  const a = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveIndex(a, 3, 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(moveIndex(a, 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(a, ['a', 'b', 'c', 'd']);
});
