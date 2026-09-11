# LMS compatibility test checklist

Upload/launch: ZIP imports without manifest errors; SCO launches; manifest at root.
Runtime: Initialize/SetValue/Commit/Terminate succeed (use ?debug=1 to observe).
Status/score: completion=completed; success=passed/failed; raw/min/max/scaled in reports;
gradebook matches retention (highest/latest/first).
Interactions: expected count stored; learner_response and result visible; matching/
sequencing/numeric patterns accepted.
Resume: exit mid-attempt, relaunch, confirm question/answers/order restored; suspend_data
within LMS limit.
Attempts: max-attempts enforced; passing-locks behavior; new launch maps to retention.
Accessibility: complete an attempt by keyboard; screen reader announces prompts/results.
Workday Learning: confirm CMI interaction data is captured and pass/fail + score visibility.
