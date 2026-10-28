import { h, icon, fmt, pageBar, button, go, emptyState } from '../ui.js';
import { state, invoiceStatus, invoiceTotals, lowSpools, printerStatus, customerName, byId } from '../store.js';
import { liveRegion } from '../live.js';
import { printerCard, orderRow, card, spoolRing } from './components.js';
import { openOrderSheet } from './orders.js';
import { openPrinterSheet } from './printers.js';

function greeting() {
  const hr = new Date().getHours();
  return hr < 11 ? 'Guten Morgen' : hr < 18 ? 'Guten Tag' : 'Guten Abend';
}

export default function dashboard() {
  const now = new Date();
  const monthKey = (d) => `${new Date(d).getFullYear()}-${new Date(d).getMonth()}`;
  const thisMonth = monthKey(now);
  const paid = state.invoices.filter((i) => i.status === 'paid');
  const revenueMonth = paid.filter((i) => monthKey(i.paidAt || i.date) === thisMonth).reduce((a, i) => a + invoiceTotals(i).gross, 0);
  const openInv = state.invoices.filter((i) => ['open', 'overdue'].includes(invoiceStatus(i).key));
  const overdue = openInv.filter((i) => invoiceStatus(i).key === 'overdue');
  const todayOrders = state.orders.filter((o) => o.status !== 'cancelled' && new Date(o.start).toDateString() === now.toDateString());
  const upcoming = state.orders
    .filter((o) => o.status === 'planned' || o.status === 'printing')
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .slice(0, 6);
  const low = lowSpools();

  const kpis = liveRegion(() => {
    const active = state.printers.filter((p) => ['printing', 'preparing', 'paused'].includes(printerStatus(p).state)).length;
    return h('div', { class: 'grid grid-kpi' },
      kpi('printer', 'Drucker aktiv', `${active} / ${state.printers.length}`, active ? 'gerade im Einsatz' : 'alle bereit'),
      kpi('calendar', 'Aufträge heute', todayOrders.length, `${state.orders.filter((o) => o.status === 'planned').length} geplant insgesamt`),
      kpi('euro', 'Umsatz im ' + now.toLocaleDateString('de-DE', { month: 'long' }), fmt.money(revenueMonth), 'bezahlte Rechnungen, brutto'),
      kpi('invoice', 'Offene Posten', fmt.money(openInv.reduce((a, i) => a + invoiceTotals(i).gross, 0)),
        overdue.length ? h('span', { style: { color: 'var(--red)', fontWeight: 600 } }, `${overdue.length} überfällig`) : `${openInv.length} Rechnungen`));
  });

  return h('div', { class: 'page' },
    pageBar({
      title: greeting(),
      subtitle: fmt.dateLong(now),
      actions: [button('Neuer Auftrag', { primary: true, icon: 'plus', onClick: () => openOrderSheet() })],
    }),
    kpis,

    h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', {}, 'Drucker'), h('span', { class: 'spacer' }), h('a', { href: '#/printers' }, 'Alle anzeigen')),
      state.printers.length
        ? liveRegion(() => h('div', { class: 'grid grid-cards' }, state.printers.map((p) => printerCard(p, { onOpen: openPrinterSheet }))))
        : h('div', { class: 'card' }, emptyState({ icon: 'printer', title: 'Noch keine Drucker', text: 'Verbinde dein Bambu-Konto oder lege einen Drucker von Hand an.', action: button('Drucker hinzufügen', { primary: true, onClick: () => go('printers') }) }))),

    h('div', { class: 'grid grid-2 section' },
      card('Als Nächstes',
        upcoming.length ? h('ul', { class: 'list' }, upcoming.map((o) => orderRow(o, openOrderSheet)))
          : emptyState({ icon: 'calendar', title: 'Nichts geplant', text: 'Neue Aufträge erscheinen hier und im Kalender.' }),
        h('a', { href: '#/calendar', class: 'small' }, 'Kalender')),
      h('div', { class: 'stack' },
        card('Umsatz der letzten 6 Monate', h('div', { style: { padding: '4px 18px 16px', position: 'relative' } }, revenueChart(paid))),
        card('Filament nachbestellen',
          low.length ? h('ul', { class: 'list' }, low.slice(0, 4).map((s) => h('li', {}, h('a', { class: 'list-row', href: '#/filament' },
            spoolRing(s, 32),
            h('div', { class: 'grow' }, h('div', { class: 'primary' }, `${s.material} ${s.colorName}`), h('div', { class: 'secondary' }, s.brand)),
            h('span', { class: ['small', 'tabular'], style: { color: Number(s.remaining) <= 0 ? 'var(--red)' : 'var(--orange)', fontWeight: 600 } }, `${fmt.grams(s.remaining)} übrig`)))))
            : h('p', { class: 'muted small row', style: { padding: '6px 18px 16px' } }, icon('checkCircle'), 'Alle Spulen sind ausreichend gefüllt.'),
          h('a', { href: '#/filament', class: 'small' }, 'Lager')))),

    recentInvoices(),
  );
}

function kpi(ic, label, value, note) {
  return h('div', { class: 'card kpi' },
    h('div', { class: 'kpi-label' }, icon(ic), label),
    h('div', { class: 'kpi-value' }, value),
    h('div', { class: 'kpi-note' }, note));
}

function recentInvoices() {
  const rows = [...state.invoices].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
  if (!rows.length) return null;
  return h('section', { class: 'section' },
    card('Letzte Rechnungen', h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Nummer'), h('th', {}, 'Kunde'), h('th', { class: 'hide-s' }, 'Datum'), h('th', {}, 'Status'), h('th', { class: 'num' }, 'Betrag'))),
      h('tbody', {}, rows.map((inv) => {
        const st = invoiceStatus(inv);
        return h('tr', { onclick: () => go('invoices/' + inv.id) },
          h('td', {}, h('a', { href: '#/invoices/' + inv.id, class: 'mono' }, inv.number)),
          h('td', {}, customerName(byId('customers', inv.customerId))),
          h('td', { class: 'hide-s' }, fmt.date(inv.date)),
          h('td', {}, h('span', { class: ['badge', st.tone] }, h('span', { class: 'dot' }), st.label)),
          h('td', { class: 'num' }, fmt.money(invoiceTotals(inv).gross)));
      })))), h('a', { href: '#/invoices', class: 'small' }, 'Alle')));
}

// Einfaches Säulendiagramm, eine Reihe: kein Legendenkasten, Titel benennt die Reihe
function revenueChart(paid) {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ d, label: d.toLocaleDateString('de-DE', { month: 'short' }).replace('.', ''), value: 0, current: i === 0 });
  }
  for (const inv of paid) {
    const d = new Date(inv.paidAt || inv.date);
    const m = months.find((x) => x.d.getFullYear() === d.getFullYear() && x.d.getMonth() === d.getMonth());
    if (m) m.value += invoiceTotals(inv).gross;
  }
  const W = 520, H = 200, top = 12, bottom = 24, left = 44;
  const max = Math.max(100, ...months.map((m) => m.value));
  const nice = niceMax(max);
  const bw = (W - left) / months.length;
  const y = (v) => top + (H - top - bottom) * (1 - v / nice);
  const tip = h('div', { class: 'chart-tip glass', hidden: true });
  const svg = h('svg', { svg: true, class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Umsatz pro Monat, Säulendiagramm. Werte stehen in der Tabelle darunter.' },
    [0, 0.5, 1].map((t) => [
      h('line', { svg: true, class: 'grid-line', x1: left, x2: W, y1: y(nice * t), y2: y(nice * t) }),
      h('text', { svg: true, class: 'axis', x: left - 8, y: y(nice * t) + 4, 'text-anchor': 'end' }, shortMoney(nice * t)),
    ]),
    months.map((m, i) => {
      const x = left + i * bw + bw * 0.22, w = bw * 0.56;
      const yy = y(m.value), hh = H - bottom - yy;
      const g = h('g', { svg: true },
        h('path', { svg: true, class: ['bar', m.current && 'current'], d: roundedTop(x, yy, w, hh, Math.min(4, hh)) }),
        h('text', { svg: true, class: 'axis', x: x + w / 2, y: H - 6, 'text-anchor': 'middle' }, m.label),
        h('rect', { svg: true, class: 'hit', x: left + i * bw, y: top, width: bw, height: H - top - bottom }));
      g.addEventListener('pointerenter', () => {
        tip.hidden = false;
        tip.textContent = `${m.d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}: ${fmt.money(m.value)}${m.current ? ' (laufend)' : ''}`;
        const r = svg.getBoundingClientRect();
        tip.style.left = `${((x + w / 2) / W) * r.width + 18}px`;
        tip.style.top = `${(yy / H) * r.height + 4}px`;
      });
      g.addEventListener('pointerleave', () => { tip.hidden = true; });
      return g;
    }));
  const table = h('table', { class: 'sr-only' }, h('caption', {}, 'Umsatz pro Monat'),
    h('tbody', {}, months.map((m) => h('tr', {}, h('th', {}, m.label), h('td', {}, fmt.money(m.value))))));
  return h('div', {}, svg, tip, table);
}

function roundedTop(x, y, w, hgt, r) {
  if (hgt <= 0) return '';
  return `M${x},${y + hgt}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hgt}Z`;
}
function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p) * p;
}
function shortMoney(v) {
  return v >= 1000 ? `${fmt.num(v / 1000)} T€` : `${Math.round(v)} €`;
}
