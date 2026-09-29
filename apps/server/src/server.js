// @ts-check
/**
 * SCORM Quiz Builder server (zero-dependency Node http + JSON files). Serves
 * the authoring UI and the JSON API from one port, so `npm start` is all a
 * user runs. Production target: Express + Prisma (see docs/architecture.md).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';
import { validateAssessment } from '../../../packages/export-service/src/validate.js';
import { buildScormPackage, buildAnswerKey, buildQuestionCsv } from '../../../packages/export-service/src/package.js';
import { importXlsx } from '../../../packages/export-service/src/xlsx-import.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
/** Data root (override with SQB_DATA_DIR); the library is one JSON file per quiz. */
const DATA_DIR = path.resolve(process.env.SQB_DATA_DIR || path.join(ROOT, 'data'));
const QUIZ_DIR = path.join(DATA_DIR, 'quizzes');
/** App version, from the root package.json: the single source of truth. */
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
fs.mkdirSync(QUIZ_DIR, { recursive: true });
const PORT = Number(process.env.PORT || 4000);
const MAX_BODY = 8 * 1024 * 1024; // 8MB (xlsx uploads)

/** Filename-safe slug for a new library file. */
function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'quiz';
}

/**
 * The library: every `*.json` file in data/quizzes, addressed by its file name
 * without `.json`. Files are identified by name, not by the quiz id inside
 * them, so files added by hand (any name, duplicate ids) all show up and open.
 */
const store = {
  /** Path of an existing-or-new library file, or null if `name` is not a plain file name. */
  file(name) {
    name = String(name || '');
    if (!name || name.startsWith('.') || /[\\/\0]/.test(name)) return null;
    const f = path.join(QUIZ_DIR, `${name}.json`);
    return path.dirname(f) === QUIZ_DIR ? f : null;
  },
  names() {
    return fs.readdirSync(QUIZ_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('.') && !f.startsWith('_'))
      .map((f) => f.slice(0, -5));
  },
  /** Summaries of every file, newest first. Unreadable files are listed with an error. */
  list() {
    return store.names().map((name) => {
      const f = path.join(QUIZ_DIR, `${name}.json`);
      const modifiedAt = fs.statSync(f).mtime.toISOString();
      try {
        const a = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (!a || typeof a !== 'object' || !Array.isArray(a.questions)) throw new Error('not a quiz project (no questions array)');
        return { file: name, id: a.id, title: a.title, description: a.description, status: a.status,
          version: a.version, updatedAt: a.updatedAt, modifiedAt, questionCount: a.questions.length,
          passingPercent: a.settings?.passingPercent ?? 80, scormVersion: '2004 4th Edition' };
      } catch (err) {
        return { file: name, modifiedAt, error: `Cannot read: ${err.message}` };
      }
    }).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  },
  get(name) {
    const f = store.file(name);
    return f && fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
  },
  /** Write to an existing or explicitly named file. */
  put(name, a) { fs.writeFileSync(/** @type {string} */ (store.file(name)), JSON.stringify(a, null, 2)); return a; },
  /** Write to a NEW file named after `base`, adding -2, -3... so nothing is overwritten. */
  create(base, a) {
    const stem = slugify(base);
    const taken = new Set(store.names().map((n) => n.toLowerCase()));
    let name = stem;
    for (let n = 2; taken.has(name); n++) name = `${stem}-${n}`;
    fs.writeFileSync(path.join(QUIZ_DIR, `${name}.json`), JSON.stringify(a, null, 2), { flag: 'wx' });
    return name;
  },
  del(name) { const f = store.file(name); if (f && fs.existsSync(f)) { fs.unlinkSync(f); return true; } return false; },
};
function auditExport(entry) {
  fs.appendFileSync(path.join(DATA_DIR, '_export-audit.log'), JSON.stringify({ ...entry, t: new Date().toISOString() }) + '\n');
}

const json = (res, code, body) => {
  const s = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(s) });
  res.end(s);
};
function readRaw(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('Body too large')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readBody(req) {
  const raw = (await readRaw(req)).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (_e) { throw new Error('Invalid JSON'); }
}
/**
 * Static files for the authoring UI. The web app imports the shared packages
 * by relative path, so those are served too; nothing else in the repo is.
 */
const STATIC_PREFIXES = ['/apps/web/', '/packages/', '/examples/'];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
function serveStatic(res, pathname) {
  if (pathname === '/') { res.writeHead(302, { Location: '/apps/web/index.html' }); res.end(); return; }
  const full = path.join(ROOT, pathname);
  const allowed = pathname === '/preview.html' || STATIC_PREFIXES.some((p) => pathname.startsWith(p));
  if (!allowed || !full.startsWith(ROOT + path.sep) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(full).pipe(res);
}

function newAssessment(input = {}) {
  const id = input.id || `assessment-${nanoid(8)}`;
  return {
    schemaVersion: 1, id, title: input.title || 'Untitled Assessment',
    lmsTitle: input.lmsTitle || input.title || 'Untitled Assessment',
    description: input.description || '', version: input.version || '1.0',
    author: input.author || '', language: input.language || 'en-US',
    status: input.status || 'draft', updatedAt: new Date().toISOString(),
    settings: input.settings || {
      passingPercent: 80, maxAttempts: 2, scoreRetention: 'highest',
      shuffleQuestions: false, shuffleAnswers: false, seed: 12345,
      results: { showScore: true, showPassFail: true, showCorrectAnswers: true, delayUntilFinalAttempt: true },
    },
    questions: Array.isArray(input.questions) ? input.questions : [],
  };
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // >>> AUTH MIDDLEWARE SEAM: verify session/JWT here in production <<<

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const parts = url.pathname.split('/').filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });

  try {
    if (parts[0] !== 'api') {
      if (req.method !== 'GET' && req.method !== 'HEAD') { json(res, 405, { error: 'Method not allowed' }); return; }
      serveStatic(res, decodeURIComponent(url.pathname)); return;
    }

    if (parts[1] === 'version' && req.method === 'GET') return json(res, 200, { version: APP_VERSION });

    // POST /api/import-xlsx  -> parse an uploaded .xlsx into an assessment
    if (parts[1] === 'import-xlsx' && req.method === 'POST') {
      const raw = await readRaw(req);
      try {
        const assessment = await importXlsx(raw);
        const validation = validateAssessment(assessment);
        return json(res, 200, { assessment, validation });
      } catch (err) {
        return json(res, 400, { error: 'Could not parse the Excel file. ' + (err.message || ''), code: err.code || null });
      }
    }

    if (parts[1] === 'assessments' && parts.length === 2) {
      if (req.method === 'GET') return json(res, 200, { assessments: store.list() });
      // Always a new file, named after the title; never overwrites.
      if (req.method === 'POST') {
        const a = { ...newAssessment(await readBody(req)), updatedAt: new Date().toISOString() };
        const file = store.create(a.title, a);
        return json(res, 201, { file, assessment: a });
      }
    }

    if (parts[1] === 'assessments' && parts[2]) {
      const name = parts[2];
      const action = parts[3];
      if (!store.file(name)) return json(res, 400, { error: 'Invalid file name' });
      let existing;
      try { existing = store.get(name); } catch (_e) { existing = null; }
      if (!action) {
        if (req.method === 'GET') return existing ? json(res, 200, existing) : json(res, 404, { error: 'Not found' });
        // Overwrite this file with the editor copy (the quiz id inside is kept as sent).
        if (req.method === 'PUT') {
          const body = await readBody(req);
          const merged = { ...(existing || newAssessment({ id: body.id || name })), ...body, updatedAt: new Date().toISOString() };
          return json(res, 200, { file: name, assessment: store.put(name, merged) });
        }
        if (req.method === 'DELETE') { const ok = store.del(name); return json(res, ok ? 200 : 404, { deleted: ok }); }
      }
      // validate/export use the posted editor copy when there is one, so
      // unsaved edits are what gets checked and packaged.
      if (action === 'validate' && req.method === 'POST') {
        const body = await readBody(req);
        const a = Array.isArray(body.questions) ? body : existing;
        if (!a) return json(res, 404, { error: 'Not found' });
        return json(res, 200, validateAssessment(a));
      }
      if (action === 'answer-key' && req.method === 'GET' && existing) {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${id}_answer_key.txt"` });
        return res.end(buildAnswerKey(existing));
      }
      if (action === 'questions.csv' && req.method === 'GET' && existing) {
        res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${id}_questions.csv"` });
        return res.end(buildQuestionCsv(existing));
      }
      if (action === 'export' && req.method === 'POST') {
        const body = await readBody(req);
        const a = Array.isArray(body.questions) ? body : existing;
        if (!a) return json(res, 404, { error: 'Not found' });
        try {
          const { zip, files } = await buildScormPackage({ assessment: a });
          auditExport({ id: a.id, files: files.length, bytes: zip.length });
          res.writeHead(200, { 'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${a.id}_SCORM2004_4thEd.zip"`, 'Content-Length': zip.length });
          return res.end(zip);
        } catch (err) { return json(res, 422, { error: 'Validation failed', validation: err.validation || null }); }
      }
    }

    if (parts[1] === 'import' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body || body.schemaVersion !== 1 || !Array.isArray(body.questions))
        return json(res, 400, { error: 'Invalid or unsupported project file' });
      const a = { ...newAssessment(body), updatedAt: new Date().toISOString() };
      return json(res, 201, { file: store.create(a.title, a), assessment: a });
    }

    json(res, 404, { error: 'Not found' });
  } catch (err) {
    json(res, 400, { error: String(err.message || err) });
  }
});

server.listen(PORT, () => console.log(`SCORM Quiz Builder v${APP_VERSION}: http://localhost:${PORT}/`));
export { server, store, newAssessment };
