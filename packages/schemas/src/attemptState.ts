import { z } from "zod";
import { IdSchema } from "./ids.js";

/** A learner's response to one question, keyed by question id. Shape varies
 * by question type but is always JSON-serializable. */
export const ResponseValueSchema = z.union([
  z.string(),
  z.array(z.string()),
  z.boolean(),
  z.null(),
]);
export type ResponseValue = z.infer<typeof ResponseValueSchema>;

export const ResponsesMapSchema = z.record(IdSchema, ResponseValueSchema);
export type ResponsesMap = z.infer<typeof ResponsesMapSchema>;

/**
 * Serialized into cmi.suspend_data (and mirrored to cmi.location for the
 * current question index) so a learner can exit and resume without losing
 * progress or re-randomizing order. Versioned for forward migrations.
 */
export const SuspendDataSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  currentQuestionIndex: z.number().int().min(0).default(0),
  responses: ResponsesMapSchema.default({}),
  flaggedQuestionIds: z.array(IdSchema).default([]),
  /** Question ids in their (possibly randomized) display order — fixed at
   * first launch of an attempt, never regenerated on resume. */
  questionOrder: z.array(IdSchema).default([]),
  /** Per-question answer-option display order, when shuffled. */
  optionOrder: z.record(IdSchema, z.array(IdSchema)).default({}),
  attemptNumber: z.number().int().min(1).default(1),
  submitted: z.boolean().default(false),
  reviewScreenShown: z.boolean().default(false),
  remainingTimeSeconds: z.number().min(0).optional(),
  startedAt: z.string().datetime().optional(),
});
export type SuspendData = z.infer<typeof SuspendDataSchema>;

export const PerAttemptResultSchema = z.object({
  attemptNumber: z.number().int().min(1),
  rawScore: z.number(),
  maxScore: z.number(),
  scaledScore: z.number().min(-1).max(1),
  passed: z.boolean(),
  completedAt: z.string().datetime(),
});
export type PerAttemptResult = z.infer<typeof PerAttemptResultSchema>;

/** Full attempt history, stored alongside suspend data so score-retention
 * rules (latest/highest/first) can be applied across LMS re-launches. */
export const AttemptHistorySchema = z.object({
  schemaVersion: z.literal(1).default(1),
  attempts: z.array(PerAttemptResultSchema).default([]),
  locked: z.boolean().default(false),
});
export type AttemptHistory = z.infer<typeof AttemptHistorySchema>;
