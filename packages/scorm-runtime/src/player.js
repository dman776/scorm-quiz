// @ts-check
/**
 * Assessment runtime / rendering engine (framework-agnostic). The SAME module
 * powers the authoring preview and the exported SCO.
 */
import { scoreAssessment, scoreQuestion, maxQuestionScore } from '../../engine/src/scoring.js';
import { QUESTION_KINDS, PRESENTATION } from '../../engine/src/types.js';
import { ScormAdapter } from './adapter.js';
import { buildInteraction } from './interactions.js';
import { renderDragDrop } from './dragdrop.js';
import { makeSortable, moveIndex } from './sortable.js';
import { serializeState, deserializeState, validateStateSize, seededShuffle } from './state.js';

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
};

export class AssessmentPlayer {
  constructor(cfg) {
    this.root = cfg.root;
    this.a = cfg.assessment;
    this.settings = this.a.settings || {};
    // cfg.api injects an LMS (e.g. the authoring preview's in-memory mock);
    // otherwise preview runs standalone and a real launch discovers the LMS.
    const api = cfg.api !== undefined ? cfg.api : cfg.preview ? null : undefined;
    this.adapter = new ScormAdapter({ logger: cfg.logger, api });
    this.startTime = Date.now();
    this.questionStart = Date.now();
    this.latency = {};
    this.state = null;
    this.live = h('div', { class: 'sr-only', 'aria-live': 'polite', role: 'status' });
  }

  start() {
    this.adapter.initialize();
    // Interactions already on the LMS for this attempt; new ones append after.
    this.lmsInteractionCount = parseInt(this.adapter.getValue('cmi.interactions._count'), 10) || 0;
    this.root.append(this.live);
    this._restoreOrInit();
    if (this.adapter.standalone) this._banner();
    if (this.state.submitted) this._renderResults();
    else this._renderQuestion();
  }

  _banner() {
    this.root.prepend(h('div', { class: 'sqb-banner', role: 'note' },
      'Standalone preview mode. No LMS detected, so results will not be recorded.'));
  }

  _restoreOrInit() {
    const suspend = this.adapter.getValue('cmi.suspend_data');
    const restored = deserializeState(suspend);
    if (restored && restored.order && restored.order.length) { this.state = restored; return; }
    const seed = this.settings.seed || 12345;
    let ids = this.a.questions.map((q) => q.id);
    if (this.settings.shuffleQuestions) ids = seededShuffle(ids, seed);
    const answerOrder = {};
    if (this.settings.shuffleAnswers) {
      for (const q of this.a.questions) {
        if (Array.isArray(q.options) && q.shuffleOptions !== false)
          answerOrder[q.id] = seededShuffle(q.options.map((o) => o.id), seed + hashStr(q.id));
        else if (q.kind === QUESTION_KINDS.DRAG_DROP && Array.isArray(q.items) && q.shuffleOptions !== false)
          answerOrder[q.id] = seededShuffle(q.items.map((it) => it.id), seed + hashStr(q.id));
      }
    }
    this.state = { order: ids, answers: {}, flagged: [], index: 0, submitted: false,
      attempt: 1, remainingTime: this.settings.timeLimitSec ?? null, answerOrder, interactionIndex: {} };
    this._persist();
  }

  get questions() {
    const byId = Object.fromEntries(this.a.questions.map((q) => [q.id, q]));
    return this.state.order.map((id) => byId[id]).filter(Boolean);
  }

  _persist() {
    const s = serializeState(this.state);
    const check = validateStateSize(s);
    if (!check.ok) this.adapter.logger &&
      this.adapter.logger({ fn: 'STATE_WARNING', args: [check.size], result: 'exceeds limit' });
    this.adapter.setValue('cmi.suspend_data', s);
    this.adapter.setValue('cmi.location', String(this.state.index));
    if (!this.state.submitted) this.adapter.setValue('cmi.completion_status', 'incomplete');
    this.adapter.commit();
  }

  _optionOrder(q) {
    const order = this.state.answerOrder && this.state.answerOrder[q.id];
    if (!order) return q.options || [];
    const byId = Object.fromEntries((q.options || []).map((o) => [o.id, o]));
    return order.map((id) => byId[id]).filter(Boolean);
  }

  /** Drag-and-drop items in (possibly shuffled) bank order. */
  _itemOrder(q) {
    const order = this.state.answerOrder && this.state.answerOrder[q.id];
    const items = q.items || [];
    if (!order) return items;
    const byId = Object.fromEntries(items.map((it) => [it.id, it]));
    // Items added after the order was saved go last rather than vanish.
    return [...order.map((id) => byId[id]).filter(Boolean), ...items.filter((it) => !order.includes(it.id))];
  }

  _renderQuestion() {
    this.root.querySelectorAll('.sqb-screen').forEach((n) => n.remove());
    const qs = this.questions;
    const idx = this.state.index;
    const q = qs[idx];
    // Re-renders of the same question (reordering, flagging) keep its timer running.
    if (this._shownQuestionId !== q.id) { this.questionStart = Date.now(); this._shownQuestionId = q.id; }
    const screen = h('div', { class: 'sqb-screen' });
    screen.append(h('div', { class: 'sqb-progress' }, `Question ${idx + 1} of ${qs.length}`));
    const fs = h('fieldset', { class: 'sqb-question' });
    fs.append(h('legend', { class: 'sqb-prompt' }, q.prompt));
    if (q.supporting) fs.append(h('p', { class: 'sqb-support' }, q.supporting));
    fs.append(this._renderInput(q));
    screen.append(fs);
    const nav = h('div', { class: 'sqb-nav' });
    if (this.settings.allowBackward !== false && idx > 0)
      nav.append(h('button', { class: 'sqb-btn', type: 'button', onclick: () => this._go(-1) }, 'Previous'));
    const flagged = this.state.flagged.includes(q.id);
    nav.append(h('button', { class: 'sqb-btn sqb-flag', type: 'button',
      'aria-pressed': flagged ? 'true' : 'false', onclick: () => this._toggleFlag(q.id) },
      flagged ? 'Unflag' : 'Flag for review'));
    if (idx < qs.length - 1)
      nav.append(h('button', { class: 'sqb-btn sqb-primary', type: 'button', onclick: () => this._go(1) }, 'Next'));
    else
      nav.append(h('button', { class: 'sqb-btn sqb-primary', type: 'button', onclick: () => this._review() }, 'Review & submit'));
    screen.append(nav);
    this.root.append(screen);
    const firstInput = fs.querySelector('input,select,button:not(.sqb-btn)');
    if (firstInput) /** @type {HTMLElement} */ (firstInput).focus();
  }

  _renderInput(q) {
    const wrap = h('div', { class: 'sqb-options' });
    const val = this.state.answers[q.id];
    switch (q.kind) {
      case QUESTION_KINDS.SINGLE_SELECT:
      case QUESTION_KINDS.TRUE_FALSE:
      case QUESTION_KINDS.SINGLE_CHECKBOX: {
        const pill = q.presentation === PRESENTATION.SINGLE_PILL;
        for (const o of this._optionOrder(q)) {
          const inputId = `${q.id}_${o.id}`;
          const input = h('input', { type: 'radio', name: q.id, id: inputId, value: o.id,
            class: 'sqb-radio', checked: val === o.id, onchange: () => this._answer(q.id, o.id) });
          wrap.append(h('label', { class: pill ? 'sqb-opt sqb-pill' : 'sqb-opt', for: inputId }, input, h('span', {}, o.label)));
        }
        break;
      }
      case QUESTION_KINDS.MULTIPLE_SELECT: {
        const pill = q.presentation === PRESENTATION.MULTI_PILL;
        const cur = Array.isArray(val) ? val : [];
        for (const o of this._optionOrder(q)) {
          const inputId = `${q.id}_${o.id}`;
          const input = h('input', { type: 'checkbox', id: inputId, value: o.id, class: 'sqb-check',
            checked: cur.includes(o.id), onchange: (e) => {
              const set = new Set(Array.isArray(this.state.answers[q.id]) ? this.state.answers[q.id] : []);
              if (e.target.checked) set.add(o.id); else set.delete(o.id);
              this._answer(q.id, [...set]);
            } });
          wrap.append(h('label', { class: pill ? 'sqb-opt sqb-pill' : 'sqb-opt', for: inputId }, input, h('span', {}, o.label)));
        }
        break;
      }
      case QUESTION_KINDS.MATCHING: {
        const cur = val && typeof val === 'object' ? val : {};
        const matches = [...new Set(q.pairs.map((p) => p.match))];
        for (const p of q.pairs) {
          const selId = `${q.id}_${slug(p.prompt)}`;
          const sel = h('select', { id: selId, class: 'sqb-select', onchange: (e) => {
            const m = { ...(this.state.answers[q.id] || {}) }; m[p.prompt] = e.target.value; this._answer(q.id, m);
          } }, h('option', { value: '' }, 'Select...'),
            ...matches.map((m) => h('option', { value: m, selected: cur[p.prompt] === m }, m)));
          wrap.append(h('div', { class: 'sqb-match-row' }, h('label', { class: 'sqb-match-prompt', for: selId }, p.prompt), sel));
        }
        break;
      }
      case QUESTION_KINDS.SEQUENCE: {
        const cur = Array.isArray(val) && val.length ? val : q.items.map((i) => i.id);
        const list = h('ol', { class: 'sqb-seq' });
        const labelOf = Object.fromEntries(q.items.map((i) => [i.id, i.label]));
        cur.forEach((id, i) => {
          const li = h('li', { class: 'sqb-seq-item', 'data-seq-id': id },
            h('span', { class: 'sqb-seq-grip', 'aria-hidden': 'true', title: 'Drag to reorder' }, '\u2807\u2807'),
            h('span', { class: 'sqb-seq-label' }, labelOf[id]),
            h('span', { class: 'sqb-seq-btns' },
              h('button', { type: 'button', class: 'sqb-btn sqb-mini', 'aria-label': `Move ${labelOf[id]} up`,
                disabled: i === 0, onclick: () => this._moveSeq(q, cur, i, -1) }, '\u2191'),
              h('button', { type: 'button', class: 'sqb-btn sqb-mini', 'aria-label': `Move ${labelOf[id]} down`,
                disabled: i === cur.length - 1, onclick: () => this._moveSeq(q, cur, i, 1) }, '\u2193')));
          list.append(li);
        });
        if (!Array.isArray(val)) this.state.answers[q.id] = cur.slice();
        makeSortable(list, { itemSelector: '.sqb-seq-item', handleSelector: '.sqb-seq-grip',
          onReorder: (from, to) => this._placeSeq(q, moveIndex(cur, from, to), cur[from], null) });
        wrap.append(list);
        wrap.append(h('p', { class: 'sqb-seq-hint' }, 'Drag the items into order, or use the arrow buttons.'));
        break;
      }
      case QUESTION_KINDS.NUMERIC: {
        const input = h('input', { type: 'number', class: 'sqb-number', value: val ?? '',
          step: q.precision ? String(1 / Math.pow(10, q.precision)) : 'any', 'aria-label': q.prompt,
          oninput: (e) => this._answer(q.id, e.target.value === '' ? '' : parseFloat(e.target.value)) });
        wrap.append(input, q.units ? h('span', { class: 'sqb-units' }, q.units) : null);
        break;
      }
      case QUESTION_KINDS.SHORT_ANSWER: {
        const input = h('input', { type: 'text', class: 'sqb-text', value: val ?? '', 'aria-label': q.prompt,
          maxlength: '250', oninput: (e) => this._answer(q.id, e.target.value) });
        wrap.append(input);
        break;
      }
      case QUESTION_KINDS.HOTSPOT: {
        wrap.classList.add('sqb-hotspot-wrap');
        const cur = q.multiple ? (Array.isArray(val) ? val : []) : val == null ? [] : [val];
        const figure = h('div', { class: 'sqb-hotspot-figure' });
        figure.append(h('img', { class: 'sqb-hotspot-img', src: q.image.src, alt: q.image.alt || '' }));
        const pct = (n) => `${(n * 100).toFixed(4)}%`;
        const opts = q.options || [];
        opts.forEach((o, i) => {
          const selected = cur.includes(o.id);
          figure.append(h('button', {
            type: 'button', class: 'sqb-hotspot' + (selected ? ' sqb-hotspot-on' : ''),
            style: `left:${pct(o.rect.x)};top:${pct(o.rect.y)};width:${pct(o.rect.w)};height:${pct(o.rect.h)}`,
            'aria-pressed': selected ? 'true' : 'false',
            // Neutral name on purpose: the author's label names the answer.
            'aria-label': `Region ${i + 1} of ${opts.length}`,
            onclick: () => this._pickHotspot(q, o.id),
          }));
        });
        wrap.append(figure);
        wrap.append(h('p', { class: 'sqb-hotspot-hint' },
          q.multiple ? 'Select every region that applies.' : 'Select one region on the image.'));
        break;
      }
      case QUESTION_KINDS.DRAG_DROP: {
        wrap.append(renderDragDrop({ q, items: this._itemOrder(q), h,
          getValue: () => this.state.answers[q.id],
          onChange: (m) => this._answer(q.id, m),
          announce: (msg) => this._announce(msg) }));
        break;
      }
    }
    return wrap;
  }

  _moveSeq(q, cur, i, dir) {
    const j = i + dir;
    if (j < 0 || j >= cur.length) return;
    this._placeSeq(q, moveIndex(cur, i, j), cur[i], dir < 0 ? 'up' : 'down');
  }
  /** Save a new sequence order, announce it, and keep focus on the moved item. */
  _placeSeq(q, order, movedId, dir) {
    this._answer(q.id, order);
    this._renderQuestion();
    const label = (q.items.find((it) => it.id === movedId) || {}).label || '';
    const pos = order.indexOf(movedId);
    this._announce(`${label} moved to position ${pos + 1} of ${order.length}.`);
    const li = this.root.querySelector(`.sqb-seq-item[data-seq-id="${String(movedId).replace(/["\\]/g, '\\$&')}"]`);
    if (!li) return;
    // Stay on the same arrow if it still works, else the other one.
    const [up, down] = li.querySelectorAll('.sqb-seq-btns button');
    const pick = dir === 'down' ? (down.disabled ? up : down) : dir === 'up' ? (up.disabled ? down : up) : (up.disabled ? down : up);
    /** @type {HTMLElement} */ (pick).focus();
  }
  _pickHotspot(q, optionId) {
    if (!q.multiple) {
      this._answer(q.id, this.state.answers[q.id] === optionId ? null : optionId);
    } else {
      const set = new Set(Array.isArray(this.state.answers[q.id]) ? this.state.answers[q.id] : []);
      if (set.has(optionId)) set.delete(optionId); else set.add(optionId);
      this._answer(q.id, [...set]);
    }
    this._renderQuestion();
    const i = (q.options || []).findIndex((o) => o.id === optionId);
    const btn = this.root.querySelectorAll('.sqb-hotspot')[i];
    if (btn) /** @type {HTMLElement} */ (btn).focus();
  }
  _answer(id, value) { this.state.answers[id] = value; this._persist(); }
  _toggleFlag(id) {
    const i = this.state.flagged.indexOf(id);
    if (i >= 0) this.state.flagged.splice(i, 1); else this.state.flagged.push(id);
    this._persist(); this._renderQuestion();
  }
  _go(dir) {
    this._recordLatency();
    this._journal(this.questions[this.state.index]);
    const q = this.questions[this.state.index];
    if (dir > 0 && this.settings.requireAnswer && !scoreQuestion(q, this.state.answers[q.id]).answered) {
      this._announce('Please answer before continuing.'); return;
    }
    this.state.index = Math.max(0, Math.min(this.questions.length - 1, this.state.index + dir));
    this._persist(); this._renderQuestion();
  }
  _recordLatency() {
    const q = this.questions[this.state.index];
    if (!q) return;
    this.latency[q.id] = (this.latency[q.id] || 0) + (Date.now() - this.questionStart) / 1000;
  }
  /** cmi.interactions index for a question, assigned in first-reported order. */
  _interactionIndex(qid) {
    const ix = this.state.interactionIndex || (this.state.interactionIndex = {});
    if (ix[qid] == null) ix[qid] = Math.max(this.lmsInteractionCount || 0, ...Object.values(ix).map((n) => n + 1));
    return ix[qid];
  }
  /**
   * Report a question as the learner leaves it, so the LMS holds every answer
   * given even if the attempt is never submitted. Callers persist afterwards.
   */
  _journal(q) {
    if (!q || this.state.submitted) return;
    const r = scoreQuestion(q, this.state.answers[q.id]);
    if (!r.answered) return;
    this.adapter.writeInteraction(this._interactionIndex(q.id),
      buildInteraction(q, this.state.answers[q.id], r, this.latency[q.id] ?? 0, false));
  }
  _review() {
    this._recordLatency();
    this._journal(this.questions[this.state.index]);
    this._persist();
    this.root.querySelectorAll('.sqb-screen').forEach((n) => n.remove());
    const screen = h('div', { class: 'sqb-screen' });
    screen.append(h('h2', {}, 'Review your answers'));
    const list = h('ul', { class: 'sqb-review' });
    this.questions.forEach((q, i) => {
      const answered = scoreQuestion(q, this.state.answers[q.id]).answered;
      list.append(h('li', {}, h('button', { type: 'button', class: 'sqb-link',
        onclick: () => { this.state.index = i; this._renderQuestion(); } },
        `Question ${i + 1}: ${answered ? 'Answered' : 'Not answered'}${this.state.flagged.includes(q.id) ? ' (flagged)' : ''}`)));
    });
    screen.append(list);
    screen.append(h('div', { class: 'sqb-nav' },
      h('button', { type: 'button', class: 'sqb-btn', onclick: () => this._renderQuestion() }, 'Back'),
      h('button', { type: 'button', class: 'sqb-btn sqb-primary', onclick: () => this._submit() }, 'Submit assessment')));
    this.root.append(screen);
    screen.querySelector('h2').setAttribute('tabindex', '-1');
    screen.querySelector('h2').focus();
  }
  _submit() {
    const scored = scoreAssessment(this.questions, this.state.answers, { passingPercent: this.settings.passingPercent ?? 80 });
    const resultsById = Object.fromEntries(scored.results.map((r) => [r.questionId, r]));
    this.adapter.setValue('cmi.score.raw', String(scored.raw));
    this.adapter.setValue('cmi.score.min', String(scored.min));
    this.adapter.setValue('cmi.score.max', String(scored.max));
    this.adapter.setValue('cmi.score.scaled', String(scored.scaled));
    this.adapter.setValue('cmi.progress_measure', '1');
    this.adapter.setValue('cmi.completion_status', 'completed');
    this.adapter.setValue('cmi.success_status', scored.passed ? 'passed' : 'failed');
    this.adapter.setValue('cmi.session_time', isoDuration((Date.now() - this.startTime) / 1000));
    for (const q of this.questions) {
      this.adapter.writeInteraction(this._interactionIndex(q.id),
        buildInteraction(q, this.state.answers[q.id], resultsById[q.id], this.latency[q.id] ?? 0, true));
    }
    this.adapter.setValue('cmi.exit', 'normal');
    this.state.submitted = true;
    this.state.lastScore = scored;
    this._persist();
    this.adapter.commit();
    this.adapter.terminate();
    this._renderResults(scored);
  }
  _renderResults(scored) {
    scored = scored || this.state.lastScore ||
      scoreAssessment(this.questions, this.state.answers, { passingPercent: this.settings.passingPercent ?? 80 });
    this.root.querySelectorAll('.sqb-screen').forEach((n) => n.remove());
    const r = this.settings.results || {};
    const screen = h('div', { class: 'sqb-screen sqb-results' });
    screen.append(h('h2', { tabindex: '-1' }, scored.passed ? 'Assessment passed' : 'Assessment complete'));
    if (r.showScore !== false) screen.append(h('p', { class: 'sqb-score' }, `Score: ${scored.raw} / ${scored.max} (${scored.percent}%)`));
    if (r.showPassFail !== false) screen.append(h('p', { class: scored.passed ? 'sqb-pass' : 'sqb-fail' },
      scored.passed ? (this.settings.passMessage || 'Congratulations, you passed.') : (this.settings.failMessage || 'You did not reach the passing score.')));
    if (r.showCorrectCount) screen.append(h('p', {}, `Correct answers: ${scored.correctCount} of ${scored.results.length}`));
    const showAnswers = r.showCorrectAnswers && (!r.delayUntilFinalAttempt || this._isFinalAttempt());
    if (showAnswers) screen.append(this._answerReview(scored, r));
    this.root.append(screen);
    screen.querySelector('h2').focus();
    this._announce(scored.passed ? 'You passed the assessment.' : 'Assessment complete.');
  }
  _answerReview(scored, r) {
    const box = h('div', { class: 'sqb-answer-review' }, h('h3', {}, 'Answer review'));
    const byId = Object.fromEntries(this.questions.map((q) => [q.id, q]));
    for (const res of scored.results) {
      if (r.showMissedOnly && res.outcome === 'correct') continue;
      const q = byId[res.questionId];
      const item = h('div', { class: 'sqb-review-q ' + res.outcome });
      item.append(h('p', { class: 'sqb-review-prompt' }, q.prompt));
      item.append(h('p', { class: 'sqb-review-outcome' }, `Result: ${res.outcome} (${res.score}/${res.max})`));
      const fb = res.outcome === 'correct' ? q.correctFeedback
        : res.outcome === 'partial' ? (q.partialFeedback || q.incorrectFeedback) : q.incorrectFeedback;
      if (fb) item.append(h('p', { class: 'sqb-review-fb' }, fb));
      if (q.kind === QUESTION_KINDS.DRAG_DROP) item.append(dragDropKey(q));
      if (q.rationale) item.append(h('p', { class: 'sqb-review-rationale' }, q.rationale));
      box.append(item);
    }
    return box;
  }
  _isFinalAttempt() {
    const max = this.settings.maxAttempts;
    if (!max || max <= 0) return false;
    return this.state.attempt >= max;
  }
  _announce(msg) { this.live.textContent = ''; setTimeout(() => (this.live.textContent = msg), 30); }
}

/** Correct placement for each item, shown in the answer review. */
function dragDropKey(q) {
  const zoneLabel = Object.fromEntries((q.zones || []).map((z) => [z.id, z.label]));
  return h('ul', { class: 'sqb-review-key' }, (q.items || []).map((it) => h('li', {},
    `${it.label}: ${(it.zones || []).map((z) => zoneLabel[z]).filter(Boolean).join(' or ') || 'leave unplaced'}`)));
}

function isoDuration(sec) {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = Math.round((s % 60) * 100) / 100;
  let o = 'PT';
  if (h) o += h + 'H';
  if (m) o += m + 'M';
  o += ss + 'S';
  return o;
}
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function slug(s) { return String(s).replace(/[^A-Za-z0-9]/g, '_').slice(0, 40); }

export { scoreAssessment, scoreQuestion, maxQuestionScore };
