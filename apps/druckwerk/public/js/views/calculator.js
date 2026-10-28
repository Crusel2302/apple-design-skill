import { h, icon, fmt, pageBar, button, field, toast, iconButton, go, rerender } from '../ui.js';
import { state, save, remove, byId, round2 } from '../store.js';
import { calculate, MATERIALS, MATERIAL_NAMES, PART_LABELS } from '../calc.js';
import { openOrderSheet } from './orders.js';

// Teile der Kosten: kategoriale Farben in fester Reihenfolge, Text bleibt neutral
const PART_COLORS = { material: 'var(--cat-blue)', energy: 'var(--cat-teal)', machine: 'var(--cat-indigo)', labor: 'var(--cat-pink)', extras: 'var(--cat-brown)', risk: 'var(--cat-graphite)' };

let calc = null;
let lastKey = '';

function defaults() {
  const c = state.settings.calc;
  const inv = state.settings.invoice;
  const p = state.printers[0];
  return {
    title: '', designId: '', printerId: p?.id ?? '', orderId: '',
    printMinutes: 120, piecesPerPrint: 1, quantity: 1,
    materials: [materialLine()],
    powerW: p?.powerW ?? 120, printerPrice: p?.price ?? 800, lifetimeHours: p?.lifetimeHours ?? 5000, maintenancePerHour: p?.maintenancePerHour ?? 0.05,
    electricityPrice: c.electricityPrice, hourlyRate: c.hourlyRate, prepMinutes: c.prepMinutes, postMinutes: c.postMinutes,
    extras: c.extras, failureRate: c.failureRate, markup: c.markup, wastePercent: c.wastePercent,
    vatRate: inv.vatRate, smallBusiness: inv.smallBusiness,
  };
}

function materialLine(material = 'PLA', grams = 50) {
  const spool = state.spools.filter((s) => s.material === material).sort((a, b) => b.remaining - a.remaining)[0];
  return { spoolId: spool?.id ?? '', material, grams, pricePerKg: spool ? spoolPricePerKg(spool) : MATERIALS[material]?.pricePerKg ?? 25 };
}
const spoolPricePerKg = (s) => round2((Number(s.price) || 0) / ((Number(s.netWeight) || 1000) / 1000));

function applyPrinter(id) {
  const p = byId('printers', id);
  if (!p) return;
  Object.assign(calc, { printerId: id, powerW: p.powerW, printerPrice: p.price, lifetimeHours: p.lifetimeHours, maintenancePerHour: p.maintenancePerHour });
}
function applyDesign(id) {
  const d = byId('designs', id);
  if (!d) return;
  calc.designId = id;
  calc.title ||= d.name;
  if (d.printMinutes) calc.printMinutes = d.printMinutes;
  calc.materials = [materialLine(d.material || 'PLA', d.weight || 50)];
}

function fromRoute(params) {
  const key = JSON.stringify(params);
  if (calc && key === lastKey) return;
  lastKey = key;
  if (calc && !Object.keys(params).length) return;
  calc = defaults();
  if (params.quote) {
    const q = byId('quotes', params.quote);
    if (q) { calc = { ...defaults(), ...q.input }; calc.quoteId = q.id; }
    return;
  }
  if (params.order) {
    const o = byId('orders', params.order);
    if (o) {
      calc.orderId = o.id; calc.title = o.title;
      if (o.printerId) applyPrinter(o.printerId);
      if (o.designId) applyDesign(o.designId);
      calc.quantity = 1;
      calc.printMinutes = Number(o.durationMin) || calc.printMinutes;
      const d = byId('designs', o.designId);
      calc.piecesPerPrint = Number(o.quantity) || 1;
      const spool = byId('spools', o.spoolId);
      calc.materials = [{ spoolId: spool?.id ?? '', material: spool?.material ?? d?.material ?? 'PLA', grams: Number(o.grams) || (d?.weight || 50) * (o.quantity || 1), pricePerKg: spool ? spoolPricePerKg(spool) : 25 }];
    }
  }
  if (params.design) applyDesign(params.design);
  if (params.printer) applyPrinter(params.printer);
  if (params.title) calc.title = params.title;
  if (params.minutes) calc.printMinutes = Number(params.minutes);
  if (params.grams) calc.materials = [materialLine(MATERIAL_NAMES.includes(params.material) ? params.material : 'PLA', Number(params.grams))];
}

export default function calculator(route) {
  fromRoute(route.params);
  const resultHost = h('div', { class: 'calc-result' });
  const materialsHost = h('div', { class: 'stack', style: { gap: '10px' } });
  const machineHost = h('div');
  const drawResult = () => resultHost.replaceChildren(resultCard());
  const set = (k, numeric = true) => (e) => { calc[k] = numeric ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value; drawResult(); };

  const drawMaterials = () => materialsHost.replaceChildren(
    ...calc.materials.map((m, i) => h('div', { class: 'mat-row' },
      field({
        label: i === 0 ? 'Filament' : `Filament ${i + 1}`, name: `spool${i}`, type: 'select', value: m.spoolId || 'mat:' + m.material,
        options: [
          ...state.spools.map((s) => [s.id, `${s.material} ${s.colorName} · ${s.brand}`]),
          ...MATERIAL_NAMES.map((n) => ['mat:' + n, `${n} (Richtpreis)`]),
        ],
        onChange: (e) => {
          const v = e.target.value;
          if (v.startsWith('mat:')) Object.assign(m, { spoolId: '', material: v.slice(4), pricePerKg: MATERIALS[v.slice(4)]?.pricePerKg ?? 25 });
          else { const s = byId('spools', v); Object.assign(m, { spoolId: v, material: s.material, pricePerKg: spoolPricePerKg(s) }); }
          drawMaterials(); drawResult();
        },
      }),
      field({ label: 'Menge', name: `grams${i}`, type: 'number', value: m.grams, unit: 'g', onInput: (e) => { m.grams = Number(e.target.value); drawResult(); } }),
      field({ label: 'Preis', name: `ppk${i}`, type: 'number', value: m.pricePerKg, unit: '€/kg', onInput: (e) => { m.pricePerKg = Number(e.target.value); drawResult(); } }),
      calc.materials.length > 1
        ? iconButton('trash', 'Filament entfernen', () => { calc.materials.splice(i, 1); drawMaterials(); drawResult(); }, 'danger')
        : h('span'))),
    h('div', {}, button('Weiteres Filament (AMS)', { plain: true, icon: 'plus', onClick: () => { calc.materials.push(materialLine(calc.materials[0]?.material)); drawMaterials(); drawResult(); } })));

  const drawMachine = () => machineHost.replaceChildren(h('div', { class: 'fieldset' },
    field({ label: 'Leistung', name: 'powerW', type: 'number', value: calc.powerW, unit: 'W', onInput: set('powerW') }),
    field({ label: 'Strompreis', name: 'electricityPrice', type: 'number', value: calc.electricityPrice, unit: '€/kWh', onInput: set('electricityPrice') }),
    field({ label: 'Anschaffung', name: 'printerPrice', type: 'number', value: calc.printerPrice, unit: '€', onInput: set('printerPrice') }),
    field({ label: 'Lebensdauer', name: 'lifetimeHours', type: 'number', value: calc.lifetimeHours, unit: 'h', onInput: set('lifetimeHours') }),
    field({ label: 'Wartung', name: 'maintenancePerHour', type: 'number', value: calc.maintenancePerHour, unit: '€/h', onInput: set('maintenancePerHour') })));

  drawMaterials(); drawMachine(); drawResult();
  const hours = Math.floor(calc.printMinutes / 60), mins = Math.round(calc.printMinutes % 60);
  const timeInput = (name, value, unit) => field({ label: name === 'h' ? 'Druckzeit' : ' ', name, type: 'number', value, unit, min: 0, step: 1, onInput: () => {
    const f = document.querySelector('#calc-form');
    calc.printMinutes = (Number(f.elements.h.value) || 0) * 60 + (Number(f.elements.m.value) || 0);
    drawResult();
  } });

  return h('div', { class: 'page' },
    pageBar({
      title: 'Kostenrechner',
      subtitle: 'Selbstkosten und Verkaufspreis pro Druck, live berechnet',
      actions: [button('Zurücksetzen', { onClick: () => { calc = defaults(); lastKey = ''; go('calculator'); rerender(); } })],
    }),
    h('div', { class: 'calc-layout' },
      h('form', { class: 'stack', id: 'calc-form', onsubmit: (e) => e.preventDefault() },
        section('Druck', h('div', { class: 'fieldset' },
          field({ label: 'Bezeichnung', name: 'title', value: calc.title, span: 'all', placeholder: 'z. B. Halterung für Kunde Müller', onInput: set('title', false) }),
          field({ label: 'Design', name: 'designId', type: 'select', value: calc.designId, options: [['', '– frei –'], ...state.designs.map((d) => [d.id, d.name])], onChange: (e) => { applyDesign(e.target.value); calc.designId = e.target.value; rerender(); } }),
          field({ label: 'Drucker', name: 'printerId', type: 'select', value: calc.printerId, options: [['', '– eigene Werte –'], ...state.printers.map((p) => [p.id, p.name])], onChange: (e) => { applyPrinter(e.target.value); calc.printerId = e.target.value; drawMachine(); drawResult(); } }),
          h('div', { class: 'row', style: { gap: '8px', alignItems: 'end' } }, timeInput('h', hours, 'h'), timeInput('m', mins, 'min')),
          field({ label: 'Teile pro Druck', name: 'piecesPerPrint', type: 'number', value: calc.piecesPerPrint, min: 1, step: 1, onInput: set('piecesPerPrint') }),
          field({ label: 'Anzahl Drucke', name: 'quantity', type: 'number', value: calc.quantity, min: 1, step: 1, onInput: set('quantity') }))),
        section('Material', materialsHost),
        section('Arbeit und Zuschläge', h('div', { class: 'fieldset' },
          field({ label: 'Vorbereitung', name: 'prepMinutes', type: 'number', value: calc.prepMinutes, unit: 'min', hint: 'Slicen, Platte vorbereiten', onInput: set('prepMinutes') }),
          field({ label: 'Nachbearbeitung', name: 'postMinutes', type: 'number', value: calc.postMinutes, unit: 'min', hint: 'Stützen entfernen, schleifen', onInput: set('postMinutes') }),
          field({ label: 'Stundensatz', name: 'hourlyRate', type: 'number', value: calc.hourlyRate, unit: '€/h', onInput: set('hourlyRate') }),
          field({ label: 'Zusatzkosten', name: 'extras', type: 'number', value: calc.extras, unit: '€', hint: 'Verpackung, Magnete, Gewindeeinsätze', onInput: set('extras') }),
          field({ label: 'Ausschuss / Stützen', name: 'wastePercent', type: 'number', value: calc.wastePercent, unit: '%', onInput: set('wastePercent') }),
          field({ label: 'Fehldruckrisiko', name: 'failureRate', type: 'number', value: calc.failureRate, unit: '%', onInput: set('failureRate') }),
          field({ label: 'Gewinnaufschlag', name: 'markup', type: 'number', value: calc.markup, unit: '%', onInput: set('markup') }))),
        section('Strom und Maschine', machineHost)),
      resultHost),
    savedQuotes());
}

function section(title, body) {
  return h('section', { class: 'card' }, h('h2', { class: 'card-title', style: { marginBottom: '14px' } }, title), body);
}

function resultCard() {
  const r = calculate(calc);
  const small = calc.smallBusiness;
  const parts = Object.entries(r.parts).filter(([, v]) => v > 0.0049);
  const sum = parts.reduce((a, [, v]) => a + v, 0) || 1;
  const headline = small ? r.net : r.gross;
  return h('section', { class: 'card stack', 'aria-live': 'polite' },
    h('div', {},
      h('div', { class: 'muted small', style: { fontWeight: 500 } }, small ? 'Verkaufspreis pro Druck' : 'Verkaufspreis pro Druck, brutto'),
      h('div', { class: 'price-hero' }, fmt.money(headline)),
      h('div', { class: 'muted small' },
        small ? 'Kleinunternehmer: ohne Umsatzsteuer' : `${fmt.money(r.net)} netto + ${r.vatRate} % USt.`,
        r.pieces > 1 ? ` · ${fmt.money(small ? r.perPiece.net : r.perPiece.gross)} pro Teil` : '')),
    h('div', { class: 'stackbar', role: 'img', 'aria-label': 'Anteile der Selbstkosten: ' + parts.map(([k, v]) => `${PART_LABELS[k]} ${Math.round((v / sum) * 100)} %`).join(', ') },
      parts.map(([k, v]) => h('span', { style: { width: `${(v / sum) * 100}%`, background: PART_COLORS[k] }, title: `${PART_LABELS[k]}: ${fmt.money(v)}` }))),
    h('div', { class: 'breakdown' },
      parts.map(([k, v]) => h('div', { class: 'breakdown-row' },
        h('span', { class: 'cat-dot', style: { background: PART_COLORS[k] } }),
        h('span', { class: 'label' }, PART_LABELS[k], k === 'material' ? ` (${fmt.grams(r.grams)})` : k === 'energy' ? ` (${fmt.dec(r.energyKwh)} kWh)` : ''),
        h('span', { class: 'value' }, fmt.money(v)))),
      h('div', { class: 'breakdown-row total' }, h('span', { class: 'label' }, 'Selbstkosten'), h('span', { class: 'value' }, fmt.money(r.cost))),
      h('div', { class: 'breakdown-row' }, h('span', { class: 'label' }, `Gewinn (${calc.markup || 0} %)`), h('span', { class: 'value' }, fmt.money(r.profit))),
      h('div', { class: 'breakdown-row total' }, h('span', { class: 'label' }, 'Netto pro Druck'), h('span', { class: 'value' }, fmt.money(r.net)))),
    r.quantity > 1 ? h('div', { class: 'card', style: { background: 'var(--surface-2)', boxShadow: 'none', padding: '12px 14px' } },
      h('div', { class: 'breakdown' },
        h('div', { class: 'breakdown-row' }, h('span', { class: 'label' }, `${r.quantity} Drucke · ${r.quantity * r.pieces} Teile`), h('span', { class: 'value' }, fmt.duration(r.total.minutes))),
        h('div', { class: 'breakdown-row' }, h('span', { class: 'label' }, 'Material gesamt'), h('span', { class: 'value' }, fmt.grams(r.total.grams))),
        h('div', { class: 'breakdown-row total' }, h('span', { class: 'label' }, small ? 'Gesamt' : 'Gesamt brutto'), h('span', { class: 'value' }, fmt.money(small ? r.total.net : r.total.gross))))) : null,
    h('div', { class: 'row wrap' },
      button(calc.quoteId ? 'Kalkulation aktualisieren' : 'Kalkulation sichern', { primary: true, icon: 'check', onClick: saveQuote }),
      button('Auftrag anlegen', { icon: 'orders', onClick: () => createOrder(r) }),
      calc.designId ? button('Preis ins Design', { plain: true, onClick: async () => {
        const d = byId('designs', calc.designId);
        await save('designs', { ...d, price: round2(r.perPiece.net), printMinutes: Math.round(calc.printMinutes / r.pieces), weight: Math.round(r.grams / r.pieces) });
        toast(`Preis von „${d.name}“ auf ${fmt.money(r.perPiece.net)} netto gesetzt`);
      } }) : null,
      calc.orderId ? button('Preis in Auftrag', { plain: true, onClick: async () => {
        const o = byId('orders', calc.orderId);
        await save('orders', { ...o, price: round2(r.total.net) });
        toast(`Auftragspreis auf ${fmt.money(r.total.net)} netto gesetzt`);
      } }) : null));
}

async function saveQuote() {
  const r = calculate(calc);
  const { quoteId, ...input } = calc;
  const q = await save('quotes', { id: quoteId, title: calc.title || 'Kalkulation', input, net: round2(r.total.net), gross: round2(r.total.gross) });
  calc.quoteId = q.id;
  toast('Kalkulation gesichert');
}

function createOrder(r) {
  openOrderSheet(null, {
    title: calc.title, designId: calc.designId, printerId: calc.printerId,
    durationMin: Math.round(calc.printMinutes * r.quantity), price: round2(r.total.net), quantity: r.quantity * r.pieces,
    grams: Math.round(r.total.grams), spoolId: calc.materials[0]?.spoolId,
  });
}

function savedQuotes() {
  const list = [...state.quotes].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return h('section', { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', {}, 'Gesicherte Kalkulationen')),
    list.length ? h('div', { class: 'card flush' }, h('ul', { class: 'list' }, list.map((q) => h('li', {}, h('div', { class: 'list-row' },
      icon('calculator'),
      h('a', { class: 'grow', href: `#/calculator?quote=${q.id}`, style: { color: 'inherit' } },
        h('div', { class: 'primary' }, q.title), h('div', { class: 'secondary' }, `${fmt.date(q.updatedAt)} · ${fmt.duration(q.input.printMinutes)} · ${fmt.grams((q.input.materials ?? []).reduce((a, m) => a + Number(m.grams || 0), 0))}`)),
      h('span', { class: 'tabular', style: { fontWeight: 600 } }, fmt.money(q.input.smallBusiness ? q.net : q.gross)),
      iconButton('trash', `${q.title} löschen`, async () => { await remove('quotes', q.id); toast('Kalkulation gelöscht'); }, 'danger'))))))
      : h('div', { class: 'card' }, h('p', { class: 'muted small' }, 'Gesicherte Kalkulationen erscheinen hier, damit du Angebote später wiederfindest.')));
}

