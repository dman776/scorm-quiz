import type { Assessment } from "@scorm-quiz/schemas";
import type { ValidationResult } from "@scorm-quiz/schemas";

const BASE_URL = import.meta.env["VITE_API_BASE_URL"] ?? "http://localhost:4000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listAssessments: () => request<Assessment[]>("/api/assessments"),
  getAssessment: (id: string) => request<Assessment>(`/api/assessments/${id}`),
  createAssessment: (assessment: Assessment) =>
    request<Assessment>("/api/assessments", { method: "POST", body: JSON.stringify(assessment) }),
  updateAssessment: (assessment: Assessment) =>
    request<Assessment>(`/api/assessments/${assessment.id}`, { method: "PUT", body: JSON.stringify(assessment) }),
  deleteAssessment: (id: string) => request<void>(`/api/assessments/${id}`, { method: "DELETE" }),
  validateAssessment: (id: string) => request<ValidationResult>(`/api/assessments/${id}/validate`, { method: "POST" }),
  exportAssessmentUrl: (id: string) => `${BASE_URL}/api/assessments/${id}/export`,
  importProject: (project: unknown) =>
    request<Assessment>("/api/projects/import", { method: "POST", body: JSON.stringify({ project }) }),
};
