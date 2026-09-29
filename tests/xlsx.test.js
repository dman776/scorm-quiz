// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importXlsx, sheetsToAssessment } from '../packages/export-service/src/xlsx-import.js';
import { validateAssessment } from '../packages/export-service/src/validate.js';
import { buildScormPackage } from '../packages/export-service/src/package.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.resolve(__dirname, '../examples/template.xlsx');

test('template.xlsx exists (run tools/make-template.py to (re)generate)', () => {
  assert.ok(fs.existsSync(templatePath), 'examples/template.xlsx missing');
});

test('importXlsx parses all 9 question types from the template', async () => {
  const a = await importXlsx(fs.readFileSync(templatePath));
  assert.equal(a.schemaVersion, 1);
  assert.equal(a.title, 'ASCEND Sample Quiz');
  assert.equal(a.settings.passingPercent, 80);
  assert.equal(a.settings.maxAttempts, 2);
  const kinds = new Set(a.questions.map((q) => q.kind));
  for (const k of ['single_select', 'multiple_select', 'true_false', 'single_checkbox', 'matching', 'sequence', 'numeric', 'short_answer', 'drag_drop'])
    assert.ok(kinds.has(k), `missing kind ${k}`);
  assert.equal(a.questions.length, 11);
});

test('imported assessment passes validation with zero errors', async () => {
  const a = await importXlsx(fs.readFileSync(templatePath));
  const v = validateAssessment(a);
  assert.equal(v.errors.length, 0, JSON.stringify(v.errors));
});

test('choice option encoding: correctness, pills, and per-answer scores', async () => {
  const a = await importXlsx(fs.readFileSync(templatePath));
  const enc = a.questions.find((q) => q.prompt.includes('provide encryption'));
  assert.equal(enc.kind, 'multiple_select');
  assert.equal(enc.presentation, 'multi_pill');
  assert.equal(enc.scoringStrategy, 'weighted');
  assert.equal(enc.options.filter((o) => o.correct).length, 2);
  assert.deepEqual(enc.options.map((o) => o.score), [1.5, 1.5, -1, -1]);

  const media = a.questions.find((q) => q.prompt.includes('electromagnetic'));
  assert.equal(media.kind, 'single_select');
  assert.equal(media.presentation, 'single_pill');
});

test('matching, sequence, numeric, short_answer encodings', async () => {
  const a = await importXlsx(fs.readFileSync(templatePath));
  const match = a.questions.find((q) => q.kind === 'matching');
  assert.deepEqual(match.pairs.map((p) => `${p.prompt}=${p.match}`), ['HTTPS=443', 'SSH=22', 'DNS=53', 'HTTP=80']);
  const seq = a.questions.find((q) => q.kind === 'sequence');
  assert.equal(seq.items.length, 4);
  assert.equal(seq.correctOrder.length, 4);
  const num = a.questions.find((q) => q.kind === 'numeric');
  assert.equal(num.exact, 254);
  assert.equal(num.units, 'hosts');
  const sa = a.questions.find((q) => q.kind === 'short_answer');
  assert.deepEqual(sa.accepted, ['NAT', 'Network Address Translation']);
});

test('imported assessment builds into a valid SCORM package', async () => {
  const a = await importXlsx(fs.readFileSync(templatePath));
  const { zip, manifest } = await buildScormPackage({ assessment: a });
  assert.ok(Buffer.isBuffer(zip));
  assert.match(manifest, /2004 4th Edition/);
});

test('sheetsToAssessment throws a clear error when Questions sheet is missing', () => {
  assert.throws(() => sheetsToAssessment({ sheets: { Settings: [['Title', 'X']] } }), /Questions/);
});

test('parses minimal inline grid without a Settings sheet', () => {
  const wb = { sheets: { Questions: [
    ['Type', 'Prompt', 'Points', 'Options', 'Correct'],
    ['single_select', 'Capital of France?', '1', '*Paris | London | Berlin', ''],
    ['numeric', '2+2?', '1', '', '4'],
  ] } };
  const a = sheetsToAssessment(wb);
  assert.equal(a.questions.length, 2);
  assert.equal(a.questions[0].options.find((o) => o.correct).label, 'Paris');
  assert.equal(a.questions[1].exact, 4);
});
