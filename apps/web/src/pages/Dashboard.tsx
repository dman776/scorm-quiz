import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Assessment, AssessmentStatus } from "@scorm-quiz/schemas";
import { AssessmentSchema, computeMaxPoints, generateId } from "@scorm-quiz/schemas";
import { api } from "../api/client.js";

type SortKey = "updatedAt" | "title" | "questionCount";

export function Dashboard() {
  const navigate = useNavigate();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AssessmentStatus | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");

  const load = () => {
    setLoading(true);
    api
      .listAssessments()
      .then(setAssessments)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    let list = assessments;
    if (statusFilter !== "all") list = list.filter((a) => a.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((a) => a.title.toLowerCase().includes(q) || a.internalId.toLowerCase().includes(q));
    }
    const sorted = [...list].sort((a, b) => {
      if (sortKey === "title") return a.title.localeCompare(b.title);
      if (sortKey === "questionCount") return b.questions.length - a.questions.length;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
    return sorted;
  }, [assessments, search, statusFilter, sortKey]);

  const createAssessment = async () => {
    const draft = AssessmentSchema.parse({
      id: generateId("assessment"),
      title: "Untitled Assessment",
      internalId: `untitled-${Date.now()}`,
    });
    const created = await api.createAssessment(draft);
    navigate(`/assessments/${created.id}/edit`);
  };

  const duplicateAssessment = async (assessment: Assessment) => {
    const copy = AssessmentSchema.parse({
      ...assessment,
      id: generateId("assessment"),
      internalId: `${assessment.internalId}-copy`,
      title: `${assessment.title} (Copy)`,
      status: "draft",
    });
    await api.createAssessment(copy);
    load();
  };

  const archiveAssessment = async (assessment: Assessment) => {
    await api.updateAssessment({ ...assessment, status: "archived" });
    load();
  };

  const deleteAssessment = async (assessment: Assessment) => {
    if (!window.confirm(`Delete "${assessment.title}"? This cannot be undone.`)) return;
    await api.deleteAssessment(assessment.id);
    load();
  };

  if (loading) return <p role="status">Loading assessments…</p>;
  if (error) return <p role="alert">Error loading assessments: {error}</p>;

  return (
    <div className="sq-dashboard">
      <div className="sq-dashboard-toolbar">
        <h1>Assessments</h1>
        <button type="button" onClick={createAssessment} className="sq-primary-button">
          New Assessment
        </button>
      </div>

      <div className="sq-dashboard-filters">
        <label>
          Search
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or ID…"
          />
        </label>
        <label>
          Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as AssessmentStatus | "all")}>
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="readyForReview">Ready for Review</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <label>
          Sort by
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
            <option value="updatedAt">Last modified</option>
            <option value="title">Title</option>
            <option value="questionCount">Question count</option>
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="sq-empty-state">No assessments yet. Create one to get started.</p>
      ) : (
        <table className="sq-dashboard-table">
          <thead>
            <tr>
              <th scope="col">Title</th>
              <th scope="col">Internal ID</th>
              <th scope="col">Status</th>
              <th scope="col">Questions</th>
              <th scope="col">Points</th>
              <th scope="col">Passing</th>
              <th scope="col">Last modified</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={a.id}>
                <td>{a.title}</td>
                <td>{a.internalId}</td>
                <td>
                  <span className={`sq-status-badge sq-status-${a.status}`}>{a.status}</span>
                </td>
                <td>{a.questions.length}</td>
                <td>{computeMaxPoints(a)}</td>
                <td>{a.settings.scoring.passingScorePercent}%</td>
                <td>{new Date(a.updatedAt).toLocaleString()}</td>
                <td className="sq-row-actions">
                  <Link to={`/assessments/${a.id}/edit`}>Edit</Link>
                  <Link to={`/assessments/${a.id}/preview`}>Preview</Link>
                  <button type="button" onClick={() => duplicateAssessment(a)}>
                    Duplicate
                  </button>
                  <a href={api.exportAssessmentUrl(a.id)} target="_blank" rel="noreferrer">
                    Export
                  </a>
                  <button type="button" onClick={() => archiveAssessment(a)}>
                    Archive
                  </button>
                  <button type="button" onClick={() => deleteAssessment(a)} className="sq-danger-button">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
