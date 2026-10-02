# SCORM Quiz Builder

Author graded tests, quizzes, challenge exams, and test-out assessments through a
visual UI, then export each one as a **self-contained SCORM 2004 4th Edition** ZIP
package that uploads to any conformant LMS. You can build questions by hand, or
**import an entire quiz from Excel** using the provided template.

The exported package launches from the LMS, communicates through the
`API_1484_11` runtime, reports completion separately from success, reports raw /
min / max / scaled scores and per-question interaction data, resumes if the
learner exits, enforces passing-score and attempt rules, is keyboard accessible,
and runs with **no internet connectivity and no external CDNs**.

## What runs right now (verified in this repo)

| Capability | Command | Status |
| --- | --- | --- |
| Deterministic scoring engine (10 types + strategies) | `npm test` | pass |
| SCORM interaction formatting / manifest / adapter | `npm test` | pass |
| Excel import (parse template into a valid quiz) | `npm test` | 8 xlsx tests pass |
| Build a real SCORM 2004 4th Ed. ZIP | `npm run build:scorm` | dist/*.zip |
| Headless full attempt through a mock LMS | `npm run e2e:sim` | 100% + 9 interactions |
| Generate the Excel template | `npm run template` | examples/template.xlsx |
| Authoring UI + REST API on one port | `npm start` | http://localhost:4000 |
| JS strict typecheck | `npm run typecheck` | clean |

Total automated tests: **66 passing** (node built-in runner, no install needed).

## Quick start

```bash
npm start                # authoring UI + API on http://localhost:4000

npm test                 # node:test suites
npm run template         # (re)generate examples/template.xlsx
npm run build:scorm      # dist/<id>_SCORM2004_4thEd.zip  (upload to LMS)
npm run e2e:sim          # full attempt scored + reported through a mock LMS
```

`npm start` serves the authoring UI at `/` and the learner preview at
`/preview.html`. The library is one JSON file per quiz in `data/quizzes/`. Set
`PORT` to change the port, and `SQB_DATA_DIR` to move the data root (quizzes then
live in `$SQB_DATA_DIR/quizzes/`).

Only runtime deps are `jszip` (packaging + xlsx parsing) and `nanoid` (ids),
already vendored under `node_modules`.

## New in 1.6.0

- **Drag and drop: items in more than one zone**: tick "Items can be placed in
  more than one zone" and an item can be dropped in several zones, counting as
  right only when it is in every zone ticked for it. In Excel, write
  `Item=Zone A + Zone B`.

## New in 1.5.0

- **Change a question's type**: the type menu in the question editor converts a
  question to another type, keeping the prompt, points, feedback and as much of
  the answers as the new type can hold (options become sequence items or
  accepted answers, matching pairs become drop zones, a hotspot's image and
  regions become drag-and-drop zones, and so on). If anything would be lost, the
  editor lists it and asks before converting.

## New in 1.4.0

- **Drag to reorder**: learners can drag sequence items into order; authors can
  drag questions to reorder the question list and drag a sequence question's
  items to set its correct order. The up/down arrows remain as the keyboard
  alternative, touch drags use a grip so lists still scroll, and Escape cancels.
- Arrow moves in a sequence question keep focus on the moved item and announce
  its new position to screen readers.
- Fix: the time spent per question sent to the LMS (latency) no longer resets
  when a question re-renders (reordering, hotspot picks, flagging).

## New in 1.3.0

- **Drag and drop question type**: learners place items into labeled boxes or
  zones drawn on a picture. Works with mouse, touch, click/tap-to-place and
  keyboard (WCAG 2.2 dragging alternative), supports distractors, items correct
  in several zones, and zone capacities; reports to the LMS as a `matching`
  interaction; box-style questions import from Excel.
- **Preview this question**: preview just the question you are editing, from the
  question editor.

## New in 1.2.0

- **Per-question LMS reporting**: every question is written to
  `cmi.interactions` with the question text, the learner's answer and the
  correct answer as readable text (not internal option ids), the result,
  weighting, latency and objective. Questions are reported as the learner moves
  past them and finalized on submit, so an unfinished attempt still reports.
- **Library**: every `.json` file in `data/quizzes/` is listed (with its file
  name) and can be opened or deleted. Save updates the open file; a new or
  imported quiz is saved to a new file named after its title, never over another
  quiz; Save as… makes a copy. Unsaved changes are flagged and confirmed.
- **One command**: `npm start` runs the UI and the API together.
- **What the LMS receives**: Preview shows the exact CMI data a real LMS would
  get, and flags anything a strict LMS would reject.
- The app version is shown under the author credit.

## Earlier

- **Import Excel**: author a quiz in `template.xlsx` and import it in one click.
  See `docs/excel-import.md` for the format. The importer parses the workbook
  server-side (JSZip), builds the assessment, validates it, and loads it into the
  editor ready to preview and export.
- **Download template**: the UI links straight to `examples/template.xlsx`.
- **New Quiz** button: clears the editor and starts a blank quiz (with a confirm
  guard so you don't lose unsaved work).

## Monorepo layout

```
packages/
  engine/          scoring engine + shared types (single source of truth)
  scorm-runtime/   player, adapter, interactions, state, HTML shell, CSS
  export-service/  manifest, validator, ZIP packager, xlsx-import, answer-key/CSV
  mock-lms/        SCORM 2004 API mock (dev/test only)
apps/
  server/          serves the authoring UI + REST API (library, import, export)
  web/             zero-build authoring UI (Library, editor, preview)
tools/             build-scorm, e2e-sim, make-template.py
tests/             node:test suites (scoring, scorm, package, xlsx)
examples/          demo-assessment.json, template.xlsx
docs/              architecture, data-model, api, scorm, excel-import, a11y, security, ...
```

## Documentation

- `docs/excel-import.md` - Excel template format and import flow (new)
- `docs/architecture.md` - system design and production seams
- `docs/data-model.md` - schemas (discriminated unions)
- `docs/api.md` - REST endpoints (incl. `POST /api/import-xlsx`)
- `docs/scorm.md` - runtime adapter, CMI mappings, manifest, deviations
- `docs/accessibility.md` - WCAG 2.2 AA plan
- `docs/security.md` - validation, zip-slip/XML/CSP protections, auth seam
- `docs/lms-compatibility-checklist.md` - what to verify in your LMS
- `docs/known-limitations.md` - scope boundaries and future work
