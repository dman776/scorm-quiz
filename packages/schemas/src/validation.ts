import { z } from "zod";

export const ValidationSeveritySchema = z.enum(["error", "warning"]);
export type ValidationSeverity = z.infer<typeof ValidationSeveritySchema>;

export const ValidationIssueSchema = z.object({
  severity: ValidationSeveritySchema,
  code: z.string(),
  message: z.string(),
  path: z.string().optional(),
});
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

export interface ValidationResult {
  issues: ValidationIssue[];
  canExport: boolean;
}
