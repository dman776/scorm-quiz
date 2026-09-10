import type { TrueFalseQuestion } from "@scorm-quiz/schemas";

export interface TrueFalseViewProps {
  question: TrueFalseQuestion;
  value: boolean | null;
  onChange: (value: boolean) => void;
}

export function TrueFalseView({ question, value, onChange }: TrueFalseViewProps) {
  return (
    <fieldset className="sq-question sq-true-false">
      <legend className="sq-question-prompt">{question.prompt}</legend>
      {question.supportingText && <p className="sq-supporting-text">{question.supportingText}</p>}
      <div className="sq-options" role="radiogroup" aria-label={question.prompt}>
        {(
          [
            [true, question.trueLabel],
            [false, question.falseLabel],
          ] as const
        ).map(([boolValue, label]) => {
          const inputId = `${question.id}-${boolValue}`;
          return (
            <label key={String(boolValue)} htmlFor={inputId} className="sq-option sq-option-radio">
              <input
                type="radio"
                id={inputId}
                name={question.id}
                checked={value === boolValue}
                onChange={() => onChange(boolValue)}
              />
              <span>{label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
