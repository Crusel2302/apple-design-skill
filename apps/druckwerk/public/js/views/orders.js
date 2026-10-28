import { h, icon, fmt, pageBar, button, field, formSheet, searchField, segmented, toast, emptyState, localDateTime, go, readForm, rerender } from '../ui.js';
import { state, save, remove, byId, customerName, ORDER_STATUS, orderEnd, printerColor, round2 } from '../store.js';
import { orderBadge } from './components.js';

const view = { query: '', filter: 'active' };
const FILTERS = [['active', 'Aktiv'], ['planned', 'Geplant'], ['finished', 'Erledigt'], ['all', 'Alle']];

export default function orders() {
  const listHost = h('div');
  const draw = () => listHost.replaceChildren(table());
  draw();
  return h('div', { class: 'page' },
    pageBar({
      title: 'Aufträge',
      subtitle: `${state.orders.filter((o) => o.status === 'printing').length} im Druck · ${state.orders.filter((o) => o.status === 'planned').length} geplant`,
      actions: [
        searchField('Aufträge durchsuchen', view.query, (q) => { view.query = q; draw(); }),
        segmented(FILTERS, view.filter, (f) => { view.filter = f; rerender(); }, 'Filter'),
        button('Neuer Auftrag', { primary: true, icon: 'plus', onClick: () => openOrderSheet() }),
      ],
    }),
    listHost);
}

function table() {
  const q = view.query.toLowerCase();
  const rows = state.orders
    .filter((o) => ({
      active: ['planned', 'printing'].includes(o.status),
      planned: o.status === 'planned',
      finished: ['done', 'delivered'].includes(o.status),
      all: true,
    })[view.filter])
    .filter((o) => !q || [o.title, customerName(byId('customers', o.customerId)), byId('printers', o.printerId)?.name, byId('designs', o.designId)?.name].join(' ').toLowerCase().includes(q))
    .sort((a, b) => (view.filter === 'finished' ? new Date(b.start) - new Date(a.start) : new Date(a.start) - new Date(b.start)));

  if (!rows.length) {
    return h('div', { class: 'card' }, emptyState({
      icon: 'orders', title: q ? 'Keine Treffer' : 'Keine Aufträge',
      text: q ? `Nichts passt zu „${view.query}“.` : 'Lege einen Auftrag an, um ihn im Kalender zu planen und später abzurechnen.',
      action: q ? null : button('Neuer Auftrag', { primary: true, icon: 'plus', onClick: () => openOrderSheet() }),
    }));
  }
  return h('div', { class: 'card flush' }, h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
    h('thead', {}, h('tr', {},
      h('th', {}, 'Auftrag'), h('th', {}, 'Kunde'), h('th', { class: 'hide-s' }, 'Drucker'),
      h('th', {}, 'Start'), h('th', { class: 'hide-s' }, 'Dauer'), h('th', {}, 'Status'), h('th', { class: 'num' }, 'Preis'))),
    h('tbody', {}, rows.map((o) => {
      const p = byId('printers', o.printerId);
      return h('tr', { onclick: () => openOrderSheet(o), tabindex: 0, onkeydown: (e) => { if (e.key === 'Enter') openOrderSheet(o); } },
        h('td', {}, h('div', { style: { fontWeight: 500 } }, o.title), o.quantity > 1 ? h('div', { class: 'muted small' }, `${o.quantity} Stück`) : null),
        h('td', {}, customerName(byId('customers', o.customerId))),
        h('td', { class: 'hide-s' }, p ? h('span', { class: 'row', style: { gap: '6px' } }, h('span', { class: 'cat-dot', style: { background: printerColor(p) } }), p.name) : '–'),
        h('td', { class: 'nowrap' }, `${fmt.relDay(o.start)}, ${fmt.time(o.start)}`),
        h('td', { class: 'hide-s nowrap' }, fmt.duration(o.durationMin)),
        h('td', {}, orderBadge(o), o.invoiceId ? h('span', { class: 'muted small', style: { marginLeft: '6px' }, title: 'Abgerechnet' }, icon('invoice')) : null),
        h('td', { class: 'num' }, o.price ? fmt.money(o.price) : '–'));
    })))));
}

export function overlaps(o) {
  if (!o.printerId || !o.start || ['done', 'delivered', 'cancelled'].includes(o.status)) return [];
  const s = new Date(o.start).getTime(), e = orderEnd(o).getTime();
  return state.orders.filter((x) => x.id !== o.id && x.printerId === o.printerId && ['planned', 'printing'].includes(x.status)
    && new Date(x.start).getTime() < e && orderEnd(x).getTime() > s);
}

// Nächster freier Termin auf einem Drucker, ab jetzt auf die Viertelstunde gerundet
function nextFreeSlot(printerId, durationMin) {
  let t = new Date();
  t.setMinutes(Math.ceil(t.getMinutes() / 15) * 15, 0, 0);
  const busy = state.orders.filter((x) => x.printerId === printerId && ['planned', 'printing'].includes(x.status))
    .map((x) => [new Date(x.start).getTime(), orderEnd(x).getTime()]).sort((a, b) => a[0] - b[0]);
  let start = t.getTime();
  for (const [s, e] of busy) {
    if (start + durationMin * 60000 <= s) break;
    if (e > start) start = e;
  }
  return new Date(start);
}

export function openOrderSheet(order, defaults = {}) {
  const o = order ?? {
    title: '', status: 'planned', quantity: 1, durationMin: 60, start: localDateTime(nextFreeSlot(defaults.printerId || state.printers[0]?.id, 60)),
    printerId: state.printers[0]?.id ?? '', ...defaults,
  };
  const opt = (list, label, empty = '– keine Auswahl –') => [['', empty], ...list.map((x) => [x.id, label(x)])];
  const conflictHost = h('div');
  const formRef = {};

  const recalc = (source) => {
    const f = readForm(formRef.form);
    const d = byId('designs', f.designId);
    const qty = Math.max(1, Number(f.quantity) || 1);
    const set = (name, v) => { const el = formRef.form.elements[name]; if (el) el.value = v; };
    if (d && (source === 'designId' || source === 'quantity')) {
      if (d.printMinutes) set('durationMin', Math.round(d.printMinutes * qty));
      if (d.weight) set('grams', Math.round(d.weight * qty));
      if (d.price) set('price', round2(d.price * qty));
      // Titel folgt Design und Menge, solange er nicht von Hand geändert wurde
      if (!f.title || f.title === formRef.autoTitle || source === 'designId') {
        formRef.autoTitle = qty > 1 ? `${d.name} × ${qty}` : d.name;
        set('title', formRef.autoTitle);
      }
      if (source === 'designId' && d.material) {
        const spool = state.spools.filter((s) => s.material === d.material).sort((a, b) => b.remaining - a.remaining)[0];
        if (spool) set('spoolId', spool.id);
      }
    }
    const c = overlaps({ ...o, ...readForm(formRef.form), start: formRef.form.elements.start.value });
    conflictHost.replaceChildren(c.length
      ? h('p', { class: 'small row', style: { color: 'var(--red)' } }, icon('warning'), `Überschneidet sich mit „${c[0].title}“ (${fmt.time(c[0].start)}–${fmt.time(orderEnd(c[0]))}).`)
      : h('p', { class: 'small muted row' }, icon('clock'), `Ende: ${fmt.dateTime(orderEnd({ start: formRef.form.elements.start.value, durationMin: readForm(formRef.form).durationMin }))}`));
  };
  const watch = (name) => () => recalc(name);

  const fields = [
    h('fieldset', { class: 'fieldset' },
      field({ label: 'Titel', name: 'title', value: o.title, required: true, span: 'all', placeholder: 'z. B. Ersatzteile Serie A' }),
      field({ label: 'Kunde', name: 'customerId', type: 'select', value: o.customerId, options: opt(state.customers, customerName, 'Ohne Kunde (intern)') }),
      field({ label: 'Design', name: 'designId', type: 'select', value: o.designId, options: opt(state.designs, (d) => d.name), onChange: watch('designId') }),
      field({ label: 'Menge', name: 'quantity', type: 'number', value: o.quantity ?? 1, min: 1, step: 1, onInput: watch('quantity') }),
      field({ label: 'Preis (netto)', name: 'price', type: 'number', value: o.price ?? '', unit: '€', step: '0.01' })),
    h('fieldset', { class: 'fieldset' }, h('legend', {}, 'Planung'),
      field({ label: 'Drucker', name: 'printerId', type: 'select', value: o.printerId, options: opt(state.printers, (p) => p.name), onChange: watch('printerId') }),
      field({ label: 'Start', name: 'start', type: 'datetime-local', value: o.start ? localDateTime(o.start) : '', required: true, onInput: watch('start') }),
      field({ label: 'Druckdauer', name: 'durationMin', type: 'number', value: o.durationMin, unit: 'min', min: 1, step: 1, onInput: watch('durationMin') }),
      field({ label: 'Status', name: 'status', type: 'select', value: o.status, options: Object.entries(ORDER_STATUS).map(([k, v]) => [k, v.label]) }),
      h('div', { class: 'field span-all' }, conflictHost)),
    h('fieldset', { class: 'fieldset' }, h('legend', {}, 'Material'),
      field({ label: 'Filamentspule', name: 'spoolId', type: 'select', value: o.spoolId, options: opt(state.spools, (s) => `${s.material} ${s.colorName} (${s.brand}) · ${fmt.grams(s.remaining)}`) }),
      field({ label: 'Verbrauch gesamt', name: 'grams', type: 'number', value: o.grams ?? (byId('designs', o.designId)?.weight ?? 0) * (o.quantity || 1), unit: 'g', hint: 'Wird beim Status „Gedruckt“ von der Spule abgebucht.' }),
      field({ label: 'Notizen', name: 'notes', type: 'textarea', value: o.notes, span: 'all' })),
  ];

  const extra = order ? h('div', { class: 'row wrap' },
    order.status === 'planned' ? button('Druck jetzt starten', { icon: 'play', onClick: async () => { await save('orders', { ...order, status: 'printing', start: new Date().toISOString() }); s.close(); toast('Druck gestartet'); } }) : null,
    order.status === 'printing' ? button('Als gedruckt melden', { icon: 'check', onClick: async () => { await finishOrder({ ...order, ...readForm(formRef.form), start: order.start }); s.close(); } }) : null,
    button('Kosten berechnen', { icon: 'calculator', onClick: () => { s.close(); go(`calculator?order=${order.id}`); } }),
    !order.invoiceId && order.customerId && ['done', 'delivered', 'printing'].includes(order.status)
      ? button('Rechnung erstellen', { icon: 'invoice', onClick: () => { s.close(); go(`invoices?fromOrder=${order.id}`); } }) : null,
    order.invoiceId ? button('Zur Rechnung', { plain: true, icon: 'invoice', onClick: () => { s.close(); go('invoices/' + order.invoiceId); } }) : null,
  ) : null;

  const s = formSheet({
    title: order ? 'Auftrag bearbeiten' : 'Neuer Auftrag',
    fields, extra, size: 'wide',
    submitLabel: order ? 'Sichern' : 'Anlegen',
    onDelete: order ? async () => { await remove('orders', order.id); toast('Auftrag gelöscht'); } : null,
    onSubmit: async (f) => {
      const next = { ...o, ...f, start: new Date(f.start).toISOString() };
      if (!next.title) throw new Error('Bitte einen Titel eingeben.');
      if (next.status === 'done' && o.status !== 'done' && o.status !== 'delivered') return finishOrder(next);
      await save('orders', next);
      toast(order ? 'Auftrag gesichert' : 'Auftrag angelegt');
    },
  });
  formRef.form = s.panel.querySelector('form');
  recalc();
  return s;
}

// Fertigmelden bucht den Filamentverbrauch einmalig von der Spule ab
export async function finishOrder(o) {
  const next = { ...o, status: o.status === 'delivered' ? 'delivered' : 'done' };
  const spool = byId('spools', o.spoolId);
  const grams = Number(o.grams) || 0;
  if (spool && grams > 0 && !o.filamentBooked) {
    await save('spools', { ...spool, remaining: Math.max(0, Math.round(Number(spool.remaining) - grams)) });
    next.filamentBooked = true;
    toast(`${fmt.grams(grams)} von „${spool.material} ${spool.colorName}“ abgebucht`);
  } else {
    toast('Auftrag als gedruckt gemeldet');
  }
  await save('orders', next);
}
