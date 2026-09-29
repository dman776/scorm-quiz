// @ts-check
/**
 * Drag-to-reorder for a vertical list, shared by the learner's sequence
 * question and the authoring question list.
 *
 * Pointer Events (mouse, pen, touch; works inside LMS iframes and <dialog>s).
 * While dragging, a copy of the row follows the pointer and the original row,
 * styled as a placeholder, slides into the slot it would drop into. Touch drags
 * start only from the grip handle so swiping the list still scrolls it; mouse
 * and pen can drag from anywhere on the row except its buttons and fields.
 * Dragging is never the only way: callers keep their Move up / Move down
 * buttons (WCAG 2.2 SC 2.5.7). Escape cancels a drag.
 *
 * Listeners are delegated to `list`, so callers may re-render its children.
 *
 * @param {HTMLElement} list
 * @param {{
 *   itemSelector: string,                  // direct children that can be dragged
 *   handleSelector: string,                // grip inside each item (required for touch)
 *   onReorder: (from: number, to: number) => void,
 *   scrollEl?: HTMLElement,                // scroll container to auto-scroll near its edges
 * }} opts
 */
export function makeSortable(list, { itemSelector, handleSelector, onReorder, scrollEl }) {
  const items = () => /** @type {HTMLElement[]} */ ([...list.children].filter((c) => c.matches(itemSelector)));
  let suppressClick = false;

  // Swallow the click a completed drag would otherwise fire on the row.
  list.addEventListener('click', (e) => {
    if (suppressClick) { e.stopPropagation(); e.preventDefault(); }
  }, true);

  list.addEventListener('pointerdown', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const row = /** @type {HTMLElement|null} */ (target.closest(itemSelector));
    if (!row || row.parentElement !== list || e.button !== 0) return;
    const onHandle = !!target.closest(handleSelector);
    if (!onHandle && target.closest('button, input, select, textarea, a, label')) return;
    if (e.pointerType === 'touch' && !onHandle) return; // let the finger scroll
    begin(e, row);
  });

  function begin(e, row) {
    const from = items().indexOf(row);
    const sx = e.clientX, sy = e.clientY;
    const box = row.getBoundingClientRect();
    const offX = sx - box.left, offY = sy - box.top;
    /** @type {HTMLElement|null} */ let ghost = null;
    let lastY = sy;
    let raf = 0;
    const next = row.nextSibling; // to restore on cancel

    const start = () => {
      ghost = /** @type {HTMLElement} */ (row.cloneNode(true));
      ghost.classList.add('sort-ghost');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
      // cloneNode copies the value attribute, not what was typed since render.
      const src = row.querySelectorAll('input, textarea, select');
      ghost.querySelectorAll('input, textarea, select').forEach((n, k) => { /** @type {any} */ (n).value = /** @type {any} */ (src[k]).value; });
      Object.assign(ghost.style, { width: `${box.width}px`, height: `${box.height}px` });
      // A modal <dialog> renders above <body>; keep the ghost inside it.
      (list.closest('dialog') || document.body).append(ghost);
      row.classList.add('sort-placeholder');
      document.documentElement.classList.add('sort-grabbing'); // also blocks text selection
      const sel = window.getSelection();
      if (sel) sel.removeAllRanges(); // drop any selection made before the drag threshold
      document.addEventListener('keydown', onKey, true);
      raf = requestAnimationFrame(autoScroll);
    };
    const place = (x, y) => {
      if (!ghost) return;
      ghost.style.left = `${x - offX}px`;
      ghost.style.top = `${y - offY}px`;
      // Slot = before the first other row whose middle is below the pointer.
      const others = items().filter((r) => r !== row);
      const before = others.find((r) => { const b = r.getBoundingClientRect(); return y < b.top + b.height / 2; });
      if (before) { if (row.nextElementSibling !== before) list.insertBefore(row, before); }
      else if (others.length && row !== others[others.length - 1].nextElementSibling) others[others.length - 1].after(row);
    };
    const autoScroll = () => {
      if (!ghost) return;
      if (scrollEl) {
        const b = scrollEl.getBoundingClientRect();
        const edge = 40;
        const dy = lastY < b.top + edge ? -10 : lastY > b.bottom - edge ? 10 : 0;
        if (dy) { scrollEl.scrollTop += dy; place(lastX, lastY); }
      }
      raf = requestAnimationFrame(autoScroll);
    };
    let lastX = sx;
    const onMove = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      lastX = ev.clientX; lastY = ev.clientY;
      if (!ghost) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return; // still a click
        start();
      }
      ev.preventDefault();
      place(ev.clientX, ev.clientY);
    };
    const end = (commit) => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
      document.removeEventListener('keydown', onKey, true);
      if (!ghost) return;
      cancelAnimationFrame(raf);
      ghost.remove();
      ghost = null;
      row.classList.remove('sort-placeholder');
      document.documentElement.classList.remove('sort-grabbing');
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      const to = items().indexOf(row);
      if (!commit || to === from) {
        list.insertBefore(row, next && next.parentNode === list ? next : null);
        if (!commit) return;
      }
      if (commit && to !== from) onReorder(from, to);
    };
    const onUp = (ev) => { if (ev.pointerId === e.pointerId) end(true); };
    const onCancel = (ev) => { if (ev.pointerId === e.pointerId) end(false); };
    const onKey = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); end(false); } };

    // Listen on the document, not the row: the row is moved in the DOM as it
    // slides between slots, and moving an element drops its pointer capture.
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
  }
}

/** Move one element of `arr` from index `from` to index `to` (returns a new array). */
export function moveIndex(arr, from, to) {
  const out = arr.slice();
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}
