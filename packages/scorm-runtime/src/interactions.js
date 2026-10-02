// @ts-check
/**
 * SCORM 2004 4th Edition interaction formatting (IEEE 1484.11.1 data bindings).
 *
 * Responses are reported with identifiers derived from the answer TEXT
 * ("Each_device_connects_to_a_central_switch"), not internal option ids ("a"),
 * so LMS interaction reports show what the learner actually picked.
 */
import { SCORM_INTERACTION_TYPE, QUESTION_KINDS, choiceKindOf, dragDropPlacements } from '../../engine/src/types.js';

/** Longest readable identifier we derive from answer text. */
const LABEL_ID_MAX = 64;

export function safeInteractionId(id) {
  return String(id).replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 250);
}

/** short_identifier_type from free text: unsafe runs collapse to one `_`. */
export function labelIdentifier(label, fallback) {
  const s = String(label ?? '').trim().replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, LABEL_ID_MAX).replace(/_+$/, '');
  return s || safeInteractionId(fallback);
}

/**
 * Map of item id -> unique readable identifier for one question's options or
 * sequence items. Duplicate labels get a numeric suffix so they stay distinct.
 */
export function responseIdentifiers(items) {
  const out = {};
  const used = new Set();
  for (const it of items || []) {
    let ident = labelIdentifier(it.label, it.id);
    for (let n = 2; used.has(ident); n++) ident = `${labelIdentifier(it.label, it.id)}_${n}`;
    used.add(ident);
    out[it.id] = ident;
  }
  return out;
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

  switch (choiceKindOf(q)) {
    case QUESTION_KINDS.SINGLE_SELECT:
    case QUESTION_KINDS.MULTIPLE_SELECT: {
      const ids = responseIdentifiers(q.options);
      const learner = asArr(response).map((id) => ids[id] ?? safeInteractionId(id)).join('[,]');
      const correct = (q.options || []).filter((o) => o.correct).map((o) => ids[o.id]).join('[,]');
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
      const learner = Object.entries(map).filter(([, v]) => v)
        .map(([k, v]) => `${labelIdentifier(k, 'source')}[.]${labelIdentifier(v, 'target')}`).join('[,]');
      const correct = (q.pairs || [])
        .map((p) => `${labelIdentifier(p.prompt, 'source')}[.]${labelIdentifier(p.match, 'target')}`).join('[,]');
      return { type, learner, correct };
    }
    case QUESTION_KINDS.DRAG_DROP: {
      // item[.]zone pairs. The correct pattern lists each non-distractor item
      // with its first accepted zone (one pattern; our engine judges the result),
      // or with every zone it must be in when items are reused.
      const itemIds = responseIdentifiers(q.items);
      const zoneIds = responseIdentifiers(q.zones);
      const learner = dragDropPlacements(q, response).map(([i, z]) => `${itemIds[i]}[.]${zoneIds[z]}`).join('[,]');
      const correct = (q.items || []).flatMap((it) => {
        const valid = (it.zones || []).filter((z) => zoneIds[z]);
        return (q.reuseItems ? valid : valid.slice(0, 1)).map((z) => `${itemIds[it.id]}[.]${zoneIds[z]}`);
      }).join('[,]');
      return { type, learner, correct };
    }
    case QUESTION_KINDS.SEQUENCE: {
      const ids = responseIdentifiers(q.items);
      const learner = asArr(response).map((id) => ids[id] ?? safeInteractionId(id)).join('[,]');
      const correct = (q.correctOrder || []).map((id) => ids[id] ?? safeInteractionId(id)).join('[,]');
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

/**
 * One cmi.interactions record. `r` is the scoring engine's result for the
 * question. An unanswered question is `neutral` while the attempt is open and
 * `incorrect` once it is submitted (`final`), since it scored zero.
 */
export function buildInteraction(q, response, r, latencySec = 0, final = true) {
  const { type, learner, correct } = buildResponsePatterns(q, response);
  let result;
  if (!r || !r.answered) result = final ? 'incorrect' : 'neutral';
  else if (r.outcome === 'correct') result = 'correct';
  else result = 'incorrect';
  return {
    id: safeInteractionId(q.id), type, timestamp: formatTimestamp(),
    learner_response: learner, correct_response: correct,
    weighting: String(r ? r.max : q.points ?? 0), result,
    latency: formatLatency(latencySec),
    description: String(q.prompt || '').slice(0, 250),
    objective: q.objective ? labelIdentifier(q.objective, '') : '',
  };
}

export function buildInteractions(questions, responses, resultsById, latencyById = {}) {
  return questions.map((q) => buildInteraction(q, responses[q.id], resultsById[q.id], latencyById[q.id] ?? 0));
}
