import type { Assessment } from "@scorm-quiz/schemas";
import { NavigationControls, ProgressIndicator, QuestionRenderer, ResultsScreen, ReviewScreen } from "@scorm-quiz/assessment-engine";

function isAnswerPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.length > 0;
  return true;
}

export interface PreviewRunnerProps {
  assessment: Assessment;
  runtime: ReturnType<typeof import("./useAssessmentPreviewRuntime.js").useAssessmentPreviewRuntime>;
}

export function PreviewRunner({ assessment, runtime }: PreviewRunnerProps) {
  const { suspendData } = runtime;
  const currentQuestionId = suspendData.questionOrder[suspendData.currentQuestionIndex];
  const currentQuestion = assessment.questions.find((q) => q.id === currentQuestionId);
  const isLast = suspendData.currentQuestionIndex >= suspendData.questionOrder.length - 1;

  if (assessment.questions.length === 0) {
    return <p className="sq-empty-state">This assessment has no questions yet.</p>;
  }

  return (
    <div className="sq-runtime">
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
          onJumpTo={runtime.goToIndex}
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
