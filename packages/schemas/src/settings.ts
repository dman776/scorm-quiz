import { z } from "zod";
import { AssessmentScoringSettingsSchema } from "./scoring.js";
import { FeedbackTimingSchema } from "./feedback.js";

export const ScoreRetentionSchema = z.enum(["latest", "highest", "first"]);
export type ScoreRetention = z.infer<typeof ScoreRetentionSchema>;

export const AttemptSettingsSchema = z.object({
  unlimitedAttempts: z.boolean().default(false),
  maxAttempts: z.number().int().min(1).default(2),
  passingEndsAccess: z.boolean().default(false),
  allowAdditionalAttemptsAfterPassing: z.boolean().default(true),
  scoreRetention: ScoreRetentionSchema.default("highest"),
  resetAnswersBetweenAttempts: z.boolean().default(true),
});
export type AttemptSettings = z.infer<typeof AttemptSettingsSchema>;

export const NavigationModeSchema = z.enum(["onePerPage", "allOnOnePage", "sectionBySection"]);
export type NavigationMode = z.infer<typeof NavigationModeSchema>;

export const NavigationSettingsSchema = z.object({
  mode: NavigationModeSchema.default("onePerPage"),
  allowBackwardNavigation: z.boolean().default(true),
  requireAnswerBeforeContinuing: z.boolean().default(false),
  allowFlagForReview: z.boolean().default(true),
  showReviewScreenBeforeSubmit: z.boolean().default(true),
  showProgressIndicator: z.boolean().default(true),
  timeLimitMinutes: z.number().int().min(0).optional(),
  warnBeforeTimeExpiresMinutes: z.number().int().min(0).optional(),
  onTimeExpired: z.enum(["autoSubmit", "lockFurtherInput"]).default("autoSubmit"),
});
export type NavigationSettings = z.infer<typeof NavigationSettingsSchema>;

export const RandomizationSettingsSchema = z.object({
  shuffleQuestions: z.boolean().default(false),
  shuffleWithinSections: z.boolean().default(false),
  shuffleAnswerChoices: z.boolean().default(false),
  seed: z.number().int().optional(),
});
export type RandomizationSettings = z.infer<typeof RandomizationSettingsSchema>;

export const ResultsSettingsSchema = z.object({
  showScore: z.boolean().default(true),
  showPassFailStatus: z.boolean().default(true),
  showNumberCorrect: z.boolean().default(true),
  showCorrectAnswers: z.boolean().default(true),
  showLearnerAnswers: z.boolean().default(true),
  showQuestionFeedback: z.boolean().default(true),
  showRationale: z.boolean().default(true),
  feedbackTiming: FeedbackTimingSchema.default("afterSubmit"),
  showMissedQuestionsOnly: z.boolean().default(false),
  allowReviewAfterCompletion: z.boolean().default(true),
  passingMessage: z.string().max(4000).optional(),
  failingMessage: z.string().max(4000).optional(),
  attemptsExhaustedMessage: z.string().max(4000).optional(),
});
export type ResultsSettings = z.infer<typeof ResultsSettingsSchema>;

export const ScormVersionSchema = z.literal("2004_4th");
export type ScormVersion = z.infer<typeof ScormVersionSchema>;

export const ScormSettingsSchema = z.object({
  version: ScormVersionSchema.default("2004_4th"),
  /** Status set on the LMS when the learner submits the assessment. */
  completionOnSubmit: z.boolean().default(true),
  /** If true, success_status reflects pass/fail; if false, it's left "unknown". */
  reportSuccessStatus: z.boolean().default(true),
  reportInteractions: z.boolean().default(true),
  masteryScore: z.number().min(0).max(1).optional(),
  apiSearchMaxParentDepth: z.number().int().min(1).max(20).default(10),
});
export type ScormSettings = z.infer<typeof ScormSettingsSchema>;

export const AssessmentSettingsSchema = z.object({
  scoring: AssessmentScoringSettingsSchema.default({}),
  attempts: AttemptSettingsSchema.default({}),
  navigation: NavigationSettingsSchema.default({}),
  randomization: RandomizationSettingsSchema.default({}),
  results: ResultsSettingsSchema.default({}),
  scorm: ScormSettingsSchema.default({}),
});
export type AssessmentSettings = z.infer<typeof AssessmentSettingsSchema>;
