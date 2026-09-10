import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Assessment } from "@scorm-quiz/schemas";
import { api } from "../api/client.js";
import { useAssessmentPreviewRuntime } from "../components/preview/useAssessmentPreviewRuntime.js";
import { PreviewRunner } from "../components/preview/PreviewRunner.js";

export function LearnerPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const [assessment, setAssessment] = useState<Assessment | null>(null);

  useEffect(() => {
    if (id) api.getAssessment(id).then(setAssessment);
  }, [id]);

  if (!assessment) return <p role="status">Loading…</p>;

  return (
    <div className="sq-preview-page">
      <div className="sq-preview-toolbar">
        <h1>Learner Preview: {assessment.title}</h1>
        <Link to={`/assessments/${assessment.id}/edit`}>Back to Editor</Link>
      </div>
      <PreviewBody assessment={assessment} />
    </div>
  );
}

function PreviewBody({ assessment }: { assessment: Assessment }) {
  const runtime = useAssessmentPreviewRuntime(assessment, null);
  return <PreviewRunner assessment={assessment} runtime={runtime} />;
}
