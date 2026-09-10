import type { Question, ResponseValue } from "@scorm-quiz/schemas";
import { SingleSelectView } from "./SingleSelectView.js";
import { MultipleSelectView } from "./MultipleSelectView.js";
import { TrueFalseView } from "./TrueFalseView.js";

export interface QuestionRendererProps {
  question: Question;
  optionOrder: string[];
  value: ResponseValue;
  onChange: (value: ResponseValue) => void;
}

/**
 * Dispatches to the accessible view component for the question's type. Used
 * by both the authoring Learner Preview and the exported SCORM runtime, so
 * there is exactly one rendering implementation per question type.
 */
export function QuestionRenderer({ question, optionOrder, value, onChange }: QuestionRendererProps) {
  switch (question.type) {
    case "singleSelect":
      return (
        <SingleSelectView
          question={question}
          optionOrder={optionOrder}
          value={typeof value === "string" ? value : null}
          onChange={(v) => onChange(v)}
        />
      );
    case "multipleSelect":
      return (
        <MultipleSelectView
          question={question}
          optionOrder={optionOrder}
          value={Array.isArray(value) ? value : []}
          onChange={(v) => onChange(v)}
        />
      );
    case "trueFalse":
      return (
        <TrueFalseView question={question} value={typeof value === "boolean" ? value : null} onChange={(v) => onChange(v)} />
      );
    default:
      return (
        <div className="sq-question sq-unsupported" role="alert">
          Question type "{question.type}" is not yet supported by this build's learner runtime.
        </div>
      );
  }
}
