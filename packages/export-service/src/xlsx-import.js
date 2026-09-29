// @ts-check
/**
 * Excel (.xlsx) importer.
 *
 * Parses a workbook into an assessment object using JSZip (an .xlsx is just a
 * ZIP of XML parts), so it needs no new dependency and runs server-side. The
 * template format is intentionally simple and human-authorable:
 *
 *   Sheet "Settings"  -> key / value rows (title, passing %, attempts, ...)
 *   Sheet "Questions" -> one row per question (see column + encoding rules)
 *
 * Options-column encoding by type (all in a single "Options" cell):
 *   single_select / multiple_select : "*Correct | Wrong 1 | Wrong 2"
 *       - a leading "*" marks a correct option
 *       - an optional score in brackets:  "*HTTPS[1.5] | HTTP[-1]"
 *       - use Type "single_select_pill" / "multiple_select_pill" for pills
 *   true_false      : leave Options blank; put "True"/"False" in Correct
 *   single_checkbox : Options = the statement; Correct = "true" (default) or "false"
 *   matching        : "HTTPS=443 | SSH=22 | DNS=53"
 *   sequence        : "Physical > Data Link > Network > Transport"  (correct order)
 *   numeric         : Options blank; Correct = value; Tolerance / Units optional
 *   short_answer    : Options blank; Correct = "NAT | Network Address Translation"
 *   drag_drop       : "Router=Network | Switch=Data Link | Hub="   (item=zone)
 *       - zones are created in order of first appearance, as labeled boxes
 *       - "Item=Zone A ; Zone B" accepts either zone
 *       - "Hub=" (nothing after =) makes a distractor that belongs nowhere
 *       - "=Session" (nothing before =) adds a zone with no correct item
 *       - "[n]" after a zone sets its capacity: "Router=Network[1]"
 */
import JSZip from 'jszip';

/* --------------------------- low-level xlsx reader ------------------------- */

function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function colToNum(ref) {
  const m = /^([A-Z]+)\d+$/.exec(ref) || /^([A-Z]+)$/.exec(ref);
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n; // 1-based
}

/** Parse sharedStrings.xml into an array of plain strings. */
function parseSharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRe.exec(xml))) {
    const inner = m[1];
    let text = '';
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let t;
    while ((t = tRe.exec(inner))) text += decodeEntities(t[1]);
    out.push(text);
  }
  return out;
}

/** Parse a worksheet XML into a 2D array of strings (row-major, 0-based). */
function parseSheet(xml, shared) {
  const grid = [];
  if (!xml) return grid;
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const rowXml = rm[1];
    const cells = [];
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm;
    while ((cm = cellRe.exec(rowXml))) {
      const attrs = cm[1] || '';
      const body = cm[2] || '';
      const refM = /\br="([A-Z]+\d+)"/.exec(attrs);
      const col = refM ? colToNum(refM[1]) : cells.length + 1;
      const typeM = /\bt="([^"]+)"/.exec(attrs);
      const type = typeM ? typeM[1] : '';
      let value = '';
      if (type === 'inlineStr') {
        const isM = /<t\b[^>]*>([\s\S]*?)<\/t>/.exec(body);
        value = isM ? decodeEntities(isM[1]) : '';
      } else {
        const vM = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body);
        const rawV = vM ? vM[1] : '';
        if (type === 's') value = shared[Number(rawV)] ?? '';
        else value = decodeEntities(rawV);
      }
      cells[col - 1] = value;
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] == null) cells[i] = '';
    grid.push(cells);
  }
  return grid;
}

/**
 * Read an .xlsx buffer/arraybuffer into { sheetName: string[][] }.
 * @param {Buffer|ArrayBuffer|Uint8Array} data
 */
export async function readXlsx(data) {
  const zip = await JSZip.loadAsync(data);
  const wbXml = await readFile(zip, 'xl/workbook.xml');
  const relsXml = await readFile(zip, 'xl/_rels/workbook.xml.rels');
  const sharedXml = await readFile(zip, 'xl/sharedStrings.xml');
  const shared = parseSharedStrings(sharedXml);

  // Map r:id -> target path
  // Parse relationships order-independently (Id/Target can appear in any order,
  // and Target may be absolute like "/xl/worksheets/sheet1.xml").
  /** @type {Record<string,string>} */
  const relTarget = {};
  const relTagRe = /<Relationship\b([^>]*)\/?>/g;
  let rt;
  while ((rt = relTagRe.exec(relsXml || ''))) {
    const attrs = rt[1];
    const idM = /\bId="([^"]+)"/.exec(attrs);
    const tgM = /\bTarget="([^"]+)"/.exec(attrs);
    if (idM && tgM) relTarget[idM[1]] = tgM[1];
  }

  /** @type {Record<string,string[][]>} */
  const sheets = {};
  const sheetTagRe = /<sheet\b([^>]*)\/?>/g;
  let stg;
  while ((stg = sheetTagRe.exec(wbXml || ''))) {
    const attrs = stg[1];
    const nameM = /\bname="([^"]+)"/.exec(attrs);
    const ridM = /\br:id="([^"]+)"/.exec(attrs) || /\bid="([^"]+)"/.exec(attrs);
    if (!nameM || !ridM) continue;
    const name = decodeEntities(nameM[1]);
    const sheetXml = await readFile(zip, normalizeTarget(relTarget[ridM[1]] || ''));
    sheets[name] = parseSheet(sheetXml, shared);
  }
  return { sheets };
}

/** Normalize a relationship target to a path inside the zip (handles absolute
 *  "/xl/..." and relative "worksheets/..." targets). */
function normalizeTarget(target) {
  if (!target) return '';
  let t = target.replace(/^\/+/, ''); // strip leading slashes -> "xl/worksheets/..."
  if (!t.startsWith('xl/')) t = 'xl/' + t;
  return t;
}

async function readFile(zip, path) {
  if (!path) return '';
  const f = zip.file(path);
  return f ? f.async('string') : '';
}

/* --------------------------- grid -> assessment --------------------------- */

const YES = (v) => /^(y|yes|true|1|x)$/i.test(String(v).trim());
const uid = (p) => `${p}-${Math.random().toString(36).slice(2, 8)}`;
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || uid('q');

/** Build a header index (normalized name -> column index) from a header row. */
function headerIndex(headerRow) {
  const idx = {};
  headerRow.forEach((h, i) => {
    const key = String(h || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (key) idx[key] = i;
  });
  return idx;
}
const pick = (row, idx, ...names) => {
  for (const n of names) {
    const key = n.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (key in idx) {
      const v = row[idx[key]];
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
  }
  return '';
};

/** Parse the "Options" cell for choice types into option objects. */
function parseChoiceOptions(cell) {
  return String(cell).split('|').map((raw) => raw.trim()).filter(Boolean).map((token) => {
    let correct = false;
    let text = token;
    if (text.startsWith('*')) { correct = true; text = text.slice(1).trim(); }
    let score;
    const sm = /\[(-?\d+(?:\.\d+)?)\]\s*$/.exec(text);
    if (sm) { score = parseFloat(sm[1]); text = text.slice(0, sm.index).trim(); }
    const opt = { id: slug(text) || uid('o'), label: text };
    if (correct) opt.correct = true;
    if (score != null) opt.score = score;
    return opt;
  });
}

/** Parse a drag_drop Options cell ("Item=Zone ; Zone | Distractor= | =Empty zone"). */
function parseDragDrop(cell) {
  const zones = [];
  const zoneFor = (raw) => {
    let label = raw.trim();
    let capacity;
    const cm = /\[(\d+)\]\s*$/.exec(label);
    if (cm) { capacity = parseInt(cm[1], 10); label = label.slice(0, cm.index).trim(); }
    if (!label) return null;
    let z = zones.find((x) => x.label.toLowerCase() === label.toLowerCase());
    if (!z) { z = { id: `z${zones.length + 1}`, label }; zones.push(z); }
    if (capacity >= 1) z.capacity = capacity;
    return z.id;
  };
  const items = [];
  for (const token of String(cell).split('|').map((t) => t.trim()).filter(Boolean)) {
    const eq = token.indexOf('=');
    const label = (eq < 0 ? token : token.slice(0, eq)).trim();
    const zoneIds = eq < 0 ? [] : token.slice(eq + 1).split(';').map(zoneFor).filter(Boolean);
    if (label) items.push({ id: `i${items.length + 1}`, label, zones: [...new Set(zoneIds)] });
  }
  return { zones, items };
}

const TYPE_ALIASES = {
  single: 'single_select', singleselect: 'single_select', mc: 'single_select', multiplechoice: 'single_select',
  radio: 'single_select', singleselectpill: 'single_select_pill', singlepill: 'single_select_pill',
  multiple: 'multiple_select', multiselect: 'multiple_select', multipleselect: 'multiple_select',
  checkbox: 'multiple_select', multiselectpill: 'multiple_select_pill', multiplepill: 'multiple_select_pill',
  multipleselectpill: 'multiple_select_pill',
  tf: 'true_false', truefalse: 'true_false', boolean: 'true_false',
  ack: 'single_checkbox', acknowledgement: 'single_checkbox', singlecheckbox: 'single_checkbox',
  match: 'matching', matching: 'matching', order: 'sequence', ordering: 'sequence', sequence: 'sequence',
  number: 'numeric', numeric: 'numeric', shortanswer: 'short_answer', fillin: 'short_answer', text: 'short_answer',
  dragdrop: 'drag_drop', draganddrop: 'drag_drop', dragndrop: 'drag_drop', dnd: 'drag_drop',
  categorize: 'drag_drop', categorise: 'drag_drop', sort: 'drag_drop',
};
function normalizeType(raw) {
  const key = String(raw || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  return TYPE_ALIASES[key] || (key ? key : 'single_select');
}

function buildQuestion(row, idx) {
  const typeRaw = normalizeType(pick(row, idx, 'type'));
  const isPill = typeRaw.endsWith('_pill');
  const kind = typeRaw.replace('_pill', '');
  const prompt = pick(row, idx, 'prompt', 'question');
  if (!prompt && !pick(row, idx, 'options', 'answers', 'correct')) return null; // blank row
  const id = pick(row, idx, 'id') || slug(prompt);
  const points = parseFloat(pick(row, idx, 'points')) || 1;
  const q = {
    id, kind, prompt, points,
    objective: pick(row, idx, 'objective', 'learningobjective'),
    section: pick(row, idx, 'section'),
    correctFeedback: pick(row, idx, 'correctfeedback'),
    incorrectFeedback: pick(row, idx, 'incorrectfeedback'),
    rationale: pick(row, idx, 'rationale'),
    status: 'draft',
  };
  const strategy = pick(row, idx, 'scoring', 'scoringstrategy');
  if (strategy) q.scoringStrategy = strategy.toLowerCase().replace(/[^a-z]+/g, '_');
  const optionsCell = pick(row, idx, 'options', 'answers');
  const correctCell = pick(row, idx, 'correct', 'correctanswer', 'answer');

  switch (kind) {
    case 'single_select':
    case 'multiple_select': {
      q.presentation = isPill ? (kind === 'single_select' ? 'single_pill' : 'multi_pill')
        : (kind === 'single_select' ? 'radio' : 'checkbox');
      q.options = parseChoiceOptions(optionsCell);
      if (kind === 'multiple_select' && !q.scoringStrategy) q.scoringStrategy = 'all_or_nothing';
      break;
    }
    case 'true_false': {
      const correctTrue = optionsCell ? /\*\s*true/i.test(optionsCell) : YES(correctCell || 'true');
      q.options = [
        { id: 'true', label: 'True', ...(correctTrue ? { correct: true } : {}) },
        { id: 'false', label: 'False', ...(!correctTrue ? { correct: true } : {}) },
      ];
      break;
    }
    case 'single_checkbox': {
      const statement = optionsCell || prompt;
      const correct = correctCell ? YES(correctCell) : true;
      q.options = [{ id: 'ack', label: statement, ...(correct ? { correct: true } : {}) }];
      break;
    }
    case 'matching': {
      q.pairs = String(optionsCell).split('|').map((t) => t.trim()).filter(Boolean).map((t) => {
        const [p, mm] = t.split('=');
        return { prompt: (p || '').trim(), match: (mm || '').trim() };
      }).filter((p) => p.prompt && p.match);
      if (!q.scoringStrategy) q.scoringStrategy = 'partial';
      break;
    }
    case 'sequence': {
      const items = String(optionsCell).split('>').map((t) => t.trim()).filter(Boolean);
      q.items = items.map((label, i) => ({ id: `s${i + 1}`, label }));
      q.correctOrder = q.items.map((it) => it.id);
      if (!q.scoringStrategy) q.scoringStrategy = 'all_or_nothing';
      break;
    }
    case 'numeric': {
      q.exact = parseFloat(correctCell);
      const tol = pick(row, idx, 'tolerance');
      if (tol) q.tolerance = parseFloat(tol); else q.tolerance = 0;
      const units = pick(row, idx, 'units');
      if (units) q.units = units;
      break;
    }
    case 'short_answer': {
      q.accepted = String(correctCell).split('|').map((t) => t.trim()).filter(Boolean);
      q.caseSensitive = YES(pick(row, idx, 'casesensitive'));
      break;
    }
    case 'drag_drop': {
      Object.assign(q, parseDragDrop(optionsCell));
      q.image = null;
      if (!q.scoringStrategy) q.scoringStrategy = 'partial';
      break;
    }
    case 'hotspot': {
      // Regions are drawn on an uploaded image, which a spreadsheet cannot carry.
      // Keep the kind so validation says "needs an image" instead of "no options".
      q.image = { src: '', alt: '' };
      q.options = [];
      q.multiple = YES(pick(row, idx, 'multiple', 'multiselect'));
      break;
    }
    default:
      q.kind = 'single_select';
      q.presentation = 'radio';
      q.options = parseChoiceOptions(optionsCell);
  }
  return q;
}

function parseSettingsSheet(grid) {
  const s = {};
  for (const row of grid || []) {
    const key = String(row[0] || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
    const val = row[1] != null ? String(row[1]).trim() : '';
    if (!key) continue;
    s[key] = val;
  }
  return s;
}

/**
 * Convert parsed sheets into an assessment object.
 * @param {{sheets: Record<string,string[][]>}} wb
 */
export function sheetsToAssessment(wb) {
  const sheets = wb.sheets || {};
  const findSheet = (...names) => {
    const keys = Object.keys(sheets);
    for (const n of names) {
      const hit = keys.find((k) => k.trim().toLowerCase() === n);
      if (hit) return sheets[hit];
    }
    return null;
  };

  const settingsGrid = findSheet('settings', 'setup', 'config');
  const s = settingsGrid ? parseSettingsSheet(settingsGrid) : {};

  const qGrid = findSheet('questions', 'quiz', 'items') ||
    // fall back to the first sheet that is not Settings
    sheets[Object.keys(sheets).find((k) => k.trim().toLowerCase() !== 'settings') || Object.keys(sheets)[0]];
  if (!qGrid || qGrid.length < 2) {
    throw Object.assign(new Error('No "Questions" sheet with a header row and at least one question was found.'),
      { code: 'NO_QUESTIONS_SHEET' });
  }

  const idx = headerIndex(qGrid[0]);
  const questions = [];
  for (let r = 1; r < qGrid.length; r++) {
    const row = qGrid[r];
    if (!row || row.every((c) => String(c).trim() === '')) continue;
    const q = buildQuestion(row, idx);
    if (q) questions.push(q);
  }

  const title = s.title || 'Imported Quiz';
  const passingPercent = s.passingpercent ? parseFloat(s.passingpercent) : 80;
  const maxAttempts = s.maxattempts ? parseInt(s.maxattempts, 10) : 2;

  const assessment = {
    schemaVersion: 1,
    id: (s.id ? slug(s.id) : slug(title)) || uid('assessment'),
    title,
    lmsTitle: s.lmstitle || title,
    description: s.description || '',
    version: s.version || '1.0',
    author: s.author || '',
    language: s.language || 'en-US',
    status: 'draft',
    settings: {
      passingPercent,
      maxAttempts,
      scoreRetention: (s.scoreretention || 'highest').toLowerCase(),
      shuffleQuestions: s.shufflequestions ? YES(s.shufflequestions) : false,
      shuffleAnswers: s.shuffleanswers ? YES(s.shuffleanswers) : false,
      seed: 12345,
      allowBackward: true,
      requireAnswer: false,
      passMessage: s.passmessage || 'Congratulations, you passed.',
      failMessage: s.failmessage || 'You did not reach the passing score.',
      results: {
        showScore: true,
        showPassFail: true,
        showCorrectCount: true,
        showCorrectAnswers: s.showcorrectanswers ? YES(s.showcorrectanswers) : true,
        delayUntilFinalAttempt: s.delayanswersuntilfinalattempt ? YES(s.delayanswersuntilfinalattempt) : true,
        showMissedOnly: false,
      },
    },
    questions,
  };
  return assessment;
}

/** Full pipeline: xlsx bytes -> assessment object. */
export async function importXlsx(data) {
  const wb = await readXlsx(data);
  return sheetsToAssessment(wb);
}
