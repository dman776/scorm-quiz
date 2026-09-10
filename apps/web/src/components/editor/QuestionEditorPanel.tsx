import type { Question } from "@scorm-quiz/schemas";
import { SingleSelectEditorForm } from "./SingleSelectEditorForm.js";
import { TrueFalseEditorForm } from "./TrueFalseEditorForm.js";
import { MultipleSelectEditorForm } from "./MultipleSelectEditorForm.js";

export interface QuestionEditorPanelProps {
  question: Question | null;
  onChange: (question: Question) => void;
}

export function QuestionEditorPanel({ question, onChange }: QuestionEditorPanelProps) {
  if (!question) {
    return (
      <div className="sq-panel sq-question-editor-panel">
        <p className="sq-empty-state">Select a question from the list, or add a new one.</p>
      </div>
    );
  }

  return (
    <div className="sq-panel sq-question-editor-panel">
      {/* key forces a clean form reset whenever the selected question changes */}
      {question.type === "singleSelect" && <SingleSelectEditorForm key={question.id} question={question} onChange={onChange} />}
      {question.type === "trueFalse" && <TrueFalseEditorForm key={question.id} question={question} onChange={onChange} />}
      {question.type === "multipleSelect" && (
        <MultipleSelectEditorForm key={question.id} question={question} onChange={onChange} />
      )}
      {question.type !== "singleSelect" && question.type !== "trueFalse" && question.type !== "multipleSelect" && (
        <p role="alert">
          Editing for question type "{question.type}" is not yet implemented in this build. See ROADMAP.md.
        </p>
      )}
    </div>
  );
}
