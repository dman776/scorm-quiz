import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { XMLValidator } from "fast-xml-parser";
import { AssessmentSchema, generateId } from "@scorm-quiz/schemas";

const API_BASE_URL = "http://localhost:4000";

/**
 * End-to-end: creates a valid assessment directly against the API (the
 * same path the authoring UI uses), exports it as a SCORM package, and
 * verifies the resulting ZIP is a real, well-formed SCORM 2004 4th
 * Edition package — imsmanifest.xml at the archive root, valid XML,
 * launch file and config present.
 */
test("exports a SCORM package with a valid manifest at the ZIP root", async ({ request }) => {
  const assessment = AssessmentSchema.parse({
    id: generateId("e2e-export"),
    title: "E2E Export Verification",
    internalId: `e2e-export-${Date.now()}`,
    questions: [
      {
        id: "q1",
        type: "trueFalse",
        prompt: "This is an end-to-end export test.",
        correctAnswer: true,
      },
    ],
  });

  const createRes = await request.post(`${API_BASE_URL}/api/assessments`, { data: assessment });
  expect(createRes.ok()).toBe(true);

  const exportRes = await request.post(`${API_BASE_URL}/api/assessments/${assessment.id}/export`);
  expect(exportRes.ok()).toBe(true);
  expect(exportRes.headers()["content-type"]).toContain("application/zip");

  const zipBuffer = await exportRes.body();
  const zip = await JSZip.loadAsync(zipBuffer);

  const entryNames = Object.keys(zip.files);
  expect(entryNames).toContain("imsmanifest.xml");
  expect(entryNames).toContain("index.html");
  expect(entryNames).toContain("assessment-config.json");
  // Manifest must be at the archive root, not nested in a subfolder.
  expect(entryNames.filter((n) => n.split("/").length > 1 && !n.endsWith("/"))).not.toContain("imsmanifest.xml");

  const manifestXml = await zip.file("imsmanifest.xml")!.async("string");
  expect(XMLValidator.validate(manifestXml)).toBe(true);
  expect(manifestXml).toContain("2004 4th Edition");
  expect(manifestXml).toContain('href="index.html"');

  const configJson = await zip.file("assessment-config.json")!.async("string");
  const config = JSON.parse(configJson);
  expect(config.assessment.id).toBe(assessment.id);
});
