import { h, icon, fmt, pageBar, button, field, formSheet, searchField, toast, emptyState, isoDate, sheet, readForm } from '../ui.js';
import { state, save, remove, lowSpools } from '../store.js';
import { MATERIAL_NAMES } from '../calc.js';
import { spoolRing, card } from './components.js';

const view = { query: '' };

export default function filament() {
  const total = state.spools.reduce((a, s) => a + (Number(s.remaining) || 0), 0);
  const value = state.spools.reduce((a, s) => a + (Number(s.remaining) || 0) / (Number(s.netWeight) || 1000) * (Number(s.price) || 0), 0);
  const low = lowSpools();
  const host = h('div');
  const draw = () => host.replaceChildren(groups());
  draw();
  return h('div', { class: 'page' },
    pageBar({
      title: 'Filament',
      subtitle: `${state.spools.length} Spulen · ${fmt.grams(total)} auf Lager`,
      actions: [
        searchField('Material, Farbe, Marke', view.query, (q) => { view.query = q; draw(); }),
        button('Spule hinzufügen', { primary: true, icon: 'plus', onClick: () => openSpoolSheet() }),
      ],
    }),
    state.spools.length ? h('div', { class: 'grid grid-kpi', style: { marginBottom: '24px' } },
      stat('spool', 'Bestand', fmt.grams(total)),
      stat('euro', 'Lagerwert', fmt.money(value)),
      stat('warning', 'Fast leer', low.length ? `${low.length} Spulen` : 'keine', low.length ? 'var(--orange)' : null)) : null,
    host);
}

function stat(ic, label, value, color) {
  return h('div', { class: 'card kpi' }, h('div', { class: 'kpi-label' }, icon(ic), label), h('div', { class: 'kpi-value', style: { color } }, value));
}

function groups() {
  const q = view.query.toLowerCase();
  const rows = state.spools.filter((s) => !q || [s.material, s.colorName, s.brand, s.location].join(' ').toLowerCase().includes(q));
  if (!rows.length) {
    return h('div', { class: 'card' }, emptyState({
      icon: 'spool', title: q ? 'Keine Treffer' : 'Noch kein Filament',
      text: q ? `Keine Spule passt zu „${view.query}“.` : 'Erfasse deine Spulen, damit Druckwerk den Verbrauch abbucht und rechtzeitig warnt.',
      action: q ? null : button('Spule hinzufügen', { primary: true, icon: 'plus', onClick: () => openSpoolSheet() }),
    }));
  }
  const byMat = {};
  for (const s of rows) (byMat[s.material] ??= []).push(s);
  return h('div', { class: 'stack', style: { gap: '20px' } }, Object.entries(byMat).sort().map(([mat, list]) => card(
    `${mat} · ${fmt.grams(list.reduce((a, s) => a + Number(s.remaining || 0), 0))}`,
    h('ul', { class: 'list' }, list.sort((a, b) => a.remaining - b.remaining).map((s) => spoolRow(s))))));
}

function spoolRow(s) {
  const pct = Math.round((Number(s.remaining) || 0) / (Number(s.netWeight) || 1000) * 100);
  const low = Number(s.remaining) <= Number(s.lowThreshold ?? 200);
  const empty = Number(s.remaining) <= 0;
  return h('li', {}, h('button', { type: 'button', class: 'list-row', onclick: () => openSpoolSheet(s) },
    spoolRing(s, 44),
    h('div', { class: 'grow' },
      h('div', { class: 'primary' }, `${s.colorName || 'Ohne Farbname'}`, h('span', { class: 'muted', style: { fontWeight: 400 } }, ` · ${s.brand || 'ohne Marke'}`)),
      h('div', { class: 'secondary' }, [s.location, s.price ? `${fmt.money(s.price / ((s.netWeight || 1000) / 1000))}/kg` : null, `${s.diameter ?? 1.75} mm`].filter(Boolean).join(' · '))),
    h('div', { style: { width: 'min(180px, 30vw)' }, class: 'stack trail' },
      h('div', { class: 'row', style: { justifyContent: 'space-between', gap: '6px' } },
        h('span', { class: 'small tabular', style: { fontWeight: 600 } }, `${fmt.grams(s.remaining)}`),
        low ? h('span', { class: 'small', style: { color: empty ? 'var(--red)' : 'var(--orange)', fontWeight: 600 } }, empty ? 'Leer' : 'Nachbestellen') : h('span', { class: 'small muted tabular' }, `${pct} %`)),
      h('div', { class: ['meter', low && 'low', empty && 'empty'], role: 'meter', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Füllstand' }, h('span', { style: { width: `${Math.max(2, Math.min(100, pct))}%` } }))),
    icon('chevron', 'chev')));
}

export function openSpoolSheet(spool) {
  const s = spool ?? { material: 'PLA', diameter: 1.75, netWeight: 1000, remaining: 1000, lowThreshold: 200, color: '#1d1d1f', purchased: isoDate() };
  const sh = formSheet({
    title: spool ? `${spool.material} ${spool.colorName}` : 'Spule hinzufügen',
    size: 'wide',
    fields: [
      h('fieldset', { class: 'fieldset' },
        field({ label: 'Material', name: 'material', type: 'select', value: s.material, options: MATERIAL_NAMES.map((m) => [m, m]) }),
        field({ label: 'Marke', name: 'brand', value: s.brand, placeholder: 'Bambu Lab, Prusament …' }),
        field({ label: 'Farbname', name: 'colorName', value: s.colorName, required: true }),
        field({ label: 'Farbe', name: 'color', type: 'color', value: s.color }),
        field({ label: 'Durchmesser', name: 'diameter', type: 'number', value: s.diameter, unit: 'mm' }),
        field({ label: 'Lagerort', name: 'location', value: s.location, placeholder: 'Regal, AMS-Slot …' })),
      h('fieldset', { class: 'fieldset' }, h('legend', {}, 'Bestand und Preis'),
        field({ label: 'Nettogewicht', name: 'netWeight', type: 'number', value: s.netWeight, unit: 'g' }),
        field({ label: 'Restmenge', name: 'remaining', type: 'number', value: s.remaining, unit: 'g' }),
        field({ label: 'Warnen ab', name: 'lowThreshold', type: 'number', value: s.lowThreshold, unit: 'g' }),
        field({ label: 'Preis pro Spule', name: 'price', type: 'number', value: s.price, unit: '€', step: '0.01' }),
        field({ label: 'Gekauft am', name: 'purchased', type: 'date', value: s.purchased })),
    ],
    extra: spool ? h('div', { class: 'row wrap' },
      button('Verbrauch buchen', { icon: 'minus', onClick: () => { sh.close(); bookUsage(spool); } }),
      button('Neue Spule eingelegt', { icon: 'refresh', onClick: async () => { await save('spools', { ...spool, remaining: spool.netWeight || 1000, purchased: isoDate() }); sh.close(); toast('Spule wieder voll'); } }),
      button('Duplizieren', { icon: 'copy', onClick: async () => { const { id, createdAt, updatedAt, ...rest } = spool; await save('spools', { ...rest, remaining: rest.netWeight || 1000, purchased: isoDate() }); sh.close(); toast('Spule dupliziert'); } })) : null,
    onDelete: spool ? async () => { await remove('spools', spool.id); toast('Spule gelöscht'); } : null,
    onSubmit: async (f) => {
      await save('spools', { ...s, ...f });
      toast(spool ? 'Spule gesichert' : 'Spule hinzugefügt');
    },
  });
}

function bookUsage(spool) {
  const form = h('form', { class: 'form', id: 'usage-form' },
    field({ label: 'Verbrauch', name: 'grams', type: 'number', required: true, unit: 'g', hint: `Aktuell ${fmt.grams(spool.remaining)} übrig.` }));
  const sh = sheet({
    title: `Verbrauch buchen · ${spool.material} ${spool.colorName}`, size: 'narrow', body: form,
    actions: [{ label: 'Abbrechen' }, { label: 'Abbuchen', primary: true, submit: true, form: 'usage-form' }],
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const g = Number(readForm(form).grams) || 0;
    await save('spools', { ...spool, remaining: Math.max(0, Math.round(spool.remaining - g)) });
    sh.close();
    toast(`${fmt.grams(g)} abgebucht`);
  });
}
