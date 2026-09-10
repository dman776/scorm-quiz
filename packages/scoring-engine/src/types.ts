import type { ResponseValue } from "@scorm-quiz/schemas";

export type QuestionOutcome = "correct" | "incorrect" | "partial" | "unanswered";

export interface QuestionScoreResult {
  questionId: string;
  outcome: QuestionOutcome;
  earnedPoints: number;
  maxPoints: number;
  response: ResponseValue;
  /** ids of the correct answer option(s), for feedback/SCORM reporting. */
  correctOptionIds: string[];
  /** ids of the options the learner selected, for choice-type questions. */
  selectedOptionIds: string[];
}

export interface AssessmentScoreResult {
  rawScore: number;
  minScore: number;
  maxScore: number;
  /** SCORM cmi.score.scaled range: -1.0 to 1.0. */
  scaledScore: number;
  passed: boolean;
  numberCorrect: number;
  numberOfQuestions: number;
  perQuestion: QuestionScoreResult[];
}
