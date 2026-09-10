# SCORM Quiz Builder

A web application for instructional designers to author graded tests, quizzes, challenge
exams, and test-out assessments through a visual UI, and export them as self-contained
SCORM 2004 4th Edition packages that run in any conformant LMS.

**This is a Phase 1 build.** It implements a complete, working, end-to-end path — author a
question, preview it, export a real SCORM package, run it against a mock LMS — for three
question types (single-select, true/false, multiple-select) with a representative subset of
the full settings surface described in the original spec. See [ROADMAP.md](./ROADMAP.md) for
exactly what is and isn't implemented yet, and in what order the rest should be built.

## Repository structure

```
scorm-quiz/
  packages/
    schemas/            Zod schemas + TS types shared by every app (Assessment, Question
                         discriminated union, settings, validation rules)
    scoring-engine/      Pure, framework-free scoring for every supported question type
    assessment-engine/  Shared session logic (navigation/resume/attempts) + accessible React
                         question/review/results components — used by BOTH the authoring
                         Learner Preview and the exported SCORM runtime, so there is exactly
                         one rendering and scoring implementation
    scorm-runtime/       API_1484_11 locator + session wrapper + interaction formatting +
                         an in-memory mock LMS for tests and the SCORM Debug Preview
    scorm-export/        SCORM 2004 4th Edition imsmanifest.xml generator + safe ZIP packaging
  apps/
    web/                 The authoring app (React + Vite): dashboard, assessment editor,
                         Learner Preview, SCORM Debug Preview
    api/                 Express API: assessment CRUD (JSON-file backed), validation, export,
                         project import
    runtime/              The learner-facing app that gets built and zipped into every SCORM
                         export
  seed/
    demo-assessment.json A demonstration assessment (mixed question types, partial credit,
                         2 attempts, shuffling, deferred answer reveal)
  tests/e2e/              Playwright end-to-end tests against the real API + web servers
```

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io) (via `corepack enable && corepack prepare pnpm@latest --activate`,
  or your own install)

## Setup

```bash
pnpm install
cp .env.example .env   # values are already sensible defaults for local dev
```

## Build

```bash
pnpm build
```

This builds every package and app in dependency order (via Turborepo), including
`apps/runtime` — **the API's export endpoint reads the pre-built runtime from
`apps/runtime/dist`, so you must run a build at least once before exporting a package.**

## Run it locally

In two terminals (or let `pnpm --filter @scorm-quiz/api dev` and
`pnpm --filter @scorm-quiz/web dev` run side by side):

```bash
pnpm --filter @scorm-quiz/api dev    # http://localhost:4000
pnpm --filter @scorm-quiz/web dev    # http://localhost:5173
```

Optionally seed the demo assessment first:

```bash
pnpm --filter @scorm-quiz/api seed
```

Then open http://localhost:5173 — you'll see the dashboard, with the seeded demo assessment
(if you ran `seed`) or an empty state with a **New Assessment** button.

## Test

```bash
pnpm test           # every unit/component test across all packages/apps (fast, no servers)
pnpm test:e2e        # Playwright end-to-end tests (spins up real API + web dev servers)
```

Before running `pnpm test:e2e`, make sure you've run `pnpm build` at least once (the export
e2e spec needs the built `apps/runtime/dist`), and install Playwright's browser once:

```bash
pnpm --filter tests-e2e exec playwright install --with-deps chromium
```

## Export a SCORM package

Through the UI: open an assessment in the editor and click **Export SCORM ZIP** (this runs
validation first and blocks export on any blocking error).

Directly against the API:

```bash
curl -X POST http://localhost:4000/api/assessments/<id>/export -o my-assessment.zip
```

The resulting ZIP has `imsmanifest.xml` at its root, works fully offline, and communicates
with the LMS through `API_1484_11` when launched inside one — or shows a clearly labeled
"Standalone Preview Mode" banner and skips all LMS calls when launched outside one.

## SCORM Debug Preview

Every assessment has a **SCORM Debug Preview** page in the authoring app. It runs the exact
same learner runtime code against an in-memory mock LMS and shows every `Initialize` /
`GetValue` / `SetValue` / `Commit` / `Terminate` call live, plus the final CMI data model
snapshot. Use it to sanity-check completion/success status, score, and interaction reporting
before testing in a real LMS.

## LMS compatibility

This build has **not** been tested against a real, third-party LMS. It implements the SCORM
2004 4th Edition RTE data model calls described in the spec and passes its own mock-LMS
integration coverage, but only testing inside your actual target LMS(s) can confirm real
compatibility — see the checklist in [ROADMAP.md](./ROADMAP.md).

## Known limitations

See [ROADMAP.md](./ROADMAP.md) for the full list of what's deferred (remaining question
types, question banks/pools, theming, DB persistence, the full settings surface, and the
full test matrix from the original spec) and the suggested build order for the next phase.
