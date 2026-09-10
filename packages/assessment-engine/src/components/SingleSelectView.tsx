import type { SingleSelectQuestion } from "@scorm-quiz/schemas";

export interface SingleSelectViewProps {
  question: SingleSelectQuestion;
  optionOrder: string[];
  value: string | null;
  onChange: (value: string) => void;
}

/** Native radio inputs grouped in a <fieldset>/<legend> — the most robust,
 * screen-reader- and keyboard-accessible way to present a single-select
 * question (arrow-key navigation and selection come for free from the
 * browser's native radio-group behavior). */
export function SingleSelectView({ question, optionOrder, value, onChange }: SingleSelectViewProps) {
  const options = optionOrder
    .map((id) => question.options.find((o) => o.id === id))
    .filter((o): o is NonNullable<typeof o> => Boolean(o));

  return (
    <fieldset className="sq-question sq-single-select">
      <legend className="sq-question-prompt">{question.prompt}</legend>
      {question.supportingText && <p className="sq-supporting-text">{question.supportingText}</p>}
      <div className="sq-options" role="radiogroup" aria-label={question.prompt}>
        {options.map((option) => {
          const inputId = `${question.id}-${option.id}`;
          return (
            <label key={option.id} htmlFor={inputId} className="sq-option sq-option-radio">
              <input
                type="radio"
                id={inputId}
                name={question.id}
                value={option.id}
                checked={value === option.id}
                onChange={() => onChange(option.id)}
              />
              <span>{option.text}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
