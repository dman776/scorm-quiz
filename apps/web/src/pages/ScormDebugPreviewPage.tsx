import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Assessment } from "@scorm-quiz/schemas";
import { MockScormApi, type DiagnosticEntry } from "@scorm-quiz/scorm-runtime";
import { api } from "../api/client.js";
import { useAssessmentPreviewRuntime } from "../components/preview/useAssessmentPreviewRuntime.js";
import { PreviewRunner } from "../components/preview/PreviewRunner.js";

export function ScormDebugPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const [assessment, setAssessment] = useState<Assessment | null>(null);

  useEffect(() => {
    if (id) api.getAssessment(id).then(setAssessment);
  }, [id]);

  if (!assessment) return <p role="status">Loading…</p>;

  return (
    <div className="sq-preview-page">
      <div className="sq-preview-toolbar">
        <h1>SCORM Debug Preview: {assessment.title}</h1>
        <Link to={`/assessments/${assessment.id}/edit`}>Back to Editor</Link>
      </div>
      <p className="sq-help-text">
        This runs against an in-memory mock LMS (never a real one) so you can inspect every SCORM RTE call before
        testing in a real LMS.
      </p>
      <DebugBody assessment={assessment} />
    </div>
  );
}

function DebugBody({ assessment }: { assessment: Assessment }) {
  const [log, setLog] = useState<DiagnosticEntry[]>([]);
  const mock = useMemo(() => {
    const api = new MockScormApi();
    return api;
  }, [assessment.id]);

  // Wrap the mock so every call is captured — the same DiagnosticLogger
  // contract ScormSession uses.
  const loggingApi = useMemo(() => {
    const logger = { log: (entry: DiagnosticEntry) => setLog((prev) => [...prev, entry].slice(-200)) };
    return new Proxy(mock, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => {
          const result = (value as (...a: unknown[]) => unknown).apply(target, args);
          logger.log({
            kind: "call",
            method: String(prop),
            args: args.map(String),
            result: String(result),
            timestamp: new Date().toISOString(),
          });
          return result;
        };
      },
    });
  }, [mock]);

  const runtime = useAssessmentPreviewRuntime(assessment, loggingApi);

  return (
    <div className="sq-debug-preview">
      <div className="sq-debug-runner">
        <PreviewRunner assessment={assessment} runtime={runtime} />
      </div>
      <div className="sq-debug-log-panel" aria-label="SCORM API call log">
        <h2>SCORM API Call Log</h2>
        <ol className="sq-debug-log">
          {log.map((entry, i) => (
            <li key={i} className={entry.kind === "error" ? "sq-log-error" : ""}>
              {entry.kind === "call" ? (
                <code>
                  {entry.method}({entry.args.map((a) => `"${a}"`).join(", ")}) → {entry.result}
                </code>
              ) : (
                <code>ERROR in {entry.method}: {entry.message}</code>
              )}
            </li>
          ))}
        </ol>
        <h3>Final CMI Snapshot</h3>
        <pre className="sq-cmi-snapshot">{JSON.stringify(mock.snapshot(), null, 2)}</pre>
      </div>
    </div>
  );
}
