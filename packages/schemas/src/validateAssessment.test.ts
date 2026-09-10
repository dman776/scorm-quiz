import { describe, expect, it } from "vitest";
import { AssessmentSchema } from "./assessment.js";
import { validateAssessment } from "./validateAssessment.js";
import { generateId } from "./ids.js";

function baseAssessment(overrides: Partial<Parameters<typeof AssessmentSchema.parse>[0]> = {}) {
  return AssessmentSchema.parse({
    id: generateId("assessment"),
    title: "Demo Assessment",
    internalId: "demo-001",
    questions: [],
    ...overrides,
  });
}

describe("validateAssessment", () => {
  it("blocks export when there are no questions", () => {
    const result = validateAssessment(baseAssessment());
    expect(result.canExport).toBe(false);
    expect(result.issues.some((i) => i.code === "NO_QUESTIONS")).toBe(true);
  });

  it("blocks export when a single-select question has zero correct answers", () => {
    const assessment = baseAssessment({
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
    });
    const result = validateAssessment(assessment);
    expect(result.canExport).toBe(false);
    expect(result.issues.some((i) => i.code === "SINGLE_SELECT_MUST_HAVE_ONE_CORRECT")).toBe(true);
  });

  it("passes for a well-formed assessment", () => {
    const assessment = baseAssessment({
      questions: [
        {
          id: "q1",
          type: "singleSelect",
          prompt: "Pick one",
          options: [
            { id: "a", text: "A", isCorrect: true },
            { id: "b", text: "B", isCorrect: false },
          ],
          feedback: { correct: "Nice", incorrect: "Nope" },
        },
      ],
    });
    const result = validateAssessment(assessment);
    expect(result.canExport).toBe(true);
    expect(result.issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("flags a duplicate question id", () => {
    const q = {
      id: "dup",
      type: "trueFalse" as const,
      prompt: "T or F",
      correctAnswer: true,
    };
    const assessment = baseAssessment({ questions: [q, q] });
    const result = validateAssessment(assessment);
    expect(result.issues.some((i) => i.code === "DUPLICATE_QUESTION_ID")).toBe(true);
  });
});
