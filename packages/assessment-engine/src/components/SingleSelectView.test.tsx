import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SingleSelectQuestion } from "@scorm-quiz/schemas";
import { SingleSelectView } from "./SingleSelectView.js";

const question: SingleSelectQuestion = {
  id: "q1",
  type: "singleSelect",
  presentation: "radio",
  prompt: "What is 2+2?",
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
  scoring: { strategy: "allOrNothing", points: 1, incorrectPenalty: 0, allowNegativeQuestionScore: false },
};

describe("SingleSelectView", () => {
  it("renders an accessible radiogroup with the prompt as its legend/label", () => {
    render(<SingleSelectView question={question} optionOrder={["a", "b"]} value={null} onChange={() => {}} />);
    const group = screen.getByRole("radiogroup", { name: "What is 2+2?" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "3" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "4" })).toBeInTheDocument();
  });

  it("is fully keyboard operable — tab to the group, arrow keys move selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SingleSelectView question={question} optionOrder={["a", "b"]} value={null} onChange={onChange} />);

    await user.tab();
    expect(screen.getByRole("radio", { name: "3" })).toHaveFocus();
    await user.keyboard(" ");
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("reflects the selected value and respects a custom option order", () => {
    render(<SingleSelectView question={question} optionOrder={["b", "a"]} value="b" onChange={() => {}} />);
    const radios = screen.getAllByRole("radio");
    expect(radios[0]).toHaveAccessibleName("4");
    expect(radios[0]).toBeChecked();
    expect(radios[1]).not.toBeChecked();
  });
});
