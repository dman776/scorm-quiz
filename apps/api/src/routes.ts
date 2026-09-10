import { Router, type Router as RouterType } from "express";
import { z } from "zod";
import { AssessmentSchema, parseProjectFile, validateAssessment } from "@scorm-quiz/schemas";
import { deleteAssessment, getAssessment, listAssessments, saveAssessment } from "./store.js";
import { exportAssessmentPackage, RuntimeNotBuiltError } from "./exportPackage.js";
import { logExportAction } from "./auditLog.js";

export const router: RouterType = Router();

router.get("/assessments", async (_req, res) => {
  const assessments = await listAssessments();
  res.json(assessments);
});

router.get("/assessments/:id", async (req, res) => {
  const assessment = await getAssessment(req.params.id);
  if (!assessment) return res.status(404).json({ error: "Assessment not found." });
  res.json(assessment);
});

router.post("/assessments", async (req, res) => {
  const parseResult = AssessmentSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: "Invalid assessment payload.", issues: parseResult.error.issues });
  }
  const saved = await saveAssessment(parseResult.data);
  res.status(201).json(saved);
});

router.put("/assessments/:id", async (req, res) => {
  const parseResult = AssessmentSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: "Invalid assessment payload.", issues: parseResult.error.issues });
  }
  if (parseResult.data.id !== req.params.id) {
    return res.status(400).json({ error: "Body id does not match URL id." });
  }
  const saved = await saveAssessment(parseResult.data);
  res.json(saved);
});

router.delete("/assessments/:id", async (req, res) => {
  await deleteAssessment(req.params.id);
  res.status(204).end();
});

router.post("/assessments/:id/validate", async (req, res) => {
  const assessment = await getAssessment(req.params.id);
  if (!assessment) return res.status(404).json({ error: "Assessment not found." });
  res.json(validateAssessment(assessment));
});

router.post("/assessments/:id/export", async (req, res) => {
  const assessment = await getAssessment(req.params.id);
  if (!assessment) return res.status(404).json({ error: "Assessment not found." });

  const validation = validateAssessment(assessment);
  if (!validation.canExport) {
    return res.status(422).json({ error: "Assessment has blocking validation errors.", issues: validation.issues });
  }

  try {
    const zipBytes = await exportAssessmentPackage(assessment);
    const filename = `${assessment.internalId.replace(/[^A-Za-z0-9_-]/g, "_")}-${assessment.version}.zip`;
    await logExportAction(assessment.id, filename);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(Buffer.from(zipBytes));
  } catch (e) {
    if (e instanceof RuntimeNotBuiltError) {
      return res.status(503).json({ error: e.message });
    }
    throw e;
  }
});

const ProjectImportSchema = z.object({ project: z.unknown() });

router.post("/projects/import", async (req, res) => {
  const parseResult = ProjectImportSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: "Expected a { project } body." });
  }
  try {
    // parseProjectFile never evaluates code — it only runs the project file
    // through the Zod schema, so a malformed or malicious file fails safely.
    const project = parseProjectFile(parseResult.data.project);
    const saved = await saveAssessment(project.assessment);
    res.status(201).json(saved);
  } catch (e) {
    res.status(400).json({ error: "Invalid or malformed project file.", detail: e instanceof Error ? e.message : String(e) });
  }
});
