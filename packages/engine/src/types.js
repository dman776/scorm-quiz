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
});

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

export const _typesOnly = true;
