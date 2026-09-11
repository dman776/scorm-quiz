# Security

## Packaging
- Zip-slip/traversal: safeZipPath rejects entries starting with `/` or containing `..`.
- Safe XML: manifest values pass through xmlEscape; identifiers sanitized.
- No answer-key leakage: learner ZIP never contains the answer-key or CSV.
- No external code/CDNs; LICENSES.txt generated into every export.

## Excel import
- Parsed server-side with JSZip; only known parts are read (workbook, rels,
  sharedStrings, worksheets). XML entities are decoded, not executed.
- The imported model is validated with the shared validator before use.
- Body cap (8 MB) applies to uploads; malformed files return a clear 400.

## Server
- Input validation on writes; JSON parsed in try/catch; NO eval anywhere.
- Storage ids sanitized to [A-Za-z0-9_-] before filesystem access.
- Export actions appended to an audit log.
- Auth seam marked in server.js (prototype omits auth by design).

## CSP (packaged SCO)
`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; connect-src 'self'; base-uri 'none'; object-src 'none'`
