# Accessibility (WCAG 2.2 AA)

## Learner runtime
- Each question is a fieldset+legend; choices are native radio/checkbox in labels;
  pills are the SAME native inputs styled as pills (correct role/state announced).
- Full keyboard operation; sequence uses Move Up/Down buttons as the accessible
  alternative to drag-and-drop; matching uses native selects.
- Visible focus (:focus-visible / :focus-within), never removed.
- No colour-only meaning: outcomes use a shape marker plus text ("Result: correct").
- aria-live status region announces validation blocks and final result.
- Focus moves to the new screen heading after navigation, review, and submission.
- Skip link, reduced-motion support, single-column reflow to 320px.

## Authoring UI
- Landmarks (header/nav/main/aside) with labels; icon-only buttons carry aria-label.
- The answer/distractor input is a full-width labelled text box (the score box is a
  separate compact field) so both are easily editable.
- Import controls and the template download are grouped and labelled.
- Preview opens in a native <dialog> (focus-trapped) with a labelled close button.

## Testing
Playwright specs cover keyboard-only authoring and attempt, mock-LMS success, and
standalone banner. Manual: complete an attempt with no mouse; confirm a screen
reader announces prompts, states, and results.
