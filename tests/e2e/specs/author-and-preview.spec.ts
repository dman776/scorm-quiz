import { test, expect } from "@playwright/test";

/**
 * End-to-end: a nontechnical author creates an assessment through the UI
 * (one single-select + one true/false question), previews it as a
 * learner, answers correctly, and sees a passing result — exercising the
 * full authoring -> preview -> scoring path with no mocking.
 */
test("author a two-question assessment and pass it in Learner Preview", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Assessments" })).toBeVisible();

  await page.getByRole("button", { name: "New Assessment" }).click();
  await expect(page.getByLabel("Assessment title")).toHaveValue("Untitled Assessment");

  // Question 1: single-select (added by default question type).
  await page.getByRole("button", { name: "Add Question" }).click();
  await page.getByLabel("Prompt").fill("What is 2 + 2?");
  const optionInputs = page.getByPlaceholder("Answer text");
  await optionInputs.nth(0).fill("4");
  await optionInputs.nth(1).fill("5");
  await page.getByLabel("Mark option 1 as correct").check();
  await page.getByRole("button", { name: "Update Question" }).click();

  // Question 2: true/false.
  await page.getByLabel("Question type").selectOption("trueFalse");
  await page.getByRole("button", { name: "Add Question" }).click();
  await page.getByLabel("Prompt").fill("Water boils at 100°C at sea level.");
  await page.getByLabel("Correct answer").selectOption("true");
  await page.getByRole("button", { name: "Update Question" }).click();

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Questions (2)")).toBeVisible();

  await page.getByRole("link", { name: "Learner Preview" }).click();
  await expect(page.getByRole("heading", { name: /Learner Preview/ })).toBeVisible();

  // Answer question 1 correctly and advance.
  await expect(page.getByText("Question 1 of 2")).toBeVisible();
  await page.getByRole("radio", { name: "4" }).check();
  await page.getByRole("button", { name: "Next" }).click();

  // Answer question 2 correctly and go to review.
  await expect(page.getByText("Question 2 of 2")).toBeVisible();
  await page.getByRole("radio", { name: "True" }).check();
  await page.getByRole("button", { name: "Review & Submit" }).click();

  await expect(page.getByRole("heading", { name: "Review your answers" })).toBeVisible();
  await page.getByRole("button", { name: "Submit Assessment" }).click();

  await expect(page.getByText("You passed!")).toBeVisible();
  await expect(page.getByText(/Score: 2 \/ 2/)).toBeVisible();
});
