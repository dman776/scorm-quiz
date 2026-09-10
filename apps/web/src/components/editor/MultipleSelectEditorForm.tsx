import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MultipleSelectQuestionSchema, generateId, type MultipleSelectQuestion } from "@scorm-quiz/schemas";

export interface MultipleSelectEditorFormProps {
  question: MultipleSelectQuestion;
  onChange: (question: MultipleSelectQuestion) => void;
}

export function MultipleSelectEditorForm({ question, onChange }: MultipleSelectEditorFormProps) {
  const { register, control, handleSubmit, formState } = useForm<MultipleSelectQuestion>({
    resolver: zodResolver(MultipleSelectQuestionSchema),
    defaultValues: question,
  });
  const { fields, append, remove } = useFieldArray({ control, name: "options" });

  const toggleCorrect = (optionId: string) => {
    const updated = {
      ...question,
      options: question.options.map((o) => (o.id === optionId ? { ...o, isCorrect: !o.isCorrect } : o)),
    };
    onChange(MultipleSelectQuestionSchema.parse(updated));
  };

  return (
    <form onSubmit={handleSubmit((data) => onChange(MultipleSelectQuestionSchema.parse(data)))} className="sq-question-form">
      <h3>Multiple Select Question</h3>

      <label htmlFor="ms-prompt">Prompt</label>
      <textarea id="ms-prompt" {...register("prompt")} rows={2} />
      {formState.errors.prompt && <p className="sq-field-error">{formState.errors.prompt.message}</p>}

      <label htmlFor="ms-strategy">Scoring strategy</label>
      <select id="ms-strategy" {...register("scoring.strategy")}>
        <option value="allOrNothing">All or nothing</option>
        <option value="partialCredit">Partial credit</option>
        <option value="weighted">Weighted per-answer</option>
      </select>

      <label htmlFor="ms-points">Points</label>
      <input id="ms-points" type="number" step="0.5" min={0} {...register("scoring.points", { valueAsNumber: true })} />

      <label htmlFor="ms-penalty">Incorrect-selection penalty (0-1, partial credit only)</label>
      <input
        id="ms-penalty"
        type="number"
        step="0.1"
        min={0}
        max={1}
        {...register("scoring.incorrectPenalty", { valueAsNumber: true })}
      />

      <label className="sq-checkbox-label">
        <input type="checkbox" {...register("scoring.allowNegativeQuestionScore")} />
        Allow this question's score to go negative
      </label>

      <fieldset>
        <legend>Answer options (check all that are correct)</legend>
        {fields.map((field, index) => (
          <div key={field.id} className="sq-option-editor-row">
            <input
              type="checkbox"
              checked={question.options[index]?.isCorrect ?? false}
              onChange={() => {
                const optionId = question.options[index]?.id;
                if (optionId) toggleCorrect(optionId);
              }}
              aria-label={`Mark option ${index + 1} as correct`}
            />
            <input
              {...register(`options.${index}.text` as const)}
              aria-label={`Option ${index + 1} text`}
              placeholder="Answer text"
            />
            <button type="button" onClick={() => remove(index)} disabled={fields.length <= 2}>
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => append({ id: generateId("option"), text: "", isCorrect: false, excludeFromShuffle: false })}
        >
          Add option
        </button>
      </fieldset>

      <label htmlFor="ms-feedback-correct">Correct feedback</label>
      <textarea id="ms-feedback-correct" {...register("feedback.correct")} rows={2} />
      <label htmlFor="ms-feedback-partial">Partially-correct feedback</label>
      <textarea id="ms-feedback-partial" {...register("feedback.partiallyCorrect")} rows={2} />
      <label htmlFor="ms-feedback-incorrect">Incorrect feedback</label>
      <textarea id="ms-feedback-incorrect" {...register("feedback.incorrect")} rows={2} />

      <button type="submit" className="sq-primary-button">
        Update Question
      </button>
    </form>
  );
}
