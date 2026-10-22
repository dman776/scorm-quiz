// @ts-check
/**
 * Matching question widget. Keys sit as pills in a left column and answers in
 * a right column; the learner drags a line from a key to an answer. Each key
 * links to at most one answer, and an answer can take lines from several keys.
 *
 * Dragging is never the only way in (WCAG 2.2 SC 2.5.7): select a key with a
 * click, tap, Space or Enter, then select an answer to link them. Delete or
 * Backspace on a selected key removes its line, Escape cancels. Dragging a
 * linked key's line onto empty space also removes it. Pointer Events drive
 * the drag, so mouse, touch and pen share one path, inside LMS iframes too.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * @param {{
 *   q: any,
 *   answers: string[],                   // right-hand column, in display order
 *   getValue: () => any,                 // current { keyPrompt: answer }
 *   onChange: (map: Record<string, string>) => void,
 *   announce: (msg: string) => void,
 *   h: (tag: string, attrs?: any, ...kids: any[]) => HTMLElement,
 * }} cfg
 */
export function renderMatching({ q, answers, getValue, onChange, announce, h }) {
  const keys = (q.pairs || []).map((p) => p.prompt);
  const root = h('div', { class: 'sqb-mt' });
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'sqb-mt-lines');
  svg.setAttribute('aria-hidden', 'true');
  /** Index of the key picked up by click/keyboard. @type {number|null} */
  let picked = null;
  /** Swallows the click that follows a completed drag. */
  let suppressClick = false;
  /** @type {HTMLElement[]} */ let keyEls = [];
  /** @type {HTMLElement[]} */ let ansEls = [];

  const value = () => { const v = getValue(); return v && typeof v === 'object' ? v : {}; };
  const linkOf = (k) => { const a = value()[k]; return answers.includes(a) ? a : null; };
  const keysFor = (a) => keys.filter((k) => linkOf(k) === a);
  const linkedCount = () => keys.filter((k) => linkOf(k)).length;

  function link(ki, a) {
    const k = keys[ki];
    const m = { ...value() };
    if (a == null) {
      if (!(k in m)) return;
      delete m[k];
      onChange(m);
      announce(`${k} unmatched.`);
      return;
    }
    m[k] = a;
    onChange(m);
    announce(`${k} matched to ${a}. ${linkedCount()} of ${keys.length} matched.`);
  }

  function render(focusKey) {
    const keyCol = h('div', { class: 'sqb-mt-col', role: 'group', 'aria-label': 'Items to match' });
    const ansCol = h('div', { class: 'sqb-mt-col', role: 'group', 'aria-label': 'Answers' });
    keyEls = keys.map((k, i) => {
      const a = linkOf(k);
      const b = h('button', {
        type: 'button', 'data-mt-key': String(i),
        class: 'sqb-mt-pill sqb-mt-key' + (a ? ' sqb-mt-linked' : '') + (picked === i ? ' sqb-mt-picked' : ''),
        'aria-pressed': picked === i ? 'true' : 'false',
        'aria-label': `${k}, ${a ? `matched to ${a}` : 'not matched'}`,
        onclick: () => { if (suppressClick) return; pick(i); },
      }, h('span', { class: 'sqb-mt-text' }, k), h('span', { class: 'sqb-mt-dot', 'aria-hidden': 'true' }));
      b.addEventListener('pointerdown', (e) => startDrag(/** @type {PointerEvent} */ (e), i, b));
      return b;
    });
    ansEls = answers.map((a) => {
      const from = keysFor(a);
      const action = picked != null ? `Match ${keys[picked]} here` : 'Select an item first';
      return h('button', {
        type: 'button', 'data-mt-ans': a,
        class: 'sqb-mt-pill sqb-mt-ans' + (from.length ? ' sqb-mt-linked' : ''),
        'aria-label': `${a}${from.length ? `, matched from ${from.join(' and ')}` : ''}. ${action}.`,
        onclick: () => {
          if (picked == null) { announce('Select an item on the left first, then its answer.'); return; }
          const ki = picked; picked = null; link(ki, a); render(ki);
        },
      }, h('span', { class: 'sqb-mt-dot', 'aria-hidden': 'true' }), h('span', { class: 'sqb-mt-text' }, a));
    });
    keyCol.append(...keyEls);
    ansCol.append(...ansEls);
    root.classList.toggle('sqb-mt-picking', picked != null);
    root.replaceChildren(svg, h('div', { class: 'sqb-mt-cols' }, keyCol, ansCol),
      h('p', { class: 'sqb-mt-hint' },
        'Drag a line from each item on the left to its answer on the right, or select an item and then an answer. ' +
        'Keyboard: Space to select an item, Tab to an answer, Enter to match, Delete to remove a match, Escape to cancel.'));
    drawLines();
    if (focusKey != null && keyEls[focusKey]) keyEls[focusKey].focus();
  }

  function pick(i) {
    picked = picked === i ? null : i;
    announce(picked != null ? `${keys[i]} selected. Choose its answer, or press Escape to cancel.` : `${keys[i]} deselected.`);
    render(i);
  }

  /** Connector dot centre of a pill, relative to the widget. */
  function anchor(el) {
    const dot = el.querySelector('.sqb-mt-dot') || el;
    const r = dot.getBoundingClientRect(), o = root.getBoundingClientRect();
    return { x: r.left + r.width / 2 - o.left, y: r.top + r.height / 2 - o.top };
  }
  function curve(p1, p2) {
    const dx = Math.max(30, Math.abs(p2.x - p1.x) / 2);
    return `M${p1.x},${p1.y} C${p1.x + dx},${p1.y} ${p2.x - dx},${p2.y} ${p2.x},${p2.y}`;
  }
  function pathEl(d, cls) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', cls);
    return p;
  }

  /** Redraw every link (layout can shift after insert, resize or font load). */
  function drawLines(skipKey = -1) {
    if (!root.isConnected) return;
    const o = root.getBoundingClientRect();
    svg.setAttribute('width', String(o.width));
    svg.setAttribute('height', String(o.height));
    svg.replaceChildren();
    keys.forEach((k, i) => {
      const a = linkOf(k);
      if (!a || i === skipKey) return;
      const ae = ansEls[answers.indexOf(a)];
      if (!ae || !keyEls[i]) return;
      svg.append(pathEl(curve(anchor(keyEls[i]), anchor(ae)), 'sqb-mt-line' + (picked === i ? ' sqb-mt-line-on' : '')));
    });
  }

  function startDrag(e, ki, btn) {
    if (e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY;
    /** @type {SVGPathElement|null} */ let live = null;
    /** @type {Element|null} */ let over = null;
    const setOver = (el) => {
      if (el === over) return;
      if (over) over.classList.remove('sqb-mt-over');
      over = el;
      if (over) over.classList.add('sqb-mt-over');
    };
    const onMove = (ev) => {
      if (!live) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return; // still a click
        picked = null;
        root.classList.add('sqb-mt-active');
        document.documentElement.classList.add('sqb-mt-grabbing');
        btn.classList.add('sqb-mt-dragging');
        drawLines(ki); // the key's old line follows the pointer instead
        live = /** @type {SVGPathElement} */ (pathEl('', 'sqb-mt-line sqb-mt-line-live'));
        svg.append(live);
      }
      const target = answerAt(ev.clientX, ev.clientY);
      setOver(target);
      const o = root.getBoundingClientRect();
      const end = target ? anchor(target) : { x: ev.clientX - o.left, y: ev.clientY - o.top };
      live.setAttribute('d', curve(anchor(btn), end));
    };
    const finish = (drop) => () => {
      btn.removeEventListener('pointermove', onMove);
      btn.removeEventListener('pointerup', onUp);
      btn.removeEventListener('pointercancel', onCancel);
      if (!live) return; // no movement: the click handler selects it
      root.classList.remove('sqb-mt-active');
      document.documentElement.classList.remove('sqb-mt-grabbing');
      const target = over;
      setOver(null);
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      // Released on an answer links it; released anywhere else drops the line.
      if (drop) link(ki, target ? target.getAttribute('data-mt-ans') : null);
      render(ki);
    };
    const onUp = finish(true);
    const onCancel = finish(false);
    try { btn.setPointerCapture(e.pointerId); } catch (_e) { /* synthetic events */ }
    btn.addEventListener('pointermove', onMove);
    btn.addEventListener('pointerup', onUp);
    btn.addEventListener('pointercancel', onCancel);
  }

  function answerAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const hit = el && el.closest('[data-mt-ans]');
    return hit && root.contains(hit) ? hit : null;
  }

  root.addEventListener('keydown', (e) => {
    if (picked == null) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      const i = picked; picked = null;
      announce(`${keys[i]} deselected.`);
      render(i);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && linkOf(keys[picked])) {
      e.preventDefault();
      const i = picked; picked = null;
      link(i, null);
      render(i);
    }
  });

  // Lines depend on layout, which only exists once the widget is in the page.
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => drawLines()).observe(root);
  else if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => drawLines());

  render(null);
  return root;
}
