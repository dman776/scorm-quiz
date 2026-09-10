import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SingleSelectQuestionSchema, type SingleSelectQuestion } from "@scorm-quiz/schemas";
import { SingleSelectEditorForm } from "./SingleSelectEditorForm.js";

const question: SingleSelectQuestion = SingleSelectQuestionSchema.parse({
  id: "q1",
  type: "singleSelect",
  prompt: "Original prompt",
  options: [
    { id: "a", text: "A", isCorrect: true },
    { id: "b", text: "B", isCorrect: false },
  ],
});

describe("SingleSelectEditorForm", () => {
  it("blocks submission and shows a field error when the prompt is cleared", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SingleSelectEditorForm question={question} onChange={onChange} />);

    const promptField = screen.getByLabelText("Prompt");
    await user.clear(promptField);
    await user.click(screen.getByRole("button", { name: "Update Question" }));

    expect(await screen.findByText(/required|too small|1 character/i)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("applies a valid edit and calls onChange with the updated question", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SingleSelectEditorForm question={question} onChange={onChange} />);

    const promptField = screen.getByLabelText("Prompt");
    await user.clear(promptField);
    await user.type(promptField, "Updated prompt");
    await user.click(screen.getByRole("button", { name: "Update Question" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const updated = onChange.mock.calls[0]![0];
    expect(updated.prompt).toBe("Updated prompt");
  });

  it("lets the author add an answer option", async () => {
    const user = userEvent.setup();
    render(<SingleSelectEditorForm question={question} onChange={vi.fn()} />);
    const before = screen.getAllByPlaceholderText("Answer text").length;
    await user.click(screen.getByRole("button", { name: "Add option" }));
    expect(screen.getAllByPlaceholderText("Answer text")).toHaveLength(before + 1);
  });
});
