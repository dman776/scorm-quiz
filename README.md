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
| Deterministic scoring engine (9 types + strategies) | `npm test` | pass |
| SCORM interaction formatting / manifest / adapter | `npm test` | pass |
| Excel import (parse template into a valid quiz) | `npm test` | 8 xlsx tests pass |
| Build a real SCORM 2004 4th Ed. ZIP | `npm run build:scorm` | dist/*.zip |
| Headless full attempt through a mock LMS | `npm run e2e:sim` | 100% + 9 interactions |
| Generate the Excel template | `npm run template` | examples/template.xlsx |
| REST API (create/validate/export/import/import-xlsx) | `npm run server` | :4000 |
| Zero-build authoring UI (New Quiz + Import Excel) | `npm run dev` | runs |
| JS strict typecheck | `npm run typecheck` | clean |

Total automated tests: **44 passing** (node built-in runner, no install needed).

## Quick start

```bash
npm test                 # 38/38
npm run template         # (re)generate examples/template.xlsx
npm run build:scorm      # dist/<id>_SCORM2004_4thEd.zip  (upload to LMS)
npm run e2e:sim          # full attempt scored + reported through a mock LMS

npm run server           # terminal 1: API on http://localhost:4000
npm run dev              # terminal 2: static server on http://localhost:5173
#   open /apps/web/index.html   -> authoring UI (New Quiz, Import Excel, Export)
#   open /preview.html          -> learner preview + SCORM debug panel
```

Only runtime deps are `jszip` (packaging + xlsx parsing) and `nanoid` (ids),
already vendored under `node_modules`.

## New in this version

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
  server/          REST API (import-xlsx endpoint included)
  web/             zero-build authoring UI (New Quiz + Import Excel)
tools/             build-scorm, e2e-sim, dev-server, make-template.py
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
