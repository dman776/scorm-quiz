import { describe, expect, it } from "vitest";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import JSZip from "jszip";
import { AssessmentSchema } from "@scorm-quiz/schemas";
import { generateManifest } from "./generateManifest.js";
import { buildPackage, assertSafeZipPath, UnsafeFilePathError } from "./buildPackage.js";
import { xmlEscape } from "./xmlEscape.js";

function demoAssessment(titleOverride?: string) {
  return AssessmentSchema.parse({
    id: "demo",
    title: titleOverride ?? "Demo Assessment",
    internalId: "demo-1",
    questions: [
      {
        id: "q1",
        type: "trueFalse",
        prompt: "Is the sky blue?",
        correctAnswer: true,
      },
    ],
  });
}

describe("xmlEscape", () => {
  it("escapes all five XML special characters", () => {
    expect(xmlEscape(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&apos;");
  });
});

describe("generateManifest", () => {
  it("produces well-formed XML", () => {
    const xml = generateManifest(demoAssessment(), {
      launchFile: "index.html",
      filePaths: ["index.html", "assets/main.js"],
      manifestIdentifier: "PKG-1",
    });
    const validation = XMLValidator.validate(xml);
    expect(validation).toBe(true);
  });

  it("escapes a malicious title instead of injecting markup", () => {
    const xml = generateManifest(demoAssessment(`</title><script>alert(1)</script><title>`), {
      launchFile: "index.html",
      filePaths: ["index.html"],
      manifestIdentifier: "PKG-1",
    });
    expect(xml).not.toContain("<script>");
    expect(XMLValidator.validate(xml)).toBe(true);

    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(xml);
    // The malicious payload should appear as literal escaped text, not as
    // additional XML structure — organizations.organization.title stays a
    // single string node.
    const orgTitle = parsed.manifest.organizations.organization.title;
    expect(typeof orgTitle).toBe("string");
  });

  it("includes the mastery score sequencing block when configured", () => {
    const assessment = AssessmentSchema.parse({
      id: "demo2",
      title: "Mastery Demo",
      internalId: "demo-2",
      questions: [{ id: "q1", type: "trueFalse", prompt: "T/F", correctAnswer: true }],
      settings: { scorm: { masteryScore: 0.8 } },
    });
    const xml = generateManifest(assessment, {
      launchFile: "index.html",
      filePaths: ["index.html"],
      manifestIdentifier: "PKG-1",
    });
    expect(xml).toContain("minNormalizedMeasure>0.8<");
  });

  it("declares every provided file path as a <file> element", () => {
    const xml = generateManifest(demoAssessment(), {
      launchFile: "index.html",
      filePaths: ["index.html", "assets/app.js", "assets/app.css"],
      manifestIdentifier: "PKG-1",
    });
    expect(xml).toContain('href="index.html"');
    expect(xml).toContain('href="assets/app.js"');
    expect(xml).toContain('href="assets/app.css"');
  });
});

describe("assertSafeZipPath", () => {
  it("rejects path traversal, absolute paths, and backslashes", () => {
    expect(() => assertSafeZipPath("../../etc/passwd")).toThrow(UnsafeFilePathError);
    expect(() => assertSafeZipPath("/etc/passwd")).toThrow(UnsafeFilePathError);
    expect(() => assertSafeZipPath("C:\\Windows\\System32")).toThrow(UnsafeFilePathError);
    expect(() => assertSafeZipPath("assets\\..\\..\\secret")).toThrow(UnsafeFilePathError);
  });

  it("allows normal relative paths", () => {
    expect(() => assertSafeZipPath("assets/img/logo.png")).not.toThrow();
    expect(() => assertSafeZipPath("index.html")).not.toThrow();
  });
});

describe("buildPackage", () => {
  it("places imsmanifest.xml at the zip root, not inside a folder", async () => {
    const manifest = generateManifest(demoAssessment(), {
      launchFile: "index.html",
      filePaths: ["index.html"],
      manifestIdentifier: "PKG-1",
    });
    const bytes = await buildPackage(manifest, [{ path: "index.html", content: "<html></html>" }]);
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files);
    expect(names).toContain("imsmanifest.xml");
    expect(names.some((n) => n.startsWith("/"))).toBe(false);
    // No file should be nested under a single common top-level directory.
    expect(names.every((n) => !n.includes("/") || n.split("/").length <= 3)).toBe(true);
    const manifestEntry = zip.file("imsmanifest.xml");
    expect(manifestEntry).not.toBeNull();
  });

  it("rejects a malicious file path even if passed through buildPackage directly", async () => {
    const manifest = generateManifest(demoAssessment(), {
      launchFile: "index.html",
      filePaths: ["index.html"],
      manifestIdentifier: "PKG-1",
    });
    await expect(
      buildPackage(manifest, [{ path: "../outside.txt", content: "gotcha" }]),
    ).rejects.toThrow(UnsafeFilePathError);
  });
});
