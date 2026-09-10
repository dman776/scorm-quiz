import { z } from "zod";
import { IdSchema } from "./ids.js";
import { QuestionSchema } from "./question.js";
import { AssessmentSettingsSchema } from "./settings.js";

export const AssessmentStatusSchema = z.enum(["draft", "readyForReview", "published", "archived"]);
export type AssessmentStatus = z.infer<typeof AssessmentStatusSchema>;

export const AssessmentSectionSchema = z.object({
  id: IdSchema,
  title: z.string().min(1).max(500),
  description: z.string().max(4000).optional(),
  order: z.number().int().min(0).default(0),
});
export type AssessmentSection = z.infer<typeof AssessmentSectionSchema>;

export const AssessmentSchema = z.object({
  id: IdSchema,
  schemaVersion: z.literal(1).default(1),
  title: z.string().min(1).max(500),
  internalId: z.string().min(1).max(200),
  lmsTitle: z.string().max(500).optional(),
  description: z.string().max(4000).optional(),
  learnerInstructions: z.string().max(10000).optional(),
  language: z.string().min(2).max(20).default("en"),
  version: z.string().max(50).default("1.0.0"),
  author: z.string().max(200).optional(),
  copyright: z.string().max(1000).optional(),
  courseId: z.string().max(200).optional(),
  status: AssessmentStatusSchema.default("draft"),
  sections: z.array(AssessmentSectionSchema).default([]),
  questions: z.array(QuestionSchema).default([]),
  settings: AssessmentSettingsSchema.default({}),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
  updatedAt: z.string().datetime().default(() => new Date().toISOString()),
});
export type Assessment = z.infer<typeof AssessmentSchema>;

/** Sum of each question's maximum achievable points, honoring a manual override. */
export function computeMaxPoints(assessment: Assessment): number {
  if (assessment.settings.scoring.maxScoreOverride !== undefined) {
    return assessment.settings.scoring.maxScoreOverride;
  }
  return assessment.questions.reduce((sum, q) => {
    if (q.type === "trueFalse") return sum + q.points;
    if (q.type === "singleSelect" || q.type === "multipleSelect") return sum + q.scoring.points;
    return sum;
  }, 0);
}

/** Keeps passingScorePoints in sync with passingScorePercent given the current max points. */
export function computePassingScorePoints(assessment: Assessment): number {
  const max = computeMaxPoints(assessment);
  return (assessment.settings.scoring.passingScorePercent / 100) * max;
}
