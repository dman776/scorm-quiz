import JSZip from "jszip";

export interface PackageFile {
  /** Path relative to the ZIP root, e.g. "index.html" or "assets/img/1.png". */
  path: string;
  content: string | Uint8Array;
}

export class UnsafeFilePathError extends Error {}

/**
 * Rejects any path that could escape the package root when extracted
 * (zip-slip) or that isn't a relative path within the archive: absolute
 * paths, `..` segments, backslashes (Windows separators smuggled through),
 * and null bytes are all rejected.
 */
export function assertSafeZipPath(path: string): void {
  if (path.length === 0) throw new UnsafeFilePathError("Empty file path.");
  if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) {
    throw new UnsafeFilePathError(`Absolute paths are not allowed: "${path}"`);
  }
  if (path.includes("\\")) {
    throw new UnsafeFilePathError(`Backslashes are not allowed in package paths: "${path}"`);
  }
  if (path.includes("\0")) {
    throw new UnsafeFilePathError(`Null bytes are not allowed in package paths: "${path}"`);
  }
  const segments = path.split("/");
  if (segments.some((s) => s === "..")) {
    throw new UnsafeFilePathError(`Path traversal ("..") is not allowed: "${path}"`);
  }
}

/**
 * Assembles a SCORM package ZIP in memory. imsmanifest.xml (and every other
 * file) is placed at the archive root — never inside an extra top-level
 * folder, per the SCORM packaging requirement. Every entry path is
 * validated with assertSafeZipPath before being written.
 */
export async function buildPackage(manifestXml: string, files: PackageFile[]): Promise<Uint8Array> {
  assertSafeZipPath("imsmanifest.xml");
  const zip = new JSZip();
  zip.file("imsmanifest.xml", manifestXml);

  for (const file of files) {
    assertSafeZipPath(file.path);
    if (file.path === "imsmanifest.xml") {
      throw new UnsafeFilePathError('"imsmanifest.xml" is reserved for the generated manifest.');
    }
    zip.file(file.path, file.content);
  }

  const buffer = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return buffer;
}
