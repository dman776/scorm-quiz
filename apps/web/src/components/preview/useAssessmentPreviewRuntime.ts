import { useCallback, useMemo, useRef, useState } from "react";
import type { Assessment, ResponseValue, SuspendData } from "@scorm-quiz/schemas";
import {
  answerQuestion,
  canStartNewAttempt,
  createNewAttempt,
  emptyAttemptHistory,
  goToIndex,
  markReviewShown,
  nextQuestion,
  prevQuestion,
  submitAttempt,
  toggleFlag,
  type RuntimeState,
} from "@scorm-quiz/assessment-engine";
import type { AssessmentScoreResult } from "@scorm-quiz/scoring-engine";
import { ScormSession, buildInteraction, type Api1484_11 } from "@scorm-quiz/scorm-runtime";

export type RuntimePhase = "inProgress" | "review" | "results";

/**
 * The same session-transition logic as the exported runtime's
 * useAssessmentRuntime, adapted for use inside the authoring app: takes an
 * injected ScormSession (or none, for a plain in-memory Learner Preview)
 * instead of locating window.API_1484_11 itself, since both the Learner
 * Preview and the SCORM Debug Preview render inside the authoring SPA, not
 * inside a real (or LMS) frame.
 */
export function useAssessmentPreviewRuntime(assessment: Assessment, api: Api1484_11 | null) {
  const sessionRef = useRef<ScormSession>(new ScormSession(api));
  const questionStartRef = useRef<number>(Date.now());

  const [runtimeState, setRuntimeState] = useState<RuntimeState>(() => ({
    suspendData: createNewAttempt(assessment, 1),
    attemptHistory: emptyAttemptHistory(),
  }));
  const [phase, setPhase] = useState<RuntimePhase>("inProgress");
  const [scoreResult, setScoreResult] = useState<AssessmentScoreResult | null>(null);
  const [initialized, setInitialized] = useState(false);

  if (!initialized) {
    sessionRef.current.initialize();
    sessionRef.current.setCompletionStatus("incomplete");
    setInitialized(true);
  }

  const update = useCallback((updater: (suspendData: SuspendData) => SuspendData) => {
    setRuntimeState((prev) => ({ ...prev, suspendData: updater(prev.suspendData) }));
  }, []);

  const answer = useCallback((questionId: string, value: ResponseValue) => update((s) => answerQuestion(s, questionId, value)), [update]);
  const flag = useCallback((questionId: string) => update((s) => toggleFlag(s, questionId)), [update]);
  const goTo = useCallback(
    (index: number) => {
      setPhase("inProgress");
      questionStartRef.current = Date.now();
      update((s) => goToIndex(s, index));
    },
    [update],
  );
  const next = useCallback(() => {
    setRuntimeState((prev) => {
      const isLast = prev.suspendData.currentQuestionIndex >= prev.suspendData.questionOrder.length - 1;
      if (isLast) {
        setPhase("review");
        return { ...prev, suspendData: markReviewShown(prev.suspendData) };
      }
      questionStartRef.current = Date.now();
      return { ...prev, suspendData: nextQuestion(prev.suspendData) };
    });
  }, []);
  const prev = useCallback(() => {
    questionStartRef.current = Date.now();
    update((s) => prevQuestion(s));
  }, [update]);
  const showReview = useCallback(() => {
    setPhase("review");
    update((s) => markReviewShown(s));
  }, [update]);

  const submit = useCallback(() => {
    const session = sessionRef.current;
    const outcome = submitAttempt(assessment, runtimeState.suspendData, runtimeState.attemptHistory);

    session.setCompletionStatus("completed");
    if (assessment.settings.scorm.reportSuccessStatus) {
      session.setSuccessStatus(outcome.scoreResult.passed ? "passed" : "failed");
    }
    session.setScore(outcome.scoreResult.rawScore, outcome.scoreResult.minScore, outcome.scoreResult.maxScore, outcome.scoreResult.scaledScore);

    if (assessment.settings.scorm.reportInteractions) {
      outcome.scoreResult.perQuestion.forEach((result, index) => {
        const question = assessment.questions.find((q) => q.id === result.questionId);
        if (!question) return;
        session.recordInteraction(index, buildInteraction(question, result, Date.now() - questionStartRef.current));
      });
    }
    session.commit();

    setRuntimeState({ suspendData: outcome.suspendData, attemptHistory: outcome.updatedHistory });
    setScoreResult(outcome.scoreResult);
    setPhase("results");
  }, [assessment, runtimeState.attemptHistory, runtimeState.suspendData]);

  const canRetry = useMemo(() => canStartNewAttempt(assessment, runtimeState.attemptHistory), [assessment, runtimeState.attemptHistory]);

  const retry = useCallback(() => {
    if (!canRetry) return;
    const attemptNumber = runtimeState.attemptHistory.attempts.length + 1;
    const reset = assessment.settings.attempts.resetAnswersBetweenAttempts;
    const fresh = createNewAttempt(assessment, attemptNumber);
    const nextSuspendData: SuspendData = reset ? fresh : { ...fresh, responses: runtimeState.suspendData.responses };
    sessionRef.current.setCompletionStatus("incomplete");
    setRuntimeState({ suspendData: nextSuspendData, attemptHistory: runtimeState.attemptHistory });
    setScoreResult(null);
    setPhase("inProgress");
  }, [assessment, canRetry, runtimeState.attemptHistory, runtimeState.suspendData.responses]);

  return {
    phase,
    suspendData: runtimeState.suspendData,
    scoreResult,
    canRetry,
    answer,
    next,
    prev,
    flag,
    goToIndex: goTo,
    showReview,
    submit,
    retry,
  };
}
