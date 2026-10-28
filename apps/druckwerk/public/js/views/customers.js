import { h, fmt, pageBar, button, field, formSheet, searchField, segmented, toast, emptyState, go, rerender } from '../ui.js';
import { state, save, remove, customerName, invoiceTotals, invoiceStatus } from '../store.js';
import { openOrderSheet } from './orders.js';
import { orderBadge } from './components.js';

const view = { query: '', type: 'all' };

function revenue(c) {
  return state.invoices.filter((i) => i.customerId === c.id && i.status === 'paid').reduce((a, i) => a + invoiceTotals(i).gross, 0);
}

export default function customers() {
  const host = h('div');
  const draw = () => host.replaceChildren(table());
  draw();
  return h('div', { class: 'page' },
    pageBar({
      title: 'Kunden',
      subtitle: `${state.customers.length} Kunden · ${state.customers.filter((c) => c.type === 'business').length} Firmen`,
      actions: [
        searchField('Name, Firma, Ort, E-Mail', view.query, (q) => { view.query = q; draw(); }),
        segmented([['all', 'Alle'], ['business', 'Firmen'], ['private', 'Privat']], view.type, (t) => { view.type = t; rerender(); }, 'Kundentyp'),
        button('Kunde anlegen', { primary: true, icon: 'plus', onClick: () => openCustomerSheet() }),
      ],
    }),
    host);
}

function table() {
  const q = view.query.toLowerCase();
  const rows = state.customers
    .filter((c) => view.type === 'all' || c.type === view.type)
    .filter((c) => !q || [c.company, c.name, c.city, c.email, c.phone].join(' ').toLowerCase().includes(q))
    .sort((a, b) => customerName(a).localeCompare(customerName(b), 'de'));
  if (!rows.length) {
    return h('div', { class: 'card' }, emptyState({
      icon: 'people', title: q ? 'Keine Treffer' : 'Noch keine Kunden',
      text: q ? `Niemand passt zu „${view.query}“.` : 'Lege deine Kunden an, um Aufträge und Rechnungen zuzuordnen.',
      action: q ? null : button('Kunde anlegen', { primary: true, icon: 'plus', onClick: () => openCustomerSheet() }),
    }));
  }
  return h('div', { class: 'card flush' }, h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Kunde'), h('th', { class: 'hide-s' }, 'Kontakt'), h('th', { class: 'hide-s' }, 'Ort'), h('th', { class: 'num' }, 'Aufträge'), h('th', { class: 'num' }, 'Umsatz'))),
    h('tbody', {}, rows.map((c) => h('tr', { tabindex: 0, onclick: () => openCustomerSheet(c), onkeydown: (e) => { if (e.key === 'Enter') openCustomerSheet(c); } },
      h('td', {}, h('div', { class: 'row' }, avatar(c), h('div', {},
        h('div', { style: { fontWeight: 500 } }, customerName(c)),
        c.company && c.name ? h('div', { class: 'muted small' }, c.name) : null))),
      h('td', { class: 'hide-s' }, h('div', {}, c.email || '–'), c.phone ? h('div', { class: 'muted small' }, c.phone) : null),
      h('td', { class: 'hide-s' }, [c.zip, c.city].filter(Boolean).join(' ') || '–'),
      h('td', { class: 'num' }, state.orders.filter((o) => o.customerId === c.id).length),
      h('td', { class: 'num' }, fmt.money(revenue(c)))))))));
}

function avatar(c) {
  const initials = customerName(c).split(/\s+/).filter((w) => /^[A-Za-zÄÖÜäöü]/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return h('span', {
    'aria-hidden': 'true',
    style: { width: '34px', height: '34px', borderRadius: '50%', display: 'grid', placeItems: 'center', flex: 'none', fontSize: '0.8125rem', fontWeight: 600,
      background: 'linear-gradient(180deg, #a1a1a6, #7c7c80)', color: '#fff' },
  }, initials || '?');
}

export function openCustomerSheet(customer) {
  const c = customer ?? { type: 'private', country: 'Deutschland' };
  const orders = customer ? state.orders.filter((o) => o.customerId === customer.id).sort((a, b) => new Date(b.start) - new Date(a.start)) : [];
  const invoices = customer ? state.invoices.filter((i) => i.customerId === customer.id).sort((a, b) => (b.date || '').localeCompare(a.date || '')) : [];

  const history = customer ? h('div', { class: 'grid grid-2' },
    h('div', {}, h('div', { class: 'small muted', style: { fontWeight: 600, marginBottom: '6px' } }, `Aufträge (${orders.length})`),
      h('div', { class: 'grouped' }, orders.length ? orders.slice(0, 6).map((o) => h('a', { href: '#/orders', class: 'row', style: { color: 'inherit' }, onclick: (e) => { e.preventDefault(); sh.close(); openOrderSheet(o); } },
        h('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, o.title), orderBadge(o))) : [h('p', { class: 'muted small' }, 'Noch keine Aufträge')])),
    h('div', {}, h('div', { class: 'small muted', style: { fontWeight: 600, marginBottom: '6px' } }, `Rechnungen (${invoices.length}) · ${fmt.money(revenue(customer))} bezahlt`),
      h('div', { class: 'grouped' }, invoices.length ? invoices.slice(0, 6).map((i) => {
        const st = invoiceStatus(i);
        return h('a', { href: '#/invoices/' + i.id, class: 'row', style: { color: 'inherit' }, onclick: () => sh.close() },
          h('span', { class: 'mono', style: { flex: 1 } }, i.number), h('span', { class: 'tabular small' }, fmt.money(invoiceTotals(i).gross)), h('span', { class: ['badge', st.tone] }, st.label));
      }) : [h('p', { class: 'muted small' }, 'Noch keine Rechnungen')]))) : null;

  const sh = formSheet({
    title: customer ? customerName(customer) : 'Kunde anlegen',
    size: 'wide',
    submitLabel: customer ? 'Sichern' : 'Anlegen',
    fields: [
      h('fieldset', { class: 'fieldset' },
        field({ label: 'Kundentyp', name: 'type', type: 'select', value: c.type, options: [['private', 'Privatkunde'], ['business', 'Firma']] }),
        field({ label: 'Firma', name: 'company', value: c.company, autocomplete: 'organization' }),
        field({ label: 'Ansprechpartner', name: 'name', value: c.name, required: true, autocomplete: 'name' }),
        field({ label: 'E-Mail', name: 'email', type: 'email', value: c.email, autocomplete: 'email' }),
        field({ label: 'Telefon', name: 'phone', type: 'tel', value: c.phone, autocomplete: 'tel' }),
        field({ label: 'USt-IdNr.', name: 'vatId', value: c.vatId, placeholder: 'DE…' })),
      h('fieldset', { class: 'fieldset' }, h('legend', {}, 'Rechnungsadresse'),
        field({ label: 'Straße und Hausnummer', name: 'street', value: c.street, span: 'all', autocomplete: 'street-address' }),
        field({ label: 'PLZ', name: 'zip', value: c.zip, autocomplete: 'postal-code' }),
        field({ label: 'Ort', name: 'city', value: c.city, autocomplete: 'address-level2' }),
        field({ label: 'Land', name: 'country', value: c.country, autocomplete: 'country-name' })),
      field({ label: 'Notizen', name: 'notes', type: 'textarea', value: c.notes, span: 'all' }),
    ],
    extra: customer ? h('div', { class: 'stack' },
      history,
      h('div', { class: 'row wrap' },
        button('Neuer Auftrag', { icon: 'orders', onClick: () => { sh.close(); openOrderSheet(null, { customerId: customer.id }); } }),
        button('Neue Rechnung', { icon: 'invoice', onClick: () => { sh.close(); go(`invoices?new=1&customer=${customer.id}`); } }),
        customer.email ? h('a', { class: 'btn btn-plain', href: `mailto:${customer.email}` }, 'E-Mail schreiben') : null)) : null,
    onDelete: customer ? async () => { await remove('customers', customer.id); toast('Kunde gelöscht'); } : null,
    onSubmit: async (f) => {
      await save('customers', { ...c, ...f });
      toast(customer ? 'Kunde gesichert' : 'Kunde angelegt');
    },
  });
}
