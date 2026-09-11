# Known limitations and future enhancements

## Fully implemented and verified
- Deterministic scoring for all 8 types + 3 strategies (unit tested).
- SCORM 2004 4th Edition interactions, CMI mapping, manifest, root-level ZIP.
- Self-contained offline SCO with shared rendering, adapter, suspend/resume.
- Excel import (Settings + Questions sheets, all 8 types) with round-trip tests.
- REST API (create/validate/export/import/import-xlsx) + zero-build UI with
  New Quiz and Import Excel.
- Headless full-attempt simulation writing score + status + interactions.

## Deviations from an idealized production build
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
