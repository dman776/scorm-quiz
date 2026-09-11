// @ts-check
/**
 * Deterministic scoring engine.
 * Pure functions, no I/O, no randomness. Shared by the authoring preview,
 * the packaged SCO runtime, and the unit tests so scores can never diverge.
 */
import { QUESTION_KINDS, SCORING_STRATEGY } from './types.js';

/**
 * @typedef {Object} QuestionResult
 * @property {string} questionId
 * @property {number} score
 * @property {number} max
 * @property {'correct'|'incorrect'|'partial'|'unanswered'} outcome
 * @property {boolean} answered
 */

const round2 = (n) => Math.round((n + Number.EPSILON) * 1e6) / 1e6;
const asArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

function clampQuestionScore(raw, max, allowNegative) {
  let s = raw;
  if (!allowNegative && s < 0) s = 0;
  if (s > max) s = max;
  return round2(s);
}

/** Max points a single question can yield (respects per-answer scores). */
export function maxQuestionScore(q) {
  if (Array.isArray(q.options) && q.options.some((o) => typeof o.score === 'number')) {
    if (q.kind === QUESTION_KINDS.MULTIPLE_SELECT) {
      return round2(
        q.options
          .filter((o) => o.correct && (o.score ?? 0) > 0)
          .reduce((a, o) => a + (o.score ?? 0), 0) || q.points,
      );
    }
    const best = Math.max(0, ...q.options.map((o) => (o.correct ? o.score ?? q.points : 0)));
    return round2(best || q.points);
  }
  return round2(q.points);
}

/**
 * Score one question against a learner response.
 * @returns {QuestionResult}
 */
export function scoreQuestion(q, response) {
  const max = maxQuestionScore(q);
  const allowNeg = !!q.allowNegative;
  const strategy = q.scoringStrategy || SCORING_STRATEGY.ALL_OR_NOTHING;

  const unanswered = () => ({
    questionId: q.id, score: 0, max,
    outcome: /** @type {const} */ ('unanswered'), answered: false,
  });

  switch (q.kind) {
    case QUESTION_KINDS.SINGLE_SELECT:
    case QUESTION_KINDS.TRUE_FALSE:
    case QUESTION_KINDS.SINGLE_CHECKBOX: {
      const picked = asArray(response)[0];
      if (picked == null || picked === '') return unanswered();
      const opt = (q.options || []).find((o) => o.id === picked);
      const correct = !!opt && !!opt.correct;
      const raw = typeof opt?.score === 'number' ? opt.score : correct ? max : 0;
      const score = clampQuestionScore(raw, max, allowNeg);
      return { questionId: q.id, score, max,
        outcome: correct ? 'correct' : score > 0 ? 'partial' : 'incorrect', answered: true };
    }

    case QUESTION_KINDS.MULTIPLE_SELECT: {
      const picks = asArray(response);
      if (picks.length === 0) return unanswered();
      const opts = q.options || [];
      const correctIds = new Set(opts.filter((o) => o.correct).map((o) => o.id));
      const pickedSet = new Set(picks);
      const exactMatch =
        correctIds.size === pickedSet.size && [...correctIds].every((id) => pickedSet.has(id));

      if (strategy === SCORING_STRATEGY.ALL_OR_NOTHING) {
        const score = exactMatch ? max : 0;
        return { questionId: q.id, score, max,
          outcome: exactMatch ? 'correct' : 'incorrect', answered: true };
      }

      let raw = 0;
      if (strategy === SCORING_STRATEGY.WEIGHTED) {
        for (const id of pickedSet) {
          const o = opts.find((x) => x.id === id);
          if (o) raw += typeof o.score === 'number' ? o.score : 0;
        }
      } else {
        const per = correctIds.size ? max / correctIds.size : 0;
        const penalty = typeof q.incorrectPenalty === 'number' ? q.incorrectPenalty : per;
        for (const id of pickedSet) {
          if (correctIds.has(id)) raw += per;
          else raw -= penalty;
        }
      }
      const score = clampQuestionScore(raw, max, allowNeg);
      const outcome = exactMatch ? 'correct' : score > 0 ? 'partial' : 'incorrect';
      return { questionId: q.id, score, max, outcome, answered: true };
    }

    case QUESTION_KINDS.MATCHING: {
      const pairs = q.pairs || [];
      const map = response && typeof response === 'object' ? response : {};
      if (Object.keys(map).length === 0) return unanswered();
      let correctCount = 0;
      for (const p of pairs) if (map[p.prompt] === p.match) correctCount++;
      const all = correctCount === pairs.length && pairs.length > 0;
      let score;
      if (strategy === SCORING_STRATEGY.ALL_OR_NOTHING) score = all ? max : 0;
      else score = clampQuestionScore(pairs.length ? (max * correctCount) / pairs.length : 0, max, allowNeg);
      return { questionId: q.id, score: round2(score), max,
        outcome: all ? 'correct' : score > 0 ? 'partial' : 'incorrect', answered: true };
    }

    case QUESTION_KINDS.SEQUENCE: {
      const order = asArray(response);
      if (order.length === 0) return unanswered();
      const target = q.correctOrder || [];
      const exact = order.length === target.length && order.every((v, i) => v === target[i]);
      let score;
      if (strategy === SCORING_STRATEGY.ALL_OR_NOTHING) score = exact ? max : 0;
      else {
        let inPlace = 0;
        for (let i = 0; i < target.length; i++) if (order[i] === target[i]) inPlace++;
        score = clampQuestionScore(target.length ? (max * inPlace) / target.length : 0, max, allowNeg);
      }
      return { questionId: q.id, score: round2(score), max,
        outcome: exact ? 'correct' : score > 0 ? 'partial' : 'incorrect', answered: true };
    }

    case QUESTION_KINDS.NUMERIC: {
      const val = typeof response === 'number' ? response : parseFloat(response);
      if (response == null || response === '' || Number.isNaN(val)) return unanswered();
      let correct = false;
      if (typeof q.min === 'number' && typeof q.max === 'number') correct = val >= q.min && val <= q.max;
      else if (typeof q.exact === 'number') {
        const tol = typeof q.tolerance === 'number' ? q.tolerance : 0;
        correct = Math.abs(val - q.exact) <= tol + 1e-9;
      }
      return { questionId: q.id, score: correct ? max : 0, max,
        outcome: correct ? 'correct' : 'incorrect', answered: true };
    }

    case QUESTION_KINDS.SHORT_ANSWER: {
      const raw = response == null ? '' : String(response);
      if (raw.trim() === '') return unanswered();
      const norm = (s) => {
        let t = String(s).trim().replace(/\s+/g, ' ');
        if (!q.caseSensitive) t = t.toLowerCase();
        return t;
      };
      const target = (q.accepted || []).map(norm);
      const correct = target.includes(norm(raw));
      return { questionId: q.id, score: correct ? max : 0, max,
        outcome: correct ? 'correct' : 'incorrect', answered: true };
    }

    default:
      return unanswered();
  }
}

/**
 * Score a whole assessment.
 * @param {any[]} questions
 * @param {Record<string, any>} responses
 * @param {{passingPercent?:number}} [settings]
 */
export function scoreAssessment(questions, responses, settings = {}) {
  const results = questions.map((q) => scoreQuestion(q, responses[q.id]));
  const raw = round2(results.reduce((a, r) => a + r.score, 0));
  const max = round2(results.reduce((a, r) => a + r.max, 0));
  const min = 0;
  const scaled = max > 0 ? round2(Math.max(-1, Math.min(1, raw / max))) : 0;
  const percent = max > 0 ? round2((raw / max) * 100) : 0;
  const passingPercent = typeof settings.passingPercent === 'number' ? settings.passingPercent : 80;
  const passed = percent >= passingPercent;
  const correctCount = results.filter((r) => r.outcome === 'correct').length;
  return { results, raw, min, max, scaled, percent, passingPercent, passed, correctCount };
}

export const _scoringInternal = { round2, clampQuestionScore };
