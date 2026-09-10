import { describe, expect, it } from "vitest";
import type { MultipleSelectQuestion, SingleSelectQuestion, TrueFalseQuestion } from "@scorm-quiz/schemas";
import { scoreSingleSelect } from "./scoreSingleSelect.js";
import { scoreTrueFalse } from "./scoreTrueFalse.js";
import { scoreMultipleSelect } from "./scoreMultipleSelect.js";
import { aggregateAssessmentScore } from "./aggregateAssessmentScore.js";
import { AssessmentSchema } from "@scorm-quiz/schemas";

const singleSelectQ: SingleSelectQuestion = {
  id: "q1",
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

const trueFalseQ: TrueFalseQuestion = {
  id: "q2",
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

function multiSelectQ(overrides: Partial<MultipleSelectQuestion["scoring"]> = {}): MultipleSelectQuestion {
  return {
    id: "q3",
    type: "multipleSelect",
    presentation: "checkbox",
    prompt: "Pick all primes",
    required: true,
    shuffleOptions: false,
    excludeFromShuffle: false,
    feedback: {},
    tags: [],
    status: "draft",
    options: [
      { id: "a", text: "2", isCorrect: true, excludeFromShuffle: false },
      { id: "b", text: "3", isCorrect: true, excludeFromShuffle: false },
      { id: "c", text: "4", isCorrect: false, excludeFromShuffle: false },
      { id: "d", text: "5", isCorrect: true, excludeFromShuffle: false },
    ],
    scoring: { strategy: "allOrNothing", points: 3, incorrectPenalty: 0, allowNegativeQuestionScore: false, ...overrides },
  };
}

describe("scoreSingleSelect", () => {
  it("awards full points for the correct option", () => {
    const result = scoreSingleSelect(singleSelectQ, "b");
    expect(result.outcome).toBe("correct");
    expect(result.earnedPoints).toBe(2);
  });

  it("awards zero for an incorrect option", () => {
    const result = scoreSingleSelect(singleSelectQ, "a");
    expect(result.outcome).toBe("incorrect");
    expect(result.earnedPoints).toBe(0);
  });

  it("marks unanswered when no response given", () => {
    const result = scoreSingleSelect(singleSelectQ, null);
    expect(result.outcome).toBe("unanswered");
  });
});

describe("scoreTrueFalse", () => {
  it("scores correct/incorrect", () => {
    expect(scoreTrueFalse(trueFalseQ, true).outcome).toBe("correct");
    expect(scoreTrueFalse(trueFalseQ, false).outcome).toBe("incorrect");
    expect(scoreTrueFalse(trueFalseQ, null).outcome).toBe("unanswered");
  });
});

describe("scoreMultipleSelect", () => {
  it("allOrNothing: exact match required", () => {
    const q = multiSelectQ({ strategy: "allOrNothing" });
    expect(scoreMultipleSelect(q, ["a", "b", "d"]).earnedPoints).toBe(3);
    expect(scoreMultipleSelect(q, ["a", "b"]).earnedPoints).toBe(0);
    expect(scoreMultipleSelect(q, ["a", "b", "d", "c"]).earnedPoints).toBe(0);
  });

  it("partialCredit: fraction of correct minus penalty for incorrect", () => {
    const q = multiSelectQ({ strategy: "partialCredit", incorrectPenalty: 0.5 });
    // 2 of 3 correct selected, 0 incorrect => 2/3 * 3 = 2
    expect(scoreMultipleSelect(q, ["a", "b"]).earnedPoints).toBeCloseTo(2);
    // 2 of 3 correct + 1 incorrect at 0.5 penalty => (2 - 0.5)/3 * 3 = 1.5
    expect(scoreMultipleSelect(q, ["a", "b", "c"]).earnedPoints).toBeCloseTo(1.5);
    const result = scoreMultipleSelect(q, ["a", "b", "c"]);
    expect(result.outcome).toBe("partial");
  });

  it("partialCredit clamps at zero unless negative scores are explicitly allowed", () => {
    const q = multiSelectQ({ strategy: "partialCredit", incorrectPenalty: 1 });
    // 0 correct selected, 1 incorrect => (0 - 1)/3 * 3 = -1, clamped to 0
    expect(scoreMultipleSelect(q, ["c"]).earnedPoints).toBe(0);
  });

  it("partialCredit allows negative when explicitly enabled", () => {
    const q = multiSelectQ({ strategy: "partialCredit", incorrectPenalty: 1, allowNegativeQuestionScore: true });
    expect(scoreMultipleSelect(q, ["c"]).earnedPoints).toBeLessThan(0);
  });

  it("weighted: sums each selected option's own score value", () => {
    const q = multiSelectQ({ strategy: "weighted" });
    q.options = [
      { id: "a", text: "Best", isCorrect: true, scoreValue: 2, excludeFromShuffle: false },
      { id: "b", text: "Partial", isCorrect: false, scoreValue: 1, excludeFromShuffle: false },
      { id: "c", text: "Wrong", isCorrect: false, scoreValue: -1, excludeFromShuffle: false },
    ];
    q.scoring.points = 2;
    const result = scoreMultipleSelect(q, ["a", "b"]);
    expect(result.earnedPoints).toBe(2); // 2 + 1 = 3, clamped to maxPoints=2
  });

  it("marks unanswered for empty selection", () => {
    const q = multiSelectQ();
    expect(scoreMultipleSelect(q, []).outcome).toBe("unanswered");
  });
});

describe("aggregateAssessmentScore", () => {
  it("computes raw/max/scaled score and pass/fail across question types", () => {
    const assessment = AssessmentSchema.parse({
      id: "a1",
      title: "Mixed",
      internalId: "mixed-1",
      questions: [singleSelectQ, trueFalseQ, multiSelectQ()],
      settings: { scoring: { passingScorePercent: 80 } },
    });

    const passingResponses = { q1: "b", q2: true, q3: ["a", "b", "d"] };
    const result = aggregateAssessmentScore(assessment, passingResponses);
    expect(result.maxScore).toBe(6); // 2 + 1 + 3
    expect(result.rawScore).toBe(6);
    expect(result.passed).toBe(true);
    expect(result.scaledScore).toBeCloseTo(1);
    expect(result.numberCorrect).toBe(3);

    const failingResponses = { q1: "a", q2: false, q3: [] };
    const failingResult = aggregateAssessmentScore(assessment, failingResponses);
    expect(failingResult.rawScore).toBe(0);
    expect(failingResult.passed).toBe(false);
  });

  it("excludes unanswered questions from scoring when configured", () => {
    const assessment = AssessmentSchema.parse({
      id: "a2",
      title: "Exclude unanswered",
      internalId: "exclude-1",
      questions: [singleSelectQ, trueFalseQ],
      settings: { scoring: { passingScorePercent: 100, unansweredTreatment: "excludeFromScoring" } },
    });
    // Only answer q1 correctly; q2 left unanswered and should not count against the max.
    const result = aggregateAssessmentScore(assessment, { q1: "b" });
    expect(result.passed).toBe(true);
  });
});
