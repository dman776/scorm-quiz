// @ts-check
/**
 * SCORM 2004 4th Edition interaction formatting (IEEE 1484.11.1 data bindings).
 */
import { SCORM_INTERACTION_TYPE, QUESTION_KINDS } from '../../engine/src/types.js';

export function safeInteractionId(id) {
  return String(id).replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 250);
}

export function formatLatency(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round((seconds % 60) * 100) / 100;
  let out = 'PT';
  if (h) out += `${h}H`;
  if (m) out += `${m}M`;
  if (s || (!h && !m)) out += `${s}S`;
  return out;
}

export function formatTimestamp(date = new Date()) {
  return date.toISOString().replace(/\.\d+Z$/, 'Z');
}

export function buildResponsePatterns(q, response) {
  const type = SCORM_INTERACTION_TYPE[q.kind] || 'other';
  const asArr = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);

  switch (q.kind) {
    case QUESTION_KINDS.SINGLE_SELECT:
    case QUESTION_KINDS.MULTIPLE_SELECT: {
      const learner = asArr(response).map(safeInteractionId).join('[,]');
      const correct = (q.options || []).filter((o) => o.correct).map((o) => safeInteractionId(o.id)).join('[,]');
      return { type, learner, correct };
    }
    case QUESTION_KINDS.TRUE_FALSE:
    case QUESTION_KINDS.SINGLE_CHECKBOX: {
      const picked = asArr(response)[0];
      const opt = (q.options || []).find((o) => o.id === picked);
      const correctOpt = (q.options || []).find((o) => o.correct);
      return { type,
        learner: opt ? String(learnerTrueFalse(q, opt)) : '',
        correct: correctOpt ? String(learnerTrueFalse(q, correctOpt)) : 'true' };
    }
    case QUESTION_KINDS.MATCHING: {
      const map = response && typeof response === 'object' ? response : {};
      const learner = Object.entries(map)
        .map(([k, v]) => `${safeInteractionId(k)}[.]${safeInteractionId(v)}`).join('[,]');
      const correct = (q.pairs || [])
        .map((p) => `${safeInteractionId(p.prompt)}[.]${safeInteractionId(p.match)}`).join('[,]');
      return { type, learner, correct };
    }
    case QUESTION_KINDS.SEQUENCE: {
      const learner = asArr(response).map(safeInteractionId).join('[,]');
      const correct = (q.correctOrder || []).map(safeInteractionId).join('[,]');
      return { type, learner, correct };
    }
    case QUESTION_KINDS.NUMERIC: {
      const val = typeof response === 'number' ? response : parseFloat(response);
      const learner = Number.isFinite(val) ? String(val) : '';
      let correct;
      if (typeof q.min === 'number' && typeof q.max === 'number') correct = `${q.min}[:]${q.max}`;
      else if (typeof q.exact === 'number') {
        const tol = typeof q.tolerance === 'number' ? q.tolerance : 0;
        correct = `${q.exact - tol}[:]${q.exact + tol}`;
      } else correct = '';
      return { type, learner, correct };
    }
    case QUESTION_KINDS.SHORT_ANSWER: {
      const learner = response == null ? '' : String(response).slice(0, 250);
      const correct = (q.accepted || [])[0] ? String((q.accepted || [])[0]).slice(0, 250) : '';
      return { type, learner, correct };
    }
    default:
      return { type: 'other', learner: response == null ? '' : String(response), correct: '' };
  }
}

function learnerTrueFalse(q, opt) {
  if (/^true$/i.test(opt.label) || opt.id === 'true') return true;
  if (/^false$/i.test(opt.label) || opt.id === 'false') return false;
  return !!opt.correct;
}

export function buildInteractions(questions, responses, resultsById, latencyById = {}) {
  const ts = formatTimestamp();
  return questions.map((q) => {
    const { type, learner, correct } = buildResponsePatterns(q, responses[q.id]);
    const r = resultsById[q.id];
    let result;
    if (!r || !r.answered) result = 'neutral';
    else if (r.outcome === 'correct') result = 'correct';
    else result = 'incorrect';
    return {
      id: safeInteractionId(q.id), type, timestamp: ts,
      learner_response: learner, correct_response: correct,
      weighting: String(r ? r.max : q.points ?? 0), result,
      latency: formatLatency(latencyById[q.id] ?? 0),
      description: String(q.prompt || '').slice(0, 250),
    };
  });
}
