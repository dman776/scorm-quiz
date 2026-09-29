# Excel import

Author a whole quiz in Excel and import it in one click. The importer parses the
`.xlsx` on the server (an xlsx is a ZIP of XML, read with JSZip, so no new
dependency), converts it to the assessment model, validates it, and loads it into
the authoring UI ready to preview and export.

Download the ready-made **template.xlsx** from the UI (Import area -> "Download
template") or generate it with `npm run template`.

## Workbook format

Two sheets are used (a third "Instructions" sheet is informational).

### Settings sheet (key / value)

| Setting | Example | Notes |
| --- | --- | --- |
| Title | ASCEND Sample Quiz | Used for the assessment + LMS title |
| Description | ... | Optional |
| Version | 1.0 | Optional |
| Author | Your Name | Optional |
| Language | en-US | Optional |
| Passing Percent | 80 | Mastery threshold |
| Max Attempts | 2 | 0 or blank = unlimited |
| Score Retention | highest | highest / latest / first |
| Shuffle Questions | no | yes/no |
| Shuffle Answers | no | yes/no |
| Show Correct Answers | yes | yes/no |
| Delay Answers Until Final Attempt | yes | yes/no |
| Pass Message | ... | Optional |
| Fail Message | ... | Optional |

If the Settings sheet is missing, sensible defaults are used (80% pass, 2
attempts, highest retention) and the title defaults to "Imported Quiz".

### Questions sheet (one row per question)

Columns: **ID, Type, Prompt, Points, Objective, Section, Scoring, Options,
Correct, Tolerance, Units, Correct Feedback, Incorrect Feedback, Rationale.**

- **ID** optional (auto-generated from the prompt when blank).
- **Type** accepts the canonical values and common aliases:
  `single_select`, `single_select_pill`, `multiple_select`,
  `multiple_select_pill`, `true_false`, `single_checkbox`, `matching`,
  `sequence`, `numeric`, `short_answer`, `drag_drop` (aliases like `mc`,
  `checkbox`, `tf`, `ordering`, `fill-in`, `drag and drop`, `categorize` also work).
- **Scoring** optional: `all_or_nothing`, `partial`, or `weighted`.

## Options-column encoding (the important part)

Everything about the answers goes in the single **Options** cell, except numeric
and short-answer keys which go in **Correct**.

| Type | Options cell | Correct cell |
| --- | --- | --- |
| single_select / _pill | `*Right choice \| Wrong 1 \| Wrong 2` | - |
| multiple_select / _pill | `*Right 1 \| *Right 2 \| Wrong` | - |
| (per-answer scores) | `*HTTPS[1.5] \| *SSH[1.5] \| HTTP[-1]` | - |
| true_false | (blank) | `True` or `False` |
| single_checkbox | the statement text | `true` (default) or `false` |
| matching | `HTTPS=443 \| SSH=22 \| DNS=53` | - |
| sequence | `Physical > Data Link > Network` (correct order) | - |
| numeric | (blank) | the value, e.g. `254` (Tolerance/Units optional) |
| short_answer | (blank) | `NAT \| Network Address Translation` |
| drag_drop | `Router=Network \| Switch=Data Link \| Repeater=` | - |

Rules:
- A leading `*` marks a correct option.
- `[n]` after an option sets its score (negative allowed, e.g. a misconception
  penalty). When any option is scored, use `weighted` scoring to sum them.
- Pipes `|` separate options; `=` separates matching pairs; `>` separates the
  sequence order.
- drag_drop: each token is `item=zone`. Zones are created as labeled boxes in the
  order they first appear. `Item=Zone A ; Zone B` accepts either zone; `Item=`
  (nothing after `=`) is a distractor; `=Zone` adds a zone with no correct item;
  `Zone[n]` caps the zone at n items. Zones on a background image must be drawn
  in the builder.

## What happens on import

1. UI reads the file and POSTs the bytes to `POST /api/import-xlsx`.
2. The server parses the workbook, builds the assessment, and returns it plus a
   validation report (`{ assessment, validation }`).
3. The UI loads the assessment, re-renders, and shows a summary
   (questions imported, plus any errors/warnings).
4. You can immediately Preview and Export SCORM.

## Round-trip guarantee

`tests/xlsx.test.js` imports the shipped `template.xlsx`, asserts all eight
question types parse, that the result validates with zero errors, that pill/
weighted/score encodings are honored, and that the imported quiz builds into a
valid SCORM 2004 4th Edition package.
