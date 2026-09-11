# Architecture

## Goals
1. One scoring engine and one rendering engine, shared by preview, export, tests.
2. A packaged SCO that is self-contained, offline, and framework-free.
3. Clear seams so the reference (zero-build) UI/API can be replaced by the
   documented production stack (React + Vite / Express + Prisma) without touching
   the SCORM, scoring, validation, packaging, or Excel-import logic.

## Modules
```
packages/engine        scoring.js + types.js   (pure, no I/O, no DOM)
packages/scorm-runtime player.js, adapter.js, interactions.js, state.js, css, html.tmpl
packages/export-service manifest.js, validate.js, package.js (ZIP), xlsx-import.js, answer-key/CSV
packages/mock-lms      API_1484_11 mock (dev/test only)
apps/server            REST API (create/validate/export/import/import-xlsx)
apps/web               zero-build authoring UI (New Quiz, Import Excel)
tools                  build-scorm, e2e-sim, dev-server, make-template.py
```

- **engine** has zero dependencies and is imported everywhere; this is what keeps
  preview and export identical.
- **scorm-runtime** is browser code; the same `player.js` runs in the authoring
  preview and inside the exported SCO.
- **export-service** is Node build code: validate, generate manifest, assemble the
  ZIP with `imsmanifest.xml` at the root, and parse `.xlsx` uploads
  (`xlsx-import.js`) using JSZip.
- **mock-lms** implements `API_1484_11` for the debug preview and tests; excluded
  from learner packages by default.

## Excel import flow
1. Authoring UI reads the chosen `.xlsx` as an ArrayBuffer and POSTs the bytes to
   `POST /api/import-xlsx`.
2. `xlsx-import.js` unzips the workbook (JSZip), parses `sharedStrings.xml` and the
   `Settings` / `Questions` sheets into a grid, then maps rows to the assessment
   model (options/pairs/order/numeric/short-answer encodings).
3. The server validates and returns `{ assessment, validation }`.
4. The UI loads the assessment; Preview and Export then use the shared engines.

Because the importer emits the same assessment model the hand-authoring UI uses,
an imported quiz is indistinguishable from one built by hand and flows through the
identical validation, preview, scoring, and packaging paths.

## Production seams
| Reference (ships here) | Production target | Seam |
| --- | --- | --- |
| `apps/web` zero-build ESM UI | React + Vite | UI calls shared validate.js/player.js; swap view layer |
| `apps/server` Node http | Express/Fastify | route handlers are plain async fns |
| JSON-file store | Prisma + SQLite/PostgreSQL | replace the `store` object (4 methods) |
| Auth omitted | Session/JWT middleware | marked `AUTH MIDDLEWARE SEAM` in server.js |
| xlsx parser (regex/JSZip) | SheetJS/ExcelJS if allowed | swap `readXlsx` internals; `sheetsToAssessment` unchanged |
