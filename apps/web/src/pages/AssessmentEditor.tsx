import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Assessment, Question, QuestionType, ValidationIssue } from "@scorm-quiz/schemas";
import { generateId, validateAssessment } from "@scorm-quiz/schemas";
import { api } from "../api/client.js";
import { QuestionListPanel } from "../components/editor/QuestionListPanel.js";
import { QuestionEditorPanel } from "../components/editor/QuestionEditorPanel.js";
import { SettingsPanel } from "../components/editor/SettingsPanel.js";
import { newQuestion } from "../components/editor/newQuestion.js";

export function AssessmentEditor() {
  const { id } = useParams<{ id: string }>();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (!id) return;
    api.getAssessment(id).then((a) => {
      setAssessment(a);
      setSelectedQuestionId(a.questions[0]?.id ?? null);
    });
  }, [id]);

  const save = useCallback(
    async (toSave: Assessment) => {
      setSaveState("saving");
      try {
        const saved = await api.updateAssessment(toSave);
        setAssessment(saved);
        setSaveState("saved");
        setAnnouncement("Assessment saved.");
      } catch {
        setSaveState("error");
        setAnnouncement("Save failed.");
      }
    },
    [],
  );

  if (!assessment) return <p role="status">Loading assessment…</p>;

  const selectedQuestion = assessment.questions.find((q) => q.id === selectedQuestionId) ?? null;

  const updateAssessment = (updater: (a: Assessment) => Assessment) => {
    setAssessment((prev) => (prev ? updater(prev) : prev));
  };

  const addQuestion = (type: QuestionType) => {
    const q = newQuestion(type);
    updateAssessment((a) => ({ ...a, questions: [...a.questions, q] }));
    setSelectedQuestionId(q.id);
    setAnnouncement(`Added a new ${type} question.`);
  };

  const updateQuestion = (updated: Question) => {
    updateAssessment((a) => ({ ...a, questions: a.questions.map((q) => (q.id === updated.id ? updated : q)) }));
    setAnnouncement("Question updated.");
  };

  const duplicateQuestion = (question: Question) => {
    const copy = { ...question, id: generateId("question") } as Question;
    updateAssessment((a) => {
      const index = a.questions.findIndex((q) => q.id === question.id);
      const questions = [...a.questions];
      questions.splice(index + 1, 0, copy);
      return { ...a, questions };
    });
    setSelectedQuestionId(copy.id);
    setAnnouncement("Question duplicated.");
  };

  const deleteQuestion = (question: Question) => {
    if (!window.confirm(`Delete this question? This cannot be undone.`)) return;
    updateAssessment((a) => ({ ...a, questions: a.questions.filter((q) => q.id !== question.id) }));
    if (selectedQuestionId === question.id) setSelectedQuestionId(null);
    setAnnouncement("Question deleted.");
  };

  const moveQuestion = (question: Question, direction: -1 | 1) => {
    updateAssessment((a) => {
      const index = a.questions.findIndex((q) => q.id === question.id);
      const target = index + direction;
      if (target < 0 || target >= a.questions.length) return a;
      const questions = [...a.questions];
      const [moved] = questions.splice(index, 1);
      questions.splice(target, 0, moved!);
      return { ...a, questions };
    });
  };

  const runValidation = async () => {
    const result = validateAssessment(assessment);
    setIssues(result.issues);
    setAnnouncement(
      result.canExport
        ? `Validation passed with ${result.issues.length} warning(s).`
        : `Validation failed with ${result.issues.filter((i) => i.severity === "error").length} error(s).`,
    );
  };

  return (
    <div className="sq-editor">
      <div aria-live="polite" className="sq-visually-hidden">
        {announcement}
      </div>
      <div className="sq-editor-topbar">
        <input
          aria-label="Assessment title"
          className="sq-editor-title-input"
          value={assessment.title}
          onChange={(e) => updateAssessment((a) => ({ ...a, title: e.target.value }))}
        />
        <div className="sq-editor-topbar-actions">
          <button type="button" onClick={() => save(assessment)}>
            {saveState === "saving" ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={runValidation}>
            Validate
          </button>
          <Link to={`/assessments/${assessment.id}/preview`}>Learner Preview</Link>
          <Link to={`/assessments/${assessment.id}/scorm-debug`}>SCORM Debug Preview</Link>
          <a href={api.exportAssessmentUrl(assessment.id)} target="_blank" rel="noreferrer">
            Export SCORM ZIP
          </a>
          <Link to="/">Back to Dashboard</Link>
        </div>
      </div>

      {issues.length > 0 && (
        <div className="sq-validation-panel" role="region" aria-label="Validation results">
          <ul>
            {issues.map((issue, i) => (
              <li key={i} className={`sq-issue sq-issue-${issue.severity}`}>
                <strong>{issue.severity === "error" ? "Error" : "Warning"}:</strong> {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="sq-editor-panes">
        <QuestionListPanel
          questions={assessment.questions}
          selectedQuestionId={selectedQuestionId}
          onSelect={setSelectedQuestionId}
          onAdd={addQuestion}
          onDuplicate={duplicateQuestion}
          onDelete={deleteQuestion}
          onMove={moveQuestion}
        />
        <QuestionEditorPanel question={selectedQuestion} onChange={updateQuestion} />
        <SettingsPanel
          assessment={assessment}
          onChange={(settings) => updateAssessment((a) => ({ ...a, settings }))}
        />
      </div>
    </div>
  );
}
