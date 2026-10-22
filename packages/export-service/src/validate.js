// @ts-check
/** Assessment validation. Returns blocking errors and non-blocking warnings. */
import { QUESTION_KINDS, MAX_HOTSPOT_IMAGE_BYTES, dataUriBytes } from '../../engine/src/types.js';
import { maxQuestionScore } from '../../engine/src/scoring.js';

/** Why a normalized rect is unusable, or '' if it is fine. */
function rectProblem(r) {
  const inRange = (n) => typeof n === 'number' && n >= 0 && n <= 1;
  if (!r || !inRange(r.x) || !inRange(r.y) || !inRange(r.w) || !inRange(r.h) || r.w <= 0 || r.h <= 0) return 'has an invalid region';
  if (r.x + r.w > 1.001 || r.y + r.h > 1.001) return 'extends past the image';
  return '';
}
const rectsOverlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Problems with an embedded question image (hotspot, drag-and-drop). */
function checkImage(q, label, errors, warnings, push) {
  const src = q.image && q.image.src;
  if (!/^data:image\//i.test(src))
    push(errors, 'BAD_IMAGE', `${label} ${qref(q)} image must be an embedded data URI so the package stays self-contained.`, q.id);
  else if (dataUriBytes(src) > MAX_HOTSPOT_IMAGE_BYTES)
    push(warnings, 'LARGE_IMAGE', `${label} ${qref(q)} embeds an image over ${MAX_HOTSPOT_IMAGE_BYTES / 1024 / 1024}MB, which inflates the package.`, q.id);
  if (!q.image.alt) push(warnings, 'NO_IMAGE_ALT', `${label} ${qref(q)} image has no alt text.`, q.id);
}

/**
 * Can every non-distractor item sit in one of its accepted zones at once,
 * given zone capacities? Bipartite matching (items -> zone slots) by
 * augmenting paths; uncapped zones get one slot per item.
 */
function dragDropFits(items, zones) {
  const cap = Object.fromEntries(zones.map((z) => [z.id, z.capacity > 0 ? z.capacity : items.length]));
  const slotOwner = {}; // `${zoneId}#${k}` -> item index
  const tryPlace = (i, seen) => {
    for (const zid of items[i].zones) {
      for (let k = 0; k < (cap[zid] || 0); k++) {
        const slot = `${zid}#${k}`;
        if (seen.has(slot)) continue;
        seen.add(slot);
        if (slotOwner[slot] === undefined || tryPlace(slotOwner[slot], seen)) { slotOwner[slot] = i; return true; }
      }
    }
    return false;
  };
  return items.every((_it, i) => tryPlace(i, new Set()));
}

function checkDragDrop(q, errors, warnings, push) {
  const zones = Array.isArray(q.zones) ? q.zones : [];
  const items = Array.isArray(q.items) ? q.items : [];
  const zoneIds = new Set(zones.map((z) => z.id));
  if (!zones.length) push(errors, 'NO_DD_ZONES', `Drag-and-drop question ${qref(q)} has no drop zones.`, q.id);
  if (!items.length) push(errors, 'NO_DD_ITEMS', `Drag-and-drop question ${qref(q)} has no items to drag.`, q.id);
  if (zones.some((z) => !String(z.label || '').trim()))
    push(errors, 'DD_ZONE_LABEL', `Every drop zone in question ${qref(q)} needs a label (screen readers announce it).`, q.id);
  if (items.some((it) => !String(it.label || '').trim()))
    push(errors, 'DD_ITEM_LABEL', `Every item in question ${qref(q)} needs a label.`, q.id);
  for (const z of zones) {
    if (z.capacity != null && !(Number.isInteger(z.capacity) && z.capacity >= 1))
      push(errors, 'DD_BAD_CAPACITY', `Zone "${z.label}" in question ${qref(q)} has an invalid capacity (use a whole number of 1 or more, or leave blank).`, q.id);
  }
  for (const it of items) {
    if ((it.zones || []).some((zid) => !zoneIds.has(zid)))
      push(errors, 'DD_BAD_REF', `Item "${it.label}" in question ${qref(q)} accepts a zone that no longer exists.`, q.id);
  }
  const targets = items.filter((it) => (it.zones || []).length > 0);
  if (items.length && !targets.length)
    push(errors, 'NO_DD_CORRECT', `Question ${qref(q)} has no item with a correct zone (all are distractors).`, q.id);
  else if (q.reuseItems) {
    // Every item goes in all of its zones, so each zone must hold all its items.
    for (const z of zones) {
      const need = targets.filter((it) => it.zones.includes(z.id)).length;
      if (z.capacity >= 1 && need > z.capacity)
        push(errors, 'DD_CAPACITY', `Zone "${z.label}" in question ${qref(q)} holds ${z.capacity} but ${need} items belong in it.`, q.id);
    }
  } else if (targets.length && !dragDropFits(targets.map((it) => ({ zones: it.zones.filter((zid) => zoneIds.has(zid)) })), zones))
    push(errors, 'DD_CAPACITY', `Question ${qref(q)}: the zone capacities leave no room to place every item correctly.`, q.id);
  if (q.image && q.image.src) {
    checkImage(q, 'Drag-and-drop question', errors, warnings, push);
    zones.forEach((z, i) => {
      const why = rectProblem(z.rect);
      if (why) push(errors, 'BAD_DD_RECT', `Zone "${z.label}" in question ${qref(q)} ${why}.`, q.id);
      else if (zones.slice(0, i).some((o) => !rectProblem(o.rect) && rectsOverlap(o.rect, z.rect)))
        push(errors, 'DD_OVERLAP', `Zone "${z.label}" in question ${qref(q)} overlaps another zone, so a drop there would be ambiguous.`, q.id);
    });
  }
}

/** question -> 1-based position, so messages can say "Question 3" instead of an opaque id. */
let positions = new WeakMap();
/** Human-readable reference to a question: its number plus the start of its prompt. */
function qref(q) {
  const n = positions.get(q);
  const text = String(q.prompt || '').replace(/\s+/g, ' ').trim();
  const snip = text.length > 40 ? text.slice(0, 40).trimEnd() + '\u2026' : text;
  return `${n ?? '?'}${snip ? ` ("${snip}")` : ''}`;
}

export function validateAssessment(a) {
  const errors = [];
  const warnings = [];
  const push = (arr, code, message, questionId) => arr.push({ code, message, questionId });

  if (!a.title || !a.title.trim()) push(errors, 'NO_TITLE', 'Assessment title is required.');
  if (!Array.isArray(a.questions) || a.questions.length === 0)
    push(errors, 'NO_QUESTIONS', 'Assessment must contain at least one question.');

  positions = new WeakMap();
  (a.questions || []).forEach((q, i) => { if (q && typeof q === 'object') positions.set(q, i + 1); });
  const ids = new Set();
  for (const q of a.questions || []) {
    if (ids.has(q.id)) push(errors, 'DUP_ID', `Duplicate question id: ${q.id}`, q.id);
    ids.add(q.id);
    const choiceKinds = [QUESTION_KINDS.SINGLE_SELECT, QUESTION_KINDS.MULTIPLE_SELECT,
      QUESTION_KINDS.TRUE_FALSE, QUESTION_KINDS.SINGLE_CHECKBOX, QUESTION_KINDS.HOTSPOT];
    if (choiceKinds.includes(q.kind)) {
      if (!Array.isArray(q.options) || q.options.length === 0)
        push(errors, 'NO_OPTIONS', `Question ${qref(q)} has no answer options.`, q.id);
      else if (!q.options.some((o) => o.correct) && !q.options.some((o) => typeof o.score === 'number'))
        push(errors, 'NO_CORRECT', `Question ${qref(q)} has no correct answer or scores.`, q.id);
      if (Array.isArray(q.options) && q.options.length > 8)
        push(warnings, 'MANY_OPTIONS', `Question ${qref(q)} has more than 8 options.`, q.id);
    }
    if (q.kind === QUESTION_KINDS.HOTSPOT) {
      const src = q.image && q.image.src;
      if (!src) push(errors, 'NO_HOTSPOT_IMAGE', `Hotspot question ${qref(q)} has no image.`, q.id);
      else if (!/^data:image\//i.test(src))
        push(errors, 'BAD_HOTSPOT_IMAGE', `Hotspot question ${qref(q)} image must be an embedded data URI so the package stays self-contained.`, q.id);
      else if (dataUriBytes(src) > MAX_HOTSPOT_IMAGE_BYTES)
        push(warnings, 'LARGE_HOTSPOT_IMAGE', `Hotspot question ${qref(q)} embeds an image over ${MAX_HOTSPOT_IMAGE_BYTES / 1024 / 1024}MB, which inflates the package.`, q.id);
      if (q.image && !q.image.alt)
        push(warnings, 'NO_HOTSPOT_ALT', `Hotspot question ${qref(q)} image has no alt text.`, q.id);
      for (const o of q.options || []) {
        const r = o.rect;
        const inRange = (n) => typeof n === 'number' && n >= 0 && n <= 1;
        if (!r || !inRange(r.x) || !inRange(r.y) || !inRange(r.w) || !inRange(r.h) || r.w <= 0 || r.h <= 0)
          push(errors, 'BAD_HOTSPOT_RECT', `Hotspot ${o.id} in question ${qref(q)} has an invalid region.`, q.id);
        else if (r.x + r.w > 1.001 || r.y + r.h > 1.001)
          push(errors, 'BAD_HOTSPOT_RECT', `Hotspot ${o.id} in question ${qref(q)} extends past the image.`, q.id);
      }
      if (!q.multiple && (q.options || []).filter((o) => o.correct).length > 1)
        push(warnings, 'HOTSPOT_MULTI_CORRECT', `Question ${qref(q)} allows only one pick but marks several hotspots correct.`, q.id);
    }
    if (q.kind === QUESTION_KINDS.DRAG_DROP) checkDragDrop(q, errors, warnings, push);
    if (q.kind === QUESTION_KINDS.MATCHING && (!q.pairs || q.pairs.length === 0))
      push(errors, 'NO_PAIRS', `Matching question ${qref(q)} has no pairs.`, q.id);
    if (q.kind === QUESTION_KINDS.SEQUENCE && (!q.correctOrder || !q.items))
      push(errors, 'NO_SEQ', `Sequence question ${qref(q)} is missing items or order.`, q.id);
    if (q.kind === QUESTION_KINDS.NUMERIC && typeof q.exact !== 'number' &&
        !(typeof q.min === 'number' && typeof q.max === 'number'))
      push(errors, 'NO_NUMERIC_KEY', `Numeric question ${qref(q)} needs an exact value or range.`, q.id);
    if (q.kind === QUESTION_KINDS.SHORT_ANSWER && (!q.accepted || q.accepted.length === 0))
      push(errors, 'NO_ACCEPTED', `Short answer question ${qref(q)} has no accepted responses.`, q.id);
    if (typeof q.points !== 'number' || q.points < 0)
      push(errors, 'BAD_POINTS', `Question ${qref(q)} has invalid points.`, q.id);
    if (!q.correctFeedback && !q.incorrectFeedback)
      push(warnings, 'NO_FEEDBACK', `Question ${qref(q)} has no feedback.`, q.id);
    if (!q.rationale) push(warnings, 'NO_RATIONALE', `Question ${qref(q)} has no rationale.`, q.id);
    if (!q.objective) push(warnings, 'NO_OBJECTIVE', `Question ${qref(q)} has no learning objective.`, q.id);
    if (q.options && q.options.some((o) => typeof o.score === 'number' && o.score < 0) && !q.allowNegative)
      push(warnings, 'NEG_SCORE', `Question ${qref(q)} has negative option scores without allowNegative.`, q.id);
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
