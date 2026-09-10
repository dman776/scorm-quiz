import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import type { TrueFalseQuestion, SingleSelectQuestion } from "@scorm-quiz/schemas";
import { findScormApi } from "./apiLocator.js";
import { ScormSession } from "./scormSession.js";
import { MockScormApi } from "./mockApi.js";
import { buildInteraction, formatScormLatency } from "./interactions.js";
import type { QuestionScoreResult } from "@scorm-quiz/scoring-engine";

describe("findScormApi", () => {
  it("returns null (standalone) when no LMS window is present", () => {
    const dom = new JSDOM("<html></html>");
    const api = findScormApi(dom.window as unknown as Window, 10);
    expect(api).toBeNull();
  });

  it("finds API_1484_11 on the current window", () => {
    const dom = new JSDOM("<html></html>");
    const mock = new MockScormApi();
    (dom.window as unknown as { API_1484_11: unknown }).API_1484_11 = mock;
    const api = findScormApi(dom.window as unknown as Window, 10);
    expect(api).toBe(mock);
  });

  it("does not loop forever when parent/opener chains cycle", () => {
    const dom = new JSDOM("<html></html>");
    const win = dom.window as unknown as Window;
    // window.parent already defaults to itself in jsdom (top window), so this
    // should terminate rather than hang.
    const api = findScormApi(win, 5);
    expect(api).toBeNull();
  });
});

describe("ScormSession", () => {
  it("enters standalone mode with a null api and never fakes success", () => {
    const session = new ScormSession(null);
    expect(session.isStandalone).toBe(true);
    expect(session.initialize()).toBe(false);
    expect(session.setCompletionStatus("completed")).toBe(false);
  });

  it("initializes, sets status/score, and terminates against a mock LMS", () => {
    const mock = new MockScormApi();
    const session = new ScormSession(mock);
    expect(session.initialize()).toBe(true);
    expect(session.setCompletionStatus("completed")).toBe(true);
    expect(session.setSuccessStatus("passed")).toBe(true);
    session.setScore(8, 0, 10, 0.8);
    expect(session.terminate("normal")).toBe(true);

    const snapshot = mock.snapshot();
    expect(snapshot["cmi.completion_status"]).toBe("completed");
    expect(snapshot["cmi.success_status"]).toBe("passed");
    expect(snapshot["cmi.score.raw"]).toBe("8");
    expect(snapshot["cmi.score.scaled"]).toBe("0.8");
  });

  it("round-trips suspend_data through a resumed session", () => {
    const mock = new MockScormApi();
    const session = new ScormSession(mock);
    session.initialize();
    const payload = JSON.stringify({ currentQuestionIndex: 2, responses: { q1: "a" } });
    session.setSuspendData(payload);
    session.commit();

    // Simulate a new launch resuming from the same backing store.
    const resumed = new ScormSession(mock);
    resumed.initialize();
    expect(resumed.getSuspendData()).toBe(payload);
  });

  it("clamps scaled score into the valid [-1, 1] range", () => {
    const mock = new MockScormApi();
    const session = new ScormSession(mock);
    session.initialize();
    session.setScore(100, 0, 10, 5);
    expect(mock.snapshot()["cmi.score.scaled"]).toBe("1");
  });

  it("does not throw when writing an interaction record with an unusual field", () => {
    const mock = new MockScormApi();
    const session = new ScormSession(mock);
    session.initialize();
    expect(() =>
      session.recordInteraction(0, {
        id: "q1",
        type: "true-false",
        timestamp: new Date().toISOString(),
        correctResponsesPatterns: ["true"],
        latency: "PT1S",
        learnerResponse: "true",
        result: "correct",
        weighting: 1,
      }),
    ).not.toThrow();
  });
});

describe("formatScormLatency", () => {
  it("formats sub-minute durations", () => {
    expect(formatScormLatency(1500)).toBe("PT1.5S");
  });

  it("formats minutes and seconds", () => {
    expect(formatScormLatency(90000)).toBe("PT1M30S");
  });

  it("formats hours, minutes, seconds", () => {
    expect(formatScormLatency(3661000)).toBe("PT1H1M1S");
  });
});

describe("buildInteraction", () => {
  const tfQuestion: TrueFalseQuestion = {
    id: "q-tf",
    type: "trueFalse",
    prompt: "The sky is blue.",
    required: true,
    shuffleOptions: false,
    excludeFromShuffle: false,
    feedback: {},
    tags: [],
    status: "draft",
    trueLabel: "True",
    falseLabel: "False",
    correctAnswer: true,
    points: 1,
  };

  const tfResult: QuestionScoreResult = {
    questionId: "q-tf",
    outcome: "correct",
    earnedPoints: 1,
    maxPoints: 1,
    response: true,
    correctOptionIds: ["true"],
    selectedOptionIds: ["true"],
  };

  it("maps true-false questions to the true-false interaction type", () => {
    const interaction = buildInteraction(tfQuestion, tfResult, 2000);
    expect(interaction.type).toBe("true-false");
    expect(interaction.learnerResponse).toBe("true");
    expect(interaction.correctResponsesPatterns).toEqual(["true"]);
    expect(interaction.result).toBe("correct");
    expect(interaction.latency).toBe("PT2S");
  });

  const choiceQuestion: SingleSelectQuestion = {
    id: "q-choice",
    type: "singleSelect",
    presentation: "radio",
    prompt: "2+2?",
    required: true,
    shuffleOptions: false,
    excludeFromShuffle: false,
    feedback: {},
    tags: [],
    status: "draft",
    options: [
      { id: "a", text: "3", isCorrect: false, excludeFromShuffle: false },
      { id: "b", text: "4", isCorrect: true, excludeFromShuffle: false },
    ],
    scoring: { strategy: "allOrNothing", points: 2, incorrectPenalty: 0, allowNegativeQuestionScore: false },
  };

  it("maps single-select questions to the choice interaction type with bracketed patterns", () => {
    const result: QuestionScoreResult = {
      questionId: "q-choice",
      outcome: "incorrect",
      earnedPoints: 0,
      maxPoints: 2,
      response: "a",
      correctOptionIds: ["b"],
      selectedOptionIds: ["a"],
    };
    const interaction = buildInteraction(choiceQuestion, result, 500);
    expect(interaction.type).toBe("choice");
    expect(interaction.learnerResponse).toBe("a");
    expect(interaction.correctResponsesPatterns).toEqual(["b"]);
    expect(interaction.result).toBe("incorrect");
  });
});
