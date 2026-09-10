import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { Assessment } from "@scorm-quiz/schemas";
import { buildPackage, buildRuntimeConfig, generateManifest, type PackageFile } from "@scorm-quiz/scorm-export";

/** Directory containing the pre-built learner runtime (apps/runtime's Vite
 * build output) that gets bundled into every export. Must be built first
 * via `pnpm --filter @scorm-quiz/runtime build`. */
const RUNTIME_DIST_DIR = process.env["RUNTIME_DIST_DIR"] ?? path.resolve(process.cwd(), "../runtime/dist");

async function collectFiles(dir: string, baseDir = dir): Promise<PackageFile[]> {
  const entries = await readdir(dir);
  const files: PackageFile[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stats = await stat(fullPath);
    if (stats.isDirectory()) {
      files.push(...(await collectFiles(fullPath, baseDir)));
    } else {
      const relativePath = path.relative(baseDir, fullPath).split(path.sep).join("/");
      const isText = /\.(html|js|css|json|svg|txt)$/i.test(entry);
      const content = isText ? await readFile(fullPath, "utf-8") : await readFile(fullPath);
      files.push({ path: relativePath, content });
    }
  }
  return files;
}

export class RuntimeNotBuiltError extends Error {}

/**
 * Assembles the full SCORM ZIP for one assessment: the pre-built learner
 * runtime bundle + a baked assessment-config.json + a generated
 * imsmanifest.xml, packaged with zip-slip-safe paths.
 */
export async function exportAssessmentPackage(assessment: Assessment): Promise<Uint8Array> {
  let runtimeFiles: PackageFile[];
  try {
    runtimeFiles = await collectFiles(RUNTIME_DIST_DIR);
  } catch {
    throw new RuntimeNotBuiltError(
      `The learner runtime has not been built. Run "pnpm --filter @scorm-quiz/runtime build" first (looked in ${RUNTIME_DIST_DIR}).`,
    );
  }
  if (runtimeFiles.length === 0 || !runtimeFiles.some((f) => f.path === "index.html")) {
    throw new RuntimeNotBuiltError(`No index.html found in the built runtime at ${RUNTIME_DIST_DIR}.`);
  }

  const config = buildRuntimeConfig(assessment);
  const configFile: PackageFile = {
    path: "assessment-config.json",
    content: JSON.stringify(config, null, 2),
  };

  const allFiles = [...runtimeFiles, configFile];
  const manifest = generateManifest(assessment, {
    launchFile: "index.html",
    filePaths: allFiles.map((f) => f.path),
    manifestIdentifier: `com.scormquizbuilder.${assessment.internalId}.${assessment.version}`,
  });

  return buildPackage(manifest, allFiles);
}
