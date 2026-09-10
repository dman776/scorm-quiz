import { z } from "zod";
import { AssessmentSchema } from "./assessment.js";

/**
 * The editable, importable/exportable "project" JSON format — distinct from
 * the SCORM export. Never contains executable code; import must go through
 * ProjectFileSchema.parse (never eval/Function) so malformed or malicious
 * files fail safely.
 */
export const ProjectFileSchema = z.object({
  formatVersion: z.literal(1).default(1),
  exportedAt: z.string().datetime(),
  assessment: AssessmentSchema,
});
export type ProjectFile = z.infer<typeof ProjectFileSchema>;

export function parseProjectFile(json: unknown): ProjectFile {
  return ProjectFileSchema.parse(json);
}
