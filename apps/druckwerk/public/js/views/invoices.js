import { h, icon, fmt, pageBar, button, field, sheet, searchField, segmented, toast, emptyState, go, iconButton, isoDate, readForm, rerender, confirmSheet } from '../ui.js';
import { state, save, remove, byId, customerName, invoiceTotals, invoiceStatus, round2 } from '../store.js';

const view = { query: '', filter: 'all' };
const FILTERS = [['all', 'Alle'], ['open', 'Offen'], ['overdue', 'Überfällig'], ['paid', 'Bezahlt'], ['draft', 'Entwürfe']];

export default function invoices(route) {
  const p = route.params;
  if (p.new || p.fromOrder) {
    history.replaceState(null, '', '#/invoices');
    queueMicrotask(() => openInvoiceSheet(null, { customerId: p.customer, orderId: p.fromOrder }));
  }
  const year = new Date().getFullYear();
  const sum = (list) => list.reduce((a, i) => a + invoiceTotals(i).gross, 0);
  const open = state.invoices.filter((i) => invoiceStatus(i).key === 'open');
  const overdue = state.invoices.filter((i) => invoiceStatus(i).key === 'overdue');
  const paidYear = state.invoices.filter((i) => i.status === 'paid' && new Date(i.paidAt || i.date).getFullYear() === year);
  const host = h('div');
  const draw = () => host.replaceChildren(table());
  draw();

  return h('div', { class: 'page' },
    pageBar({
      title: 'Rechnungen',
      subtitle: state.settings.invoice.smallBusiness ? 'Kleinunternehmer nach § 19 UStG' : `Umsatzsteuer ${state.settings.invoice.vatRate} %`,
      actions: [
        searchField('Nummer oder Kunde', view.query, (q) => { view.query = q; draw(); }),
        button('Neue Rechnung', { primary: true, icon: 'plus', onClick: () => openInvoiceSheet() }),
      ],
    }),
    h('div', { class: 'grid grid-kpi', style: { marginBottom: '20px' } },
      kpi('Offen', sum(open), `${open.length} Rechnungen`),
      kpi('Überfällig', sum(overdue), `${overdue.length} Rechnungen`, overdue.length ? 'var(--red)' : null),
      kpi(`Bezahlt ${year}`, sum(paidYear), `${paidYear.length} Rechnungen`)),
    h('div', { style: { marginBottom: '14px', overflowX: 'auto' } }, segmented(FILTERS, view.filter, (f) => { view.filter = f; rerender(); }, 'Filter')),
    host);
}

function kpi(label, value, note, color) {
  return h('div', { class: 'card kpi' }, h('div', { class: 'kpi-label' }, label), h('div', { class: 'kpi-value', style: { color } }, fmt.money(value)), h('div', { class: 'kpi-note' }, note));
}

function table() {
  const q = view.query.toLowerCase();
  const rows = state.invoices
    .filter((i) => view.filter === 'all' || invoiceStatus(i).key === view.filter)
    .filter((i) => !q || [i.number, customerName(byId('customers', i.customerId))].join(' ').toLowerCase().includes(q))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.number || '').localeCompare(a.number || ''));
  if (!rows.length) {
    return h('div', { class: 'card' }, emptyState({
      icon: 'invoice', title: q || view.filter !== 'all' ? 'Keine Rechnungen gefunden' : 'Noch keine Rechnungen',
      text: 'Rechnungen erstellst du hier oder direkt aus einem fertigen Auftrag. Die Nummer vergibt Druckwerk fortlaufend.',
      action: button('Neue Rechnung', { primary: true, icon: 'plus', onClick: () => openInvoiceSheet() }),
    }));
  }
  return h('div', { class: 'card flush' }, h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Nummer'), h('th', {}, 'Kunde'), h('th', { class: 'hide-s' }, 'Datum'), h('th', { class: 'hide-s' }, 'Fällig'), h('th', {}, 'Status'), h('th', { class: 'num' }, 'Betrag'))),
    h('tbody', {}, rows.map((inv) => {
      const st = invoiceStatus(inv);
      return h('tr', { tabindex: 0, onclick: () => go('invoices/' + inv.id), onkeydown: (e) => { if (e.key === 'Enter') go('invoices/' + inv.id); } },
        h('td', { class: 'mono' }, inv.number),
        h('td', {}, customerName(byId('customers', inv.customerId))),
        h('td', { class: 'hide-s' }, fmt.date(inv.date)),
        h('td', { class: 'hide-s' }, fmt.date(inv.dueDate)),
        h('td', {}, h('span', { class: ['badge', st.tone] }, h('span', { class: 'dot' }), st.label)),
        h('td', { class: 'num' }, fmt.money(invoiceTotals(inv).gross)));
    })))));
}

const addDays = (date, days) => isoDate(new Date(new Date(date).getTime() + days * 864e5));

function orderLine(o) {
  const d = byId('designs', o.designId);
  const qty = Number(o.quantity) || 1;
  const net = Number(o.price) || (d?.price ?? 0) * qty;
  return qty > 1 && net
    ? { description: `${o.title}${d && !o.title.includes(d.name) ? ` (${d.name})` : ''}`, qty, unit: 'Stk.', unitPrice: round2(net / qty), vatRate: state.settings.invoice.vatRate, orderId: o.id }
    : { description: o.title, qty: 1, unit: 'Pauschal', unitPrice: round2(net), vatRate: state.settings.invoice.vatRate, orderId: o.id };
}

export function openInvoiceSheet(invoice, { customerId, orderId } = {}) {
  const s = state.settings.invoice;
  const order = orderId ? byId('orders', orderId) : null;
  const inv = structuredClone(invoice ?? {
    customerId: customerId || order?.customerId || '', date: isoDate(), dueDate: addDays(new Date(), s.paymentDays),
    status: 'open', items: order ? [orderLine(order)] : [{ description: '', qty: 1, unit: 'Stk.', unitPrice: 0, vatRate: s.vatRate }],
    notes: '', orderIds: order ? [order.id] : [],
  });
  inv.orderIds ??= [];
  const small = s.smallBusiness;
  const itemsHost = h('div', { class: 'stack', style: { gap: '8px' } });
  const totalsHost = h('div');
  const ordersHost = h('div');
  const formId = 'inv-' + Math.random().toString(36).slice(2, 7);

  const drawTotals = () => {
    const t = invoiceTotals(inv);
    totalsHost.replaceChildren(h('div', { class: 'breakdown', style: { maxWidth: '320px', marginLeft: 'auto' } },
      h('div', { class: 'breakdown-row' }, h('span', { class: 'label' }, 'Netto'), h('span', { class: 'value' }, fmt.money(t.net))),
      Object.entries(t.vat).map(([rate, v]) => h('div', { class: 'breakdown-row' }, h('span', { class: 'label' }, `USt. ${rate} %`), h('span', { class: 'value' }, fmt.money(v)))),
      h('div', { class: 'breakdown-row total' }, h('span', { class: 'label' }, small ? 'Gesamt' : 'Gesamt brutto'), h('span', { class: 'value' }, fmt.money(t.gross)))));
  };
  const drawItems = () => {
    itemsHost.replaceChildren(...inv.items.map((it, i) => h('div', { style: { display: 'grid', gridTemplateColumns: small ? 'minmax(0,3fr) 70px 90px 110px 32px' : 'minmax(0,3fr) 70px 90px 110px 80px 32px', gap: '8px', alignItems: 'end' } },
      itemField(i === 0 ? 'Beschreibung' : null, it.description, (v) => { it.description = v; }, { required: true }),
      itemField(i === 0 ? 'Menge' : null, it.qty, (v) => { it.qty = Number(v); drawTotals(); }, { type: 'number' }),
      itemField(i === 0 ? 'Einheit' : null, it.unit, (v) => { it.unit = v; }),
      itemField(i === 0 ? 'Einzelpreis €' : null, it.unitPrice, (v) => { it.unitPrice = Number(v); drawTotals(); }, { type: 'number', step: '0.01' }),
      small ? null : itemField(i === 0 ? 'USt. %' : null, it.vatRate, (v) => { it.vatRate = Number(v); drawTotals(); }, { type: 'number' }),
      iconButton('trash', 'Position entfernen', () => {
        inv.items.splice(i, 1);
        if (it.orderId) inv.orderIds = inv.orderIds.filter((x) => x !== it.orderId);
        drawItems(); drawOrders();
      }, 'danger'))),
      h('div', {}, button('Position hinzufügen', { plain: true, icon: 'plus', onClick: () => { inv.items.push({ description: '', qty: 1, unit: 'Stk.', unitPrice: 0, vatRate: s.vatRate }); drawItems(); } })));
    drawTotals();
  };
  // Noch nicht abgerechnete Aufträge des gewählten Kunden zum Übernehmen anbieten
  const drawOrders = () => {
    const open = state.orders.filter((o) => o.customerId === inv.customerId && !o.invoiceId && o.status !== 'cancelled' && !inv.orderIds.includes(o.id));
    ordersHost.replaceChildren(open.length ? h('div', { class: 'card', style: { background: 'var(--surface-2)', boxShadow: 'none', padding: '12px 14px' } },
      h('div', { class: 'small muted', style: { fontWeight: 600, marginBottom: '6px' } }, 'Offene Aufträge dieses Kunden'),
      h('div', { class: 'row wrap' }, open.map((o) => button(`${o.title} · ${o.price ? fmt.money(o.price) : 'ohne Preis'}`, { icon: 'plus', onClick: () => {
        const blank = inv.items.findIndex((x) => !x.description && !Number(x.unitPrice));
        if (blank >= 0) inv.items.splice(blank, 1);
        inv.items.push(orderLine(o));
        inv.orderIds.push(o.id);
        drawItems(); drawOrders();
      } })))) : '');
  };

  const form = h('form', { class: 'form', id: formId },
    h('fieldset', { class: 'fieldset' },
      field({ label: 'Kunde', name: 'customerId', type: 'select', value: inv.customerId, required: true, options: [['', 'Kunde wählen …'], ...state.customers.map((c) => [c.id, customerName(c)])], onChange: (e) => { inv.customerId = e.target.value; drawOrders(); } }),
      field({ label: 'Rechnungsdatum', name: 'date', type: 'date', value: inv.date, required: true, onChange: (e) => { form.elements.dueDate.value = addDays(e.target.value, s.paymentDays); } }),
      field({ label: 'Fällig am', name: 'dueDate', type: 'date', value: inv.dueDate }),
      field({ label: 'Status', name: 'status', type: 'select', value: inv.status, options: [['draft', 'Entwurf'], ['open', 'Offen'], ['paid', 'Bezahlt'], ['cancelled', 'Storniert']] }),
      invoice ? field({ label: 'Nummer', name: 'number', value: inv.number }) : null,
      field({ label: 'Leistungszeitraum', name: 'servicePeriod', value: inv.servicePeriod, placeholder: 'leer = Rechnungsdatum' })),
    ordersHost,
    h('fieldset', { class: 'fieldset', style: { display: 'block' } }, h('legend', {}, 'Positionen'), itemsHost),
    totalsHost,
    field({ label: 'Hinweis auf der Rechnung', name: 'notes', type: 'textarea', value: inv.notes }));
  drawItems();
  drawOrders();

  const sh = sheet({
    title: invoice ? `Rechnung ${invoice.number}` : 'Neue Rechnung', body: form, size: 'wide',
    actions: [
      invoice ? { label: 'Löschen', danger: true, left: true, icon: 'trash', keepOpen: true, onClick: async () => {
        if (!(await confirmSheet({ title: 'Rechnung löschen?', text: 'Für die Buchhaltung ist Stornieren meist der bessere Weg. Gelöschte Nummern entstehen als Lücke.', confirm: 'Löschen', danger: true }))) return false;
        for (const id of invoice.orderIds ?? []) { const o = byId('orders', id); if (o) await save('orders', { ...o, invoiceId: null }); }
        await remove('invoices', invoice.id);
        sh.close();
        go('invoices');
        toast('Rechnung gelöscht');
      } } : null,
      { label: 'Abbrechen' },
      { label: invoice ? 'Sichern' : 'Rechnung erstellen', primary: true, submit: true, form: formId },
    ].filter(Boolean),
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = readForm(form);
    if (!f.customerId) return toast('Bitte einen Kunden wählen.', 'error');
    const items = inv.items.filter((it) => it.description || Number(it.unitPrice));
    if (!items.length) return toast('Bitte mindestens eine Position eintragen.', 'error');
    const next = { ...inv, ...Object.fromEntries(Object.entries(f).filter(([k]) => !k.startsWith('item'))), items };
    if (next.status === 'paid' && !next.paidAt) next.paidAt = isoDate();
    const saved = await save('invoices', next);
    for (const id of saved.orderIds ?? []) {
      const o = byId('orders', id);
      if (o && o.invoiceId !== saved.id) await save('orders', { ...o, invoiceId: saved.id });
    }
    sh.close();
    toast(invoice ? 'Rechnung gesichert' : `Rechnung ${saved.number} erstellt`);
    if (!invoice) go('invoices/' + saved.id);
  });
}

function itemField(label, value, onInput, opts = {}) {
  const input = h('input', { class: 'input', type: opts.type || 'text', value: value ?? '', step: opts.step ?? (opts.type === 'number' ? 'any' : null), 'aria-label': label ?? undefined, required: opts.required, inputmode: opts.type === 'number' ? 'decimal' : null, name: 'item-' + Math.random().toString(36).slice(2, 6) });
  input.addEventListener('input', () => onInput(input.value));
  return h('label', { class: 'field' }, label ? h('span', {}, label) : null, input);
}

// ---------- Rechnungsdokument (A4, druckbar als PDF) ----------
export function invoiceDocument(id) {
  const inv = byId('invoices', id);
  if (!inv) return h('div', { class: 'page' }, pageBar({ title: 'Rechnung nicht gefunden' }), h('a', { href: '#/invoices' }, 'Zurück zu den Rechnungen'));
  const co = state.settings.company;
  const s = state.settings.invoice;
  const c = byId('customers', inv.customerId) ?? {};
  const t = invoiceTotals(inv);
  const st = invoiceStatus(inv);
  const small = s.smallBusiness;

  const paper = h('article', { class: 'paper', 'aria-label': `Rechnung ${inv.number}` },
    h('div', { class: 'head' },
      h('div', {},
        h('div', { class: 'sender-line' }, [co.name, co.street, [co.zip, co.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ')),
        h('address', { style: { fontStyle: 'normal' } },
          c.company ? h('div', {}, c.company) : null, h('div', {}, c.name), h('div', {}, c.street), h('div', {}, [c.zip, c.city].filter(Boolean).join(' ')),
          c.country && c.country !== 'Deutschland' ? h('div', {}, c.country) : null)),
      h('div', { style: { textAlign: 'right' } },
        h('div', { class: 'brand', style: { justifyContent: 'flex-end' } }, h('img', { src: '/icon.svg', alt: '' }), co.name || 'Dein Firmenname'),
        h('div', { style: { color: '#555', marginTop: '2mm', fontSize: '9pt' } }, co.owner, h('br'), co.street, h('br'), [co.zip, co.city].filter(Boolean).join(' '), h('br'), co.email, co.phone ? [h('br'), co.phone] : null))),
    h('div', { class: 'head', style: { marginBottom: '6mm', alignItems: 'flex-end' } },
      h('h1', { style: { margin: 0 } }, 'Rechnung'),
      h('dl', { class: 'meta', style: { margin: 0 } },
        h('dt', {}, 'Rechnungsnummer'), h('dd', {}, inv.number),
        h('dt', {}, 'Rechnungsdatum'), h('dd', {}, fmt.date(inv.date)),
        h('dt', {}, 'Leistungsdatum'), h('dd', {}, inv.servicePeriod || fmt.date(inv.date)),
        c.vatId ? [h('dt', {}, 'USt-IdNr. Kunde'), h('dd', {}, c.vatId)] : null)),
    h('p', {}, `Guten Tag ${c.name || ''},`.trim()),
    h('p', { style: { marginTop: '2mm' } }, 'vielen Dank für Ihren Auftrag. Wir berechnen Ihnen folgende Leistungen:'),
    h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Pos.'), h('th', {}, 'Beschreibung'), h('th', { class: 'num' }, 'Menge'), h('th', { class: 'num' }, 'Einzelpreis'), small ? null : h('th', { class: 'num' }, 'USt.'), h('th', { class: 'num' }, 'Gesamt'))),
      h('tbody', {}, inv.items.map((it, i) => h('tr', {},
        h('td', {}, i + 1), h('td', {}, it.description),
        h('td', { class: 'num' }, `${fmt.num(it.qty)} ${it.unit || ''}`), h('td', { class: 'num' }, fmt.money(it.unitPrice)),
        small ? null : h('td', { class: 'num' }, `${it.vatRate ?? s.vatRate} %`),
        h('td', { class: 'num' }, fmt.money((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))))))),
    h('div', { class: 'totals' },
      h('span', {}, small ? 'Summe' : 'Summe netto'), h('span', { class: 'num' }, fmt.money(t.net)),
      Object.entries(t.vat).map(([rate, v]) => [h('span', {}, `zzgl. USt. ${rate} %`), h('span', { class: 'num' }, fmt.money(v))]),
      h('span', { class: 'grand' }, 'Rechnungsbetrag'), h('span', { class: 'grand num' }, fmt.money(t.gross))),
    h('div', { class: 'note' },
      small ? h('p', {}, 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.') : null,
      inv.status === 'paid'
        ? h('p', { style: { marginTop: '3mm' } }, `Der Betrag wurde am ${fmt.date(inv.paidAt || inv.date)} dankend erhalten.`)
        : h('p', { style: { marginTop: '3mm' } }, `Bitte überweisen Sie den Betrag bis zum ${fmt.date(inv.dueDate)} unter Angabe der Rechnungsnummer ${inv.number} auf das unten genannte Konto.`),
      inv.notes ? h('p', { style: { marginTop: '3mm', whiteSpace: 'pre-line' } }, inv.notes) : null,
      s.footer ? h('p', { style: { marginTop: '3mm' } }, s.footer) : null),
    h('footer', { class: 'foot' },
      h('div', {}, h('strong', {}, co.name), h('br'), co.owner, h('br'), co.street, h('br'), [co.zip, co.city].filter(Boolean).join(' ')),
      h('div', {}, co.email, h('br'), co.phone, h('br'), co.website, h('br'), co.taxNumber ? `Steuernummer ${co.taxNumber}` : null, co.vatId ? [h('br'), `USt-IdNr. ${co.vatId}`] : null),
      h('div', {}, co.bank, h('br'), co.iban ? `IBAN ${co.iban}` : null, h('br'), co.bic ? `BIC ${co.bic}` : null)));

  const missing = ['name', 'street', 'city', 'iban'].filter((k) => !co[k]);
  return h('div', { class: 'page' },
    pageBar({
      title: `Rechnung ${inv.number}`,
      subtitle: `${customerName(c)} · ${fmt.money(t.gross)}`,
      actions: [
        h('span', { class: ['badge', st.tone] }, h('span', { class: 'dot' }), st.label),
        button('Alle Rechnungen', { plain: true, icon: 'chevronLeft', onClick: () => go('invoices') }),
        button('Bearbeiten', { icon: 'edit', onClick: () => openInvoiceSheet(inv) }),
        inv.status !== 'paid' && inv.status !== 'cancelled'
          ? button('Als bezahlt markieren', { icon: 'check', onClick: async () => { await save('invoices', { ...inv, status: 'paid', paidAt: isoDate() }); toast('Als bezahlt markiert'); } }) : null,
        button('Drucken / PDF', { primary: true, icon: 'print', onClick: () => window.print() }),
      ],
    }),
    missing.length ? h('div', { class: 'card row no-print', style: { marginBottom: '16px', background: 'var(--orange-soft)', boxShadow: 'none' } },
      icon('warning'), h('span', { class: 'small' }, 'Deine Firmendaten sind unvollständig. Eine Rechnung braucht Name, Anschrift und Bankverbindung. '),
      h('a', { href: '#/settings', class: 'small' }, 'Zu den Einstellungen')) : null,
    paper);
}
