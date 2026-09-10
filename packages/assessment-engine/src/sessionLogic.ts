import type { Assessment, AttemptHistory, PerAttemptResult, ResponseValue, SuspendData } from "@scorm-quiz/schemas";
import { aggregateAssessmentScore } from "@scorm-quiz/scoring-engine";
import type { AssessmentScoreResult } from "@scorm-quiz/scoring-engine";
import { generateOrder } from "./generateOrder.js";

/** Starts a fresh attempt: generates (and fixes) question/option order —
 * this must only be called once per attempt; resuming must reuse the
 * persisted order instead of calling this again. */
export function createNewAttempt(assessment: Assessment, attemptNumber: number): SuspendData {
  const { questionOrder, optionOrder } = generateOrder(assessment);
  return {
    schemaVersion: 1,
    currentQuestionIndex: 0,
    responses: {},
    flaggedQuestionIds: [],
    questionOrder,
    optionOrder,
    attemptNumber,
    submitted: false,
    reviewScreenShown: false,
    startedAt: new Date().toISOString(),
  };
}

export function answerQuestion(state: SuspendData, questionId: string, value: ResponseValue): SuspendData {
  return { ...state, responses: { ...state.responses, [questionId]: value } };
}

export function toggleFlag(state: SuspendData, questionId: string): SuspendData {
  const flagged = state.flaggedQuestionIds.includes(questionId);
  return {
    ...state,
    flaggedQuestionIds: flagged
      ? state.flaggedQuestionIds.filter((id) => id !== questionId)
      : [...state.flaggedQuestionIds, questionId],
  };
}

export function goToIndex(state: SuspendData, index: number): SuspendData {
  const clamped = Math.max(0, Math.min(index, state.questionOrder.length - 1));
  return { ...state, currentQuestionIndex: clamped };
}

export function nextQuestion(state: SuspendData): SuspendData {
  return goToIndex(state, state.currentQuestionIndex + 1);
}

export function prevQuestion(state: SuspendData): SuspendData {
  return goToIndex(state, state.currentQuestionIndex - 1);
}

export function markReviewShown(state: SuspendData): SuspendData {
  return { ...state, reviewScreenShown: true };
}

export interface SubmitOutcome {
  scoreResult: AssessmentScoreResult;
  updatedHistory: AttemptHistory;
  suspendData: SuspendData;
}

/** Scores the current attempt and appends it to attempt history, applying
 * the passingEndsAccess lock rule. */
export function submitAttempt(assessment: Assessment, suspendData: SuspendData, history: AttemptHistory): SubmitOutcome {
  const scoreResult = aggregateAssessmentScore(assessment, suspendData.responses);
  const record: PerAttemptResult = {
    attemptNumber: suspendData.attemptNumber,
    rawScore: scoreResult.rawScore,
    maxScore: scoreResult.maxScore,
    scaledScore: scoreResult.scaledScore,
    passed: scoreResult.passed,
    completedAt: new Date().toISOString(),
  };
  const locked =
    history.locked ||
    (assessment.settings.attempts.passingEndsAccess && scoreResult.passed) ||
    (!assessment.settings.attempts.allowAdditionalAttemptsAfterPassing && scoreResult.passed);

  return {
    scoreResult,
    updatedHistory: { ...history, attempts: [...history.attempts, record], locked },
    suspendData: { ...suspendData, submitted: true },
  };
}

export function canStartNewAttempt(assessment: Assessment, history: AttemptHistory): boolean {
  if (history.locked) return false;
  if (assessment.settings.attempts.unlimitedAttempts) return true;
  return history.attempts.length < assessment.settings.attempts.maxAttempts;
}

/** Applies the configured score-retention rule (latest/highest/first) across
 * all recorded attempts — this is the score written to the LMS. */
export function retainedResult(history: AttemptHistory, retention: "latest" | "highest" | "first"): PerAttemptResult | undefined {
  if (history.attempts.length === 0) return undefined;
  if (retention === "first") return history.attempts[0];
  if (retention === "latest") return history.attempts[history.attempts.length - 1];
  return history.attempts.reduce((best, current) => (current.rawScore > best.rawScore ? current : best));
}
