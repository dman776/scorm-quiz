// @ts-check
/** SCORM export service. Assembles a self-contained SCORM 2004 4th Edition ZIP. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { generateManifest } from './manifest.js';
import { validateAssessment } from './validate.js';
import { maxQuestionScore } from '../../engine/src/scoring.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_DIR = path.resolve(__dirname, '../../scorm-runtime/src');
const ENGINE_DIR = path.resolve(__dirname, '../../engine/src');

function safeZipPath(p) {
  const norm = p.replace(/\\/g, '/');
  if (norm.startsWith('/') || norm.includes('..')) throw new Error(`Unsafe zip path: ${p}`);
  return norm;
}
function renderTemplate(tmpl, vars) {
  return tmpl.replace(/\{\{(\w+)\}\}/g, (_m, k) => (k in vars ? vars[k] : ''));
}
function themeVars(theme = {}) {
  const map = { primary: '--sqb-primary', primaryInk: '--sqb-primary-ink', bg: '--sqb-bg',
    ink: '--sqb-ink', correct: '--sqb-correct', incorrect: '--sqb-incorrect' };
  return Object.entries(map).filter(([k]) => theme[k]).map(([k, v]) => `${v}:${theme[k]};`).join(' ');
}

/**
 * @returns {Promise<{zip:Buffer, files:string[], manifest:string, validation:any, totalMax:number}>}
 */
export async function buildScormPackage(opts) {
  const a = opts.assessment;
  const validation = validateAssessment(a);
  if (validation.errors.length) throw Object.assign(new Error('Assessment failed validation'), { validation });

  const zip = new JSZip();
  const files = [];
  const add = (p, content) => { const sp = safeZipPath(p); zip.file(sp, content); files.push(sp); };

  const runtimeFiles = ['player.js', 'adapter.js', 'interactions.js', 'state.js', 'dragdrop.js'];
  for (const f of runtimeFiles) add(`runtime/scorm-runtime/src/${f}`, fs.readFileSync(path.join(RUNTIME_DIR, f), 'utf8'));
  const engineFiles = ['scoring.js', 'types.js'];
  for (const f of engineFiles) add(`runtime/engine/src/${f}`, fs.readFileSync(path.join(ENGINE_DIR, f), 'utf8'));
  if (opts.includeDebug) add('runtime/mock-lms.js', fs.readFileSync(path.resolve(__dirname, '../../mock-lms/mock-lms.js'), 'utf8'));

  add('runtime/assessment.data.js', 'export default ' + JSON.stringify(a, null, 0) + ';\n');
  add('assets/player.css', fs.readFileSync(path.join(RUNTIME_DIR, 'player.css'), 'utf8'));

  const tmpl = fs.readFileSync(path.join(RUNTIME_DIR, 'index.html.tmpl'), 'utf8');
  add('index.html', renderTemplate(tmpl, {
    LANG: a.language || 'en-US', TITLE: escapeHtml(a.title || 'Assessment'), THEME_VARS: themeVars(opts.theme),
  }));

  add('LICENSES.txt', 'SCORM Quiz Builder runtime.\nBundled dependencies: none at runtime.\nGenerated ' + new Date().toISOString() + '\n');

  const passingPercent = (a.settings && a.settings.passingPercent) ?? 80;
  const manifest = generateManifest({
    identifier: a.id || 'assessment', title: a.lmsTitle || a.title, version: a.version || '1.0',
    launch: 'index.html', files: files.concat(['imsmanifest.xml']),
    masteryScaled: Math.max(0, Math.min(1, passingPercent / 100)),
  });
  add('imsmanifest.xml', manifest);

  const totalMax = (a.questions || []).reduce((s, q) => s + maxQuestionScore(q), 0);
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { zip: buf, files, manifest, validation, totalMax };
}

export function buildAnswerKey(a) {
  let out = `Answer Key: ${a.title}\nVersion ${a.version || '1.0'}\n\n`;
  a.questions.forEach((q, i) => {
    out += `${i + 1}. [${q.kind}] ${q.prompt}\n`;
    if (q.kind === 'drag_drop') {
      const zoneLabel = Object.fromEntries((q.zones || []).map((z) => [z.id, z.label]));
      out += `   Placements: ${(q.items || []).map((it) => `${it.label} -> ${(it.zones || []).map((z) => zoneLabel[z]).join(' or ') || '(distractor, leave unplaced)'}`).join('; ')}\n`;
    } else if (q.options) {
      const correct = q.options.filter((o) => o.correct).map((o) => o.label);
      out += `   Correct: ${correct.join('; ') || '(score-based)'}\n`;
    } else if (q.pairs) out += `   Pairs: ${q.pairs.map((p) => `${p.prompt}=${p.match}`).join('; ')}\n`;
    else if (q.correctOrder) out += `   Order: ${q.correctOrder.join(' > ')}\n`;
    else if (typeof q.exact === 'number') out += `   Value: ${q.exact}${q.tolerance ? ' \u00b1' + q.tolerance : ''}\n`;
    else if (q.accepted) out += `   Accepted: ${q.accepted.join('; ')}\n`;
    out += `   Points: ${maxQuestionScore(q)}${q.rationale ? '\n   Rationale: ' + q.rationale : ''}\n\n`;
  });
  return out;
}

export function buildQuestionCsv(a) {
  const rows = [['num', 'id', 'kind', 'section', 'objective', 'points', 'status']];
  a.questions.forEach((q, i) =>
    rows.push([i + 1, q.id, q.kind, q.section || '', q.objective || '', maxQuestionScore(q), q.status || 'draft']));
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}
function csvCell(v) { const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
