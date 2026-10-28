import { h, icon, fmt, pageBar, button, iconButton, segmented, toast, rerender } from '../ui.js';
import { state, save, byId, customerName, orderEnd, printerColor } from '../store.js';
import { openOrderSheet, overlaps } from './orders.js';

const DAY = 864e5;
const view = { mode: 'timeline', days: 3, cursor: startOfDay(new Date()) };

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function startOfWeek(d) { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
const visible = () => state.orders.filter((o) => o.status !== 'cancelled');

export default function calendar() {
  const isMonth = view.mode === 'month';
  const title = isMonth
    ? view.cursor.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
    : rangeTitle(rangeStart(), view.days);
  const shift = (dir) => {
    const c = new Date(view.cursor);
    if (isMonth) c.setMonth(c.getMonth() + dir, 1); else c.setDate(c.getDate() + view.days * dir);
    view.cursor = c;
    rerender();
  };

  return h('div', { class: 'page' },
    pageBar({
      title,
      subtitle: isMonth ? 'Aufträge per Drag-and-drop auf einen anderen Tag ziehen' : 'Balken ziehen zum Verschieben, auch auf einen anderen Drucker',
      actions: [
        isMonth ? null : segmented([[1, 'Tag'], [3, '3 Tage'], [7, 'Woche']], view.days, (d) => { view.days = d; rerender(); }, 'Zeitraum'),
        segmented([['timeline', 'Drucker'], ['month', 'Monat']], view.mode, (m) => { view.mode = m; rerender(); }, 'Ansicht'),
        h('div', { class: 'row', style: { gap: '2px' } },
          iconButton('chevronLeft', isMonth ? 'Vorheriger Monat' : 'Zurück', () => shift(-1)),
          button('Heute', { onClick: () => { view.cursor = startOfDay(new Date()); rerender(); } }),
          iconButton('chevron', isMonth ? 'Nächster Monat' : 'Weiter', () => shift(1))),
        button('Neuer Auftrag', { primary: true, icon: 'plus', onClick: () => openOrderSheet() }),
      ],
    }),
    isMonth ? month() : timeline(),
    h('div', { class: 'legend', style: { marginTop: '14px' } }, state.printers.map((p) => h('span', {}, h('span', { class: 'cat-dot', style: { background: printerColor(p) } }), p.name))));
}

// Woche beginnt am Montag, kürzere Zeiträume am gewählten Tag
function rangeStart() {
  return view.days === 7 ? startOfWeek(view.cursor) : startOfDay(view.cursor);
}
function rangeTitle(ws, days) {
  if (days === 1) return ws.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  const we = new Date(ws.getTime() + (days - 1) * DAY);
  const range = `${ws.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })} – ${we.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  return days === 7 ? `KW ${isoWeek(ws)} · ${range}` : range;
}
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / DAY + 1) / 7);
}

// ---------- Monat ----------
function month() {
  const first = new Date(view.cursor.getFullYear(), view.cursor.getMonth(), 1);
  const start = startOfWeek(first);
  const today = startOfDay(new Date()).getTime();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (i >= 35 && d.getMonth() !== first.getMonth()) break;
    const events = visible().filter((o) => startOfDay(o.start).getTime() === d.getTime()).sort((a, b) => new Date(a.start) - new Date(b.start));
    const max = 3;
    const cell = h('div', {
      class: ['cal-day', d.getMonth() !== first.getMonth() && 'other', d.getTime() === today && 'today'],
      ondblclick: (e) => { if (e.target === cell) openOrderSheet(null, { start: at(d, 9) }); },
      ondragover: (e) => { e.preventDefault(); cell.classList.add('drop'); },
      ondragleave: () => cell.classList.remove('drop'),
      ondrop: async (e) => {
        e.preventDefault();
        cell.classList.remove('drop');
        const o = byId('orders', e.dataTransfer.getData('text/plain'));
        if (!o) return;
        const old = new Date(o.start);
        const next = new Date(d); next.setHours(old.getHours(), old.getMinutes());
        await move(o, { start: next.toISOString() });
      },
    },
      h('span', { class: 'cal-num', 'aria-label': fmt.dateLong(d) }, d.getDate()),
      events.slice(0, max).map((o) => {
        const p = byId('printers', o.printerId);
        return h('button', {
          type: 'button', class: 'cal-event', draggable: 'true', style: { '--c': printerColor(p) },
          title: `${fmt.time(o.start)} ${o.title} · ${p?.name ?? 'kein Drucker'}`,
          ondragstart: (e) => e.dataTransfer.setData('text/plain', o.id),
          onclick: () => openOrderSheet(o),
        }, h('span', {}, `${fmt.time(o.start)} ${o.title}`));
      }),
      events.length > max ? h('button', { type: 'button', class: 'cal-more btn-plain', style: { border: 0, background: 'none', textAlign: 'left', cursor: 'pointer' }, onclick: () => { view.mode = 'timeline'; view.cursor = d; rerender(); } }, `+ ${events.length - max} weitere`) : null);
    cells.push(cell);
  }
  return h('div', { class: 'cal-month' }, ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((t) => h('div', { class: 'cal-dow' }, t)), cells);
}

function at(d, hour) { const x = new Date(d); x.setHours(hour, 0, 0, 0); return x.toISOString(); }

async function move(o, patch) {
  const next = { ...o, ...patch };
  await save('orders', next);
  const c = overlaps(next);
  if (c.length) toast(`Achtung: überschneidet sich mit „${c[0].title}“`, 'error');
  else toast(`Verschoben auf ${fmt.dateTime(next.start)}`);
}

// ---------- Drucker-Zeitplan (Woche) ----------
function timeline() {
  const ws = rangeStart();
  const span = view.days * DAY;
  // Spalten: Tage, in der Tagesansicht Zwei-Stunden-Blöcke
  const cols = view.days === 1 ? 12 : view.days;
  const lanes = [...state.printers.map((p) => ({ id: p.id, name: p.name, printer: p }))];
  if (visible().some((o) => !o.printerId)) lanes.push({ id: '', name: 'Ohne Drucker', printer: null });
  if (!lanes.length) return h('div', { class: 'card' }, h('p', { class: 'muted' }, 'Lege zuerst einen Drucker an, um Aufträge zu planen.'));
  const today = startOfDay(new Date()).getTime();
  const nowPct = ((Date.now() - ws.getTime()) / span) * 100;

  const grid = h('div', { class: 'gantt-grid' },
    h('div', { class: 'gantt-label', style: { minHeight: 'auto' } }, h('span', { class: 'muted small' }, 'Drucker')),
    h('div', { class: 'gantt-days', style: { gridTemplateColumns: `repeat(${cols}, 1fr)` } }, Array.from({ length: cols }, (_, i) => {
      if (view.days === 1) return h('div', {}, `${String(i * 2).padStart(2, '0')}:00`);
      const d = new Date(ws.getTime() + i * DAY);
      return h('div', { class: d.getTime() === today ? 'today' : '' }, d.toLocaleDateString('de-DE', { weekday: view.days === 7 ? 'short' : 'long', day: 'numeric', month: 'numeric' }));
    })));

  for (const lane of lanes) {
    const laneEl = h('div', { class: 'gantt-lane', dataset: { lane: lane.id }, style: { backgroundSize: `calc(100% / ${cols}) 100%` } });
    laneEl.addEventListener('dblclick', (e) => {
      if (e.target !== laneEl) return;
      const r = laneEl.getBoundingClientRect();
      const t = ws.getTime() + ((e.clientX - r.left) / r.width) * span;
      const d = new Date(Math.round(t / 9e5) * 9e5);
      openOrderSheet(null, { printerId: lane.id, start: d.toISOString() });
    });
    if (nowPct >= 0 && nowPct <= 100) laneEl.append(h('div', { class: 'gantt-now', style: { left: `${nowPct}%` }, 'aria-hidden': 'true' }));
    const items = visible().filter((o) => (o.printerId || '') === lane.id);
    for (const o of items) {
      const s = new Date(o.start).getTime(), e = orderEnd(o).getTime();
      if (e < ws.getTime() || s > ws.getTime() + span) continue;
      const left = Math.max(0, (s - ws.getTime()) / span) * 100;
      const right = Math.min(1, (e - ws.getTime()) / span) * 100;
      const bar = h('button', {
        type: 'button', class: ['gantt-bar', overlaps(o).length && 'conflict'],
        style: { left: `${left}%`, width: `calc(${Math.max(right - left, 0.6)}% - 2px)`, '--c': printerColor(lane.printer) },
        'aria-label': `${o.title}, ${fmt.dateTime(o.start)} bis ${fmt.time(orderEnd(o))}${overlaps(o).length ? ', Überschneidung' : ''}`,
        title: `${o.title}\n${fmt.dateTime(o.start)} – ${fmt.dateTime(orderEnd(o))}\n${customerName(byId('customers', o.customerId))}`,
      },
        h('strong', {}, o.title),
        h('span', {}, `${fmt.time(o.start)}–${fmt.time(orderEnd(o))} · ${customerName(byId('customers', o.customerId))}`));
      dragBar(bar, o, ws, span);
      laneEl.append(bar);
    }
    grid.append(h('div', { class: 'gantt-label' }, h('span', { class: 'cat-dot', style: { background: printerColor(lane.printer) } }), lane.name), laneEl);
  }
  return h('div', { class: 'gantt' }, h('div', { class: 'gantt-scroll' }, grid));
}

// Ziehen: waagerecht in Viertelstunden, senkrecht auf einen anderen Drucker
function dragBar(bar, o, ws, span) {
  let start = null;
  bar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY, left: bar.offsetLeft, laneW: bar.parentElement.getBoundingClientRect().width, moved: false };
    bar.setPointerCapture(e.pointerId);
  });
  bar.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < 4) return;
    start.moved = true;
    bar.classList.add('dragging');
    bar.style.transform = `translate(${dx}px, ${dy}px)`;
    document.querySelectorAll('.gantt-lane.drop').forEach((l) => l.classList.remove('drop'));
    laneAt(e.clientX, e.clientY, bar)?.classList.add('drop');
  });
  const end = async (e) => {
    if (!start) return;
    const s = start; start = null;
    bar.classList.remove('dragging');
    document.querySelectorAll('.gantt-lane.drop').forEach((l) => l.classList.remove('drop'));
    if (!s.moved) { openOrderSheet(o); return; }
    const dx = e.clientX - s.x;
    const deltaMs = Math.round(((dx / s.laneW) * span) / 9e5) * 9e5;
    const lane = laneAt(e.clientX, e.clientY, bar);
    bar.style.transform = '';
    const patch = { start: new Date(new Date(o.start).getTime() + deltaMs).toISOString() };
    if (lane && lane.dataset.lane && lane.dataset.lane !== o.printerId) patch.printerId = lane.dataset.lane;
    if (deltaMs || patch.printerId) await move(o, patch);
  };
  bar.addEventListener('pointerup', end);
  bar.addEventListener('pointercancel', () => { start = null; bar.classList.remove('dragging'); bar.style.transform = ''; });
  bar.addEventListener('keydown', async (e) => {
    // Tastatur: Pfeil links/rechts verschiebt um 15 Minuten, mit Umschalt um eine Stunde
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const step = (e.shiftKey ? 60 : 15) * 60000 * (e.key === 'ArrowLeft' ? -1 : 1);
    await move(o, { start: new Date(new Date(o.start).getTime() + step).toISOString() });
  });
}

function laneAt(x, y, bar) {
  bar.style.pointerEvents = 'none';
  const el = document.elementFromPoint(x, y)?.closest('.gantt-lane');
  bar.style.pointerEvents = '';
  return el;
}
