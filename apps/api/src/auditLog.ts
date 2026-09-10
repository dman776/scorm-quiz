import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

function dataDir(): string {
  return process.env["DATA_DIR"] ?? "./data";
}

export async function logExportAction(assessmentId: string, filename: string): Promise<void> {
  await mkdir(dataDir(), { recursive: true });
  const entry = { timestamp: new Date().toISOString(), action: "export", assessmentId, filename };
  await appendFile(path.join(dataDir(), "audit.log"), `${JSON.stringify(entry)}\n`, "utf-8");
}
