import { describe, expect, it } from "vitest";
import { AssessmentSchema, type AttemptHistory } from "@scorm-quiz/schemas";
import { generateOrder } from "./generateOrder.js";
import {
  answerQuestion,
  canStartNewAttempt,
  createNewAttempt,
  goToIndex,
  retainedResult,
  submitAttempt,
  toggleFlag,
} from "./sessionLogic.js";

function demoAssessment(overrides: Record<string, unknown> = {}) {
  return AssessmentSchema.parse({
    id: "demo",
    title: "Demo",
    internalId: "demo-1",
    questions: [
      { id: "q1", type: "trueFalse", prompt: "T/F 1", correctAnswer: true },
      { id: "q2", type: "trueFalse", prompt: "T/F 2", correctAnswer: false },
      { id: "q3", type: "trueFalse", prompt: "T/F 3", correctAnswer: true },
    ],
    settings: { scoring: { passingScorePercent: 100 }, attempts: { maxAttempts: 2 } },
    ...overrides,
  });
}

describe("generateOrder", () => {
  it("is reproducible for a given seed", () => {
    const assessment = demoAssessment({
      settings: { randomization: { shuffleQuestions: true, seed: 42 } },
    });
    const a = generateOrder(assessment);
    const b = generateOrder(assessment);
    expect(a.questionOrder).toEqual(b.questionOrder);
  });

  it("keeps unshuffled order stable when shuffling is off", () => {
    const assessment = demoAssessment();
    const order = generateOrder(assessment);
    expect(order.questionOrder).toEqual(["q1", "q2", "q3"]);
  });
});

describe("attempt/session lifecycle", () => {
  it("resume does not regenerate the question order", () => {
    const assessment = demoAssessment({ settings: { randomization: { shuffleQuestions: true, seed: 7 } } });
    const attempt = createNewAttempt(assessment, 1);
    const originalOrder = [...attempt.questionOrder];

    // Simulate answering and navigating — order must remain untouched.
    const afterAnswer = answerQuestion(attempt, "q1", true);
    const afterNav = goToIndex(afterAnswer, 1);
    expect(afterNav.questionOrder).toEqual(originalOrder);
  });

  it("toggling a flag twice returns to unflagged", () => {
    const assessment = demoAssessment();
    let attempt = createNewAttempt(assessment, 1);
    attempt = toggleFlag(attempt, "q1");
    expect(attempt.flaggedQuestionIds).toContain("q1");
    attempt = toggleFlag(attempt, "q1");
    expect(attempt.flaggedQuestionIds).not.toContain("q1");
  });

  it("scores a submitted attempt and records it in history", () => {
    const assessment = demoAssessment();
    let attempt = createNewAttempt(assessment, 1);
    attempt = answerQuestion(attempt, "q1", true);
    attempt = answerQuestion(attempt, "q2", false);
    attempt = answerQuestion(attempt, "q3", true);

    const history: AttemptHistory = { schemaVersion: 1, attempts: [], locked: false };
    const outcome = submitAttempt(assessment, attempt, history);
    expect(outcome.scoreResult.passed).toBe(true);
    expect(outcome.updatedHistory.attempts).toHaveLength(1);
    expect(outcome.suspendData.submitted).toBe(true);
  });

  it("locks further attempts when passingEndsAccess is set and the attempt passed", () => {
    const assessment = demoAssessment({
      settings: { scoring: { passingScorePercent: 100 }, attempts: { maxAttempts: 5, passingEndsAccess: true } },
    });
    let attempt = createNewAttempt(assessment, 1);
    attempt = answerQuestion(attempt, "q1", true);
    attempt = answerQuestion(attempt, "q2", false);
    attempt = answerQuestion(attempt, "q3", true);

    const history: AttemptHistory = { schemaVersion: 1, attempts: [], locked: false };
    const outcome = submitAttempt(assessment, attempt, history);
    expect(outcome.updatedHistory.locked).toBe(true);
    expect(canStartNewAttempt(assessment, outcome.updatedHistory)).toBe(false);
  });

  it("blocks new attempts once maxAttempts is reached", () => {
    const assessment = demoAssessment({ settings: { attempts: { maxAttempts: 1 } } });
    const history: AttemptHistory = {
      schemaVersion: 1,
      attempts: [{ attemptNumber: 1, rawScore: 0, maxScore: 3, scaledScore: -1, passed: false, completedAt: new Date().toISOString() }],
      locked: false,
    };
    expect(canStartNewAttempt(assessment, history)).toBe(false);
  });

  it("applies score retention rules across multiple attempts", () => {
    const history: AttemptHistory = {
      schemaVersion: 1,
      locked: false,
      attempts: [
        { attemptNumber: 1, rawScore: 1, maxScore: 3, scaledScore: 0.33, passed: false, completedAt: "2026-01-01T00:00:00.000Z" },
        { attemptNumber: 2, rawScore: 3, maxScore: 3, scaledScore: 1, passed: true, completedAt: "2026-01-02T00:00:00.000Z" },
      ],
    };
    expect(retainedResult(history, "highest")?.rawScore).toBe(3);
    expect(retainedResult(history, "latest")?.rawScore).toBe(3);
    expect(retainedResult(history, "first")?.rawScore).toBe(1);
  });
});
