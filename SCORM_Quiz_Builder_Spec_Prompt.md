# Specification Prompt: Node-Based SCORM 2004 (4th Edition) Quiz/Test Builder

> Use this as a project brief/prompt for a developer or an AI coding assistant. It defines the authoring tool, the data model, the runtime quiz player, and the SCORM packaging requirements.
>
> **Status (v1.1, 2026-09-11):** A reference implementation exists in this repository. Where it differs from the original brief, the sections below describe what is built and mark each requirement **Implemented**, **Partial** or **Not yet built**. See the revision history in section 11.

## 1. Project Summary

Build a **Node.js-based authoring application** that lets an instructional designer create tests/quizzes through a UI, then export a **SCORM 2004 4th Edition** compliant package (a `.zip` containing `imsmanifest.xml`, HTML/CSS/JS, and assets) that can be uploaded directly to an LMS (Workday Learning) for deployment.

**Important architecture note:** The *authoring tool* runs on Node.js (as a local web app). The *exported quiz package* that runs inside the LMS must be **static HTML/CSS/JavaScript only** (no server/Node runtime), since SCORM content is loaded client-side in an iframe by the LMS's SCORM player. The build/export step compiles the quiz JSON definition into this static, self-contained package.

## 2. Goals

- Give non-developers a UI to author quiz items without hand-coding SCORM/Storyline.
- Support the question types, scoring rules, and reporting behaviors listed below.
- Produce packages that report reliably to Workday Learning via **CMI data**, since SCORM 1.2/AICC do not support the CMI reporting WDL requires.<cite>turn1search2</cite>
- Reuse item-writing conventions already used for JCI ASCEND test-outs (balanced distractors, position randomization, per-section scoring) as optional built-in authoring aids.<cite>turn1search11</cite><cite>turn1search13</cite>

## 3. Tech Stack

The reference build uses a **zero-dependency stack** so it runs from a fresh clone with only Node.js installed. Business logic lives in shared packages behind clear seams, so the authoring UI and API can later move to the production stack without touching scoring, SCORM, validation, packaging or import code.

| Layer | As built (reference) | Production target |
|---|---|---|
| Repo layout | npm workspaces: `packages/*` (engine, scorm-runtime, export-service, mock-lms, shared) and `apps/*` (server, web) | unchanged |
| Authoring app runtime | Node.js >= 20, built-in `node:http` server (`apps/server`) | Express or Fastify |
| Authoring UI | Zero-build vanilla ES modules + CSS (`apps/web`) | React + TypeScript |
| Local data storage | Browser `localStorage` for the working quiz, JSON files on the server, project JSON import/export | Prisma + SQLite/PostgreSQL |
| Quiz runtime (exported package) | Vanilla JS ES modules, the same `player.js` used by the authoring preview | unchanged |
| SCORM communication | Custom `API_1484_11` adapter (`adapter.js`) with API discovery and a standalone fallback | unchanged |
| Manifest generation | Custom Node module (`manifest.js`), SCORM 2004 4th Edition | unchanged |
| Packaging | `jszip` | unchanged |
| Type checking | JSDoc + `// @ts-check`, `tsc --noEmit` | TypeScript |
| Tests | Node built-in test runner, a headless mock-LMS attempt simulation, and a Playwright learner spec | unchanged |
| Validation | Built-in validator; ADL Test Suite run is a manual step | automate the ADL run |

Only two runtime dependencies are used: `jszip` (packaging and `.xlsx` reading) and `nanoid` (ids). The exported package bundles no third-party code.

## 4. Authoring UI Requirements

### 4.1 Item Bank Management
- Create, edit, duplicate, delete and reorder questions within a quiz. **Implemented.**
- Tag each question with a section and a learning objective. **Implemented** (stored and exported to the question CSV; see 4.3 for subscoring).
- Each item includes: prompt, item type, answer options, correct answer(s), per-option point value, correct/incorrect feedback and a rationale. **Implemented.** Per-option feedback text is in the data model but not yet shown to learners. **Partial.**
- A reusable **item bank** separate from any single quiz. **Not yet built.**
- Bulk authoring:
  - **Excel import**: one click imports an `.xlsx` workbook with a `Settings` sheet and a `Questions` sheet, parsed on the server, validated, and loaded into the editor. A ready-made `template.xlsx` can be downloaded from the UI. Supports every text-based question type. **Implemented.** Hotspot questions cannot come from Excel because a spreadsheet cannot carry the image. A `hotspot` row imports as a hotspot question with no image and fails validation until an image is added in the builder.
  - **Project JSON** import/export of the whole quiz. **Implemented.**
  - CSV item import. **Not yet built** (a question CSV and an answer key are produced on export).
- **New Quiz** clears the editor to a blank quiz, with a confirmation when the current quiz has questions. **Implemented.**
- A built-in **Help & User Guide** page, linked from the top bar and the sidebar. **Implemented.**

### 4.2 Supported Question/Response Types

All 11 authoring presets are **implemented**. They map onto 9 underlying question kinds:

| # | Authoring type | Kind | Behavior |
|---|---|---|---|
| 1 | Single select (radio) | `single_select` | One correct answer |
| 2 | Single select (pills) | `single_select` | Pill-shaped toggles with radio behavior |
| 3 | Multiple select (checkbox) | `multiple_select` | One or more correct answers |
| 4 | Multiple select (pills) | `multiple_select` | Pill-shaped toggles with checkbox behavior |
| 5 | True / False | `true_false` | Two-choice statement |
| 6 | Single checkbox | `single_checkbox` | An acknowledgement ("I confirm...") |
| 7 | Matching | `matching` | Match each prompt to an option |
| 8 | Sequence / ordering | `sequence` | Put items in the correct order |
| 9 | Numeric | `numeric` | Number checked against an exact value with tolerance, or a min/max range |
| 10 | Short answer | `short_answer` | Text matched against accepted answers, with optional case sensitivity |
| 11 | **Hotspot (click the image)** | `hotspot` | Click one or more regions on an image |

Scenario/branching items remain a stretch goal.<cite>turn1search12</cite>

For choice-style types, the UI lets the author:
- Add and remove answer options.
- Mark one or more options as correct.
- Assign a **point value per answer option**, so partial-credit and weighted-distractor designs are possible.
- Choose a scoring strategy for multiple-select: all-or-nothing, partial credit, or weighted (per-answer scores).
- Shuffle answer options, using a quiz-level setting that can be switched off per question.<cite>turn1search13</cite>

#### 4.2.1 Hotspot questions

The learner clicks regions on an image, such as a diagram, photo or screenshot.

**Authoring:**
1. Add a Hotspot question and upload an image (PNG, JPEG, GIF, WebP or SVG).
2. Enter alt text describing the image. A missing alt text is a validation warning.
3. Drag on the image to draw each clickable region. **Regions are rectangles only**; circles and polygons are not supported.
4. For each region, mark it correct or not, give it a label, and optionally a per-region score.
5. Choose whether the learner may select **one region** or **more than one**. With more than one, the multiple-select scoring strategies apply.

**Rules:**
- A hotspot is modeled as a choice question: each region is an ordinary answer option with a `rect`. Single-pick hotspots follow single-select scoring rules and multi-pick hotspots follow multiple-select rules, so scoring, validation and SCORM reporting reuse the existing choice logic.
- Region coordinates are stored as **fractions of the image (0 to 1)**, so regions stay aligned when the image scales down on smaller screens.
- The image is **embedded in the package as a `data:` URI** so the package stays self-contained and works where the LMS blocks external requests. External image URLs are a validation error.
- **Image size limit: 5MB per image, measured in raw (decoded) bytes.** The uploader rejects larger files, and the validator warns if an imported project exceeds it. This limit is a product choice, not a SCORM rule: SCORM 2004 caps runtime data such as `cmi.suspend_data`, not package assets. The practical limits are the target LMS's upload cap and first-load time, because the whole assessment, images included, downloads before the first question appears. The limit is per image; the total across a quiz is not yet checked.
- The author's region **label is never shown to the learner** and is not used as the region's accessible name, because it would name the answer. It appears in the authoring UI and the answer key.

**Validation errors:** no image; image not an embedded `data:image/...` URI; no regions; no correct region (unless scores are set); a region with zero size or extending past the image.
**Validation warnings:** image over 5MB; no alt text; several regions marked correct on a single-pick question.

### 4.3 Scoring & Test Configuration
- **Per-answer score values**: point weight assignable at the option level, with an optional negative-score allowance and incorrect-selection penalty. **Implemented.**
- **Overall passing score** as a percentage (e.g. 80%). **Implemented.** Passing on a raw point threshold (e.g. 24/30) is validated against the maximum possible score but not yet used to decide pass/fail. **Partial.**<cite>turn1search12</cite><cite>turn1search16</cite>
- **Section/topic subscoring** in the LMS results. **Not yet built** (sections are stored per question).<cite>turn1search11</cite>
- **Attempt limits** (`maxAttempts`, 0 = unlimited) and score retention (highest / latest / first). **Partial:** the attempt limit controls when correct answers are revealed; learner messaging about attempts remaining is not built.
- **Time limit** (`timeLimitSec`). **Partial:** stored and carried in resume state, but no countdown or auto-submit yet.<cite>turn1search11</cite>
- **Question and answer randomization**, deterministic from a quiz seed so a learner's order survives suspend/resume. **Implemented.**
- **Navigation**: allow going back, and optionally require an answer before moving on. **Implemented.**
- **Results screen options**: show score, pass/fail, number correct, correct answers, missed questions only, and delay correct answers until the final attempt. **Implemented.**
- **Rationale display**: the question's feedback and rationale appear in the results answer review. **Implemented.**

### 4.4 Feedback Behavior
- End-of-test feedback on the results screen: correct, partial or incorrect feedback chosen by the learner's outcome, plus the rationale. **Implemented.**
- Immediate per-question feedback mode. **Not yet built.** (Timing values are defined in `FEEDBACK_TIMING` but not wired up.)
- Rationale distinguishable as "why correct" vs. "why incorrect" in the author view: separate correct and incorrect feedback fields plus a rationale. **Implemented.**

### 4.5 Preview & Validate
- In-app **Preview** runs the quiz with the same player code that ships in the package. **Implemented.**
- A live **Validation panel** lists blocking errors and non-blocking warnings; export is blocked while errors remain. **Implemented.** Checks include: missing title or questions, duplicate ids, missing options or correct answers, missing matching pairs or sequence order, missing numeric key or accepted answers, invalid points, a passing score above the maximum possible, a results-review conflict, and the hotspot checks in 4.2.1.

## 5. Data Model (Quiz Definition Schema)

The built schema (`schemaVersion: 1`) replaces the draft `items` schema from the original brief. Full reference: `docs/data-model.md`. Types and constants live in `packages/engine/src/types.js`. Questions are a discriminated union on `kind`.

```jsonc
{
  "schemaVersion": 1,
  "id": "assessment-abc123",
  "title": "string",
  "lmsTitle": "string",
  "description": "string",
  "version": "1.0",
  "author": "string",
  "language": "en-US",
  "status": "draft|ready|published|archived",
  "settings": {
    "passingPercent": 80,
    "maxAttempts": 2,
    "scoreRetention": "highest|latest|first",
    "shuffleQuestions": false,
    "shuffleAnswers": false,
    "seed": 12345,
    "allowBackward": true,
    "requireAnswer": false,
    "timeLimitSec": null,
    "passMessage": "string",
    "failMessage": "string",
    "results": {
      "showScore": true, "showPassFail": true, "showCorrectCount": true,
      "showCorrectAnswers": true, "delayUntilFinalAttempt": true, "showMissedOnly": false
    }
  },
  "questions": [
    {
      "id": "q-abc123",
      "kind": "single_select|multiple_select|true_false|single_checkbox|matching|sequence|numeric|short_answer|hotspot",
      "prompt": "string",
      "points": 1,
      "objective": "string",
      "section": "string",
      "presentation": "radio|checkbox|single_pill|multi_pill",
      "scoringStrategy": "all_or_nothing|partial|weighted",
      "shuffleOptions": true,
      "options": [
        { "id": "a", "label": "string", "correct": true, "score": 1 }
      ],
      "correctFeedback": "string",
      "incorrectFeedback": "string",
      "rationale": "string",
      "status": "draft|sme_review|approved|retired"
    },
    {
      "id": "q-hs1",
      "kind": "hotspot",
      "prompt": "Click the router in the diagram.",
      "points": 2,
      "multiple": false,
      "scoringStrategy": "all_or_nothing",
      "image": { "src": "data:image/png;base64,...", "alt": "Network topology diagram", "width": 400, "height": 260 },
      "options": [
        { "id": "hs-router", "label": "Router", "correct": true,
          "rect": { "x": 0.075, "y": 0.154, "w": 0.275, "h": 0.269 } }
      ]
    }
  ]
}
```

Kind-specific fields: `matching` uses `pairs[] = {prompt, match}`; `sequence` uses `items[] = {id, label}` and `correctOrder[]`; `numeric` uses `exact` + `tolerance` or `min` + `max`, plus `units` and `precision`; `short_answer` uses `accepted[]` and `caseSensitive`; `hotspot` uses `image`, `multiple`, and `options[].rect`.

## 6. SCORM 2004 (4th Edition) Packaging Requirements

All items in this section are **implemented**.

- Generate a valid `imsmanifest.xml` per the SCORM 2004 4th Edition Content Aggregation Model (CAM), including required namespaces, `<organizations>`/`<organization>`, `<resources>`/`<resource>` with the correct `href` to the launch page, metadata, and a mastery score derived from the passing percentage. The manifest lists every packaged file and sits at the ZIP root.
- Package communicates with the LMS via the SCORM 2004 Run-Time Environment (RTE) API (`API_1484_11`), calling:
  - `Initialize("")` on load
  - `SetValue("cmi.completion_status", ...)` (incomplete while in progress, completed on submit)
  - `SetValue("cmi.success_status", "passed"|"failed")`
  - `SetValue("cmi.score.raw", ...)`, `cmi.score.min`, `cmi.score.max`, `cmi.score.scaled`
  - `SetValue("cmi.interactions.n.*")` — one record per question with id, type, learner response, correct response pattern, result, weighting, latency (ISO 8601) and description
  - `SetValue("cmi.suspend_data", ...)` and `cmi.location` to persist attempt state, with a warning past 64,000 characters
  - `cmi.session_time` and `cmi.exit`
  - `Commit("")` after updates and `Terminate("")` on submit
- Interaction types map to the IEEE 1484.11.1 vocabulary: `choice`, `true-false`, `matching`, `sequencing`, `numeric`, `fill-in`. **Hotspot questions report as `choice`** using the region ids. SCORM 2004 has no hotspot interaction type, and the learner is choosing among identified regions.
- Since WDL's own quiz engine doesn't reliably support CMI reporting, the package owns all scoring/reporting logic client-side and pushes final results via the RTE calls above.<cite>turn1search2</cite><cite>turn1search21</cite>
- The manifest declares SCORM 2004 4th Edition explicitly (not 3rd Edition or SCORM 1.2), since that's the version WDL expects.<cite>turn1search2</cite>
- If `API_1484_11` cannot be found in the parent window chain, the quiz runs in a clearly labelled **standalone preview mode** and records nothing.

## 7. Export/Build Pipeline

1. The author edits the quiz in the authoring UI; the working copy auto-saves to browser storage and can be exported as project JSON.
2. **Export SCORM** validates in the browser, then POSTs the quiz to the API server, which:
   - Re-validates and refuses to build while there are errors.
   - Copies the shared runtime (`player.js`, `adapter.js`, `interactions.js`, `state.js`) and engine (`scoring.js`, `types.js`) into the package.
   - Embeds the quiz as a static `runtime/assessment.data.js`. **Hotspot images travel inside this file as `data:` URIs**, so no separate asset folder is needed.
   - Renders `index.html` from a template and adds `assets/player.css`.
   - Generates `imsmanifest.xml` listing every file.
   - Zips everything into a single SCORM-compliant `.zip`.
3. The CLI (`npm run build:scorm`) produces the same ZIP plus an answer key (`.txt`) and a question list (`.csv`).
4. Every export is appended to an audit log on the server.
5. Optional, manual: run the ADL SCORM 2004 4th Edition Test Suite on the ZIP (see `docs/lms-compatibility-checklist.md`).

## 8. Non-Functional Requirements

- **Accessibility**: all interactive controls must be keyboard-navigable and screen-reader labeled, with visible focus and no color-only meaning. **Implemented** for all types. For hotspots: regions are native `<button>` elements in the tab order with `aria-pressed`, a visible focus ring, and selection marked by fill, border and a check mark. Each region's accessible name is the neutral "Region N of M" so it never names the answer. Hotspot questions are **inherently visual**: a screen-reader user cannot tell regions apart, so authors should pair them with an accessible alternative where accessibility is required. Keyboard activation of hotspot regions has not been confirmed by an automated test yet.
- **Responsive runtime**: renders correctly at common LMS iframe widths. **Implemented**; hotspot regions stay aligned as the image scales.
- **Offline-safe runtime**: no external CDN or network dependencies in the exported package; all JS, CSS and images are bundled. **Implemented.** `docs/security.md` recommends a Content Security Policy allowing images only from `'self'` and `data:`; the packaged `index.html` does not set one yet. **Partial.**
- **Data portability**: quiz JSON export/import so item banks can be version-controlled or shared across designers. **Implemented.**
- **Zero install beyond Node.js**: `npm install` then `npm run server` / `npm run dev`; no build step for app code.

## 9. Scope: Delivered vs. Remaining

**Delivered (v1.1):**
- 9 question kinds (11 authoring presets), including matching, sequence, numeric, short answer and hotspot
- Per-option scoring with all-or-nothing, partial and weighted strategies; percent passing score; randomization; results display options; rationale in the answer review
- Excel import with a downloadable template; project JSON import/export; New Quiz
- SCORM 2004 4th Ed export with full `cmi.interactions` reporting, suspend/resume, and a standalone fallback
- Validation panel; in-app preview sharing the shipped player; built-in help guide
- 45 automated tests plus a headless full-attempt simulation against a mock LMS

**Remaining (Phase 2):**
- Reusable item bank across quizzes; CSV item import
- Per-section/topic subscore reporting
- Time-limit countdown and auto-submit; attempt-remaining messaging; raw-points passing threshold
- Immediate per-question feedback mode; showing per-option feedback to learners
- Scenario/branching item types
- Hotspot: circle and polygon regions; a warning for total embedded image size; a configurable image limit
- A Content Security Policy in the packaged `index.html`
- Production stack migration (React UI, Express/Fastify API, database storage) and authentication
- Item analytics (difficulty/discrimination) once real attempt data exists

## 10. Open Questions

**Resolved:**
- *Show correct answers on every attempt, or only after the final attempt/on passing?* Configurable per quiz (`showCorrectAnswers` + `delayUntilFinalAttempt`).
- *Partial-credit behavior for multi-select items?* Author's choice per question: all-or-nothing, partial credit (with an optional incorrect-selection penalty), or weighted per-answer scores.
- *Desktop app (Electron) or locally hosted web app?* Locally hosted web app: a Node API on port 4000 and a static authoring UI.
- *Hotspot image storage?* Embedded as `data:` URIs to keep packages self-contained.
- *Hotspot region shapes?* Rectangles only for now.
- *Hotspot image size?* 5MB per image in raw bytes (a product choice, not a SCORM rule).

**Still open:**
- Any requirement to log attempt-level data outside of what the LMS captures (e.g. to a JCI-internal reporting store)?
- What upload size limit does the target Workday Learning tenant enforce? This decides whether 5MB per image and the resulting package sizes are acceptable.
- Should hotspot questions be allowed in assessments that must meet WCAG requirements, or require a text-based alternative?

## 11. Revision History

| Version | Date | Changes |
|---|---|---|
| 1.0 | — | Original project brief. |
| 1.1 | 2026-09-11 | Updated to match the reference implementation: zero-dependency npm-workspace stack (replacing the pnpm/Turborepo/React/TypeScript build); question types expanded from 4 to 9 kinds (11 authoring presets); new **Hotspot** question type with rectangle regions, embedded images and a 5MB-per-image limit measured in raw bytes; Excel import, New Quiz and built-in help guide; data model replaced with the built `schemaVersion 1` schema; status markers added to every requirement; open questions resolved or added. |
