// @ts-check
/**
 * Shared domain constants and JSDoc typedefs for the SCORM Quiz Builder.
 * Framework-agnostic ESM so it runs unchanged in Node tooling AND inside the
 * exported SCO in the browser. Single source of truth for question shapes.
 */

/** Canonical question types (discriminated union `kind`). */
export const QUESTION_KINDS = Object.freeze({
  SINGLE_SELECT: 'single_select',
  MULTIPLE_SELECT: 'multiple_select',
  TRUE_FALSE: 'true_false',
  SINGLE_CHECKBOX: 'single_checkbox',
  MATCHING: 'matching',
  SEQUENCE: 'sequence',
  NUMERIC: 'numeric',
  SHORT_ANSWER: 'short_answer',
  HOTSPOT: 'hotspot',
  DRAG_DROP: 'drag_drop',
});

/** Presentation styles for choice questions. */
export const PRESENTATION = Object.freeze({
  RADIO: 'radio',
  CHECKBOX: 'checkbox',
  SINGLE_PILL: 'single_pill',
  MULTI_PILL: 'multi_pill',
  SINGLE_CHECKBOX: 'single_checkbox',
});

/** SCORM 2004 4th Edition interaction types (IEEE 1484.11.1 vocabulary). */
export const SCORM_INTERACTION_TYPE = Object.freeze({
  single_select: 'choice',
  multiple_select: 'choice',
  true_false: 'true-false',
  single_checkbox: 'true-false',
  matching: 'matching',
  sequence: 'sequencing',
  numeric: 'numeric',
  short_answer: 'fill-in',
  hotspot: 'choice',
  // SCORM 2004 has no drag-and-drop type; item->zone pairs are a matching.
  drag_drop: 'matching',
});

/**
 * Hotspot questions reuse the choice machinery: each hotspot is an option with
 * a normalized rect. Resolves one to the choice kind whose rules it follows.
 */
export function choiceKindOf(q) {
  if (q.kind !== QUESTION_KINDS.HOTSPOT) return q.kind;
  return q.multiple ? QUESTION_KINDS.MULTIPLE_SELECT : QUESTION_KINDS.SINGLE_SELECT;
}

/** Scoring strategies. */
export const SCORING_STRATEGY = Object.freeze({
  ALL_OR_NOTHING: 'all_or_nothing',
  PARTIAL: 'partial',
  WEIGHTED: 'weighted',
});

/** Result-score retention modes reported to the LMS. */
export const SCORE_RETENTION = Object.freeze({
  HIGHEST: 'highest',
  LATEST: 'latest',
  FIRST: 'first',
});

/** Feedback visibility timing. */
export const FEEDBACK_TIMING = Object.freeze({
  IMMEDIATE: 'immediate',
  ON_LEAVE: 'on_leave',
  ON_SUBMIT: 'on_submit',
  ON_PASS: 'on_pass',
  FINAL_ATTEMPT: 'final_attempt',
  NEVER: 'never',
});

/** Authoring lifecycle status for questions. */
export const QUESTION_STATUS = Object.freeze({
  DRAFT: 'draft',
  SME_REVIEW: 'sme_review',
  APPROVED: 'approved',
  RETIRED: 'retired',
});

/** Current project-file schema version (bump on breaking changes). */
export const PROJECT_SCHEMA_VERSION = 1;

/** Conservative SCORM 2004 suspend_data limit (chars) used for warnings. */
export const SUSPEND_DATA_LIMIT = 64000;

/** Per-image cap for embedded hotspot / drag-and-drop images, in raw (decoded) bytes. Not a SCORM limit. */
export const MAX_HOTSPOT_IMAGE_BYTES = 5 * 1024 * 1024;

/** Decoded byte size of a base64 data URI, without decoding it. */
export function dataUriBytes(uri) {
  const comma = uri.indexOf(',');
  if (comma < 0 || !/;base64$/i.test(uri.slice(0, comma))) return uri.length;
  const b64 = uri.slice(comma + 1);
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

export const _typesOnly = true;
