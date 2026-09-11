# Data model

Types live in `packages/engine/src/types.js` (JSDoc typedefs + frozen constants).
Questions are a discriminated union on `kind`.

## Assessment (project file, schemaVersion 1)
```jsonc
{ "schemaVersion": 1, "id": "safe-id", "title": "string", "lmsTitle": "string",
  "description": "string", "version": "1.0", "author": "string", "language": "en-US",
  "status": "draft|ready|published|archived",
  "settings": { /* AssessmentSettings */ }, "questions": [ /* Question[] */ ] }
```

## AssessmentSettings
```jsonc
{ "passingPercent": 80, "maxAttempts": 2, "scoreRetention": "highest|latest|first",
  "allowBackward": true, "requireAnswer": false, "shuffleQuestions": false,
  "shuffleAnswers": false, "seed": 12345, "timeLimitSec": null,
  "passMessage": "string", "failMessage": "string",
  "results": { "showScore": true, "showPassFail": true, "showCorrectCount": true,
    "showCorrectAnswers": true, "delayUntilFinalAttempt": true, "showMissedOnly": false } }
```

## Question (discriminated union on `kind`)
Common: id, kind, prompt, points, objective, section, correctFeedback,
incorrectFeedback, partialFeedback, rationale, status, tags, difficulty,
required, shuffleOptions.

| kind | key fields |
| --- | --- |
| single_select | presentation (radio/single_pill/single_checkbox), options[] one correct |
| multiple_select | presentation (checkbox/multi_pill), options[] >=1 correct, scoringStrategy, incorrectPenalty, allowNegative |
| true_false | options[] True/False, one correct |
| single_checkbox | single options[0], required |
| matching | pairs[]={prompt,match}, scoringStrategy |
| sequence | items[]={id,label}, correctOrder[], scoringStrategy |
| numeric | exact+tolerance or min+max; precision, units |
| short_answer | accepted[], caseSensitive |
| hotspot | image={src,alt,width,height}, options[] each with rect, multiple, scoringStrategy |

### AnswerOption
```jsonc
{ "id": "safe-id", "label": "text", "correct": true, "score": 1.5, "feedback": "text" }
```

### Hotspot
A hotspot question is a choice question drawn on a picture: each clickable region
is an ordinary AnswerOption carrying a `rect`, so scoring, validation and the SCORM
`choice` interaction reuse the existing choice machinery unchanged. `multiple`
decides which rules apply — false follows single_select, true follows
multiple_select (including scoringStrategy and per-region scores).

```jsonc
{
  "kind": "hotspot",
  "multiple": false,
  "image": { "src": "data:image/png;base64,...", "alt": "Network diagram", "width": 400, "height": 260 },
  "options": [
    { "id": "hs-router", "label": "Router", "correct": true,
      "rect": { "x": 0.075, "y": 0.154, "w": 0.275, "h": 0.269 } }
  ]
}
```

`rect` values are fractions of the image (0..1) measured from its top-left, so
regions scale with the rendered image instead of assuming a pixel size. The image
must be an embedded `data:` URI: the SCO has no network access in many LMS
deployments, so an external URL would leave learners looking at a broken image.
The author's `label` is never shown to the learner and never used as the region's
accessible name (that would name the answer); it exists for the authoring UI and
the answer key. Regions get a neutral "Region N of M" accessible name instead.

## Scoring strategies
- all_or_nothing, partial (with incorrectPenalty, floored at 0 unless allowNegative),
  weighted (sums per-answer scores). All deterministic and unit tested.

## Project + Excel import
- The Excel importer (`xlsx-import.js`) emits exactly this model, so imported and
  hand-authored quizzes are identical downstream. See `docs/excel-import.md`.
