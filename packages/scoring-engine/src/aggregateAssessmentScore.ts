import type { Assessment, ResponsesMap } from "@scorm-quiz/schemas";
import { computeMaxPoints, isSupportedQuestionType } from "@scorm-quiz/schemas";
import type { AssessmentScoreResult } from "./types.js";
import { scoreQuestion } from "./scoreQuestion.js";
import { applyRounding } from "./rounding.js";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Scores an entire assessment attempt. Pure function: no DOM, no SCORM I/O.
 * Used identically by the Learner Preview, the packaged SCORM runtime, and
 * server-side re-validation, so scoring can never drift between them.
 */
export function aggregateAssessmentScore(assessment: Assessment, responses: ResponsesMap): AssessmentScoreResult {
  const scorable = assessment.questions.filter((q) => isSupportedQuestionType(q.type));
  const perQuestion = scorable.map((q) => scoreQuestion(q, responses[q.id] ?? null));

  const { unansweredTreatment, minScore, rounding, passingScorePercent } = assessment.settings.scoring;
  const maxScore = computeMaxPoints(assessment);

  const counted =
    unansweredTreatment === "excludeFromScoring"
      ? perQuestion.filter((r) => r.outcome !== "unanswered")
      : perQuestion;

  const rawScoreUnrounded = counted.reduce((sum, r) => sum + r.earnedPoints, 0);
  const effectiveMax =
    unansweredTreatment === "excludeFromScoring"
      ? counted.reduce((sum, r) => sum + r.maxPoints, 0)
      : maxScore;

  const rawScore = applyRounding(rawScoreUnrounded, rounding);
  const passingPoints = (passingScorePercent / 100) * effectiveMax;
  const scaledScore = effectiveMax > 0 ? clamp((rawScore - minScore) / (effectiveMax - minScore || 1), -1, 1) : 0;
  const numberCorrect = perQuestion.filter((r) => r.outcome === "correct").length;

  return {
    rawScore,
    minScore,
    maxScore,
    scaledScore,
    passed: rawScore >= passingPoints,
    numberCorrect,
    numberOfQuestions: perQuestion.length,
    perQuestion,
  };
}
