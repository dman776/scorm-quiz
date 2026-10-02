// @ts-check
/**
 * Drag-and-drop question widget. Learners place items into drop zones, either
 * labeled boxes or regions drawn on a background image.
 *
 * Dragging is never the only way in (WCAG 2.2 SC 2.5.7): every item is a
 * button you can "pick up" with a click, tap, Space or Enter, then drop by
 * activating a zone (Escape cancels). Pointer Events drive the drag itself, so
 * mouse, touch and pen share one path and it works inside LMS iframes. Items
 * snap into zones: only which zone matters, never the pixel position. With
 * `q.reuseItems`, the bank keeps every item and each zone gets its own copy.
 */

/**
 * @param {{
 *   q: any,
 *   items: any[],                        // items in display order
 *   getValue: () => any,                 // current { itemId: zoneId } ({ itemId: zoneId[] } when reusing items)
 *   onChange: (map: Record<string, string|string[]>) => void,
 *   announce: (msg: string) => void,
 *   h: (tag: string, attrs?: any, ...kids: any[]) => HTMLElement,
 * }} cfg
 */
export function renderDragDrop({ q, items, getValue, onChange, announce, h }) {
  const zones = q.zones || [];
  const zoneById = Object.fromEntries(zones.map((z) => [z.id, z]));
  const itemById = Object.fromEntries(items.map((it) => [it.id, it]));
  const hasImage = !!(q.image && q.image.src);
  /** Items stay in the bank and can be placed in several zones (one copy per zone). */
  const reuse = !!q.reuseItems;
  const root = h('div', { class: 'sqb-dd' + (hasImage ? ' sqb-dd-has-image' : '') });
  /**
   * Item currently picked up (click/keyboard mode or mid-drag), and the zone
   * it was picked from (null = the bank).
   * @type {{ id: string, from: string|null } | null}
   */
  let picked = null;
  /** Swallows the click that follows a completed drag. */
  let suppressClick = false;

  const value = () => { const v = getValue(); return v && typeof v === 'object' ? v : {}; };
  /** Zones an item is placed in (at most one unless items are reused). */
  const zonesOf = (id, m = value()) => {
    const v = m[id];
    return [...new Set(Array.isArray(v) ? v : [v])].filter((zid) => zoneById[zid]);
  };
  const inZone = (zid) => items.filter((it) => zonesOf(it.id).includes(zid));
  const bankItems = () => (reuse ? items : items.filter((it) => !zonesOf(it.id).length));
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const isPicked = (id, from) => !!picked && picked.id === id && picked.from === from;

  /**
   * Move an item from one zone (or the bank, null) to another (or the bank).
   * False if refused (zone full, or the item is already there).
   */
  function move(itemId, from, to) {
    const it = itemById[itemId];
    const cur = zonesOf(itemId);
    if (to === from || (!to && !cur.includes(from))) return true;
    if (to) {
      const z = zoneById[to];
      if (cur.includes(to)) { announce(`${it.label} is already in ${z.label}.`); return false; }
      if (z.capacity && inZone(to).length >= z.capacity) { announce(`${z.label} is full.`); return false; }
    }
    const next = cur.filter((zid) => zid !== from);
    if (to) next.push(to);
    const m = { ...value() };
    if (!next.length) delete m[itemId];
    else m[itemId] = reuse ? next : next[0];
    if (!to) announce(reuse ? `${it.label} removed from ${zoneById[from].label}.` : `${it.label} returned to the item bank.`);
    else if (reuse) announce(`${it.label} placed in ${zoneById[to].label}.`);
    else announce(`${it.label} placed in ${zoneById[to].label}. ${plural(items.filter((x) => zonesOf(x.id, m).length).length, 'item')} of ${items.length} placed.`);
    onChange(m);
    return true;
  }

  function pick(it, from) {
    picked = isPicked(it.id, from) ? null : { id: it.id, from };
    announce(picked ? `${it.label} picked up. Choose a drop zone, or press Escape to cancel.` : `${it.label} put down.`);
    render({ id: it.id, from });
  }
  function dropPicked(zoneId) {
    if (!picked) { announce('Pick up an item first, then choose where to place it.'); return; }
    const { id, from } = picked;
    if (move(id, from, zoneId)) { picked = null; render({ id, from: zoneId }); }
  }

  /** An item's button: in the bank (from = null) or placed in zone `from`. */
  function itemButton(it, from) {
    const where = from ? [from] : reuse ? zonesOf(it.id) : [];
    const b = h('button', {
      type: 'button', class: 'sqb-dd-item' + (isPicked(it.id, from) ? ' sqb-dd-picked' : ''),
      'data-dd-item': it.id, 'data-dd-from': from || '',
      'aria-pressed': isPicked(it.id, from) ? 'true' : 'false',
      'aria-label': `${it.label}${where.length ? `, placed in ${where.map((zid) => zoneById[zid].label).join(' and ')}` : ''}`,
      onclick: () => { if (suppressClick) return; pick(it, from); },
    }, it.label);
    b.addEventListener('pointerdown', (e) => startDrag(/** @type {PointerEvent} */ (e), it, b, from));
    return b;
  }

  function zoneEl(z) {
    const here = inZone(z.id);
    const full = !!z.capacity && here.length >= z.capacity;
    const count = z.capacity ? `${here.length} of ${z.capacity}` : plural(here.length, 'item');
    const action = picked ? `Place ${itemById[picked.id].label} here` : 'Pick up an item first';
    const target = h('button', {
      type: 'button', class: 'sqb-dd-drop', 'aria-label': `${z.label}, ${count}${full ? ', full' : ''}. ${action}.`,
      onclick: () => dropPicked(z.id),
    }, hasImage ? null : h('span', { class: 'sqb-dd-zone-name' }, z.label),
      hasImage ? null : h('span', { class: 'sqb-dd-count', 'aria-hidden': 'true' }, count));
    const style = hasImage && z.rect ? `left:${pct(z.rect.x)};top:${pct(z.rect.y)};width:${pct(z.rect.w)};height:${pct(z.rect.h)}` : null;
    return h('div', { class: 'sqb-dd-zone' + (full ? ' sqb-dd-full' : ''), 'data-dd-zone': z.id, style,
      title: hasImage ? z.label : null },
      target, h('div', { class: 'sqb-dd-chips' }, here.map((it) => itemButton(it, z.id))));
  }

  /** Re-render, then focus the given item button (where it now is). */
  function render(focus) {
    const inBank = bankItems();
    const bank = h('div', { class: 'sqb-dd-bank', 'data-dd-bank': '', role: 'group', 'aria-label': 'Item bank' },
      h('div', { class: 'sqb-dd-bank-head' }, 'Items'),
      h('div', { class: 'sqb-dd-chips' }, inBank.map((it) => itemButton(it, null))),
      inBank.length ? null : h('p', { class: 'sqb-dd-empty' }, 'All items placed.'),
      picked && picked.from ? h('button', { type: 'button', class: 'sqb-btn sqb-mini sqb-dd-return', onclick: () => {
        const { id, from } = picked; picked = null; move(id, from, null); render({ id, from: null });
      } }, reuse ? `Remove from ${zoneById[picked.from].label}` : 'Return to item bank') : null);
    const zoneEls = zones.map(zoneEl);
    const area = hasImage
      ? h('div', { class: 'sqb-dd-figure' }, h('img', { class: 'sqb-dd-img', src: q.image.src, alt: q.image.alt || '' }), zoneEls)
      : h('div', { class: 'sqb-dd-zones' }, zoneEls);
    root.classList.toggle('sqb-dd-picking', !!picked);
    root.replaceChildren(bank, area, h('p', { class: 'sqb-dd-hint' },
      (reuse ? 'Items can go in more than one zone. ' : '') +
      'Drag each item into a zone, or select an item and then select a zone. ' +
      'Keyboard: Space to pick up, Tab to a zone, Enter to place, Escape to cancel.'));
    if (focus) {
      const sel = `[data-dd-item="${cssEscape(focus.id)}"]`;
      const el = /** @type {HTMLElement|null} */ (root.querySelector(`${sel}[data-dd-from="${cssEscape(focus.from || '')}"]`) || root.querySelector(sel));
      if (el) el.focus();
    }
  }

  function startDrag(e, it, btn, from) {
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
        ghost.removeAttribute('data-dd-from');
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
      let at = from;
      if (drop && target) {
        const zid = target.getAttribute('data-dd-zone') || null;
        if (move(it.id, from, zid)) at = zid;
      }
      render({ id: it.id, from: at });
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
      const was = picked;
      picked = null;
      announce(`${itemById[was.id].label} put down.`);
      render(was);
    }
  });

  render(null);
  return root;
}

const pct = (n) => `${(n * 100).toFixed(4)}%`;
const cssEscape = (s) => String(s).replace(/["\\]/g, '\\$&');
