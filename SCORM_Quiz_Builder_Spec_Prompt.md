# Specification Prompt: Node-Based SCORM 2004 (4th Edition) Quiz/Test Builder

> Use this as a project brief/prompt for a developer or an AI coding assistant. It defines the authoring tool, the data model, the runtime quiz player, and the SCORM packaging requirements.

## 1. Project Summary

Build a **Node.js-based authoring application** that lets an instructional designer create tests/quizzes through a UI, then export a **SCORM 2004 4th Edition** compliant package (a `.zip` containing `imsmanifest.xml`, HTML/CSS/JS, and assets) that can be uploaded directly to an LMS (Workday Learning) for deployment.

**Important architecture note:** The *authoring tool* runs on Node.js (as a local web app or Electron app). The *exported quiz package* that runs inside the LMS must be **static HTML/CSS/JavaScript only** (no server/Node runtime), since SCORM content is loaded client-side in an iframe by the LMS's SCORM player. The build/export step compiles the quiz JSON definition into this static, self-contained package.

## 2. Goals

- Give non-developers a UI to author quiz items without hand-coding SCORM/Storyline.
- Support the question types, scoring rules, and reporting behaviors listed below.
- Produce packages that report reliably to Workday Learning via **CMI data**, since SCORM 1.2/AICC do not support the CMI reporting WDL requires.<cite>turn1search2</cite>
- Reuse item-writing conventions already used for JCI ASCEND test-outs (balanced distractors, position randomization, per-section scoring) as optional built-in authoring aids.<cite>turn1search11</cite><cite>turn1search13</cite>

## 3. Tech Stack (Recommended)

| Layer | Recommendation |
|---|---|
| Authoring app runtime | Node.js (LTS) + Express (local server) or Electron (desktop packaging) |
| Authoring UI | React + TypeScript, component library (e.g., MUI or Radix UI) for accessible form controls |
| Local data storage | SQLite (via `better-sqlite3`) or flat JSON project files (`.quizproj.json`) — pick one; SQLite recommended if the tool will manage many quizzes/item banks |
| Quiz runtime (exported package) | Vanilla JS or a compiled bundle (e.g., esbuild/Vite output) — must run with no build/server dependency, just static files |
| SCORM communication | A SCORM 2004 3rd/4th edition JS API wrapper (e.g., adapt or extend the widely used `pipwerks-scorm-api-wrapper`, updated for SCORM 2004 RTE calls: `Initialize`, `GetValue`, `SetValue`, `Commit`, `Terminate`) |
| Manifest generation | Custom Node module that generates `imsmanifest.xml` (SCORM 2004 4th Ed schema, with `<organizations>`, `<resources>`, `<sequencing>` if needed) |
| Packaging | `archiver` or `jszip` (Node) to zip the final output folder |
| Validation | Optional: integrate ADL SCORM 2004 4th Edition Test Suite / a manifest validator step before final export |

## 4. Authoring UI Requirements

### 4.1 Item Bank Management
- Create, edit, duplicate, delete, and tag/categorize items (e.g., by section/course/topic, matching how you currently tag test-out items to a source course for subscoring).<cite>turn1search11</cite>
- Each item includes: stem/question text (rich text + optional image/media), item type, list of answer options, correct answer(s), per-option point value, and per-option feedback/rationale text.
- Support a reusable **item bank** separate from any single quiz, so items can be pulled into multiple quizzes/test-outs.
- Import/export items via CSV or JSON for bulk authoring.

### 4.2 Supported Question/Response Types
1. **Single-select radio buttons** — one correct answer.
2. **Multiple-select checkboxes** — one or more correct answers; author defines whether scoring requires *all-or-nothing* credit or allows *partial credit* per selected option.
3. **Single-select "pill"/chip buttons** — visually a row of pill-shaped toggle buttons, functionally single-select (radio behavior).
4. **Multi-select "pill"/chip buttons** — visually pill-shaped toggle buttons, functionally multi-select (checkbox behavior).
5. *(Optional/future)* Matching and scenario-branch types — flagged as a stretch goal since your existing assessments use matching and scenario formats; not in v1 scope unless prioritized.<cite>turn1search12</cite>

For each type, the UI must let the author:
- Add/remove/reorder answer options (distractors).
- Mark one or more options as correct.
- Assign a **point value per answer option** (not just per item), so partial-credit and weighted-distractor designs are possible.
- Enter **feedback/rationale text per option**, shown for both correct and incorrect selections (see 4.4).
- Toggle "shuffle answer options" per item (supports position-bias-free authoring like your current standard).<cite>turn1search13</cite>

### 4.3 Scoring & Test Configuration
- **Per-answer score values**: point weight assignable at the option level; total item score = sum of correct option values (or max possible, depending on scoring mode).
- **Overall passing score**: configurable as a percentage (e.g., 80%) or raw point threshold (e.g., 24/30), consistent with your existing test-out passing standards.<cite>turn1search12</cite><cite>turn1search16</cite>
- **Optional section/topic subscoring**: report a per-tag or per-section score breakdown in addition to the overall score, mirroring your Fire Fundamentals per-course subscore table.<cite>turn1search11</cite>
- **Retry/attempt limits**: configurable number of allowed attempts (0/unlimited, or a specific number, e.g., 2), with clear messaging to the learner about attempts remaining.
- **Time limit** (recommended addition, optional to enable): configurable per-quiz time limit, matching the 30-minute pattern used in your current test-outs.<cite>turn1search11</cite>
- **Question/answer randomization**: toggle to randomize question order and/or answer option order per attempt.
- **Show correct answers at end of test**: toggle; when enabled, learner review screen reveals correct answer(s) after submission (respecting attempts-remaining logic — recommend only revealing on final attempt or after passing, configurable).
- **Show reason/rationale for correct and incorrect answers**: toggle; when enabled, the per-option feedback text authored in 4.2 is displayed to the learner on the results/review screen for both selected and correct options.

### 4.4 Feedback Behavior
- Immediate vs. end-of-test feedback mode (configurable): show rationale immediately after each question, or only on the final results screen.
- Rationale text should be distinguishable as "why this is correct" vs. "why this is incorrect" in the UI author view, but rendered contextually to the learner based on what they selected.

### 4.5 Preview & Validate
- In-app "Preview" mode to take the quiz exactly as a learner would, before export.
- Validation checks before export block (e.g., item with no correct answer marked, passing score not set, missing point values).

## 5. Data Model (Quiz Definition Schema)

Author a versioned JSON schema, for example:

```json
{
  "quizId": "string",
  "title": "string",
  "version": "1.0",
  "settings": {
    "passingScore": { "type": "percentage|points", "value": 80 },
    "maxAttempts": 2,
    "timeLimitMinutes": 30,
    "randomizeQuestionOrder": true,
    "randomizeAnswerOrder": true,
    "showCorrectAnswersAtEnd": true,
    "showRationale": { "correct": true, "incorrect": true, "timing": "immediate|end" }
  },
  "sections": [
    { "sectionId": "string", "label": "string" }
  ],
  "items": [
    {
      "itemId": "string",
      "sectionId": "string",
      "type": "single_radio|multi_checkbox|single_pill|multi_pill",
      "stem": "string (rich text)",
      "media": { "type": "image|none", "url": "string" },
      "shuffleOptions": true,
      "scoringMode": "all_or_nothing|partial_credit",
      "options": [
        {
          "optionId": "string",
          "text": "string",
          "isCorrect": true,
          "pointValue": 1,
          "rationale": "string"
        }
      ]
    }
  ]
}
```

## 6. SCORM 2004 (4th Edition) Packaging Requirements

- Generate a valid `imsmanifest.xml` per the SCORM 2004 4th Edition Content Aggregation Model (CAM), including required namespaces, `<organizations>`/`<organization>`, `<resources>`/`<resource>` with correct `href` to the launch page, and metadata.
- Package must communicate with the LMS via the SCORM 2004 Run-Time Environment (RTE) API (`API_1484_11`), calling:
  - `Initialize("")` on load
  - `SetValue("cmi.completion_status", ...)`
  - `SetValue("cmi.success_status", "passed"|"failed")`
  - `SetValue("cmi.score.raw", ...)`, `cmi.score.min`, `cmi.score.max`, `cmi.score.scaled`
  - `SetValue("cmi.interactions.n.id"/".type"/".learner_response"/".result"/".description")` — one interaction record per question, so the LMS can report per-item results, not just an overall score
  - `SetValue("cmi.suspend_data", ...)` to persist attempt state/progress if a learner exits and resumes
  - `Commit("")` after updates and `Terminate("")` on exit
- Since WDL's own quiz engine doesn't reliably support CMI reporting, this package must own all scoring/reporting logic client-side and push final results via the RTE calls above.<cite>turn1search2</cite><cite>turn1search21</cite>
- Confirm the manifest declares SCORM 2004 4th Edition schema version explicitly (not 3rd Edition or SCORM 1.2), since that's the version WDL expects.<cite>turn1search2</cite>
- Include a fallback/error state if `API_1484_11` cannot be found in the parent window chain (common LMS integration issue), so the quiz still functions in preview/standalone mode.

## 7. Export/Build Pipeline

1. Author saves/edits quiz in the authoring UI → persisted to local storage (SQLite/JSON).
2. "Export to SCORM" action triggers a Node build step:
   - Renders the quiz runtime (HTML/CSS/JS) with the quiz JSON embedded or loaded as a static asset.
   - Injects the SCORM API wrapper and RTE call logic.
   - Generates `imsmanifest.xml` from the quiz metadata/settings.
   - Copies any media assets into the package folder.
   - Zips the output folder into a single SCORM-compliant `.zip`.
3. Optional: run an automated manifest/package validation step before finalizing the zip.

## 8. Non-Functional Requirements

- **Accessibility**: all interactive controls (radios, checkboxes, pill/chip toggles) must be keyboard-navigable and screen-reader labeled (proper ARIA roles for pill-style toggle buttons acting as radio/checkbox groups).
- **Responsive runtime**: quiz player should render correctly at common LMS iframe widths.
- **Offline-safe runtime**: no external CDN dependencies in the exported package (LMS environments often block external calls); bundle all JS/CSS locally.
- **Data portability**: quiz JSON export/import so item banks can be version-controlled or shared across designers.

## 9. Suggested V1 Scope vs. Later Phases

**V1 (MVP):**
- Item bank + 4 question types (radio, checkbox, single pill, multi pill)
- Per-option scoring, passing score, retries, randomization, show-correct-answers toggle, rationale display
- SCORM 2004 4th Ed export with `cmi.interactions` reporting

**Phase 2 (stretch):**
- Matching and scenario/branching item types
- Per-section/topic subscore reporting in the LMS results view
- Item analytics (difficulty/discrimination) once real attempt data exists

## 10. Open Questions to Confirm Before Development

- Should "show correct answers at end" reveal on every attempt, or only after the final attempt/on passing? (current recommendation: configurable per quiz)
- Desired partial-credit behavior for multi-select/multi-pill items: all-or-nothing vs. per-option credit?
- Should the authoring tool be a local desktop app (Electron) or a locally-hosted web app your dev team runs internally?
- Any requirement to log attempt-level data outside of what the LMS captures (e.g., to a JCI-internal reporting store)?
