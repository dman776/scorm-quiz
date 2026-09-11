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

### AnswerOption
```jsonc
{ "id": "safe-id", "label": "text", "correct": true, "score": 1.5, "feedback": "text" }
```

## Scoring strategies
- all_or_nothing, partial (with incorrectPenalty, floored at 0 unless allowNegative),
  weighted (sums per-answer scores). All deterministic and unit tested.

## Project + Excel import
- The Excel importer (`xlsx-import.js`) emits exactly this model, so imported and
  hand-authored quizzes are identical downstream. See `docs/excel-import.md`.
