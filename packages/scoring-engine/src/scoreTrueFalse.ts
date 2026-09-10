import type { TrueFalseQuestion } from "@scorm-quiz/schemas";
import type { QuestionScoreResult } from "./types.js";

export function scoreTrueFalse(question: TrueFalseQuestion, response: unknown): QuestionScoreResult {
  const maxPoints = question.points;
  const correctOptionIds = [String(question.correctAnswer)];
  const answered = typeof response === "boolean";
  const selectedOptionIds = answered ? [String(response)] : [];

  if (!answered) {
    return {
      questionId: question.id,
      outcome: "unanswered",
      earnedPoints: 0,
      maxPoints,
      response: null,
      correctOptionIds,
      selectedOptionIds,
    };
  }

  const correct = response === question.correctAnswer;
  return {
    questionId: question.id,
    outcome: correct ? "correct" : "incorrect",
    earnedPoints: correct ? maxPoints : 0,
    maxPoints,
    response: response as boolean,
    correctOptionIds,
    selectedOptionIds,
  };
}
