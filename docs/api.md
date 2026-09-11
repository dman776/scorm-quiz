# REST API

Base URL: `http://localhost:4000` (set `PORT` to change). JSON bodies unless noted.

| Method | Path | Purpose | Body | Response |
| --- | --- | --- | --- | --- |
| GET | `/api/assessments` | List assessments | - | `{ assessments: [...] }` |
| POST | `/api/assessments` | Create | partial assessment | `201` assessment |
| GET | `/api/assessments/:id` | Fetch | - | assessment |
| PUT | `/api/assessments/:id` | Update/upsert | assessment fields | updated assessment |
| DELETE | `/api/assessments/:id` | Delete | - | `{ deleted }` |
| POST | `/api/assessments/:id/validate` | Validate | assessment (or stored) | `{ errors, warnings }` |
| POST | `/api/assessments/:id/export` | Build SCORM ZIP | assessment (or stored) | `application/zip` or `422` |
| GET | `/api/assessments/:id/answer-key` | Answer key (text) | - | `text/plain` |
| GET | `/api/assessments/:id/questions.csv` | Question report | - | `text/csv` |
| POST | `/api/import` | Import project JSON | project file | `201` created |
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
- Successful exports append to `apps/server/data/_export-audit.log`.
