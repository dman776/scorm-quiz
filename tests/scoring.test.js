// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreQuestion, scoreAssessment, maxQuestionScore } from '../packages/engine/src/scoring.js';
import { QUESTION_KINDS, SCORING_STRATEGY } from '../packages/engine/src/types.js';

test('single_select correct and incorrect', () => {
  const q = { id: 'q', kind: QUESTION_KINDS.SINGLE_SELECT, points: 2, options: [{ id: 'a', correct: true }, { id: 'b' }] };
  assert.equal(scoreQuestion(q, 'a').score, 2);
  assert.equal(scoreQuestion(q, 'a').outcome, 'correct');
  assert.equal(scoreQuestion(q, 'b').score, 0);
  assert.equal(scoreQuestion(q, undefined).outcome, 'unanswered');
});

test('single_select per-answer partial scores and clamp', () => {
  const q = { id: 'q', kind: QUESTION_KINDS.SINGLE_SELECT, points: 2,
    options: [{ id: 'a', correct: true, score: 2 }, { id: 'b', score: 1 }, { id: 'c', score: -1 }] };
  assert.equal(scoreQuestion(q, 'b').score, 1);
  assert.equal(scoreQuestion(q, 'b').outcome, 'partial');
  assert.equal(scoreQuestion(q, 'c').score, 0);
});

test('multiple_select all_or_nothing', () => {
  const q = { id: 'q', kind: QUESTION_KINDS.MULTIPLE_SELECT, points: 4, scoringStrategy: SCORING_STRATEGY.ALL_OR_NOTHING,
    options: [{ id: 'a', correct: true }, { id: 'b', correct: true }, { id: 'c' }] };
  assert.equal(scoreQuestion(q, ['a', 'b']).score, 4);
  assert.equal(scoreQuestion(q, ['a']).score, 0);
  assert.equal(scoreQuestion(q, ['a', 'b', 'c']).score, 0);
});

test('multiple_select partial with penalty floors at 0', () => {
  const q = { id: 'q', kind: QUESTION_KINDS.MULTIPLE_SELECT, points: 4, scoringStrategy: SCORING_STRATEGY.PARTIAL, incorrectPenalty: 2,
    options: [{ id: 'a', correct: true }, { id: 'b', correct: true }, { id: 'c' }, { id: 'd' }] };
  assert.equal(scoreQuestion(q, ['a', 'c']).score, 0);
  assert.equal(scoreQuestion(q, ['a', 'b']).score, 4);
  const r = scoreQuestion(q, ['a']);
  assert.equal(r.score, 2);
  assert.equal(r.outcome, 'partial');
});

test('multiple_select weighted uses per-answer scores', () => {
  const q = { id: 'q', kind: QUESTION_KINDS.MULTIPLE_SELECT, points: 3, scoringStrategy: SCORING_STRATEGY.WEIGHTED,
    options: [{ id: 'a', correct: true, score: 1.5 }, { id: 'b', correct: true, score: 1.5 }, { id: 'c', score: -1 }] };
  assert.equal(scoreQuestion(q, ['a', 'b']).score, 3);
  assert.equal(scoreQuestion(q, ['a', 'c']).score, 0.5);
});

test('matching partial credit', () => {
  const q = { id: 'q', kind: QUESTION_KINDS.MATCHING, points: 4, scoringStrategy: SCORING_STRATEGY.PARTIAL,
    pairs: [{ prompt: 'HTTPS', match: '443' }, { prompt: 'SSH', match: '22' }, { prompt: 'DNS', match: '53' }, { prompt: 'HTTP', match: '80' }] };
  assert.equal(scoreQuestion(q, { HTTPS: '443', SSH: '22', DNS: '53', HTTP: '80' }).score, 4);
  assert.equal(scoreQuestion(q, { HTTPS: '443', SSH: '22' }).score, 2);
});

test('sequence exact order all_or_nothing', () => {
  const q = { id: 'q', kind: QUESTION_KINDS.SEQUENCE, points: 3, scoringStrategy: SCORING_STRATEGY.ALL_OR_NOTHING,
    items: [{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }], correctOrder: ['l1', 'l2', 'l3'] };
  assert.equal(scoreQuestion(q, ['l1', 'l2', 'l3']).score, 3);
  assert.equal(scoreQuestion(q, ['l2', 'l1', 'l3']).score, 0);
});

test('numeric exact with tolerance and range', () => {
  const q1 = { id: 'q', kind: QUESTION_KINDS.NUMERIC, points: 2, exact: 254, tolerance: 0 };
  assert.equal(scoreQuestion(q1, 254).score, 2);
  assert.equal(scoreQuestion(q1, 253).score, 0);
  const q2 = { id: 'q', kind: QUESTION_KINDS.NUMERIC, points: 2, min: 10, max: 20 };
  assert.equal(scoreQuestion(q2, 15).score, 2);
  assert.equal(scoreQuestion(q2, 25).score, 0);
});

test('short_answer normalization and case-insensitive', () => {
  const q = { id: 'q', kind: QUESTION_KINDS.SHORT_ANSWER, points: 1, accepted: ['NAT'], caseSensitive: false };
  assert.equal(scoreQuestion(q, ' nat ').score, 1);
  assert.equal(scoreQuestion(q, 'DHCP').score, 0);
});

test('assessment aggregate', () => {
  const questions = [
    { id: 'a', kind: QUESTION_KINDS.SINGLE_SELECT, points: 2, options: [{ id: 'x', correct: true }, { id: 'y' }] },
    { id: 'b', kind: QUESTION_KINDS.NUMERIC, points: 2, exact: 10 },
  ];
  const s = scoreAssessment(questions, { a: 'x', b: 10 }, { passingPercent: 80 });
  assert.equal(s.raw, 4); assert.equal(s.max, 4); assert.equal(s.scaled, 1); assert.equal(s.percent, 100); assert.equal(s.passed, true);
  const s2 = scoreAssessment(questions, { a: 'y', b: 10 }, { passingPercent: 80 });
  assert.equal(s2.raw, 2); assert.equal(s2.percent, 50); assert.equal(s2.passed, false);
});

test('maxQuestionScore reflects weighted correct options', () => {
  const q = { id: 'q', kind: QUESTION_KINDS.MULTIPLE_SELECT, points: 3,
    options: [{ id: 'a', correct: true, score: 1.5 }, { id: 'b', correct: true, score: 1.5 }, { id: 'c', score: -1 }] };
  assert.equal(maxQuestionScore(q), 3);
});
