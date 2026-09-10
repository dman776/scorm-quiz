export type DiagnosticEntry =
  | { kind: "call"; method: string; args: string[]; result: string; timestamp: string }
  | { kind: "error"; method: string; message: string; timestamp: string };

export interface DiagnosticLogger {
  log(entry: DiagnosticEntry): void;
}

/** No-op logger used by default in production; the authoring app's SCORM
 * Debug Preview supplies a logger that records to visible state instead. */
export const NULL_LOGGER: DiagnosticLogger = { log: () => {} };
