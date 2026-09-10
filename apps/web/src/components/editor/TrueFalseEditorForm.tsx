import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { TrueFalseQuestionSchema, type TrueFalseQuestion } from "@scorm-quiz/schemas";

export interface TrueFalseEditorFormProps {
  question: TrueFalseQuestion;
  onChange: (question: TrueFalseQuestion) => void;
}

export function TrueFalseEditorForm({ question, onChange }: TrueFalseEditorFormProps) {
  const { register, handleSubmit, formState } = useForm<TrueFalseQuestion>({
    resolver: zodResolver(TrueFalseQuestionSchema),
    defaultValues: question,
  });

  return (
    <form onSubmit={handleSubmit((data) => onChange(TrueFalseQuestionSchema.parse(data)))} className="sq-question-form">
      <h3>True / False Question</h3>

      <label htmlFor="tf-prompt">Prompt</label>
      <textarea id="tf-prompt" {...register("prompt")} rows={2} />
      {formState.errors.prompt && <p className="sq-field-error">{formState.errors.prompt.message}</p>}

      <div className="sq-field-row">
        <div>
          <label htmlFor="tf-true-label">"True" label</label>
          <input id="tf-true-label" {...register("trueLabel")} />
        </div>
        <div>
          <label htmlFor="tf-false-label">"False" label</label>
          <input id="tf-false-label" {...register("falseLabel")} />
        </div>
      </div>

      <label htmlFor="tf-correct">Correct answer</label>
      <select id="tf-correct" {...register("correctAnswer", { setValueAs: (v) => v === "true" })}>
        <option value="true">True</option>
        <option value="false">False</option>
      </select>

      <label htmlFor="tf-points">Points</label>
      <input id="tf-points" type="number" step="0.5" min={0} {...register("points", { valueAsNumber: true })} />

      <label htmlFor="tf-feedback-correct">Correct feedback</label>
      <textarea id="tf-feedback-correct" {...register("feedback.correct")} rows={2} />
      <label htmlFor="tf-feedback-incorrect">Incorrect feedback</label>
      <textarea id="tf-feedback-incorrect" {...register("feedback.incorrect")} rows={2} />

      <button type="submit" className="sq-primary-button">
        Update Question
      </button>
    </form>
  );
}
