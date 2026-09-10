import type { Question, QuestionType } from "@scorm-quiz/schemas";
import { generateId } from "@scorm-quiz/schemas";

/** Factory for a blank, schema-valid question of a given (supported) type,
 * used when the author clicks "Add question" in the editor. */
export function newQuestion(type: QuestionType): Question {
  const id = generateId("question");
  const base = {
    id,
    prompt: "",
    required: true,
    shuffleOptions: false,
    excludeFromShuffle: false,
    feedback: {},
    tags: [],
    status: "draft" as const,
  };

  if (type === "singleSelect") {
    return {
      ...base,
      type: "singleSelect",
      presentation: "radio",
      options: [
        { id: generateId("option"), text: "", isCorrect: true, excludeFromShuffle: false },
        { id: generateId("option"), text: "", isCorrect: false, excludeFromShuffle: false },
      ],
      scoring: { strategy: "allOrNothing", points: 1, incorrectPenalty: 0, allowNegativeQuestionScore: false },
    };
  }

  if (type === "multipleSelect") {
    return {
      ...base,
      type: "multipleSelect",
      presentation: "checkbox",
      options: [
        { id: generateId("option"), text: "", isCorrect: true, excludeFromShuffle: false },
        { id: generateId("option"), text: "", isCorrect: false, excludeFromShuffle: false },
      ],
      scoring: { strategy: "allOrNothing", points: 1, incorrectPenalty: 0, allowNegativeQuestionScore: false },
    };
  }

  // trueFalse (and default fallback — the editor UI only offers supported types)
  return {
    ...base,
    type: "trueFalse",
    trueLabel: "True",
    falseLabel: "False",
    correctAnswer: true,
    points: 1,
  };
}
