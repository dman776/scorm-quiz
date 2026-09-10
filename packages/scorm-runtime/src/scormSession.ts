import type { Api1484_11 } from "./api1484_11.js";
import { CmiElement, interactionElement, SUSPEND_DATA_HARD_LIMIT, SUSPEND_DATA_WARN_THRESHOLD } from "./cmi.js";
import type { CompletionStatus, ExitValue, SuccessStatus } from "./cmi.js";
import type { InteractionRecord } from "./interactions.js";
import { NULL_LOGGER, type DiagnosticLogger } from "./diagnostics.js";

/**
 * Wraps the raw API_1484_11 calls with typed methods, error capture, and a
 * standalone mode for when no LMS is present. Never simulates a successful
 * LMS session — if `api` is null, every method is a safe, clearly-labeled
 * no-op and `isStandalone` is true.
 */
export class ScormSession {
  readonly isStandalone: boolean;
  private initialized = false;

  constructor(
    private readonly api: Api1484_11 | null,
    private readonly logger: DiagnosticLogger = NULL_LOGGER,
  ) {
    this.isStandalone = api === null;
  }

  private call<T>(method: string, args: string[], invoke: (api: Api1484_11) => T): T | null {
    if (!this.api) return null;
    try {
      const result = invoke(this.api);
      this.logger.log({ kind: "call", method, args, result: String(result), timestamp: new Date().toISOString() });
      return result;
    } catch (e) {
      this.logger.log({
        kind: "error",
        method,
        message: e instanceof Error ? e.message : String(e),
        timestamp: new Date().toISOString(),
      });
      return null;
    }
  }

  initialize(): boolean {
    if (this.isStandalone) return false;
    const result = this.call("Initialize", [""], (api) => api.Initialize(""));
    this.initialized = result === "true";
    return this.initialized;
  }

  terminate(exit: ExitValue): boolean {
    if (this.isStandalone || !this.initialized) return false;
    if (exit) this.setExit(exit);
    this.commit();
    const result = this.call("Terminate", [""], (api) => api.Terminate(""));
    return result === "true";
  }

  private setValue(element: string, value: string): boolean {
    const result = this.call("SetValue", [element, value], (api) => api.SetValue(element, value));
    return result === "true";
  }

  getValue(element: string): string {
    return this.call("GetValue", [element], (api) => api.GetValue(element)) ?? "";
  }

  setCompletionStatus(status: CompletionStatus): boolean {
    return this.setValue(CmiElement.CompletionStatus, status);
  }

  setSuccessStatus(status: SuccessStatus): boolean {
    return this.setValue(CmiElement.SuccessStatus, status);
  }

  setScore(raw: number, min: number, max: number, scaled: number): void {
    this.setValue(CmiElement.ScoreRaw, String(raw));
    this.setValue(CmiElement.ScoreMin, String(min));
    this.setValue(CmiElement.ScoreMax, String(max));
    this.setValue(CmiElement.ScoreScaled, String(Math.max(-1, Math.min(1, scaled))));
  }

  setProgressMeasure(value: number): boolean {
    return this.setValue(CmiElement.ProgressMeasure, String(Math.max(0, Math.min(1, value))));
  }

  /** Validates the serialized size against SCORM's typical 64,000-char
   * suspend_data limit before writing, warning during development if close. */
  setSuspendData(data: string): boolean {
    if (data.length > SUSPEND_DATA_HARD_LIMIT) {
      this.logger.log({
        kind: "error",
        method: "SetValue",
        message: `cmi.suspend_data length ${data.length} exceeds the ${SUSPEND_DATA_HARD_LIMIT}-char SCORM limit; LMS will likely truncate or reject it.`,
        timestamp: new Date().toISOString(),
      });
    } else if (data.length > SUSPEND_DATA_WARN_THRESHOLD) {
      this.logger.log({
        kind: "error",
        method: "SetValue",
        message: `cmi.suspend_data length ${data.length} is approaching the ${SUSPEND_DATA_HARD_LIMIT}-char SCORM limit.`,
        timestamp: new Date().toISOString(),
      });
    }
    return this.setValue(CmiElement.SuspendData, data);
  }

  getSuspendData(): string {
    return this.getValue(CmiElement.SuspendData);
  }

  setLocation(location: string): boolean {
    return this.setValue(CmiElement.Location, location);
  }

  getLocation(): string {
    return this.getValue(CmiElement.Location);
  }

  private setExit(exit: ExitValue): boolean {
    return this.setValue(CmiElement.Exit, exit);
  }

  /** Writes one cmi.interactions.n.* record. Wrapped so a single failed
   * field write (e.g. an LMS rejecting an unsupported field) never throws
   * or aborts the overall score/completion commit. */
  recordInteraction(index: number, record: InteractionRecord): void {
    const fields: Array<[string, string]> = [
      [interactionElement(index, "id"), record.id],
      [interactionElement(index, "type"), record.type],
      [interactionElement(index, "timestamp"), record.timestamp],
      [interactionElement(index, "learner_response"), record.learnerResponse],
      [interactionElement(index, "result"), record.result],
      [interactionElement(index, "weighting"), String(record.weighting)],
      [interactionElement(index, "latency"), record.latency],
    ];
    if (record.description) fields.push([interactionElement(index, "description"), record.description]);
    record.correctResponsesPatterns.forEach((pattern, i) => {
      fields.push([interactionElement(index, `correct_responses.${i}.pattern`), pattern]);
    });

    for (const [element, value] of fields) {
      try {
        this.setValue(element, value);
      } catch (e) {
        this.logger.log({
          kind: "error",
          method: "SetValue",
          message: `Failed writing ${element}: ${e instanceof Error ? e.message : String(e)}`,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  commit(): boolean {
    const result = this.call("Commit", [""], (api) => api.Commit(""));
    return result === "true";
  }

  getLastErrorInfo(): { code: string; errorString: string; diagnostic: string } | null {
    if (!this.api) return null;
    const code = this.call("GetLastError", [], (api) => api.GetLastError()) ?? "0";
    const errorString = this.call("GetErrorString", [code], (api) => api.GetErrorString(code)) ?? "";
    const diagnostic = this.call("GetDiagnostic", [code], (api) => api.GetDiagnostic(code)) ?? "";
    return { code, errorString, diagnostic };
  }
}
