import type { MultipleSelectQuestion } from "@scorm-quiz/schemas";

export interface MultipleSelectViewProps {
  question: MultipleSelectQuestion;
  optionOrder: string[];
  value: string[];
  onChange: (value: string[]) => void;
}

export function MultipleSelectView({ question, optionOrder, value, onChange }: MultipleSelectViewProps) {
  const options = optionOrder
    .map((id) => question.options.find((o) => o.id === id))
    .filter((o): o is NonNullable<typeof o> => Boolean(o));

  const toggle = (optionId: string) => {
    if (value.includes(optionId)) {
      onChange(value.filter((id) => id !== optionId));
    } else {
      if (question.maxSelections !== undefined && value.length >= question.maxSelections) return;
      onChange([...value, optionId]);
    }
  };

  const hint =
    question.minSelections !== undefined || question.maxSelections !== undefined
      ? `Select ${question.minSelections ?? 0}${question.maxSelections ? `–${question.maxSelections}` : "+"} answers.`
      : "Select all that apply.";

  return (
    <fieldset className="sq-question sq-multiple-select">
      <legend className="sq-question-prompt">{question.prompt}</legend>
      {question.supportingText && <p className="sq-supporting-text">{question.supportingText}</p>}
      <p className="sq-hint">{hint}</p>
      <div className="sq-options">
        {options.map((option) => {
          const inputId = `${question.id}-${option.id}`;
          return (
            <label key={option.id} htmlFor={inputId} className="sq-option sq-option-checkbox">
              <input
                type="checkbox"
                id={inputId}
                name={question.id}
                value={option.id}
                checked={value.includes(option.id)}
                onChange={() => toggle(option.id)}
              />
              <span>{option.text}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
