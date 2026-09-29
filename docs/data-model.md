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
| drag_drop | zones[]={id,label,rect?,capacity?}, items[]={id,label,zones[]}, image (optional), scoringStrategy |

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

### Drag and drop
Learners place items into drop zones. Zones are labeled boxes, or regions (`rect`,
fractions of the image like hotspot) on an optional background `image`; when
`image` is null or has no `src`, zones render as boxes. Each item lists the zone
ids where it counts as correct (`zones`); an empty list makes it a distractor that
is correct to leave in the bank. `capacity` (whole number, optional) caps how many
items a zone holds.

```jsonc
{
  "kind": "drag_drop", "scoringStrategy": "partial", "image": null,
  "zones": [{ "id": "z1", "label": "Layer 3: Network" }, { "id": "z2", "label": "Layer 2: Data Link", "capacity": 2 }],
  "items": [
    { "id": "router", "label": "Router", "zones": ["z1"] },
    { "id": "l3sw", "label": "Layer 3 switch", "zones": ["z1", "z2"] },
    { "id": "repeater", "label": "Repeater", "zones": [] }
  ]
}
```

The learner response is `{ itemId: zoneId }` (unplaced items are absent). Items
snap into zones; where inside a zone never matters. Scoring: each non-distractor
item is right if it sits in one of its zones; a placed distractor counts one
against. `partial` = max x (right - placed distractors) / non-distractor items,
floored at 0; `all_or_nothing` needs every item right and no distractor placed.
`shuffleAnswers` shuffles the item bank. Validation requires labels, at least one
non-distractor item, valid zone references, and that the capacities leave room for
every item at once (checked by bipartite matching); in image mode every zone needs
a valid, non-overlapping region.

## Scoring strategies
- all_or_nothing, partial (with incorrectPenalty, floored at 0 unless allowNegative),
  weighted (sums per-answer scores). All deterministic and unit tested.

## Project + Excel import
- The Excel importer (`xlsx-import.js`) emits exactly this model, so imported and
  hand-authored quizzes are identical downstream. See `docs/excel-import.md`.
