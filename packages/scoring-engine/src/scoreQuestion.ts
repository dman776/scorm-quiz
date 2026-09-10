import { assertSupportedQuestionType, type Question } from "@scorm-quiz/schemas";
import type { QuestionScoreResult } from "./types.js";
import { scoreSingleSelect } from "./scoreSingleSelect.js";
import { scoreTrueFalse } from "./scoreTrueFalse.js";
import { scoreMultipleSelect } from "./scoreMultipleSelect.js";

/** Dispatches to the correct per-type scorer. Throws for question types not
 * yet implemented (see SUPPORTED_QUESTION_TYPES in @scorm-quiz/schemas). */
export function scoreQuestion(question: Question, response: unknown): QuestionScoreResult {
  assertSupportedQuestionType(question.type);
  switch (question.type) {
    case "singleSelect":
      return scoreSingleSelect(question, response);
    case "trueFalse":
      return scoreTrueFalse(question, response);
    case "multipleSelect":
      return scoreMultipleSelect(question, response);
  }
}
