import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Assessment, ResponseValue, SuspendData } from "@scorm-quiz/schemas";
import {
  answerQuestion,
  canStartNewAttempt,
  createNewAttempt,
  deserializeRuntimeState,
  emptyAttemptHistory,
  goToIndex,
  markReviewShown,
  nextQuestion,
  prevQuestion,
  serializeRuntimeState,
  submitAttempt,
  toggleFlag,
  type RuntimeState,
} from "@scorm-quiz/assessment-engine";
import { aggregateAssessmentScore, type AssessmentScoreResult } from "@scorm-quiz/scoring-engine";
import { ScormSession, buildInteraction, findScormApi } from "@scorm-quiz/scorm-runtime";

export type RuntimePhase = "inProgress" | "review" | "results";

export interface AssessmentRuntime {
  phase: RuntimePhase;
  suspendData: SuspendData;
  isStandalone: boolean;
  scoreResult: AssessmentScoreResult | null;
  canRetry: boolean;
  answer: (questionId: string, value: ResponseValue) => void;
  next: () => void;
  prev: () => void;
  flag: (questionId: string) => void;
  goToIndex: (index: number) => void;
  showReview: () => void;
  submit: () => void;
  retry: () => void;
}

/**
 * Wires the shared assessment-engine session logic + scoring engine to a
 * live (or standalone) SCORM session. This is the one place the exported
 * runtime differs from the authoring app's Learner Preview: everything
 * upstream of this hook (rendering, scoring, session state transitions) is
 * shared code from @scorm-quiz/assessment-engine and @scorm-quiz/scoring-engine.
 */
export function useAssessmentRuntime(assessment: Assessment): AssessmentRuntime {
  const sessionRef = useRef<ScormSession | null>(null);
  const questionStartRef = useRef<number>(Date.now());
  const phaseRef = useRef<RuntimePhase>("inProgress");

  const [runtimeState, setRuntimeState] = useState<RuntimeState>(() => ({
    suspendData: createNewAttempt(assessment, 1),
    attemptHistory: emptyAttemptHistory(),
  }));
  const [phase, setPhaseState] = useState<RuntimePhase>("inProgress");
  const [scoreResult, setScoreResult] = useState<AssessmentScoreResult | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  const setPhase = useCallback((p: RuntimePhase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  // --- Initialize once on mount: locate the LMS, resume prior state. ---
  useEffect(() => {
    const api = findScormApi(window, assessment.settings.scorm.apiSearchMaxParentDepth);
    const session = new ScormSession(api);
    sessionRef.current = session;
    setIsStandalone(session.isStandalone);
    session.initialize();

    const resumed = deserializeRuntimeState(session.getSuspendData());
    if (resumed) {
      setRuntimeState(resumed);
      setPhase(resumed.suspendData.submitted ? "results" : resumed.suspendData.reviewScreenShown ? "review" : "inProgress");
      if (resumed.suspendData.submitted && resumed.attemptHistory.attempts.length > 0) {
        // Recompute the score view from persisted responses so the results
        // screen is consistent even if this is a brand-new page load.
        setScoreResult(aggregateAssessmentScore(assessment, resumed.suspendData.responses));
      }
    } else {
      session.setCompletionStatus("incomplete");
    }

    const handleUnload = () => {
      const current = sessionRef.current;
      if (!current) return;
      current.terminate(phaseRef.current === "results" ? "normal" : "suspend");
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback((state: RuntimeState) => {
    const session = sessionRef.current;
    if (!session) return;
    session.setSuspendData(serializeRuntimeState(state));
    session.setLocation(String(state.suspendData.currentQuestionIndex));
    session.commit();
  }, []);

  const update = useCallback(
    (updater: (suspendData: SuspendData) => SuspendData) => {
      setRuntimeState((prev) => {
        const next = { ...prev, suspendData: updater(prev.suspendData) };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const answer = useCallback((questionId: string, value: ResponseValue) => update((s) => answerQuestion(s, questionId, value)), [update]);
  const flag = useCallback((questionId: string) => update((s) => toggleFlag(s, questionId)), [update]);
  const goTo = useCallback(
    (index: number) => {
      questionStartRef.current = Date.now();
      setPhase("inProgress");
      update((s) => goToIndex(s, index));
    },
    [setPhase, update],
  );
  const next = useCallback(() => {
    const isLast = runtimeState.suspendData.currentQuestionIndex >= runtimeState.suspendData.questionOrder.length - 1;
    if (isLast) {
      setPhase("review");
      update((s) => markReviewShown(s));
    } else {
      questionStartRef.current = Date.now();
      update((s) => nextQuestion(s));
    }
  }, [runtimeState.suspendData.currentQuestionIndex, runtimeState.suspendData.questionOrder.length, update]);
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
    const nextState: RuntimeState = { suspendData: outcome.suspendData, attemptHistory: outcome.updatedHistory };

    if (session) {
      session.setCompletionStatus("completed");
      if (assessment.settings.scorm.reportSuccessStatus) {
        session.setSuccessStatus(outcome.scoreResult.passed ? "passed" : "failed");
      }
      session.setScore(outcome.scoreResult.rawScore, outcome.scoreResult.minScore, outcome.scoreResult.maxScore, outcome.scoreResult.scaledScore);
      session.setProgressMeasure(1);

      if (assessment.settings.scorm.reportInteractions) {
        outcome.scoreResult.perQuestion.forEach((result, index) => {
          const question = assessment.questions.find((q) => q.id === result.questionId);
          if (!question) return;
          const interaction = buildInteraction(question, result, Date.now() - questionStartRef.current);
          session.recordInteraction(index, interaction);
        });
      }

      session.setSuspendData(serializeRuntimeState(nextState));
      session.commit();
    }

    setRuntimeState(nextState);
    setScoreResult(outcome.scoreResult);
    setPhase("results");
  }, [assessment, runtimeState.attemptHistory, runtimeState.suspendData]);

  const canRetry = useMemo(
    () => canStartNewAttempt(assessment, runtimeState.attemptHistory),
    [assessment, runtimeState.attemptHistory],
  );

  const retry = useCallback(() => {
    if (!canRetry) return;
    const attemptNumber = runtimeState.attemptHistory.attempts.length + 1;
    const reset = assessment.settings.attempts.resetAnswersBetweenAttempts;
    const freshAttempt = createNewAttempt(assessment, attemptNumber);
    const nextSuspendData: SuspendData = reset
      ? freshAttempt
      : { ...freshAttempt, responses: runtimeState.suspendData.responses };
    const nextState: RuntimeState = { suspendData: nextSuspendData, attemptHistory: runtimeState.attemptHistory };
    persist(nextState);
    sessionRef.current?.setCompletionStatus("incomplete");
    setRuntimeState(nextState);
    setScoreResult(null);
    setPhase("inProgress");
  }, [assessment, canRetry, persist, runtimeState.attemptHistory, runtimeState.suspendData.responses]);

  return {
    phase,
    suspendData: runtimeState.suspendData,
    isStandalone,
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
