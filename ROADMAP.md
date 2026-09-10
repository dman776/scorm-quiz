# Roadmap

This file is the honest ledger of what the original spec asked for versus what this Phase 1
build actually implements, plus a suggested build order for closing the gap. Nothing below is
silently skipped — every deferred item was a deliberate scope cut to ship a real, working,
end-to-end system in Phase 1 rather than a large amount of half-finished code across every
feature.

## What Phase 1 actually delivers

- Full monorepo architecture (pnpm workspaces + Turborepo, strict TypeScript) with the
  intended separation of concerns: schemas, scoring engine, SCORM runtime adapter, SCORM
  export/manifest service, shared assessment rendering/session engine, API, authoring app,
  and the packaged learner runtime.
- Three question types, fully implemented end-to-end (author → validate → preview → score →
  SCORM-report → export): **single-select**, **true/false**, **multiple-select** (with
  all-or-nothing, partial-credit-with-penalty, and weighted scoring strategies).
- A real SCORM 2004 4th Edition export: valid `imsmanifest.xml` at the ZIP root, offline-
  capable relative asset paths, zip-slip-safe packaging, XML-escaped author content.
- A SCORM runtime adapter that locates `API_1484_11` safely (cross-origin/cycle/depth-
  guarded), never fakes a successful LMS session, and reports completion status, success
  status, raw/min/max/scaled score, progress measure, session resume via suspend_data, and
  per-question `cmi.interactions.*` records.
- Resume-after-exit: question/answer order is generated once per attempt and persisted, never
  regenerated on resume.
- Attempt rules: max attempts, passing-ends-access, allow-additional-attempts-after-passing,
  score retention (highest/latest/first), reset-vs-retain answers between attempts.
- A representative subset of assessment settings (scoring, attempts, navigation,
  randomization, results, and an "Advanced SCORM Settings" tab) — not the full ~60-field
  surface from the spec, but the data model (`packages/schemas`) already has room for the
  rest.
- Accessible authoring and learner UI: native radio/checkbox controls with proper
  `fieldset`/`legend`/`radiogroup` semantics, visible focus states, keyboard-operable
  navigation, reduced-motion support, an accessible review/results flow.
- A SCORM Debug Preview showing every live RTE call against a mock LMS, and a Learner Preview
  sharing the exact same rendering/scoring code as the exported package.
- Automated tests: 60+ unit/component tests across every package (scoring strategies,
  attempt/retention logic, SCORM status/interaction mapping, manifest XML generation and
  escaping, ZIP structure and zip-slip rejection, API integration tests, an accessible-
  component RTL test, a form-validation RTL test) plus two Playwright end-to-end specs
  (author→preview→pass, and export→unzip→manifest validation) — all passing against real
  code, no mocked assertions.

## Deferred: question types (7 of 10)

Not implemented: **single-select pills, multi-select pills, single checkbox (as its own
distinct type), matching, sequencing/ordering, numeric response, short answer.**

The schema (`packages/schemas/src/question.ts`) already reserves discriminant literals and
minimal stub schemas for all of these (`SUPPORTED_QUESTION_TYPES` names exactly which three
are usable) so adding one doesn't require a data-model migration — it requires:

1. A `score<Type>` function in `packages/scoring-engine` + unit tests.
2. A `<Type>View` component in `packages/assessment-engine/src/components` (accessible —
   matching and sequencing in particular need a fully keyboard-operable non-drag-and-drop
   alternative, not just an ARIA label bolted onto a drag interaction).
3. A `buildInteraction` case in `packages/scorm-runtime` for the correct SCORM interaction
   type (`matching`, `sequencing`, `numeric`, `fill-in`).
4. An editor form in `apps/web/src/components/editor`.
5. Add the literal to `SUPPORTED_QUESTION_TYPES` and the `QuestionRenderer`/`scoreQuestion`
   switch statements.

Suggested order: **numeric** and **short answer** first (simplest scoring, no reordering
UI), then **matching**, then **sequencing** (both need the keyboard-alternative reordering
work), then the pill/checkbox presentation variants (mostly styling — the underlying
selection semantics are shared with single-select/multi-select).

## Deferred: question bank & pools

No question bank UI, no reusable/tagged question library across assessments, no pool draw
rules ("draw 5 of 10", guarantee topic coverage, unequal-form-score warnings), no
duplicate-question detection, no question retirement-without-deletion workflow.

This is a substantial standalone feature — it needs its own storage collection (not just
per-assessment questions), a search/filter UI, and a pool-resolution step in
`assessment-engine`'s order generation. Build after the remaining question types, since pools
of currently-unsupported types wouldn't be useful yet.

## Deferred: full settings surface

Implemented now: passing score %, rounding, unanswered-question treatment, partial credit
toggle, max attempts, score retention, reset/retain answers, passing-locks-access,
navigation mode, backward nav, require-answer, flag-for-review, review screen, progress
indicator, shuffle questions/answers with a seed, show score/pass-fail/correct-answers/
feedback, feedback timing, custom pass/fail/exhausted messages, SCORM mastery score,
interaction reporting toggle.

Not yet implemented: time limits with expiry warning/behavior (the schema has the fields;
there's no countdown timer or auto-submit wiring in `apps/runtime`), section-by-section
navigation mode (schema supports it; the runtime only really implements one-per-page and
would need section-grouped rendering), per-question/per-option shuffle exclusion UI (the data
model and scoring/order-generation logic already honor `excludeFromShuffle` — there's just no
checkbox for it in the editor yet), manual total-points override UI, scaled-score min/max
edge-case UI, "show missed questions only" is implemented in `ResultsScreen` but not exposed
in every results-configuration corner the spec describes.

## Deferred: theming

No logo/color/font/button-style/progress-bar-style authoring UI. The runtime's CSS
(`apps/runtime/src/styles.css`) is a single fixed accessible theme. Adding real theming means:
a `Theme` schema (already listed as a planned type in the original spec, not yet in
`packages/schemas`), a theme editor screen, and templating the runtime's CSS custom
properties from `assessment-config.json` at export time (straightforward, since the runtime
already uses CSS variables for its palette).

## Deferred: persistence layer

The API stores assessments as JSON files on disk (`apps/api/src/store.ts`), not
Prisma/SQLite. This was a deliberate substitution to avoid shipping a half-wired ORM layer —
the API's storage functions (`listAssessments`/`getAssessment`/`saveAssessment`/
`deleteAssessment`) are a small, swappable surface. Migrating to Prisma+SQLite (with a schema
designed to also support Postgres later, per the original spec) means: a `prisma/schema.prisma`
modeling `Assessment` as a JSON column (simplest path, keeps the Zod schema as the single
source of truth) or fully relational tables (more query power, more migration work), plus
`prisma migrate` wiring and replacing `store.ts`'s file I/O with Prisma Client calls. The
route/handler layer (`apps/api/src/routes.ts`) shouldn't need to change.

No authentication — per the original spec's own instruction ("do not include authentication
in the first prototype unless needed for persistence"), and the interfaces (a plain
`store.ts` module) are intentionally easy to wrap with an auth/authorization layer later.

## Deferred: full test matrix

Implemented: unit tests for every scoring strategy, rounding, attempt limits/retention,
resume/suspend-data round-trip, SCORM status/interaction mapping, manifest generation, ZIP
structure and zip-slip rejection, XML escaping, stable IDs (via `crypto.randomUUID()`,
covered indirectly through every schema test); API integration tests (create/list/get/
validate/export-gating/import/delete); two e2e specs (author+preview+pass, export+manifest
validation).

Not implemented: keyboard-only e2e coverage beyond what the two existing specs exercise via
`getByRole`/keyboard-equivalent locators, explicit screen-reader-label e2e assertions, mobile
vs. desktop viewport e2e, browser-refresh-and-resume e2e, LMS-API-unavailable /
`SetValue`-error / `Commit`-error e2e (the mock LMS in `packages/scorm-runtime` already
supports simulating these — e.g. by having it reject `SetValue` after Terminate — but no
Playwright spec drives that scenario yet), retry/attempts-exhausted e2e, reimport-project e2e.
Building these is mostly additive: the fixtures, mock LMS, and page structure already exist.

## LMS compatibility checklist (verify before production use)

This build's SCORM Debug Preview confirms *this application* calls the RTE API correctly and
in the right sequence against a spec-shaped mock. It cannot confirm real-LMS behavior. Before
trusting an export in production, verify in your actual target LMS(s):

- [ ] Package imports and launches without errors from the LMS's own import flow (not just a
      manual ZIP upload)
- [ ] `cmi.completion_status` and `cmi.success_status` are read back correctly by the LMS
      gradebook/transcript after a submitted attempt
- [ ] `cmi.score.raw/min/max/scaled` display correctly in the LMS's reporting
- [ ] `cmi.interactions.*` appear in the LMS's interaction/question-level reports, if it
      supports them (many LMSs ignore or partially support this)
- [ ] Suspend/resume works when the learner closes the browser tab (not just navigates away
      inside the SCO) and relaunches from the LMS
- [ ] Attempt-limit and re-launch behavior matches your LMS's own attempt-counting semantics
      (LMS "attempts" and this package's internal attempt counter are two different things —
      see the Advanced SCORM Settings tab)
- [ ] The package's CSP meta tag (`default-src 'self'`) doesn't conflict with any LMS iframe/
      sandboxing wrapper
- [ ] Mobile learner experience inside the LMS's mobile app/wrapper, if applicable

## Suggested next-session order

1. Numeric + short-answer question types (rounds out simple scoring types).
2. Matching + sequencing (accessible keyboard-alternative reordering is the hard part).
3. Pill/checkbox presentation variants for existing select types.
4. Time limits + section-by-section navigation in `apps/runtime`.
5. Question bank & pools.
6. Prisma/SQLite persistence swap.
7. Theming.
8. Remaining e2e coverage (LMS-error scenarios, resume-after-refresh, mobile/desktop,
   keyboard-only, reimport).
