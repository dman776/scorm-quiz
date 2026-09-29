# REST API

Base URL: `http://localhost:4000` (set `PORT` to change). JSON bodies unless noted.
The same server serves the authoring UI (`/` redirects to `/apps/web/index.html`)
and the shared packages it imports; nothing else in the repo is served. Saved
assessments are JSON files in `data/quizzes/`, one per quiz (set `SQB_DATA_DIR`
to move the `data/` root). Library routes address a quiz by its FILE name without
`.json` (`:file`), not by the quiz id inside it, so files added to the folder by
hand appear and open too. Creating never overwrites an existing file. The list
includes files that cannot be parsed, with an `error`, so nothing is hidden.

| Method | Path | Purpose | Body | Response |
| --- | --- | --- | --- | --- |
| GET | `/api/version` | App version (root package.json) | - | `{ version }` |
| GET | `/api/assessments` | List every library file, newest first | - | `{ assessments: [{ file, title, ... } or { file, error }] }` |
| POST | `/api/assessments` | Save as a NEW file named after the title (`-2`, `-3`... if taken) | assessment | `201 { file, assessment }` |
| GET | `/api/assessments/:file` | Fetch a library file | - | assessment |
| PUT | `/api/assessments/:file` | Overwrite that file (quiz id kept as sent) | assessment | `{ file, assessment }` |
| DELETE | `/api/assessments/:file` | Delete that file | - | `{ deleted }` |
| POST | `/api/assessments/:id/validate` | Validate | assessment (else the stored one) | `{ errors, warnings }` |
| POST | `/api/assessments/:id/export` | Build SCORM ZIP | assessment (else the stored one) | `application/zip` or `422` |
| GET | `/api/assessments/:id/answer-key` | Answer key (text) | - | `text/plain` |
| GET | `/api/assessments/:id/questions.csv` | Question report | - | `text/csv` |
| POST | `/api/import` | Import project JSON as a new file | project file | `201 { file, assessment }` |
| POST | `/api/import-xlsx` | Import an Excel quiz | raw .xlsx bytes | `{ assessment, validation }` |

## POST /api/import-xlsx

Accepts the raw bytes of an `.xlsx` file (Content-Type `application/octet-stream`
or `multipart` not required; the body is the file). Parses the workbook using the
shared `xlsx-import` module and returns:

```json
{
  "assessment": { "schemaVersion": 1, "title": "...", "questions": [ ... ] },
  "validation": { "errors": [], "warnings": [ ... ] }
}
```

On a parse failure it returns `400` with `{ error, code }`. The authoring UI
loads `assessment` directly into the editor. See `docs/excel-import.md` for the
workbook format.

## Errors

- `400` invalid JSON / body too large (8 MB cap) / unparseable xlsx
- `404` unknown route or assessment
- `422` assessment failed validation on export

## Notes

- Bodies capped at 8 MB (raised from 5 MB to accommodate xlsx uploads).
- No `eval`; JSON parsed in try/catch; storage ids sanitized (no path traversal).
- Successful exports append to `data/_export-audit.log`.
