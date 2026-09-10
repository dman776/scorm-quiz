import type { Assessment } from "@scorm-quiz/schemas";
import type { AssessmentScoreResult } from "@scorm-quiz/scoring-engine";

export interface ResultsScreenProps {
  assessment: Assessment;
  scoreResult: AssessmentScoreResult;
  attemptsRemaining: number | "unlimited" | 0;
}

export function ResultsScreen({ assessment, scoreResult, attemptsRemaining }: ResultsScreenProps) {
  const { results } = assessment.settings;
  const percent = scoreResult.maxScore > 0 ? Math.round((scoreResult.rawScore / scoreResult.maxScore) * 100) : 0;
  const message = scoreResult.passed ? results.passingMessage : results.failingMessage;
  const questionsById = new Map(assessment.questions.map((q) => [q.id, q]));

  const showDetails = results.showCorrectAnswers || results.showLearnerAnswers || results.showQuestionFeedback;
  const questionsToShow = results.showMissedQuestionsOnly
    ? scoreResult.perQuestion.filter((r) => r.outcome !== "correct")
    : scoreResult.perQuestion;

  return (
    <div className="sq-results-screen" role="region" aria-label="Assessment results">
      <h2>{scoreResult.passed ? "You passed!" : "Assessment complete"}</h2>
      <p className={`sq-pass-fail ${scoreResult.passed ? "sq-passed" : "sq-failed"}`}>
        {results.showPassFailStatus && (scoreResult.passed ? "Passed" : "Not passed")}
      </p>
      {results.showScore && (
        <p className="sq-score">
          Score: {scoreResult.rawScore} / {scoreResult.maxScore} ({percent}%)
        </p>
      )}
      {results.showNumberCorrect && (
        <p className="sq-number-correct">
          {scoreResult.numberCorrect} of {scoreResult.numberOfQuestions} correct
        </p>
      )}
      {message && <p className="sq-custom-message">{message}</p>}
      {attemptsRemaining !== "unlimited" && attemptsRemaining === 0 && assessment.settings.results.attemptsExhaustedMessage && (
        <p className="sq-attempts-exhausted">{assessment.settings.results.attemptsExhaustedMessage}</p>
      )}

      {showDetails && (
        <ol className="sq-results-details">
          {questionsToShow.map((r) => {
            const question = questionsById.get(r.questionId);
            if (!question) return null;
            return (
              <li key={r.questionId} className={`sq-result-item sq-outcome-${r.outcome}`}>
                <p className="sq-result-prompt">{question.prompt}</p>
                {results.showLearnerAnswers && <p className="sq-your-answer">Your answer recorded.</p>}
                {results.showQuestionFeedback && question.feedback && (
                  <p className="sq-question-feedback">
                    {r.outcome === "correct" ? question.feedback.correct : question.feedback.incorrect}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
