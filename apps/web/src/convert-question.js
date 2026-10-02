// @ts-check
/**
 * Question type presets for the authoring UI, and changing an existing
 * question's type while carrying over as much of its content as the new type
 * can hold. No DOM, so it is unit tested.
 *
 * Every type's answers are first read into one neutral list of entries
 * ({ label, correct, ... }), which each type then rebuilds its fields from.
 * Common fields (prompt, points, feedback, objective, ...) are never touched.
 */

/** Authoring presets: the choices in the Add and type menus. */
export const KIND_PRESET = {
  single_select: { kind: 'single_select', presentation: 'radio' },
  single_select_pill: { kind: 'single_select', presentation: 'single_pill' },
  multiple_select: { kind: 'multiple_select', presentation: 'checkbox', scoringStrategy: 'all_or_nothing' },
  multiple_select_pill: { kind: 'multiple_select', presentation: 'multi_pill', scoringStrategy: 'partial' },
  true_false: { kind: 'true_false' },
  single_checkbox: { kind: 'single_checkbox' },
  matching: { kind: 'matching', scoringStrategy: 'partial' },
  sequence: { kind: 'sequence', scoringStrategy: 'all_or_nothing' },
  numeric: { kind: 'numeric' },
  short_answer: { kind: 'short_answer' },
  hotspot: { kind: 'hotspot', multiple: false, scoringStrategy: 'all_or_nothing' },
  drag_drop: { kind: 'drag_drop', scoringStrategy: 'partial' },
};

/** A new question of the given preset, filled with placeholder content. */
export function blankQuestion(presetKey, id) {
  const base = { id, points: 1, prompt: 'New question', objective: '', section: '',
    correctFeedback: '', incorrectFeedback: '', rationale: '', status: 'draft', ...KIND_PRESET[presetKey] };
  if (['single_select', 'multiple_select'].includes(base.kind))
    base.options = [{ id: 'a', label: 'Option A', correct: true }, { id: 'b', label: 'Option B' }, { id: 'c', label: 'Option C' }, { id: 'd', label: 'Option D' }];
  else if (base.kind === 'true_false') base.options = [{ id: 'true', label: 'True', correct: true }, { id: 'false', label: 'False' }];
  else if (base.kind === 'single_checkbox') base.options = [{ id: 'ack', label: 'I acknowledge the statement is true', correct: true }];
  else if (base.kind === 'matching') base.pairs = [{ prompt: 'Term 1', match: 'Def 1' }, { prompt: 'Term 2', match: 'Def 2' }];
  else if (base.kind === 'sequence') { base.items = [{ id: 's1', label: 'First' }, { id: 's2', label: 'Second' }, { id: 's3', label: 'Third' }]; base.correctOrder = ['s1', 's2', 's3']; }
  else if (base.kind === 'numeric') { base.exact = 0; base.tolerance = 0; base.units = ''; }
  else if (base.kind === 'short_answer') { base.accepted = ['answer']; base.caseSensitive = false; }
  else if (base.kind === 'hotspot') { base.image = { src: '', alt: '' }; base.options = []; }
  else if (base.kind === 'drag_drop') {
    base.image = null;
    base.zones = [{ id: 'z1', label: 'Zone A' }, { id: 'z2', label: 'Zone B' }];
    base.items = [{ id: 'i1', label: 'Item 1', zones: ['z1'] }, { id: 'i2', label: 'Item 2', zones: ['z2'] }];
  }
  return base;
}

/** Fields that belong to a particular kind; everything else is common. */
const KIND_FIELDS = ['presentation', 'scoringStrategy', 'incorrectPenalty', 'allowNegative', 'options', 'pairs',
  'items', 'correctOrder', 'exact', 'tolerance', 'min', 'max', 'precision', 'units', 'accepted', 'caseSensitive',
  'image', 'multiple', 'zones', 'reuseItems'];

/** Kinds whose scoringStrategy is chosen by the author, and which strategies each allows. */
const STRATEGIES = {
  multiple_select: ['all_or_nothing', 'partial', 'weighted'],
  hotspot: ['all_or_nothing', 'partial', 'weighted'],
  matching: ['all_or_nothing', 'partial'],
  sequence: ['all_or_nothing', 'partial'],
  drag_drop: ['all_or_nothing', 'partial'],
};

const hasImage = (q) => !!(q.image && q.image.src);
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

/**
 * The question's answers as a neutral list. `correct` marks right answers,
 * `match` the other side of a pair, `rect` an image region.
 * @returns {{ id?: string, label: string, correct: boolean, score?: number, feedback?: string, match?: string, rect?: object }[]}
 */
function entriesOf(q) {
  switch (q.kind) {
    case 'matching':
      return (q.pairs || []).map((p) => ({ label: p.prompt, match: p.match, correct: false }));
    case 'sequence': {
      const byId = new Map((q.items || []).map((it) => [it.id, it]));
      const ordered = (q.correctOrder || []).map((id) => byId.get(id)).filter(Boolean);
      for (const it of q.items || []) if (!ordered.includes(it)) ordered.push(it);
      return ordered.map((it) => ({ id: it.id, label: it.label, correct: false }));
    }
    case 'numeric': {
      const v = isNum(q.exact) ? q.exact : isNum(q.min) && isNum(q.max) ? (q.min + q.max) / 2 : null;
      return v == null ? [] : [{ label: String(v), correct: true }];
    }
    case 'short_answer':
      return (q.accepted || []).map((a) => ({ label: a, correct: true }));
    case 'drag_drop': {
      const zones = new Map((q.zones || []).map((z) => [z.id, z]));
      return (q.items || []).map((it) => ({ id: it.id, label: it.label, correct: (it.zones || []).length > 0,
        match: zones.get((it.zones || [])[0])?.label }));
    }
    default:
      return (q.options || []).map((o) => ({ id: o.id, label: o.label, correct: !!o.correct,
        score: o.score, feedback: o.feedback, rect: o.rect }));
  }
}

/** Keep ids that are present and unique; give the rest `${prefix}N`. */
function withIds(list, prefix) {
  const used = new Set();
  const out = list.map((e) => {
    const id = e.id && !used.has(e.id) ? e.id : null;
    if (id) used.add(id);
    return { ...e, id };
  });
  let n = 1;
  for (const e of out) if (!e.id) { while (used.has(`${prefix}${n}`)) n++; e.id = `${prefix}${n}`; used.add(e.id); }
  return out;
}

/** One correct answer at most: keep the first. */
function firstCorrectOnly(entries) {
  let seen = false;
  return entries.map((e) => { const correct = e.correct && !seen; if (e.correct) seen = true; return { ...e, correct }; });
}

function choiceOption(e) {
  const o = { id: e.id, label: e.label, correct: !!e.correct };
  if (isNum(e.score)) o.score = e.score;
  if (e.feedback) o.feedback = e.feedback;
  return o;
}

/**
 * Convert `q` to the type of a KIND_PRESET key. Placeholder content from a new
 * question of that type fills whatever the old question cannot supply.
 * @returns {{ question: object, dropped: string[] }} the converted copy and,
 *   for a confirmation prompt, the content that could not be carried over.
 */
export function convertQuestion(q, presetKey) {
  const preset = KIND_PRESET[presetKey];
  const fresh = blankQuestion(presetKey, q.id);
  const from = q.kind;
  const to = preset.kind;
  // Same kind, different preset (e.g. radio to pills): only the look changes.
  if (from === to) return { question: JSON.parse(JSON.stringify({ ...q, ...(preset.presentation ? { presentation: preset.presentation } : {}) })), dropped: [] };
  const entries = entriesOf(q);
  const dropped = [];
  /** @type {Record<string, any>} */
  const out = {};
  for (const [k, v] of Object.entries(q)) if (!KIND_FIELDS.includes(k)) out[k] = v;
  Object.assign(out, preset);

  // Scoring strategy: keep the author's choice when the new type allows it.
  if (STRATEGIES[to] && STRATEGIES[to].includes(q.scoringStrategy)) out.scoringStrategy = q.scoringStrategy;
  if (to === 'multiple_select' || to === 'hotspot') {
    for (const k of ['incorrectPenalty', 'allowNegative']) if (q[k] !== undefined) out[k] = q[k];
  }

  const labels = entries.filter((e) => e.label);
  const anyCorrect = labels.some((e) => e.correct);

  switch (to) {
    case 'single_select':
    case 'multiple_select': {
      if (!labels.length) { out.options = fresh.options; break; }
      let opts = withIds(labels, 'o');
      if (to === 'single_select') {
        if (opts.filter((e) => e.correct).length > 1) dropped.push('extra correct answers (only one can be correct)');
        opts = firstCorrectOnly(opts);
      }
      if (!anyCorrect) opts[0].correct = true;
      out.options = opts.map(choiceOption);
      break;
    }
    case 'true_false': {
      const opts = fresh.options.map((o) => ({ ...o }));
      // A former true/false (or an answer literally "False") keeps its key.
      const pick = labels.find((e) => e.correct && /^(true|false)$/i.test(e.label.trim()));
      if (pick) opts.forEach((o) => (o.correct = o.label.toLowerCase() === pick.label.trim().toLowerCase()));
      if (labels.length) dropped.push('the answer options (replaced by True / False)');
      out.options = opts;
      break;
    }
    case 'single_checkbox': {
      const keep = labels.find((e) => e.correct) || labels[0];
      out.options = keep ? [{ id: fresh.options[0].id, label: keep.label, correct: true }] : fresh.options;
      if (labels.length > 1) dropped.push('all but one answer option');
      break;
    }
    case 'matching': {
      if (!labels.length) { out.pairs = fresh.pairs; break; }
      // Answers without a match get an empty one for the author to fill in.
      out.pairs = labels.map((e) => ({ prompt: e.label, match: e.match ?? '' }));
      break;
    }
    case 'sequence': {
      if (!labels.length) { out.items = fresh.items; out.correctOrder = fresh.correctOrder; break; }
      const items = withIds(labels, 's');
      out.items = items.map((e) => ({ id: e.id, label: e.label }));
      out.correctOrder = items.map((e) => e.id);
      if (from !== 'matching' && labels.some((e) => !e.correct)) dropped.push('which answers were correct (every item is now part of the order)');
      break;
    }
    case 'numeric': {
      const num = labels.filter((e) => e.correct).map((e) => parseFloat(e.label)).find(isNum);
      Object.assign(out, { exact: fresh.exact, tolerance: fresh.tolerance, units: fresh.units });
      if (num !== undefined) out.exact = num;
      if (labels.length) dropped.push(num !== undefined ? 'every answer except the numeric value' : 'the answers (none were a number)');
      break;
    }
    case 'short_answer': {
      out.caseSensitive = fresh.caseSensitive;
      const acc = (anyCorrect ? labels.filter((e) => e.correct) : labels).map((e) => e.label);
      out.accepted = acc.length ? acc : fresh.accepted;
      if (anyCorrect && acc.length < labels.length) dropped.push('incorrect answers (only accepted answers are kept)');
      break;
    }
    case 'hotspot': {
      out.multiple = from === 'multiple_select' || labels.filter((e) => e.correct).length > 1;
      out.image = hasImage(q) ? { ...q.image } : { src: '', alt: '' };
      if (from === 'drag_drop' && hasImage(q)) {
        // Each drawn zone becomes a region, correct when some item belongs in it.
        const wanted = new Set((q.items || []).flatMap((it) => it.zones || []));
        out.options = withIds((q.zones || []).filter((z) => z.rect).map((z) => ({ ...z, correct: wanted.has(z.id) })), 'hs')
          .map((z) => ({ id: z.id, label: z.label, correct: z.correct, rect: z.rect }));
        if (!out.multiple && out.options.filter((o) => o.correct).length > 1) out.multiple = true;
        dropped.push('the draggable items');
      } else {
        const regions = labels.filter((e) => e.rect);
        out.options = withIds(regions, 'hs').map((e) => ({ ...choiceOption(e), rect: e.rect }));
        if (regions.length < labels.length) dropped.push('answers without a drawn region (draw them on the image)');
      }
      if (!out.multiple) out.options = firstCorrectOnly(out.options);
      break;
    }
    case 'drag_drop': {
      out.image = hasImage(q) ? { ...q.image } : null;
      if (from === 'hotspot' && hasImage(q)) {
        // Regions become zones; each correct region gets an item to drop on it.
        const zones = withIds((q.options || []).map((o) => ({ id: o.id, label: o.label, rect: o.rect })), 'z');
        out.zones = zones.map((z) => ({ id: z.id, label: z.label, rect: z.rect }));
        out.items = withIds(zones.filter((z, i) => q.options[i].correct).map((z) => ({ label: z.label, zone: z.id })), 'i')
          .map((e) => ({ id: e.id, label: e.label, zones: [e.zone] }));
      } else if (labels.some((e) => e.match)) {
        // Matching (or a previous drag and drop): each distinct match is a zone.
        const zoneOf = new Map();
        out.zones = [];
        for (const e of labels) if (e.match && !zoneOf.has(e.match)) {
          const id = `z${out.zones.length + 1}`;
          zoneOf.set(e.match, id);
          out.zones.push({ id, label: e.match });
        }
        out.items = withIds(labels, 'i').map((e) => ({ id: e.id, label: e.label, zones: e.match ? [zoneOf.get(e.match)] : [] }));
      } else if (labels.length) {
        // Otherwise sort the answers into Correct / Incorrect.
        out.zones = [{ id: 'z1', label: 'Correct' }, { id: 'z2', label: 'Incorrect' }];
        out.items = withIds(labels, 'i').map((e) => ({ id: e.id, label: e.label, zones: [e.correct ? 'z1' : 'z2'] }));
      } else {
        out.zones = fresh.zones;
        out.items = fresh.items;
      }
      break;
    }
  }

  if (hasImage(q) && !hasImage(out)) dropped.push('the image');
  if (to !== 'drag_drop' && entries.some((e) => e.rect)) dropped.push('the drawn image regions');
  if (from === 'drag_drop' && !['hotspot', 'matching'].includes(to) && (q.zones || []).length) dropped.push('the drop zones');
  if (from === 'numeric' && q.units) dropped.push('the units');
  if (from === 'numeric' && (q.tolerance || isNum(q.min))) dropped.push('the tolerance or range');
  if (from === 'matching' && to !== 'drag_drop') dropped.push('the matches');
  if (from === 'sequence') dropped.push('the correct order');
  if (!['single_select', 'multiple_select', 'hotspot'].includes(to) && entries.some((e) => isNum(e.score) || e.feedback))
    dropped.push('per-answer scores and feedback');
  return { question: JSON.parse(JSON.stringify(out)), dropped: [...new Set(dropped)] };
}
