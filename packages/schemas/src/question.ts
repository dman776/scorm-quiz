import { z } from "zod";
import { IdSchema } from "./ids.js";
import { AnswerOptionSchema } from "./answerOption.js";
import { ScoringRuleSchema } from "./scoring.js";
import { QuestionFeedbackSchema } from "./feedback.js";

export const QuestionStatusSchema = z.enum(["draft", "smeReview", "approved", "retired"]);
export type QuestionStatus = z.infer<typeof QuestionStatusSchema>;

export const DifficultySchema = z.enum(["easy", "medium", "hard"]);
export type Difficulty = z.infer<typeof DifficultySchema>;

/** Every question type the data model knows about. Only the first three are
 * implemented end-to-end (rendering + scoring + SCORM reporting) in this
 * phase; the rest are reserved discriminants so the schema/type surface is
 * stable as they're added. See SUPPORTED_QUESTION_TYPES below. */
export const QuestionTypeSchema = z.enum([
  "singleSelect",
  "trueFalse",
  "multipleSelect",
  "singleSelectPill",
  "multiSelectPill",
  "singleCheckbox",
  "matching",
  "sequencing",
  "numeric",
  "shortAnswer",
]);
export type QuestionType = z.infer<typeof QuestionTypeSchema>;

/** Question types with a full authoring/scoring/SCORM-reporting implementation. */
export const SUPPORTED_QUESTION_TYPES = ["singleSelect", "trueFalse", "multipleSelect"] as const;
export type SupportedQuestionType = (typeof SUPPORTED_QUESTION_TYPES)[number];

export function isSupportedQuestionType(type: QuestionType): type is SupportedQuestionType {
  return (SUPPORTED_QUESTION_TYPES as readonly string[]).includes(type);
}

export function assertSupportedQuestionType(type: QuestionType): asserts type is SupportedQuestionType {
  if (!isSupportedQuestionType(type)) {
    throw new Error(
      `Question type "${type}" is not yet implemented in this build of SCORM Quiz Builder. ` +
        `Supported types: ${SUPPORTED_QUESTION_TYPES.join(", ")}. See ROADMAP.md.`,
    );
  }
}

const QuestionBaseSchema = z.object({
  id: IdSchema,
  number: z.number().int().min(1).optional(),
  sectionId: IdSchema.optional(),
  learningObjective: z.string().max(500).optional(),
  topic: z.string().max(500).optional(),
  prompt: z.string().min(1).max(10000),
  supportingText: z.string().max(10000).optional(),
  imageAssetId: z.string().optional(),
  imageAltText: z.string().max(1000).optional(),
  audioAssetId: z.string().optional(),
  required: z.boolean().default(true),
  shuffleOptions: z.boolean().default(false),
  excludeFromShuffle: z.boolean().default(false),
  feedback: QuestionFeedbackSchema.default({}),
  developerNotes: z.string().max(4000).optional(),
  smeNotes: z.string().max(4000).optional(),
  tags: z.array(z.string().max(100)).default([]),
  difficulty: DifficultySchema.optional(),
  status: QuestionStatusSchema.default("draft"),
});

export const SingleSelectQuestionSchema = QuestionBaseSchema.extend({
  type: z.literal("singleSelect"),
  presentation: z.enum(["radio", "pill", "singleCheckbox"]).default("radio"),
  options: z.array(AnswerOptionSchema).min(2),
  scoring: ScoringRuleSchema.default({}),
});
export type SingleSelectQuestion = z.infer<typeof SingleSelectQuestionSchema>;

export const TrueFalseQuestionSchema = QuestionBaseSchema.extend({
  type: z.literal("trueFalse"),
  trueLabel: z.string().min(1).max(100).default("True"),
  falseLabel: z.string().min(1).max(100).default("False"),
  correctAnswer: z.boolean(),
  points: z.number().min(0).default(1),
  trueFeedback: z.string().max(4000).optional(),
  falseFeedback: z.string().max(4000).optional(),
});
export type TrueFalseQuestion = z.infer<typeof TrueFalseQuestionSchema>;

export const MultipleSelectQuestionSchema = QuestionBaseSchema.extend({
  type: z.literal("multipleSelect"),
  presentation: z.enum(["checkbox", "pill"]).default("checkbox"),
  options: z.array(AnswerOptionSchema).min(2),
  scoring: ScoringRuleSchema.default({}),
  minSelections: z.number().int().min(0).optional(),
  maxSelections: z.number().int().min(1).optional(),
});
export type MultipleSelectQuestion = z.infer<typeof MultipleSelectQuestionSchema>;

// --- Reserved stub types (schema-valid, not yet renderable/scorable) ---

const StubQuestionSchema = (literal: Exclude<QuestionType, SupportedQuestionType>) =>
  QuestionBaseSchema.extend({
    type: z.literal(literal),
    options: z.array(AnswerOptionSchema).default([]),
    scoring: ScoringRuleSchema.default({}),
  });

export const SingleSelectPillQuestionSchema = StubQuestionSchema("singleSelectPill");
export const MultiSelectPillQuestionSchema = StubQuestionSchema("multiSelectPill");
export const SingleCheckboxQuestionSchema = StubQuestionSchema("singleCheckbox");
export const MatchingQuestionSchema = StubQuestionSchema("matching");
export const SequencingQuestionSchema = StubQuestionSchema("sequencing");
export const NumericQuestionSchema = StubQuestionSchema("numeric");
export const ShortAnswerQuestionSchema = StubQuestionSchema("shortAnswer");

export const QuestionSchema = z.discriminatedUnion("type", [
  SingleSelectQuestionSchema,
  TrueFalseQuestionSchema,
  MultipleSelectQuestionSchema,
  SingleSelectPillQuestionSchema,
  MultiSelectPillQuestionSchema,
  SingleCheckboxQuestionSchema,
  MatchingQuestionSchema,
  SequencingQuestionSchema,
  NumericQuestionSchema,
  ShortAnswerQuestionSchema,
]);
export type Question = z.infer<typeof QuestionSchema>;
