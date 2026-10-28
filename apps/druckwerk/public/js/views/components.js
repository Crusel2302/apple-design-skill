// Gemeinsame Bausteine mehrerer Ansichten.
import { h, icon, badge, fmt } from '../ui.js';
import { state, printerStatus, nextOrderFor, byId, ORDER_STATUS, customerName, printerColor } from '../store.js';

export function printerCard(p, { onOpen } = {}) {
  const s = printerStatus(p);
  const running = s.state === 'printing' || s.state === 'paused' || s.state === 'preparing';
  const next = nextOrderFor(p.id);
  const eta = running && s.remainingMin != null ? new Date(Date.now() + s.remainingMin * 60000) : null;

  const meta = [];
  if (s.isLive) {
    meta.push(['Düse', s.nozzle != null ? `${Math.round(s.nozzle)} °C` : '–']);
    meta.push(['Bett', s.bed != null ? `${Math.round(s.bed)} °C` : '–']);
    meta.push(s.totalLayers ? ['Schicht', `${s.layer ?? 0} / ${s.totalLayers}`] : ['Kammer', s.chamber != null ? `${Math.round(s.chamber)} °C` : '–']);
  } else {
    meta.push(['Düse', p.nozzle ? `${fmt.num(p.nozzle)} mm` : '–']);
    meta.push(['Leistung', p.powerW ? `${p.powerW} W` : '–']);
    meta.push(['Heute', `${state.orders.filter((o) => o.printerId === p.id && new Date(o.start).toDateString() === new Date().toDateString()).length} Auftr.`]);
  }

  return h('button', { type: 'button', class: 'card interactive printer-card', onclick: () => onOpen?.(p), 'aria-label': `${p.name}, ${s.label}` },
    h('div', { class: 'printer-head' },
      h('div', { class: 'printer-glyph', style: { color: printerColor(p) } }, icon('printer')),
      h('div', { style: { flex: 1, minWidth: 0 } },
        h('div', { class: 'card-title' }, p.name),
        h('div', { class: 'muted small' }, [p.brand, p.model].filter(Boolean).join(' '), p.source === 'bambu' ? ' · Bambu Cloud' : '')),
      badge(s.label, s.tone, s.icon)),
    running
      ? h('div', { class: 'stack', style: { gap: '8px' } },
          h('div', { class: 'row', style: { justifyContent: 'space-between' } },
            h('span', { class: 'small', style: { fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, s.file || 'Druckauftrag'),
            h('span', { class: 'small tabular', style: { fontWeight: 600 } }, `${s.percent ?? 0} %`)),
          h('div', { class: ['layers', s.state === 'paused' && 'paused'], style: { '--p': s.percent ?? 0 }, role: 'progressbar', 'aria-valuenow': s.percent ?? 0, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Druckfortschritt' }),
          h('div', { class: 'muted small row' }, icon('clock'), s.remainingMin != null ? `noch ${fmt.duration(s.remainingMin)}` : '', eta ? ` · fertig ${fmt.relDay(eta) === 'Heute' ? 'um' : fmt.relDay(eta)} ${fmt.time(eta)}` : ''))
      : h('div', { class: 'muted small row', style: { minHeight: '52px' } },
          next ? [icon('calendar'), `Als Nächstes: ${next.title} · ${fmt.relDay(next.start)}, ${fmt.time(next.start)}`]
               : [icon('checkCircle'), 'Keine geplanten Aufträge']),
    h('dl', { class: 'printer-meta', style: { margin: 0 } }, meta.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v)))),
    s.trays?.length ? h('div', { class: 'ams', 'aria-label': 'AMS-Belegung' }, s.trays.map((t) => h('div', { class: 'ams-slot', title: [t.type, t.name].filter(Boolean).join(' ') },
      h('span', { class: 'swatch', style: { background: t.color || 'transparent', border: t.color ? 0 : '1px dashed var(--label-3)' } }),
      h('span', {}, t.type || 'leer'),
      t.remain != null ? h('span', { class: 'tabular' }, `${t.remain} %`) : null))) : null);
}

export function spoolRing(s, size = 56) {
  const pct = Math.max(0, Math.min(1, (Number(s.remaining) || 0) / (Number(s.netWeight) || 1000)));
  const r = 22, c = 2 * Math.PI * r;
  const low = Number(s.remaining) <= Number(s.lowThreshold ?? 200);
  return h('svg', { svg: true, class: 'spool-ring', viewBox: '0 0 56 56', width: size, height: size, 'aria-hidden': 'true' },
    h('circle', { svg: true, cx: 28, cy: 28, r, fill: 'none', stroke: 'var(--fill-strong)', 'stroke-width': 7 }),
    h('circle', {
      svg: true, cx: 28, cy: 28, r, fill: 'none', stroke: s.color || '#888', 'stroke-width': 7, 'stroke-linecap': 'round',
      'stroke-dasharray': `${c * pct} ${c}`, transform: 'rotate(-90 28 28)',
    }),
    h('circle', { svg: true, cx: 28, cy: 28, r: 9, fill: 'var(--surface-2)', stroke: low ? 'var(--orange)' : 'var(--separator)', 'stroke-width': low ? 2 : 1 }));
}

export function orderBadge(o) {
  const st = ORDER_STATUS[o.status] ?? ORDER_STATUS.planned;
  return badge(st.label, st.tone);
}

export function orderRow(o, onOpen) {
  const printer = byId('printers', o.printerId);
  const customer = byId('customers', o.customerId);
  return h('li', {}, h('button', { type: 'button', class: 'list-row', onclick: () => onOpen(o) },
    h('span', { class: 'cat-dot', style: { background: printerColor(printer) }, title: printer?.name }),
    h('div', { class: 'grow' },
      h('div', { class: 'primary' }, o.title),
      h('div', { class: 'secondary' }, [customerName(customer), printer?.name].filter(Boolean).join(' · '))),
    h('div', { class: 'trail' },
      h('div', { class: 'small', style: { fontWeight: 500 } }, `${fmt.relDay(o.start)}, ${fmt.time(o.start)}`),
      h('div', { class: 'secondary small muted' }, fmt.duration(o.durationMin))),
    icon('chevron', 'chev')));
}

export function card(title, content, action) {
  return h('section', { class: 'card flush' },
    h('div', { class: 'row', style: { padding: '14px 18px 6px' } }, h('h2', { class: 'card-title' }, title), h('span', { class: 'spacer' }), action),
    content);
}
