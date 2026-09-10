import { AttemptHistorySchema, SuspendDataSchema, type AttemptHistory, type SuspendData } from "@scorm-quiz/schemas";
import { z } from "zod";

/** Combined blob persisted as cmi.suspend_data: both the in-progress
 * attempt's answer/navigation state and the cross-attempt score history
 * (needed for score-retention rules to survive an LMS re-launch). */
export const RuntimeStateSchema = z.object({
  suspendData: SuspendDataSchema,
  attemptHistory: AttemptHistorySchema,
});
export type RuntimeState = z.infer<typeof RuntimeStateSchema>;

export function serializeRuntimeState(state: RuntimeState): string {
  return JSON.stringify(state);
}

/** Returns null (never throws) on empty/malformed data so callers can fall
 * back to starting a fresh attempt rather than crashing the learner runtime. */
export function deserializeRuntimeState(raw: string): RuntimeState | null {
  if (!raw) return null;
  try {
    const parsed = RuntimeStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function emptyAttemptHistory(): AttemptHistory {
  return { schemaVersion: 1, attempts: [], locked: false };
}

export type { AttemptHistory, SuspendData };
