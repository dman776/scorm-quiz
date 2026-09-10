import { useState } from "react";
import type { Question, QuestionType } from "@scorm-quiz/schemas";
import { SUPPORTED_QUESTION_TYPES } from "@scorm-quiz/schemas";

export interface QuestionListPanelProps {
  questions: Question[];
  selectedQuestionId: string | null;
  onSelect: (id: string) => void;
  onAdd: (type: QuestionType) => void;
  onDuplicate: (question: Question) => void;
  onDelete: (question: Question) => void;
  onMove: (question: Question, direction: -1 | 1) => void;
}

const TYPE_LABELS: Record<string, string> = {
  singleSelect: "Single Select",
  trueFalse: "True / False",
  multipleSelect: "Multiple Select",
};

export function QuestionListPanel({ questions, selectedQuestionId, onSelect, onAdd, onDuplicate, onDelete, onMove }: QuestionListPanelProps) {
  const [addType, setAddType] = useState<QuestionType>("singleSelect");

  return (
    <nav className="sq-panel sq-question-list-panel" aria-label="Question list">
      <h2>Questions ({questions.length})</h2>
      <ol className="sq-question-list">
        {questions.map((q, index) => (
          <li key={q.id}>
            <button
              type="button"
              className={`sq-question-list-item ${selectedQuestionId === q.id ? "sq-selected" : ""}`}
              onClick={() => onSelect(q.id)}
              aria-current={selectedQuestionId === q.id ? "true" : undefined}
            >
              <span className="sq-question-index">{index + 1}.</span>
              <span className="sq-question-type-tag">{TYPE_LABELS[q.type] ?? q.type}</span>
              <span className="sq-question-list-prompt">{q.prompt || "(empty prompt)"}</span>
            </button>
            <div className="sq-question-list-item-actions">
              <button type="button" onClick={() => onMove(q, -1)} disabled={index === 0} aria-label={`Move question ${index + 1} up`}>
                ↑
              </button>
              <button
                type="button"
                onClick={() => onMove(q, 1)}
                disabled={index === questions.length - 1}
                aria-label={`Move question ${index + 1} down`}
              >
                ↓
              </button>
              <button type="button" onClick={() => onDuplicate(q)} aria-label={`Duplicate question ${index + 1}`}>
                Duplicate
              </button>
              <button type="button" onClick={() => onDelete(q)} aria-label={`Delete question ${index + 1}`} className="sq-danger-button">
                Delete
              </button>
            </div>
          </li>
        ))}
      </ol>

      <div className="sq-add-question">
        <label htmlFor="add-question-type">Question type</label>
        <select id="add-question-type" value={addType} onChange={(e) => setAddType(e.target.value as QuestionType)}>
          {SUPPORTED_QUESTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => onAdd(addType)} className="sq-primary-button">
          Add Question
        </button>
      </div>
    </nav>
  );
}
