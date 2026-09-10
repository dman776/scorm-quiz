import type { ScoreRounding } from "@scorm-quiz/schemas";

export function applyRounding(value: number, rounding: ScoreRounding): number {
  switch (rounding) {
    case "nearestInteger":
      return Math.round(value);
    case "twoDecimal":
      return Math.round(value * 100) / 100;
    case "none":
    default:
      return value;
  }
}
