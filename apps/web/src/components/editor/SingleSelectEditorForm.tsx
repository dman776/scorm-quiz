import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SingleSelectQuestionSchema, generateId, type SingleSelectQuestion } from "@scorm-quiz/schemas";

export interface SingleSelectEditorFormProps {
  question: SingleSelectQuestion;
  onChange: (question: SingleSelectQuestion) => void;
}

export function SingleSelectEditorForm({ question, onChange }: SingleSelectEditorFormProps) {
  const { register, control, handleSubmit, formState } = useForm<SingleSelectQuestion>({
    resolver: zodResolver(SingleSelectQuestionSchema),
    defaultValues: question,
  });
  const { fields, append, remove } = useFieldArray({ control, name: "options" });

  const setCorrect = (optionId: string, current: SingleSelectQuestion) => {
    const updated = { ...current, options: current.options.map((o) => ({ ...o, isCorrect: o.id === optionId })) };
    onChange(SingleSelectQuestionSchema.parse(updated));
  };

  return (
    <form onSubmit={handleSubmit((data) => onChange(SingleSelectQuestionSchema.parse(data)))} className="sq-question-form">
      <h3>Single Select Question</h3>

      <label htmlFor="prompt">Prompt</label>
      <textarea id="prompt" {...register("prompt")} rows={2} />
      {formState.errors.prompt && <p className="sq-field-error">{formState.errors.prompt.message}</p>}

      <label htmlFor="presentation">Presentation</label>
      <select id="presentation" {...register("presentation")}>
        <option value="radio">Radio buttons</option>
        <option value="pill">Single-select pill</option>
      </select>

      <label htmlFor="points">Points</label>
      <input id="points" type="number" step="0.5" min={0} {...register("scoring.points", { valueAsNumber: true })} />

      <fieldset>
        <legend>Answer options</legend>
        {fields.map((field, index) => (
          <div key={field.id} className="sq-option-editor-row">
            <input
              type="radio"
              name="correct-option"
              checked={question.options[index]?.isCorrect ?? false}
              onChange={() => {
                const optionId = question.options[index]?.id;
                if (optionId) setCorrect(optionId, question);
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

      <label htmlFor="feedback-correct">Correct feedback</label>
      <textarea id="feedback-correct" {...register("feedback.correct")} rows={2} />
      <label htmlFor="feedback-incorrect">Incorrect feedback</label>
      <textarea id="feedback-incorrect" {...register("feedback.incorrect")} rows={2} />

      <button type="submit" className="sq-primary-button">
        Update Question
      </button>
    </form>
  );
}
