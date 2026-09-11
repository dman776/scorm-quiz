// @ts-check
/** Assessment validation. Returns blocking errors and non-blocking warnings. */
import { QUESTION_KINDS } from '../../engine/src/types.js';
import { maxQuestionScore } from '../../engine/src/scoring.js';

export function validateAssessment(a) {
  const errors = [];
  const warnings = [];
  const push = (arr, code, message, questionId) => arr.push({ code, message, questionId });

  if (!a.title || !a.title.trim()) push(errors, 'NO_TITLE', 'Assessment title is required.');
  if (!Array.isArray(a.questions) || a.questions.length === 0)
    push(errors, 'NO_QUESTIONS', 'Assessment must contain at least one question.');

  const ids = new Set();
  for (const q of a.questions || []) {
    if (ids.has(q.id)) push(errors, 'DUP_ID', `Duplicate question id: ${q.id}`, q.id);
    ids.add(q.id);
    const choiceKinds = [QUESTION_KINDS.SINGLE_SELECT, QUESTION_KINDS.MULTIPLE_SELECT,
      QUESTION_KINDS.TRUE_FALSE, QUESTION_KINDS.SINGLE_CHECKBOX];
    if (choiceKinds.includes(q.kind)) {
      if (!Array.isArray(q.options) || q.options.length === 0)
        push(errors, 'NO_OPTIONS', `Question ${q.id} has no answer options.`, q.id);
      else if (!q.options.some((o) => o.correct) && !q.options.some((o) => typeof o.score === 'number'))
        push(errors, 'NO_CORRECT', `Question ${q.id} has no correct answer or scores.`, q.id);
      if (Array.isArray(q.options) && q.options.length > 8)
        push(warnings, 'MANY_OPTIONS', `Question ${q.id} has more than 8 options.`, q.id);
    }
    if (q.kind === QUESTION_KINDS.MATCHING && (!q.pairs || q.pairs.length === 0))
      push(errors, 'NO_PAIRS', `Matching question ${q.id} has no pairs.`, q.id);
    if (q.kind === QUESTION_KINDS.SEQUENCE && (!q.correctOrder || !q.items))
      push(errors, 'NO_SEQ', `Sequence question ${q.id} is missing items or order.`, q.id);
    if (q.kind === QUESTION_KINDS.NUMERIC && typeof q.exact !== 'number' &&
        !(typeof q.min === 'number' && typeof q.max === 'number'))
      push(errors, 'NO_NUMERIC_KEY', `Numeric question ${q.id} needs an exact value or range.`, q.id);
    if (q.kind === QUESTION_KINDS.SHORT_ANSWER && (!q.accepted || q.accepted.length === 0))
      push(errors, 'NO_ACCEPTED', `Short answer question ${q.id} has no accepted responses.`, q.id);
    if (typeof q.points !== 'number' || q.points < 0)
      push(errors, 'BAD_POINTS', `Question ${q.id} has invalid points.`, q.id);
    if (!q.correctFeedback && !q.incorrectFeedback)
      push(warnings, 'NO_FEEDBACK', `Question ${q.id} has no feedback.`, q.id);
    if (!q.rationale) push(warnings, 'NO_RATIONALE', `Question ${q.id} has no rationale.`, q.id);
    if (!q.objective) push(warnings, 'NO_OBJECTIVE', `Question ${q.id} has no learning objective.`, q.id);
    if (q.options && q.options.some((o) => typeof o.score === 'number' && o.score < 0) && !q.allowNegative)
      push(warnings, 'NEG_SCORE', `Question ${q.id} has negative option scores without allowNegative.`, q.id);
  }

  const settings = a.settings || {};
  const totalMax = (a.questions || []).reduce((s, q) => s + maxQuestionScore(q), 0);
  if (typeof settings.passingPoints === 'number' && settings.passingPoints > totalMax)
    push(errors, 'PASS_GT_MAX', 'Passing score exceeds maximum possible score.');
  if (settings.results && settings.results.showCorrectAnswers &&
      settings.results.delayUntilFinalAttempt && (!settings.maxAttempts || settings.maxAttempts <= 0))
    push(warnings, 'REVIEW_CONFLICT', 'Answer review is delayed until final attempt, but attempts are unlimited.');

  return { errors, warnings };
}
