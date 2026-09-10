import { z } from "zod";

/**
 * How a multi-answer question's score is derived from per-answer selections.
 * - allOrNothing: full points only if the selection set exactly matches the correct set
 * - partialCredit: fraction of points = (correct selected - incorrect selected) / correct total, clamped
 * - weighted: sum of each selected answer's own scoreValue, clamped to [0, maxPoints] unless allowNegative
 */
export const ScoringStrategySchema = z.enum(["allOrNothing", "partialCredit", "weighted"]);
export type ScoringStrategy = z.infer<typeof ScoringStrategySchema>;

export const ScoringRuleSchema = z.object({
  strategy: ScoringStrategySchema.default("allOrNothing"),
  /** Points awarded for a fully correct response. */
  points: z.number().finite().min(0).default(1),
  /** Penalty per incorrect selection when strategy = partialCredit. 0..1 fraction of `points`. */
  incorrectPenalty: z.number().min(0).max(1).default(0),
  /** If false (default), a question's score can never go below 0. */
  allowNegativeQuestionScore: z.boolean().default(false),
});
export type ScoringRule = z.infer<typeof ScoringRuleSchema>;

export const ScoreRoundingSchema = z.enum(["none", "nearestInteger", "twoDecimal"]);
export type ScoreRounding = z.infer<typeof ScoreRoundingSchema>;

export const UnansweredTreatmentSchema = z.enum(["incorrect", "excludeFromScoring"]);
export type UnansweredTreatment = z.infer<typeof UnansweredTreatmentSchema>;

export const AssessmentScoringSettingsSchema = z.object({
  passingScorePercent: z.number().min(0).max(100).default(80),
  /** Kept in sync with passingScorePercent by the authoring UI; derived from totalPoints. */
  passingScorePoints: z.number().min(0).default(0),
  allowPartialCredit: z.boolean().default(true),
  rounding: ScoreRoundingSchema.default("nearestInteger"),
  minScore: z.number().default(0),
  /** Manual override; if unset, computed as the sum of all question max points. */
  maxScoreOverride: z.number().min(0).optional(),
  unansweredTreatment: UnansweredTreatmentSchema.default("incorrect"),
});
export type AssessmentScoringSettings = z.infer<typeof AssessmentScoringSettingsSchema>;
