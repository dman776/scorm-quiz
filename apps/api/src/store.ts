import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Assessment } from "@scorm-quiz/schemas";
import { AssessmentSchema } from "@scorm-quiz/schemas";

function dataDir(): string {
  return process.env["DATA_DIR"] ?? "./data";
}

/** Only safe filename characters are ever derived from an assessment id —
 * this is a defense-in-depth guard against path traversal even though ids
 * are server-generated UUIDs, never taken verbatim from user input. */
function safeFileName(id: string): string {
  const sanitized = id.replace(/[^A-Za-z0-9_-]/g, "");
  if (sanitized.length === 0) throw new Error("Invalid assessment id.");
  return `${sanitized}.json`;
}

async function ensureDataDir(): Promise<void> {
  await mkdir(dataDir(), { recursive: true });
}

export async function listAssessments(): Promise<Assessment[]> {
  await ensureDataDir();
  const files = await readdir(dataDir());
  const assessments: Assessment[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const raw = await readFile(path.join(dataDir(), file), "utf-8");
    assessments.push(AssessmentSchema.parse(JSON.parse(raw)));
  }
  return assessments.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getAssessment(id: string): Promise<Assessment | null> {
  await ensureDataDir();
  try {
    const raw = await readFile(path.join(dataDir(), safeFileName(id)), "utf-8");
    return AssessmentSchema.parse(JSON.parse(raw));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

export async function saveAssessment(assessment: Assessment): Promise<Assessment> {
  await ensureDataDir();
  const toSave = { ...assessment, updatedAt: new Date().toISOString() };
  const parsed = AssessmentSchema.parse(toSave);
  await writeFile(path.join(dataDir(), safeFileName(parsed.id)), JSON.stringify(parsed, null, 2), "utf-8");
  return parsed;
}

export async function deleteAssessment(id: string): Promise<void> {
  await ensureDataDir();
  try {
    await rm(path.join(dataDir(), safeFileName(id)));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}
