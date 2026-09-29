// @ts-check
/** Suspend/resume state serialization for the SCO. */
import { SUSPEND_DATA_LIMIT } from '../../engine/src/types.js';

export function serializeState(state) {
  const compact = {
    v: 1, o: state.order, a: state.answers, f: state.flagged, i: state.index,
    s: state.submitted ? 1 : 0, at: state.attempt, rt: state.remainingTime ?? null,
    ao: state.answerOrder ?? null, ix: state.interactionIndex ?? {},
  };
  return JSON.stringify(compact);
}

export function validateStateSize(serialized) {
  const size = serialized.length;
  return { ok: size <= SUSPEND_DATA_LIMIT, size, limit: SUSPEND_DATA_LIMIT };
}

export function deserializeState(str) {
  if (!str) return null;
  let raw;
  try { raw = JSON.parse(str); } catch (_e) { return null; }
  if (!raw || raw.v !== 1) return null;
  return {
    order: raw.o || [], answers: raw.a || {}, flagged: raw.f || [], index: raw.i || 0,
    submitted: raw.s === 1, attempt: raw.at || 1, remainingTime: raw.rt, answerOrder: raw.ao,
    interactionIndex: raw.ix || {},
  };
}

export function seededShuffle(array, seed) {
  const a = array.slice();
  let s = seed >>> 0;
  const rand = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
