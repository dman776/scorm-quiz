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
| cmi.interactions.n.* | one record per reportable question |

## Interaction formats (IEEE 1484.11.1)
choice -> ids joined by `[,]`; true-false -> true/false; matching ->
`src[.]tgt[,]...`; sequencing -> ordered ids by `[,]`; numeric -> `min[:]max`
range; fill-in -> text. Ids sanitized to `[A-Za-z0-9_.-]`, latency ISO 8601.
Hotspot questions report as `choice` using their region ids: SCORM 2004 has no
hotspot interaction type, and the learner is choosing among identified regions.

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
