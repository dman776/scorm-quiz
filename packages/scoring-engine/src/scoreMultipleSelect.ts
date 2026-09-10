import type { MultipleSelectQuestion } from "@scorm-quiz/schemas";
import type { QuestionScoreResult } from "./types.js";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Scores a multiple-select question under one of three strategies:
 * - allOrNothing: full points only if the selected set exactly matches the correct set
 * - partialCredit: fraction = (correctSelected - penalty*incorrectSelected) / correctTotal
 * - weighted: sum of each selected option's own scoreValue (defaulting to an
 *   even share of maxPoints for correct options with no explicit value)
 * In all strategies the result is clamped to [0, maxPoints] unless the
 * question explicitly allows a negative question score.
 */
export function scoreMultipleSelect(question: MultipleSelectQuestion, response: unknown): QuestionScoreResult {
  const maxPoints = question.scoring.points;
  const correctOptions = question.options.filter((o) => o.isCorrect);
  const correctOptionIds = correctOptions.map((o) => o.id);
  const selectedOptionIds = Array.isArray(response) ? response.filter((r): r is string => typeof r === "string") : [];

  if (selectedOptionIds.length === 0) {
    return {
      questionId: question.id,
      outcome: "unanswered",
      earnedPoints: 0,
      maxPoints,
      response: [],
      correctOptionIds,
      selectedOptionIds,
    };
  }

  const correctSet = new Set(correctOptionIds);
  const selectedSet = new Set(selectedOptionIds);
  const correctSelectedCount = selectedOptionIds.filter((id) => correctSet.has(id)).length;
  const incorrectSelectedCount = selectedOptionIds.filter((id) => !correctSet.has(id)).length;
  const floor = question.scoring.allowNegativeQuestionScore ? -maxPoints : 0;

  let earnedPoints: number;

  if (question.scoring.strategy === "allOrNothing") {
    const exactMatch =
      selectedSet.size === correctSet.size && [...correctSet].every((id) => selectedSet.has(id));
    earnedPoints = exactMatch ? maxPoints : 0;
  } else if (question.scoring.strategy === "weighted") {
    const perOptionShare = maxPoints / Math.max(correctOptionIds.length, 1);
    earnedPoints = selectedOptionIds.reduce((sum, id) => {
      const option = question.options.find((o) => o.id === id);
      const value = option?.scoreValue ?? (option?.isCorrect ? perOptionShare : 0);
      return sum + value;
    }, 0);
    earnedPoints = clamp(earnedPoints, floor, maxPoints);
  } else {
    // partialCredit
    const correctTotal = Math.max(correctOptionIds.length, 1);
    const fraction =
      (correctSelectedCount - question.scoring.incorrectPenalty * incorrectSelectedCount) / correctTotal;
    earnedPoints = clamp(fraction * maxPoints, floor, maxPoints);
  }

  earnedPoints = clamp(earnedPoints, floor, maxPoints);

  const outcome = earnedPoints >= maxPoints ? "correct" : earnedPoints <= 0 ? "incorrect" : "partial";

  return {
    questionId: question.id,
    outcome,
    earnedPoints,
    maxPoints,
    response: selectedOptionIds,
    correctOptionIds,
    selectedOptionIds,
  };
}
