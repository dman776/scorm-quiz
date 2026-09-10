import { useEffect, useState } from "react";
import type { Assessment } from "@scorm-quiz/schemas";
import { AssessmentSchema } from "@scorm-quiz/schemas";
import {
  NavigationControls,
  ProgressIndicator,
  QuestionRenderer,
  ResultsScreen,
  ReviewScreen,
} from "@scorm-quiz/assessment-engine";
import { useAssessmentRuntime } from "./useAssessmentRuntime.js";

interface RuntimeConfigFile {
  assessment: unknown;
}

function useLoadedAssessment() {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("./assessment-config.json")
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load assessment-config.json (${res.status})`);
        return res.json();
      })
      .then((config: RuntimeConfigFile) => {
        const parsed = AssessmentSchema.safeParse(config.assessment);
        if (!parsed.success) {
          setError("The bundled assessment configuration is invalid.");
          return;
        }
        setAssessment(parsed.data);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return { assessment, error };
}

function isAnswerPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.length > 0;
  return true;
}

export function App() {
  const { assessment, error } = useLoadedAssessment();

  if (error) {
    return (
      <div className="sq-runtime-error" role="alert">
        <h1>Unable to load assessment</h1>
        <p>{error}</p>
      </div>
    );
  }
  if (!assessment) {
    return (
      <div className="sq-runtime-loading" role="status">
        Loading assessment…
      </div>
    );
  }
  return <AssessmentRunner assessment={assessment} />;
}

function AssessmentRunner({ assessment }: { assessment: Assessment }) {
  const runtime = useAssessmentRuntime(assessment);
  const { suspendData } = runtime;
  const currentQuestionId = suspendData.questionOrder[suspendData.currentQuestionIndex];
  const currentQuestion = assessment.questions.find((q) => q.id === currentQuestionId);
  const isLast = suspendData.currentQuestionIndex >= suspendData.questionOrder.length - 1;

  return (
    <div className="sq-runtime">
      {runtime.isStandalone && (
        <div className="sq-standalone-banner" role="status">
          Standalone Preview Mode — no LMS detected. Progress and scores will not be saved.
        </div>
      )}

      <header className="sq-runtime-header">
        <h1>{assessment.title}</h1>
      </header>

      {runtime.phase === "inProgress" && currentQuestion && (
        <main>
          {assessment.settings.navigation.showProgressIndicator && (
            <ProgressIndicator currentIndex={suspendData.currentQuestionIndex} total={suspendData.questionOrder.length} />
          )}
          <QuestionRenderer
            question={currentQuestion}
            optionOrder={suspendData.optionOrder[currentQuestion.id] ?? []}
            value={suspendData.responses[currentQuestion.id] ?? null}
            onChange={(value) => runtime.answer(currentQuestion.id, value)}
          />
          <NavigationControls
            canGoBack={assessment.settings.navigation.allowBackwardNavigation && suspendData.currentQuestionIndex > 0}
            canGoNext={true}
            isLastQuestion={isLast}
            allowFlag={assessment.settings.navigation.allowFlagForReview}
            flagged={suspendData.flaggedQuestionIds.includes(currentQuestion.id)}
            onBack={runtime.prev}
            onNext={runtime.next}
            onToggleFlag={() => runtime.flag(currentQuestion.id)}
            disableNextUntilAnswered={assessment.settings.navigation.requireAnswerBeforeContinuing}
            hasAnswer={isAnswerPresent(suspendData.responses[currentQuestion.id])}
          />
        </main>
      )}

      {runtime.phase === "review" && (
        <ReviewScreen
          assessment={assessment}
          questionOrder={suspendData.questionOrder}
          responses={suspendData.responses}
          flaggedQuestionIds={suspendData.flaggedQuestionIds}
          onJumpTo={(index) => {
            runtime.goToIndex(index);
          }}
          onSubmit={runtime.submit}
        />
      )}

      {runtime.phase === "results" && runtime.scoreResult && (
        <>
          <ResultsScreen
            assessment={assessment}
            scoreResult={runtime.scoreResult}
            attemptsRemaining={assessment.settings.attempts.unlimitedAttempts ? "unlimited" : runtime.canRetry ? 1 : 0}
          />
          {runtime.canRetry && (
            <button type="button" className="sq-retry-button" onClick={runtime.retry}>
              Start new attempt
            </button>
          )}
        </>
      )}
    </div>
  );
}
