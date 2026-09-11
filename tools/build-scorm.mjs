// @ts-check
/** CLI: build a SCORM 2004 4th Edition package from an assessment JSON file. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildScormPackage, buildAnswerKey, buildQuestionCsv } from '../packages/export-service/src/package.js';
import { validateAssessment } from '../packages/export-service/src/validate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const input = process.argv[2] || path.resolve(__dirname, '../examples/demo-assessment.json');
const outDir = process.argv[3] || path.resolve(__dirname, '../dist');
fs.mkdirSync(outDir, { recursive: true });

const assessment = JSON.parse(fs.readFileSync(input, 'utf8'));
const v = validateAssessment(assessment);
console.log(`Validation: ${v.errors.length} error(s), ${v.warnings.length} warning(s)`);
for (const w of v.warnings) console.log(`  warn ${w.code}: ${w.message}`);
if (v.errors.length) { for (const e of v.errors) console.error(`  ERROR ${e.code}: ${e.message}`); process.exit(1); }

const { zip, files, totalMax } = await buildScormPackage({ assessment });
const base = (assessment.id || 'assessment') + '_SCORM2004_4thEd';
fs.writeFileSync(path.join(outDir, base + '.zip'), zip);
fs.writeFileSync(path.join(outDir, base + '_answer_key.txt'), buildAnswerKey(assessment));
fs.writeFileSync(path.join(outDir, base + '_questions.csv'), buildQuestionCsv(assessment));
console.log(`\nPackage: ${base}.zip`);
console.log(`Files packaged: ${files.length}`);
console.log(`Questions: ${assessment.questions.length}  Max points: ${totalMax}  Passing: ${assessment.settings?.passingPercent ?? 80}%`);
console.log(`Output dir: ${outDir}`);
