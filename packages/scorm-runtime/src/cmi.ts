export const CmiElement = {
  CompletionStatus: "cmi.completion_status",
  SuccessStatus: "cmi.success_status",
  ScoreRaw: "cmi.score.raw",
  ScoreMin: "cmi.score.min",
  ScoreMax: "cmi.score.max",
  ScoreScaled: "cmi.score.scaled",
  ProgressMeasure: "cmi.progress_measure",
  SessionTime: "cmi.session_time",
  Exit: "cmi.exit",
  Location: "cmi.location",
  SuspendData: "cmi.suspend_data",
  InteractionsCount: "cmi.interactions._count",
} as const;

export type CompletionStatus = "completed" | "incomplete" | "not attempted" | "unknown";
export type SuccessStatus = "passed" | "failed" | "unknown";
export type ExitValue = "" | "suspend" | "logout" | "normal" | "time-out";
export type InteractionResult = "correct" | "incorrect" | "unanticipated" | "neutral";
export type ScormInteractionType =
  | "true-false"
  | "choice"
  | "fill-in"
  | "long-fill-in"
  | "matching"
  | "performance"
  | "sequencing"
  | "likert"
  | "numeric"
  | "other";

/** cmi.suspend_data has a per-SCO storage limit many LMSs enforce at 64,000
 * characters. We warn well below that so authors notice during development
 * rather than discovering silent truncation in production. */
export const SUSPEND_DATA_WARN_THRESHOLD = 60000;
export const SUSPEND_DATA_HARD_LIMIT = 64000;

export function interactionElement(index: number, field: string): string {
  return `cmi.interactions.${index}.${field}`;
}
