# SCORM 2004 4th Edition: runtime, CMI mappings, packaging

## Why 2004 4th Edition
Separates completion from success, supports scaled score, objectives,
cmi.interactions, and a large suspend_data area for resume. It is the format your
LMS guidance names for CMI interaction reporting.

## Runtime adapter (adapter.js)
Discovers `API_1484_11` by walking `window.parent` (max 20), then `opener`, then
`top`, with cross-origin reads wrapped so a security exception never throws. No
API found -> labelled standalone preview mode. Every call is defensive: a failed
SetValue is logged but never aborts submission (proven by a fault-injection test).

## CMI mapping on submit
| Element | Value |
| --- | --- |
| cmi.completion_status | incomplete at launch, completed on submit |
| cmi.success_status | passed if percent >= passing, else failed |
| cmi.score.raw/min/max/scaled | from the scoring engine |
| cmi.progress_measure | 1 on completion |
| cmi.session_time | ISO 8601 duration |
| cmi.location / suspend_data | current index / compact JSON state |
| cmi.interactions.n.* | one record per question (see below) |

## Interactions
Each question gets one `cmi.interactions.n` record: `id` (question id), `type`,
`objectives.0.id` (the question's objective, if set), `timestamp`, `weighting`
(max points), `correct_responses.0.pattern`, `learner_response`, `result`,
`latency` and `description` (the question text, up to 250 chars).

**When they are written.** A question is reported when the learner moves past it
(Next, Previous, or Review & submit) if it has an answer, with `result` computed then, so the LMS
holds every answer given even if the attempt is never submitted. On submit every
question is rewritten with its final result; unanswered questions report
`incorrect` with no `learner_response`. Indexes are assigned in first-reported
order, continuing after any `_count` already on the LMS, so they are always
contiguous. The question-to-index map is kept in `suspend_data` (`ix`), so a
resumed session updates the same records.

**Formats (IEEE 1484.11.1).** Responses use identifiers derived from the answer
TEXT so LMS reports are readable: runs of characters outside `[A-Za-z0-9_.-]`
become `_`, capped at 64 chars, with `_2`, `_3` suffixes for duplicate labels
(blank labels fall back to the option id). choice -> identifiers joined by `[,]`;
true-false -> `true`/`false`; matching -> `source[.]target[,]...`; sequencing ->
ordered identifiers by `[,]`; numeric -> learner value, correct `min[:]max`;
fill-in -> text. `result` is `correct`/`incorrect` (partial credit reports
`incorrect`; the score reflects the partial points). A question the learner
skips is not reported until submit. Latency is ISO 8601. Hotspot questions report
as `choice` using their region labels: SCORM 2004 has no hotspot interaction type.
Drag-and-drop questions report as `matching` (`item[.]zone[,]...`, the format
Articulate Storyline also uses): the learner response lists the items placed and
where, including any distractor placed; the correct pattern lists each
non-distractor item with its FIRST accepted zone (the LMS gets one pattern; the
result is judged by the engine, which accepts any listed zone).

The mock LMS validates interaction writes like a strict LMS (contiguous indexes,
`id` then `type` before responses, vocabularies, pattern syntax) and records
rejections in `lms.errors`; the authoring Preview shows them.

## Packaging
ZIP with `imsmanifest.xml` at the ROOT (no wrapper folder): index.html, runtime
engine modules, assessment.data.js (embedded ES module so it runs offline/file://),
assets/player.css, LICENSES.txt. Manifest declares ADL SCORM 2004 4th Edition, one
organization/item, a webcontent SCO resource, lists every file, and emits an imsss
primary objective mastery measure from the passing percentage. No answer-key
document is shipped in the learner package.

## Deviations / verify in your LMS
Client-side scoring (correct answers exist in the package); attempt semantics and
retention; interaction reporting depth; suspend_data limits. Run the ADL 4th
Edition test suite and your LMS upload test. We do not claim certified conformance.
