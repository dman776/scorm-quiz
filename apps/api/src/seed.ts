import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AssessmentSchema } from "@scorm-quiz/schemas";
import { saveAssessment } from "./store.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const SEED_FILE = path.resolve(moduleDir, "../../../seed/demo-assessment.json");

async function main() {
  const raw = await readFile(SEED_FILE, "utf-8");
  const assessment = AssessmentSchema.parse(JSON.parse(raw));
  const saved = await saveAssessment(assessment);
  console.log(`Seeded demo assessment "${saved.title}" (${saved.id}) into ${process.env["DATA_DIR"] ?? "./data"}`);
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exitCode = 1;
});
