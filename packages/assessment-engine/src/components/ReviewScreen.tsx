import type { Assessment, ResponsesMap } from "@scorm-quiz/schemas";

export interface ReviewScreenProps {
  assessment: Assessment;
  questionOrder: string[];
  responses: ResponsesMap;
  flaggedQuestionIds: string[];
  onJumpTo: (index: number) => void;
  onSubmit: () => void;
}

function isAnswered(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.length > 0;
  return true;
}

export function ReviewScreen({ assessment, questionOrder, responses, flaggedQuestionIds, onJumpTo, onSubmit }: ReviewScreenProps) {
  const questionsById = new Map(assessment.questions.map((q) => [q.id, q]));
  const unansweredCount = questionOrder.filter((id) => !isAnswered(responses[id])).length;

  return (
    <div className="sq-review-screen">
      <h2>Review your answers</h2>
      {unansweredCount > 0 && (
        <p role="status" className="sq-review-warning">
          {unansweredCount} question{unansweredCount === 1 ? "" : "s"} left unanswered.
        </p>
      )}
      <ol className="sq-review-list">
        {questionOrder.map((id, index) => {
          const question = questionsById.get(id);
          if (!question) return null;
          const answered = isAnswered(responses[id]);
          const flagged = flaggedQuestionIds.includes(id);
          return (
            <li key={id} className="sq-review-item">
              <button type="button" onClick={() => onJumpTo(index)} className="sq-review-jump">
                <span className="sq-review-number">Q{index + 1}</span>
                <span className="sq-review-prompt">{question.prompt}</span>
                <span className={`sq-review-status ${answered ? "sq-answered" : "sq-unanswered"}`}>
                  {answered ? "Answered" : "Not answered"}
                </span>
                {flagged && <span className="sq-review-flag">Flagged</span>}
              </button>
            </li>
          );
        })}
      </ol>
      <button type="button" onClick={onSubmit} className="sq-submit-button">
        Submit Assessment
      </button>
    </div>
  );
}
