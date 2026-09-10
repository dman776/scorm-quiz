import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import request from "supertest";
import type { Express } from "express";

let app: Express;
let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "scorm-quiz-api-test-"));
  process.env["DATA_DIR"] = tempDir;
  const { createApp } = await import("./app.js");
  app = createApp();
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function sampleAssessment(overrides: Record<string, unknown> = {}) {
  return {
    id: "test-assessment-1",
    title: "Sample Assessment",
    internalId: "sample-1",
    questions: [
      { id: "q1", type: "trueFalse", prompt: "The sky is blue.", correctAnswer: true },
    ],
    ...overrides,
  };
}

describe("Assessments API", () => {
  it("creates and retrieves an assessment", async () => {
    const createRes = await request(app).post("/api/assessments").send(sampleAssessment());
    expect(createRes.status).toBe(201);
    expect(createRes.body.title).toBe("Sample Assessment");

    const getRes = await request(app).get("/api/assessments/test-assessment-1");
    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe("test-assessment-1");
  });

  it("rejects an invalid assessment payload", async () => {
    const res = await request(app).post("/api/assessments").send({ title: "" });
    expect(res.status).toBe(400);
  });

  it("lists assessments", async () => {
    const res = await request(app).get("/api/assessments");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("returns 404 for an unknown assessment", async () => {
    const res = await request(app).get("/api/assessments/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("runs validation and reports missing correct answer", async () => {
    await request(app).post("/api/assessments").send(
      sampleAssessment({
        id: "invalid-1",
        questions: [
          {
            id: "q1",
            type: "singleSelect",
            prompt: "Pick one",
            options: [
              { id: "a", text: "A", isCorrect: false },
              { id: "b", text: "B", isCorrect: false },
            ],
          },
        ],
      }),
    );
    const res = await request(app).post("/api/assessments/invalid-1/validate");
    expect(res.status).toBe(200);
    expect(res.body.canExport).toBe(false);
    expect(res.body.issues.some((i: { code: string }) => i.code === "SINGLE_SELECT_MUST_HAVE_ONE_CORRECT")).toBe(true);
  });

  it("blocks export when validation fails, and reports 503 when the runtime isn't built for a valid one", async () => {
    const blockedRes = await request(app).post("/api/assessments/invalid-1/export");
    expect(blockedRes.status).toBe(422);

    const validRes = await request(app).post("/api/assessments/test-assessment-1/export");
    // In CI/dev before `pnpm --filter @scorm-quiz/runtime build` has run,
    // this should fail loudly (503) rather than silently produce a broken
    // package.
    expect([200, 503]).toContain(validRes.status);
  });

  it("imports a project file and rejects a malformed one", async () => {
    const project = {
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      assessment: sampleAssessment({ id: "imported-1", internalId: "imported-1" }),
    };
    const res = await request(app).post("/api/projects/import").send({ project });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("imported-1");

    const badRes = await request(app).post("/api/projects/import").send({ project: { not: "valid" } });
    expect(badRes.status).toBe(400);
  });

  it("deletes an assessment", async () => {
    const delRes = await request(app).delete("/api/assessments/test-assessment-1");
    expect(delRes.status).toBe(204);
    const getRes = await request(app).get("/api/assessments/test-assessment-1");
    expect(getRes.status).toBe(404);
  });
});
