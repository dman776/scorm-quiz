// @ts-check
/** Library API: every .json file in data/quizzes, addressed by file name, never overwritten on create. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqb-lib-'));
const quizDir = path.join(dataDir, 'quizzes');
let base = '';
let server;

before(async () => {
  process.env.SQB_DATA_DIR = dataDir;
  process.env.PORT = '0';
  ({ server } = await import('../apps/server/src/server.js'));
  if (!server.listening) await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

const call = async (method, p, body) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json() };
};
const quiz = (title, id = 'same-id') => ({ schemaVersion: 1, id, title, questions: [] });

test('saving new quizzes with the same title and id creates separate files', async () => {
  const a = await call('POST', '/api/assessments', quiz('Network Basics'));
  const b = await call('POST', '/api/assessments', quiz('Network Basics'));
  assert.equal(a.status, 201);
  assert.equal(a.data.file, 'network-basics');
  assert.equal(b.data.file, 'network-basics-2');
  assert.ok(fs.existsSync(path.join(quizDir, 'network-basics.json')));
  assert.ok(fs.existsSync(path.join(quizDir, 'network-basics-2.json')));
});

test('PUT updates only the named file and keeps the quiz id', async () => {
  const r = await call('PUT', '/api/assessments/network-basics-2', { ...quiz('Renamed', 'my-id'), questions: [{ id: 'q' }] });
  assert.equal(r.data.file, 'network-basics-2');
  const onDisk = JSON.parse(fs.readFileSync(path.join(quizDir, 'network-basics-2.json'), 'utf8'));
  assert.equal(onDisk.id, 'my-id');
  assert.equal(onDisk.title, 'Renamed');
  assert.equal(JSON.parse(fs.readFileSync(path.join(quizDir, 'network-basics.json'), 'utf8')).title, 'Network Basics');
});

test('list shows every .json file, including hand-added and unreadable ones', async () => {
  fs.writeFileSync(path.join(quizDir, 'My Quiz (copy).json'), JSON.stringify(quiz('Hand added')));
  fs.writeFileSync(path.join(quizDir, 'broken.json'), '{ not json');
  fs.writeFileSync(path.join(quizDir, 'notes.txt'), 'ignored');
  const { data } = await call('GET', '/api/assessments');
  const files = data.assessments.map((a) => a.file).sort();
  assert.deepEqual(files, ['My Quiz (copy)', 'broken', 'network-basics', 'network-basics-2']);
  assert.match(data.assessments.find((a) => a.file === 'broken').error, /Cannot read/);
  const hand = await call('GET', `/api/assessments/${encodeURIComponent('My Quiz (copy)')}`);
  assert.equal(hand.data.title, 'Hand added');
});

test('DELETE removes one file; path tricks are rejected', async () => {
  assert.equal((await call('DELETE', '/api/assessments/network-basics')).data.deleted, true);
  assert.ok(!fs.existsSync(path.join(quizDir, 'network-basics.json')));
  assert.ok(fs.existsSync(path.join(quizDir, 'network-basics-2.json')));
  assert.equal((await call('GET', `/api/assessments/${encodeURIComponent('../quizzes/broken')}`)).status, 400);
  assert.equal((await call('GET', `/api/assessments/${encodeURIComponent('.hidden')}`)).status, 400);
});

test('folders: create, save into, move, rename, list and delete only when empty', async () => {
  assert.equal((await call('POST', '/api/folders', { path: 'safety/ppe' })).data.folder, 'safety/ppe');
  const created = await call('POST', '/api/assessments?folder=safety%2Fppe', quiz('Gloves'));
  assert.equal(created.data.file, 'safety/ppe/gloves');
  assert.ok(fs.existsSync(path.join(quizDir, 'safety', 'ppe', 'gloves.json')));
  assert.equal((await call('GET', `/api/assessments/${encodeURIComponent('safety/ppe/gloves')}`)).data.title, 'Gloves');

  const moved = await call('POST', `/api/assessments/${encodeURIComponent('safety/ppe/gloves')}/move`, { folder: 'safety' });
  assert.equal(moved.data.file, 'safety/gloves');
  assert.equal((await call('POST', '/api/folders/rename', { path: 'safety/ppe', name: 'gear' })).data.folder, 'safety/gear');
  assert.deepEqual((await call('GET', '/api/folders')).data.folders, ['safety', 'safety/gear']);
  const listed = (await call('GET', '/api/assessments')).data.assessments.find((a) => a.file === 'safety/gloves');
  assert.equal(listed.folder, 'safety');

  assert.equal((await call('DELETE', '/api/folders?path=safety')).status, 409);
  assert.equal((await call('DELETE', '/api/folders?path=safety%2Fgear')).data.deleted, true);
  assert.equal((await call('POST', `/api/assessments/${encodeURIComponent('safety/gloves')}/move`, { folder: '' })).data.file, 'gloves');
});

test('folder paths reject traversal and hidden names', async () => {
  assert.equal((await call('POST', '/api/folders', { path: '../escape' })).status, 400);
  assert.equal((await call('POST', '/api/folders', { path: 'a/.hidden' })).status, 400);
  assert.equal((await call('GET', `/api/assessments/${encodeURIComponent('safety/../../x')}`)).status, 400);
  assert.equal((await call('POST', '/api/folders/rename', { path: 'safety', name: '../up' })).status, 400);
  assert.ok(!fs.existsSync(path.join(dataDir, 'escape')));
});

test('answer key and question CSV download, named after the quiz id', async () => {
  await call('PUT', '/api/assessments/keyed', { ...quiz('Keyed', 'Quiz "One"'), questions: [] });
  const key = await fetch(`${base}/api/assessments/keyed/answer-key`);
  assert.equal(key.status, 200);
  assert.equal(key.headers.get('content-disposition'), 'attachment; filename="quiz-one_answer_key.txt"');
  assert.match(await key.text(), /Answer Key: Keyed/);
  const csv = await fetch(`${base}/api/assessments/keyed/questions.csv`);
  assert.equal(csv.status, 200);
  assert.equal(csv.headers.get('content-disposition'), 'attachment; filename="quiz-one_questions.csv"');
});
