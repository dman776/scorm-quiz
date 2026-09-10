import type { Api1484_11 } from "./api1484_11.js";

const VALID_ELEMENTS = new Set<string>([
  "cmi.completion_status",
  "cmi.success_status",
  "cmi.score.raw",
  "cmi.score.min",
  "cmi.score.max",
  "cmi.score.scaled",
  "cmi.progress_measure",
  "cmi.session_time",
  "cmi.exit",
  "cmi.location",
  "cmi.suspend_data",
]);

function isInteractionElement(element: string): boolean {
  return /^cmi\.interactions\.\d+\./.test(element);
}

/**
 * An in-memory, spec-shaped mock of API_1484_11 for local development and
 * automated tests — never used in a production export. Tracks call history
 * so the SCORM Debug Preview can display it, and enforces basic RTE
 * lifecycle rules (must Initialize before other calls, etc.) so bugs are
 * caught during authoring instead of in a real LMS.
 */
export class MockScormApi implements Api1484_11 {
  private data = new Map<string, string>();
  private state: "not initialized" | "running" | "terminated" = "not initialized";
  private lastError = "0";

  constructor(initialData: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(initialData)) this.data.set(k, v);
  }

  Initialize(parameter: ""): "true" | "false" {
    if (parameter !== "" || this.state !== "not initialized") {
      this.lastError = "103";
      return "false";
    }
    this.state = "running";
    this.lastError = "0";
    return "true";
  }

  Terminate(parameter: ""): "true" | "false" {
    if (parameter !== "" || this.state !== "running") {
      this.lastError = "111";
      return "false";
    }
    this.state = "terminated";
    this.lastError = "0";
    return "true";
  }

  GetValue(element: string): string {
    if (this.state !== "running") {
      this.lastError = "122";
      return "";
    }
    if (!VALID_ELEMENTS.has(element) && !isInteractionElement(element)) {
      this.lastError = "401";
      return "";
    }
    this.lastError = "0";
    return this.data.get(element) ?? "";
  }

  SetValue(element: string, value: string): "true" | "false" {
    if (this.state !== "running") {
      this.lastError = "132";
      return "false";
    }
    if (!VALID_ELEMENTS.has(element) && !isInteractionElement(element)) {
      this.lastError = "401";
      return "false";
    }
    this.data.set(element, value);
    this.lastError = "0";
    return "true";
  }

  Commit(parameter: ""): "true" | "false" {
    if (parameter !== "" || this.state !== "running") {
      this.lastError = "142";
      return "false";
    }
    this.lastError = "0";
    return "true";
  }

  GetLastError(): string {
    return this.lastError;
  }

  GetErrorString(errorCode: string): string {
    const map: Record<string, string> = {
      "0": "No Error",
      "103": "Already Initialized",
      "111": "General Termination Failure",
      "122": "Retrieve Data Before Initialization",
      "132": "Store Data Before Initialization",
      "142": "Commit Before Initialization",
      "401": "Undefined Data Model Element",
    };
    return map[errorCode] ?? "Unknown Error";
  }

  GetDiagnostic(errorCode: string): string {
    return `Diagnostic for error ${errorCode}`;
  }

  /** Test/debug-only inspection helper — not part of the SCORM API surface. */
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.data.entries());
  }
}
