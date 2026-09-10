import type { Question } from "@scorm-quiz/schemas";
import { toScormSafeId } from "@scorm-quiz/schemas";
import type { QuestionScoreResult } from "@scorm-quiz/scoring-engine";
import type { InteractionResult, ScormInteractionType } from "./cmi.js";

export interface InteractionRecord {
  id: string;
  type: ScormInteractionType;
  timestamp: string;
  /** SCORM 2004 correct_responses.n.pattern values (one entry per pattern). */
  correctResponsesPatterns: string[];
  /** SCORM 2004 time interval format, e.g. "PT1M30S". */
  latency: string;
  learnerResponse: string;
  result: InteractionResult;
  weighting: number;
  description?: string;
}

function questionToInteractionType(question: Question): ScormInteractionType {
  if (question.type === "trueFalse") return "true-false";
  if (question.type === "singleSelect" || question.type === "multipleSelect") return "choice";
  return "other";
}

/**
 * Formats milliseconds as a SCORM 2004 "timeinterval" (ISO 8601 duration,
 * e.g. PT1H2M3.500S). Always includes at least seconds.
 */
export function formatScormLatency(elapsedMs: number): string {
  const totalSeconds = Math.max(0, elapsedMs) / 1000;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let result = "PT";
  if (hours > 0) result += `${hours}H`;
  if (minutes > 0 || hours > 0) result += `${minutes}M`;
  result += `${Math.round(seconds * 1000) / 1000}S`;
  return result;
}

function outcomeToResult(outcome: QuestionScoreResult["outcome"]): InteractionResult {
  if (outcome === "correct") return "correct";
  if (outcome === "incorrect") return "incorrect";
  if (outcome === "partial") return "neutral";
  return "unanticipated";
}

/**
 * Builds a fully-formed SCORM interaction record for one answered question.
 * learner_response / correct_responses follow the SCORM 2004 4th Ed "choice"
 * and "true-false" response-type formats: multiple selected ids are joined
 * with the reserved `[,]` separator.
 */
export function buildInteraction(
  question: Question,
  scoreResult: QuestionScoreResult,
  elapsedMs: number,
  timestamp: string = new Date().toISOString(),
): InteractionRecord {
  const type = questionToInteractionType(question);
  const id = toScormSafeId(question.id);

  const learnerResponse =
    question.type === "trueFalse"
      ? scoreResult.selectedOptionIds[0] ?? ""
      : scoreResult.selectedOptionIds.map(toScormSafeId).join("[,]");

  const correctResponsesPatterns =
    question.type === "trueFalse"
      ? scoreResult.correctOptionIds
      : [scoreResult.correctOptionIds.map(toScormSafeId).join("[,]")];

  return {
    id,
    type,
    timestamp,
    correctResponsesPatterns,
    latency: formatScormLatency(elapsedMs),
    learnerResponse,
    result: outcomeToResult(scoreResult.outcome),
    weighting: scoreResult.maxPoints,
    description: question.prompt.slice(0, 250),
  };
}
