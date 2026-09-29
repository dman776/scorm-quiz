// @ts-check
/**
 * Drag-and-drop question widget. Learners place items into drop zones, either
 * labeled boxes or regions drawn on a background image.
 *
 * Dragging is never the only way in (WCAG 2.2 SC 2.5.7): every item is a
 * button you can "pick up" with a click, tap, Space or Enter, then drop by
 * activating a zone (Escape cancels). Pointer Events drive the drag itself, so
 * mouse, touch and pen share one path and it works inside LMS iframes. Items
 * snap into zones: only which zone matters, never the pixel position.
 */

/**
 * @param {{
 *   q: any,
 *   items: any[],                        // items in display order
 *   getValue: () => any,                 // current { itemId: zoneId }
 *   onChange: (map: Record<string,string>) => void,
 *   announce: (msg: string) => void,
 *   h: (tag: string, attrs?: any, ...kids: any[]) => HTMLElement,
 * }} cfg
 */
export function renderDragDrop({ q, items, getValue, onChange, announce, h }) {
  const zones = q.zones || [];
  const zoneById = Object.fromEntries(zones.map((z) => [z.id, z]));
  const itemById = Object.fromEntries(items.map((it) => [it.id, it]));
  const hasImage = !!(q.image && q.image.src);
  const root = h('div', { class: 'sqb-dd' + (hasImage ? ' sqb-dd-has-image' : '') });
  /** Item currently picked up (click/keyboard mode or mid-drag). */
  let picked = null;
  /** Swallows the click that follows a completed drag. */
  let suppressClick = false;

  const placement = () => { const v = getValue(); return v && typeof v === 'object' ? v : {}; };
  const inZone = (zid) => items.filter((it) => placement()[it.id] === zid);
  const unplaced = () => items.filter((it) => !zoneById[placement()[it.id]]);
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  /** Place an item in a zone, or back in the bank (zoneId null). False if refused. */
  function move(itemId, zoneId) {
    const it = itemById[itemId];
    const m = { ...placement() };
    if (zoneId) {
      const z = zoneById[zoneId];
      if (m[itemId] === zoneId) return true;
      if (z.capacity && inZone(zoneId).length >= z.capacity) { announce(`${z.label} is full.`); return false; }
      m[itemId] = zoneId;
      announce(`${it.label} placed in ${z.label}. ${plural(items.length - unplacedAfter(m), 'item')} of ${items.length} placed.`);
    } else {
      if (!(itemId in m)) return true;
      delete m[itemId];
      announce(`${it.label} returned to the item bank.`);
    }
    onChange(m);
    return true;
  }
  const unplacedAfter = (m) => items.filter((it) => !zoneById[m[it.id]]).length;

  function pick(it) {
    picked = picked === it.id ? null : it.id;
    announce(picked ? `${it.label} picked up. Choose a drop zone, or press Escape to cancel.` : `${it.label} put down.`);
    render(it.id);
  }
  function dropPicked(zoneId) {
    if (!picked) { announce('Pick up an item first, then choose where to place it.'); return; }
    const id = picked;
    if (move(id, zoneId)) { picked = null; render(id); }
  }

  function itemButton(it) {
    const isPicked = picked === it.id;
    const where = zoneById[placement()[it.id]];
    const b = h('button', {
      type: 'button', class: 'sqb-dd-item' + (isPicked ? ' sqb-dd-picked' : ''), 'data-dd-item': it.id,
      'aria-pressed': isPicked ? 'true' : 'false',
      'aria-label': `${it.label}${where ? `, placed in ${where.label}` : ''}`,
      onclick: () => { if (suppressClick) return; pick(it); },
    }, it.label);
    b.addEventListener('pointerdown', (e) => startDrag(/** @type {PointerEvent} */ (e), it, b));
    return b;
  }

  function zoneEl(z) {
    const here = inZone(z.id);
    const full = !!z.capacity && here.length >= z.capacity;
    const count = z.capacity ? `${here.length} of ${z.capacity}` : plural(here.length, 'item');
    const action = picked ? `Place ${itemById[picked].label} here` : 'Pick up an item first';
    const target = h('button', {
      type: 'button', class: 'sqb-dd-drop', 'aria-label': `${z.label}, ${count}${full ? ', full' : ''}. ${action}.`,
      onclick: () => dropPicked(z.id),
    }, hasImage ? null : h('span', { class: 'sqb-dd-zone-name' }, z.label),
      hasImage ? null : h('span', { class: 'sqb-dd-count', 'aria-hidden': 'true' }, count));
    const style = hasImage && z.rect ? `left:${pct(z.rect.x)};top:${pct(z.rect.y)};width:${pct(z.rect.w)};height:${pct(z.rect.h)}` : null;
    return h('div', { class: 'sqb-dd-zone' + (full ? ' sqb-dd-full' : ''), 'data-dd-zone': z.id, style,
      title: hasImage ? z.label : null },
      target, h('div', { class: 'sqb-dd-chips' }, here.map(itemButton)));
  }

  function render(focusItemId) {
    const bankItems = unplaced();
    const pickedPlaced = picked && zoneById[placement()[picked]];
    const bank = h('div', { class: 'sqb-dd-bank', 'data-dd-bank': '', role: 'group', 'aria-label': 'Item bank' },
      h('div', { class: 'sqb-dd-bank-head' }, 'Items'),
      h('div', { class: 'sqb-dd-chips' }, bankItems.map(itemButton)),
      bankItems.length ? null : h('p', { class: 'sqb-dd-empty' }, 'All items placed.'),
      pickedPlaced ? h('button', { type: 'button', class: 'sqb-btn sqb-mini sqb-dd-return', onclick: () => {
        const id = picked; picked = null; move(id, null); render(id);
      } }, 'Return to item bank') : null);
    const zoneEls = zones.map(zoneEl);
    const area = hasImage
      ? h('div', { class: 'sqb-dd-figure' }, h('img', { class: 'sqb-dd-img', src: q.image.src, alt: q.image.alt || '' }), zoneEls)
      : h('div', { class: 'sqb-dd-zones' }, zoneEls);
    root.classList.toggle('sqb-dd-picking', !!picked);
    root.replaceChildren(bank, area, h('p', { class: 'sqb-dd-hint' },
      'Drag each item into a zone, or select an item and then select a zone. ' +
      'Keyboard: Space to pick up, Tab to a zone, Enter to place, Escape to cancel.'));
    if (focusItemId) {
      const el = /** @type {HTMLElement|null} */ (root.querySelector(`[data-dd-item="${cssEscape(focusItemId)}"]`));
      if (el) el.focus();
    }
  }

  function startDrag(e, it, btn) {
    if (e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY;
    // Keep the grab point under the pointer, so the box moves as if held there.
    const box = btn.getBoundingClientRect();
    const offX = sx - box.left, offY = sy - box.top;
    /** @type {HTMLElement|null} */ let ghost = null;
    /** @type {Element|null} */ let over = null;
    const setOver = (el) => {
      if (el === over) return;
      if (over) over.classList.remove('sqb-dd-over');
      over = el;
      if (over) over.classList.add('sqb-dd-over');
    };
    const onMove = (ev) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return; // still a click
        ghost = /** @type {HTMLElement} */ (btn.cloneNode(true));
        ghost.className = 'sqb-dd-item sqb-dd-ghost';
        ghost.removeAttribute('data-dd-item');
        ghost.setAttribute('aria-hidden', 'true');
        const cs = getComputedStyle(btn);
        Object.assign(ghost.style, { width: `${box.width}px`, height: `${box.height}px`,
          fontSize: cs.fontSize, padding: cs.padding });
        // A modal <dialog> (e.g. the authoring preview) sits in the browser's top
        // layer, above <body>; the ghost must live inside it to be visible.
        (root.closest('dialog') || document.body).append(ghost);
        document.documentElement.classList.add('sqb-dd-grabbing');
        btn.classList.add('sqb-dd-dragging');
        root.classList.add('sqb-dd-active');
        picked = null;
      }
      ghost.style.left = `${ev.clientX - offX}px`;
      ghost.style.top = `${ev.clientY - offY}px`;
      setOver(dropTargetAt(ev.clientX, ev.clientY));
    };
    const finish = (drop) => () => {
      btn.removeEventListener('pointermove', onMove);
      btn.removeEventListener('pointerup', onUp);
      btn.removeEventListener('pointercancel', onCancel);
      if (!ghost) return; // no movement: the click handler picks it up
      ghost.remove();
      document.documentElement.classList.remove('sqb-dd-grabbing');
      root.classList.remove('sqb-dd-active');
      const target = over;
      setOver(null);
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      if (drop && target) {
        const zid = target.getAttribute('data-dd-zone');
        move(it.id, zid || null);
      }
      render(it.id);
    };
    const onUp = finish(true);
    const onCancel = finish(false);
    try { btn.setPointerCapture(e.pointerId); } catch (_e) { /* synthetic events */ }
    btn.addEventListener('pointermove', onMove);
    btn.addEventListener('pointerup', onUp);
    btn.addEventListener('pointercancel', onCancel);
  }

  /** Zone or bank under the pointer (the ghost ignores pointer events). */
  function dropTargetAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const hit = el && el.closest('[data-dd-zone], [data-dd-bank]');
    return hit && root.contains(hit) ? hit : null;
  }

  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && picked) {
      e.preventDefault();
      const id = picked;
      picked = null;
      announce(`${itemById[id].label} put down.`);
      render(id);
    }
  });

  render(null);
  return root;
}

const pct = (n) => `${(n * 100).toFixed(4)}%`;
const cssEscape = (s) => String(s).replace(/["\\]/g, '\\$&');
