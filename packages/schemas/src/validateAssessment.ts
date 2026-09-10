import type { Assessment } from "./assessment.js";
import { computeMaxPoints } from "./assessment.js";
import type { ValidationIssue, ValidationResult } from "./validation.js";
import { isSupportedQuestionType } from "./question.js";

/**
 * Pre-export validation checklist. Errors block export; warnings do not.
 * Pure function over the data model — no I/O — so it can run identically in
 * the authoring API and in client-side "Validate" button tests.
 */
export function validateAssessment(assessment: Assessment): ValidationResult {
  const issues: ValidationIssue[] = [];
  const err = (code: string, message: string, path?: string) =>
    issues.push({ severity: "error", code, message, path });
  const warn = (code: string, message: string, path?: string) =>
    issues.push({ severity: "warning", code, message, path });

  if (!assessment.title.trim()) err("MISSING_TITLE", "Assessment title is required.", "title");

  if (assessment.questions.length === 0) {
    err("NO_QUESTIONS", "Assessment must contain at least one question.", "questions");
  }

  const seenIds = new Set<string>();
  for (const q of assessment.questions) {
    if (seenIds.has(q.id)) {
      err("DUPLICATE_QUESTION_ID", `Duplicate question id "${q.id}".`, `questions.${q.id}`);
    }
    seenIds.add(q.id);

    if (!isSupportedQuestionType(q.type)) {
      err(
        "UNSUPPORTED_QUESTION_TYPE",
        `Question "${q.id}" uses type "${q.type}", which is not yet implemented for export.`,
        `questions.${q.id}.type`,
      );
      continue;
    }

    if (q.type === "singleSelect") {
      const correctCount = q.options.filter((o) => o.isCorrect).length;
      if (correctCount !== 1) {
        err(
          "SINGLE_SELECT_MUST_HAVE_ONE_CORRECT",
          `Single-select question "${q.id}" must have exactly one correct answer (has ${correctCount}).`,
          `questions.${q.id}.options`,
        );
      }
      if (q.options.length < 2) {
        err("TOO_FEW_OPTIONS", `Question "${q.id}" needs at least two answer options.`, `questions.${q.id}.options`);
      }
      if (q.options.length > 10) {
        warn("MANY_OPTIONS", `Question "${q.id}" has ${q.options.length} options; consider simplifying.`, `questions.${q.id}.options`);
      }
      for (const o of q.options) {
        if (o.text.length > 300) warn("LONG_OPTION_TEXT", `An answer option on "${q.id}" is very long.`, `questions.${q.id}.options.${o.id}`);
      }
      if (!q.feedback.correct && !q.feedback.incorrect) {
        warn("MISSING_FEEDBACK", `Question "${q.id}" has no correct/incorrect feedback.`, `questions.${q.id}.feedback`);
      }
    }

    if (q.type === "multipleSelect") {
      const correctCount = q.options.filter((o) => o.isCorrect).length;
      if (correctCount < 1) {
        err(
          "MULTI_SELECT_NEEDS_CORRECT_ANSWER",
          `Multiple-select question "${q.id}" needs at least one correct answer.`,
          `questions.${q.id}.options`,
        );
      }
      if (q.minSelections !== undefined && q.maxSelections !== undefined && q.minSelections > q.maxSelections) {
        err("INVALID_SELECTION_RANGE", `Question "${q.id}" has minSelections > maxSelections.`, `questions.${q.id}`);
      }
      if (q.scoring.strategy === "partialCredit" && q.scoring.incorrectPenalty > 1) {
        warn("HIGH_PENALTY", `Question "${q.id}" has a penalty greater than 1x the point value.`, `questions.${q.id}.scoring`);
      }
    }

    if (q.imageAssetId && !q.imageAltText) {
      warn("MISSING_ALT_TEXT", `Question "${q.id}" has an image but no alternative text.`, `questions.${q.id}.imageAltText`);
    }

    if (!q.feedback.correct && !q.feedback.incorrect && q.type === "trueFalse" && !q.trueFeedback && !q.falseFeedback) {
      warn("MISSING_RATIONALE", `Question "${q.id}" has no feedback configured.`, `questions.${q.id}`);
    }
  }

  const maxScore = computeMaxPoints(assessment);
  const passingPoints = (assessment.settings.scoring.passingScorePercent / 100) * maxScore;
  if (passingPoints > maxScore) {
    err("PASSING_SCORE_EXCEEDS_MAX", "Passing score exceeds the maximum possible score.", "settings.scoring.passingScorePercent");
  }
  if (maxScore <= 0 && assessment.questions.length > 0) {
    err("ZERO_MAX_SCORE", "Assessment's maximum possible score is zero.", "settings.scoring");
  }

  if (assessment.settings.navigation.requireAnswerBeforeContinuing && assessment.settings.navigation.allowFlagForReview) {
    warn(
      "REVIEW_CONFLICT",
      "Requiring an answer before continuing conflicts with allowing flag-for-review of unanswered questions.",
      "settings.navigation",
    );
  }

  const canExport = !issues.some((i) => i.severity === "error");
  return { issues, canExport };
}
