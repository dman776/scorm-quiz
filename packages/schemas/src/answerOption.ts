import { z } from "zod";
import { IdSchema } from "./ids.js";

export const AnswerOptionSchema = z.object({
  id: IdSchema,
  text: z.string().min(1).max(2000),
  isCorrect: z.boolean().default(false),
  /** Optional explicit score value for this option (weighted scoring). */
  scoreValue: z.number().finite().optional(),
  feedback: z.string().max(4000).optional(),
  rationale: z.string().max(4000).optional(),
  excludeFromShuffle: z.boolean().default(false),
});
export type AnswerOption = z.infer<typeof AnswerOptionSchema>;
