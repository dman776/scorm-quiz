import { z } from "zod";

export const FeedbackTimingSchema = z.enum([
  "immediately",
  "afterLeavingQuestion",
  "afterSubmit",
  "onlyAfterPassing",
  "onlyAfterFinalAttempt",
  "never",
]);
export type FeedbackTiming = z.infer<typeof FeedbackTimingSchema>;

export const QuestionFeedbackSchema = z.object({
  correct: z.string().max(4000).optional(),
  incorrect: z.string().max(4000).optional(),
  partiallyCorrect: z.string().max(4000).optional(),
});
export type QuestionFeedback = z.infer<typeof QuestionFeedbackSchema>;
