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

test('hotspot validation catches missing image, external image and bad regions', () => {
  const make = (q) => ({ title: 'T', questions: [{ id: 'q1', kind: 'hotspot', points: 1, prompt: 'Click it', ...q }] });
  const codes = (a) => validateAssessment(a).errors.map((e) => e.code);
  const ok = { image: { src: 'data:image/png;base64,AAA', alt: 'a' },
    options: [{ id: 'h1', label: 'A', correct: true, rect: { x: 0, y: 0, w: .5, h: .5 } }] };

  assert.ok(!codes(make(ok)).length, 'well-formed hotspot question should pass');
  assert.ok(codes(make({ ...ok, image: { src: '' } })).includes('NO_HOTSPOT_IMAGE'));
  assert.ok(codes(make({ ...ok, image: { src: 'https://cdn.example.com/a.png' } })).includes('BAD_HOTSPOT_IMAGE'));
  assert.ok(codes(make({ ...ok, options: [{ id: 'h1', correct: true, rect: { x: 0, y: 0, w: 0, h: .5 } }] })).includes('BAD_HOTSPOT_RECT'));
  assert.ok(codes(make({ ...ok, options: [{ id: 'h1', correct: true, rect: { x: .8, y: 0, w: .5, h: .5 } }] })).includes('BAD_HOTSPOT_RECT'));
  assert.ok(codes(make({ ...ok, options: [{ id: 'h1', label: 'A', rect: { x: 0, y: 0, w: .5, h: .5 } }] })).includes('NO_CORRECT'));
});

test('hotspot question builds into a SCORM package with the image embedded', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const a = { id: 'hs-demo', title: 'Hotspot demo', questions: [{ id: 'q1', kind: 'hotspot', points: 2,
    prompt: 'Click the router', multiple: false, image: { src: png, alt: 'Network diagram' },
    options: [{ id: 'h1', label: 'Router', correct: true, rect: { x: .1, y: .1, w: .3, h: .3 } },
      { id: 'h2', label: 'Switch', rect: { x: .5, y: .5, w: .3, h: .3 } }] }] };
  const built = await buildScormPackage({ assessment: a });
  const zip = await JSZip.loadAsync(built.zip);
  const data = await zip.file('runtime/assessment.data.js').async('string');
  assert.ok(data.includes(png), 'image data URI travels inside the package');
  assert.equal(built.totalMax, 2);
});

test('hotspot image size is measured in raw bytes against the 5MB cap', async () => {
  const { MAX_HOTSPOT_IMAGE_BYTES, dataUriBytes } = await import('../packages/engine/src/types.js');
  assert.equal(MAX_HOTSPOT_IMAGE_BYTES, 5 * 1024 * 1024);
  for (const n of [0, 1, 2, 3, 1000, 1001, 1002]) {
    const uri = 'data:image/png;base64,' + Buffer.alloc(n).toString('base64');
    assert.equal(dataUriBytes(uri), n, `decoded size for ${n} bytes`);
  }
  const withImage = (bytes) => ({ title: 'T', questions: [{ id: 'q1', kind: 'hotspot', points: 1, prompt: 'p',
    image: { src: 'data:image/png;base64,' + Buffer.alloc(bytes).toString('base64'), alt: 'a' },
    options: [{ id: 'h1', label: 'A', correct: true, rect: { x: 0, y: 0, w: .5, h: .5 } }] }] });
  const warns = (a) => validateAssessment(a).warnings.map((w) => w.code);
  // 4.5MB raw is ~6MB of base64: the old check would have warned, the new one must not.
  assert.ok(!warns(withImage(4.5 * 1024 * 1024)).includes('LARGE_HOTSPOT_IMAGE'));
  assert.ok(!warns(withImage(MAX_HOTSPOT_IMAGE_BYTES)).includes('LARGE_HOTSPOT_IMAGE'));
  assert.ok(warns(withImage(MAX_HOTSPOT_IMAGE_BYTES + 1)).includes('LARGE_HOTSPOT_IMAGE'));
});
