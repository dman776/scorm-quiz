import type { SingleSelectQuestion } from "@scorm-quiz/schemas";
import type { QuestionScoreResult } from "./types.js";

export function scoreSingleSelect(question: SingleSelectQuestion, response: unknown): QuestionScoreResult {
  const maxPoints = question.scoring.points;
  const correctOption = question.options.find((o) => o.isCorrect);
  const correctOptionIds = correctOption ? [correctOption.id] : [];
  const selectedId = typeof response === "string" && response.length > 0 ? response : null;
  const selectedOptionIds = selectedId ? [selectedId] : [];

  if (selectedId === null) {
    return {
      questionId: question.id,
      outcome: "unanswered",
      earnedPoints: 0,
      maxPoints,
      response: selectedId,
      correctOptionIds,
      selectedOptionIds,
    };
  }

  const correct = selectedId === correctOption?.id;
  return {
    questionId: question.id,
    outcome: correct ? "correct" : "incorrect",
    earnedPoints: correct ? maxPoints : 0,
    maxPoints,
    response: selectedId,
    correctOptionIds,
    selectedOptionIds,
  };
}
