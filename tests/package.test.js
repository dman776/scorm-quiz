// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { buildScormPackage, buildAnswerKey, buildQuestionCsv } from '../packages/export-service/src/package.js';
import { validateAssessment } from '../packages/export-service/src/validate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demo = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../examples/demo-assessment.json'), 'utf8'));

test('demo assessment passes validation', () => {
  const v = validateAssessment(demo);
  assert.equal(v.errors.length, 0, JSON.stringify(v.errors));
});
test('build produces ZIP with imsmanifest.xml at root and launch file', async () => {
  const { zip, files, manifest } = await buildScormPackage({ assessment: demo });
  assert.ok(Buffer.isBuffer(zip));
  const z = await JSZip.loadAsync(zip);
  assert.ok(z.file('imsmanifest.xml'));
  assert.ok(z.file('index.html'));
  assert.ok(z.file('runtime/scorm-runtime/src/player.js'));
  assert.ok(z.file('runtime/engine/src/scoring.js'));
  assert.ok(z.file('runtime/assessment.data.js'));
  assert.ok(z.file('assets/player.css'));
  assert.match(manifest, /href="index.html"/);
  assert.ok(!files.some((f) => f.startsWith('/')));
});
test('learner package excludes mock LMS', async () => {
  const { zip } = await buildScormPackage({ assessment: demo });
  const z = await JSZip.loadAsync(zip);
  assert.equal(z.file('runtime/mock-lms.js'), null);
});
test('manifest lists every packaged file', async () => {
  const { zip, manifest } = await buildScormPackage({ assessment: demo });
  const z = await JSZip.loadAsync(zip);
  const packaged = Object.keys(z.files).filter((f) => f !== 'imsmanifest.xml' && !z.files[f].dir);
  for (const f of packaged) assert.match(manifest, new RegExp(f.replace(/[.]/g, '\\.')));
});
test('build blocks on validation errors', async () => {
  await assert.rejects(() => buildScormPackage({ assessment: { ...demo, title: '', questions: [] } }), /validation/);
});
test('answer key and CSV export', () => {
  assert.match(buildAnswerKey(demo), /Answer Key/);
  assert.match(buildAnswerKey(demo), /NAT/);
  const csv = buildQuestionCsv(demo);
  assert.match(csv, /num,id,kind/);
  assert.equal(csv.split('\n').length, demo.questions.length + 1);
});
