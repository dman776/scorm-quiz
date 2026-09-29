# Known limitations and future enhancements

## Fully implemented and verified
- Deterministic scoring for all 10 types + 3 strategies (unit tested).
- SCORM 2004 4th Edition interactions, CMI mapping, manifest, root-level ZIP.
- Self-contained offline SCO with shared rendering, adapter, suspend/resume.
- Excel import (Settings + Questions sheets, the text-only types incl. drag-and-drop boxes) with round-trip tests.
- REST API (create/validate/export/import/import-xlsx) + zero-build UI with
  New Quiz and Import Excel.
- Headless full-attempt simulation writing score + status + interactions.

## Deviations from an idealized production build
- Hotspot regions are axis-aligned rectangles only; circles and polygons are not
  supported, so irregular targets must be approximated by a box.
- Hotspot images are embedded as data URIs to keep the package self-contained,
  which inflates the ZIP; validation warns above 5MB (raw) per image.
- Hotspot questions cannot be authored from Excel (a sheet cannot carry the
  image); importing one yields a question that fails validation until an image is
  added in the builder.
- Hotspot questions are inherently visual. Regions are keyboard reachable and get
  a neutral "Region N of M" accessible name, but a non-sighted learner cannot tell
  which region is which; pair such a question with an accessible alternative.
- Drag-and-drop zones are rectangles (boxes or image regions); items are text
  only, and each item can be placed once (no reusable "token" items). LMSs get one
  correct pattern per question, listing each item's first accepted zone.
- Drag-and-drop on a background image reads zone labels to screen readers, but
  the picture itself still needs good alt text for non-sighted learners.
- UI/API ship as zero-build ESM + Node http for offline runnability; documented
  target is React + Vite and Express + Prisma (seams in architecture.md).
- Persistence is JSON files, not SQLite/Prisma (store is a drop-in seam).
- Client-side scoring (correct answers in the package), standard for SCORM.
- The xlsx parser is a lightweight JSZip+regex reader tuned for the template and
  openpyxl output; for arbitrary/complex workbooks, swap in SheetJS/ExcelJS behind
  the same readXlsx interface. sheetsToAssessment is unchanged either way.

## Future enhancements
- Multi-SCO packages + full sequencing; question bank/pools UI; media upload with
  alt-text enforcement; theming panel; undo/redo; RBAC; xAPI export; CI Playwright.
