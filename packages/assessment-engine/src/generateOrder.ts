import type { Assessment } from "@scorm-quiz/schemas";
import { mulberry32, shuffle } from "./seededRandom.js";

export interface GeneratedOrder {
  questionOrder: string[];
  optionOrder: Record<string, string[]>;
}

/**
 * Generates question and answer-option display order for a fresh attempt,
 * honoring shuffleQuestions/shuffleAnswerChoices and each item's own
 * excludeFromShuffle flag. Deterministic for a given seed (or Date.now()
 * when unseeded) — callers must persist the result and never call this
 * again mid-attempt (see SuspendData.questionOrder / optionOrder).
 */
export function generateOrder(assessment: Assessment): GeneratedOrder {
  const { shuffleQuestions, shuffleAnswerChoices, seed } = assessment.settings.randomization;
  const rng = mulberry32(seed ?? Date.now());

  const questions = assessment.questions;
  let questionOrder: string[];
  if (shuffleQuestions) {
    const fixed = questions.filter((q) => q.excludeFromShuffle);
    const shufflable = questions.filter((q) => !q.excludeFromShuffle);
    const shuffled = shuffle(shufflable, rng);
    // Fixed questions stay at their original absolute index; shuffled ones
    // fill the remaining slots in order.
    const result: string[] = new Array(questions.length);
    let shuffledCursor = 0;
    questions.forEach((q, i) => {
      if (q.excludeFromShuffle) {
        result[i] = q.id;
      } else {
        result[i] = shuffled[shuffledCursor]!.id;
        shuffledCursor += 1;
      }
    });
    void fixed;
    questionOrder = result;
  } else {
    questionOrder = questions.map((q) => q.id);
  }

  const optionOrder: Record<string, string[]> = {};
  for (const q of questions) {
    if (!("options" in q) || !Array.isArray(q.options)) continue;
    const shouldShuffle = shuffleAnswerChoices && q.shuffleOptions !== false;
    if (!shouldShuffle) {
      optionOrder[q.id] = q.options.map((o) => o.id);
      continue;
    }
    const fixed = q.options.filter((o) => o.excludeFromShuffle);
    const shufflable = q.options.filter((o) => !o.excludeFromShuffle);
    const shuffledOptions = shuffle(shufflable, rng);
    const result: string[] = new Array(q.options.length);
    let cursor = 0;
    q.options.forEach((o, i) => {
      if (o.excludeFromShuffle) {
        result[i] = o.id;
      } else {
        result[i] = shuffledOptions[cursor]!.id;
        cursor += 1;
      }
    });
    void fixed;
    optionOrder[q.id] = result;
  }

  return { questionOrder, optionOrder };
}
