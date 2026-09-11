// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildResponsePatterns, buildInteractions, formatLatency, safeInteractionId } from '../packages/scorm-runtime/src/interactions.js';
import { serializeState, deserializeState, validateStateSize, seededShuffle } from '../packages/scorm-runtime/src/state.js';
import { generateManifest, xmlEscape, manifestId } from '../packages/export-service/src/manifest.js';
import { ScormAdapter } from '../packages/scorm-runtime/src/adapter.js';
import { MockLMS } from '../packages/mock-lms/mock-lms.js';
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
