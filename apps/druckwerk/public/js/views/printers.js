import { h, icon, fmt, pageBar, button, field, formSheet, sheet, toast, emptyState, readForm, go, badge } from '../ui.js';
import { state, save, remove, api, refreshBambu, printerStatus, PRINTER_COLORS } from '../store.js';
import { liveRegion } from '../live.js';
import { printerCard } from './components.js';

// Richtwerte für Bambu-Modelle: durchschnittliche Leistung beim Drucken und Neupreis
const BAMBU_DEFAULTS = {
  'X1 Carbon': [150, 1449], X1C: [150, 1449], X1E: [160, 2299], X1: [150, 1199],
  P1S: [120, 799], P1P: [110, 599], P2S: [130, 899], A1: [95, 399], 'A1 mini': [80, 249], H2D: [200, 2199], H2S: [180, 1699],
};

export default function printers() {
  const b = state.bambu ?? {};
  return h('div', { class: 'page' },
    pageBar({
      title: 'Drucker',
      subtitle: `${state.printers.length} Drucker · Bambu Cloud ${b.connected ? `verbunden (${b.email})` : 'nicht verbunden'}`,
      actions: [
        button(b.connected ? 'Bambu Cloud' : 'Bambu Cloud verbinden', { icon: 'cloud', onClick: openBambuSheet }),
        button('Drucker hinzufügen', { primary: true, icon: 'plus', onClick: () => openPrinterSheet() }),
      ],
    }),
    b.connected ? cloudStrip(b) : null,
    state.printers.length
      ? liveRegion(() => h('div', { class: 'grid grid-cards' }, state.printers.map((p) => printerCard(p, { onOpen: openPrinterSheet }))))
      : h('div', { class: 'card' }, emptyState({
          icon: 'printer', title: 'Noch keine Drucker',
          text: 'Mit der Bambu Cloud übernimmst du deine Drucker samt Live-Status, AMS-Belegung und Druckhistorie. Andere Drucker legst du von Hand an.',
          action: h('div', { class: 'row wrap', style: { justifyContent: 'center' } },
            button('Bambu Cloud verbinden', { primary: true, icon: 'cloud', onClick: openBambuSheet }),
            button('Von Hand anlegen', { onClick: () => openPrinterSheet() })),
        })));
}

function cloudStrip(b) {
  const tone = b.mqtt === 'verbunden' ? 'green' : b.mqtt === 'Fehler' ? 'red' : 'orange';
  return liveRegion(() => h('div', { class: 'card row wrap', style: { marginBottom: '16px', padding: '12px 18px' } },
    icon('cloud'), h('span', { style: { fontWeight: 500 } }, 'Live-Status'),
    badge(state.bambu.mqtt === 'verbunden' ? 'Verbunden' : state.bambu.mqtt, tone),
    state.bambu.error ? h('span', { class: 'small', style: { color: 'var(--red)' } }, state.bambu.error) : null,
    h('span', { class: 'spacer' }),
    button('Druckhistorie', { plain: true, icon: 'clock', onClick: () => openHistorySheet() })));
}

export function openPrinterSheet(printer) {
  const p = printer ?? { source: 'manual', brand: '', color: Object.keys(PRINTER_COLORS)[state.printers.length % 8], powerW: 120, price: 800, lifetimeHours: 5000, maintenancePerHour: 0.05, nozzle: 0.4 };
  const statusBox = printer ? liveRegion(() => {
    const st = printerStatus(printer);
    return h('div', { class: 'card row wrap', style: { background: 'var(--surface-2)', boxShadow: 'none' } },
      badge(st.label, st.tone, st.icon),
      st.file ? h('span', { class: 'small' }, `${st.file} · ${st.percent ?? 0} %`) : h('span', { class: 'small muted' }, 'Kein aktiver Druck'),
      st.isLive && st.updatedAt ? h('span', { class: 'small muted' }, `Stand ${fmt.time(st.updatedAt)}`) : null);
  }) : null;

  const sh = formSheet({
    title: printer ? printer.name : 'Drucker hinzufügen',
    size: 'wide',
    submitLabel: printer ? 'Sichern' : 'Hinzufügen',
    fields: [
      statusBox,
      h('fieldset', { class: 'fieldset' },
        field({ label: 'Name', name: 'name', value: p.name, required: true, placeholder: 'z. B. P1S Werkbank' }),
        field({ label: 'Hersteller', name: 'brand', value: p.brand, placeholder: 'Bambu Lab, Prusa, Creality …' }),
        field({ label: 'Modell', name: 'model', value: p.model }),
        field({ label: 'Farbe im Kalender', name: 'color', type: 'select', value: p.color, options: Object.entries(PRINTER_COLORS) }),
        field({ label: 'Bauraum', name: 'buildVolume', value: p.buildVolume, placeholder: '256 × 256 × 256 mm' }),
        field({ label: 'Düse', name: 'nozzle', type: 'number', value: p.nozzle, unit: 'mm' }),
        p.source === 'bambu' ? field({ label: 'Seriennummer (Bambu)', name: 'serial', value: p.serial, disabled: true }) : null,
        field({ label: 'In Wartung', name: 'maintenance', type: 'switch', value: p.maintenance })),
      h('fieldset', { class: 'fieldset' }, h('legend', {}, 'Für die Kostenrechnung'),
        field({ label: 'Leistung beim Drucken', name: 'powerW', type: 'number', value: p.powerW, unit: 'W', hint: 'Durchschnitt, nicht Spitzenwert' }),
        field({ label: 'Anschaffungspreis', name: 'price', type: 'number', value: p.price, unit: '€' }),
        field({ label: 'Erwartete Lebensdauer', name: 'lifetimeHours', type: 'number', value: p.lifetimeHours, unit: 'h' }),
        field({ label: 'Wartung & Verschleiß', name: 'maintenancePerHour', type: 'number', value: p.maintenancePerHour, unit: '€/h', hint: 'Düsen, Riemen, PEI-Platten' })),
      field({ label: 'Notizen', name: 'notes', type: 'textarea', value: p.notes, span: 'all' }),
    ],
    extra: printer ? h('div', { class: 'row wrap' },
      printer.source === 'bambu' && state.bambu.connected ? button('Druckhistorie aus der Cloud', { icon: 'clock', onClick: () => openHistorySheet(printer) }) : null,
      button('Aufträge im Kalender', { icon: 'calendar', onClick: () => { sh.close(); go('calendar'); } })) : null,
    onDelete: printer ? async () => { await remove('printers', printer.id); toast('Drucker entfernt'); } : null,
    onSubmit: async (f) => {
      delete f.serial;
      await save('printers', { ...p, ...f });
      toast(printer ? 'Drucker gesichert' : 'Drucker hinzugefügt');
    },
  });
}

// ---------- Bambu Cloud ----------
export async function openBambuSheet() {
  const body = h('div', { class: 'stack' });
  const sh = sheet({ title: 'Bambu Cloud', body, size: 'narrow' });
  const status = await api('/api/bambu/status');
  refreshBambu(status);
  if (status.connected) return showDevices(body, sh);
  showLogin(body, sh, status.pending);
}

function showLogin(body, sh, pending) {
  if (pending) return showCode(body, sh, pending.type, pending.email);
  const form = h('form', { class: 'form' },
    h('p', { class: 'muted small' }, 'Melde dich mit deinem Bambu-Lab-Konto an. Das Passwort wird nur an Bambu Lab gesendet; Druckwerk speichert ausschließlich das Zugangstoken auf deinem Server.'),
    h('div', { class: 'fieldset', style: { gridTemplateColumns: '1fr' } },
      field({ label: 'E-Mail', name: 'email', type: 'email', required: true, autocomplete: 'username' }),
      field({ label: 'Passwort', name: 'password', type: 'password', required: true, autocomplete: 'current-password' }),
      field({ label: 'Region', name: 'region', type: 'select', value: 'global', options: [['global', 'Weltweit (Europa, Amerika …)'], ['china', 'China']] })),
    h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, button('Anmelden', { primary: true, type: 'submit' })));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = readForm(form);
    const btn = form.querySelector('.btn-primary');
    btn.disabled = true; btn.textContent = 'Anmelden …';
    try {
      const r = await api('/api/bambu/login', { method: 'POST', body: f });
      if (r.step === 'ok') { await afterLogin(body, sh); return; }
      showCode(body, sh, r.step, f.email);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false; btn.textContent = 'Anmelden';
    }
  });
  body.replaceChildren(form);
}

function showCode(body, sh, type, email) {
  const form = h('form', { class: 'form' },
    h('p', {}, type === 'tfa'
      ? 'Gib den sechsstelligen Code aus deiner Authenticator-App ein.'
      : `Bambu Lab hat einen Bestätigungscode an ${email} gesendet. Gib ihn hier ein.`),
    field({ label: 'Code', name: 'code', required: true, inputmode: 'numeric', autocomplete: 'one-time-code', placeholder: '123456' }),
    h('div', { class: 'row' },
      type !== 'tfa' ? button('Code erneut senden', { plain: true, onClick: async () => { try { await api('/api/bambu/resend', { method: 'POST' }); toast('Neuer Code gesendet'); } catch (err) { toast(err.message, 'error'); } } }) : null,
      h('span', { class: 'spacer' }),
      button('Bestätigen', { primary: true, type: 'submit' })));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/bambu/verify', { method: 'POST', body: readForm(form) });
      await afterLogin(body, sh);
    } catch (err) { toast(err.message, 'error'); }
  });
  body.replaceChildren(form);
}

async function afterLogin(body, sh) {
  refreshBambu(await api('/api/bambu/status'));
  toast('Mit der Bambu Cloud verbunden');
  showDevices(body, sh);
}

async function showDevices(body, sh) {
  body.replaceChildren(h('p', { class: 'muted' }, 'Geräte werden geladen …'));
  let devices = [];
  try { devices = await api('/api/bambu/devices'); } catch (err) {
    body.replaceChildren(h('p', { style: { color: 'var(--red)' } }, err.message), logoutButton(body, sh));
    return;
  }
  const known = new Set(state.printers.filter((p) => p.source === 'bambu').map((p) => p.serial));
  const fresh = devices.filter((d) => !known.has(d.serial));
  const list = h('div', { class: 'grouped' }, devices.length ? devices.map((d) => h('label', { class: 'row' },
    h('input', { type: 'checkbox', value: d.serial, checked: !known.has(d.serial), disabled: known.has(d.serial), style: { width: '18px', height: '18px' } }),
    h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { style: { fontWeight: 500 } }, d.name), h('div', { class: 'muted small' }, `${d.model ?? ''} · ${d.serial}`)),
    known.has(d.serial) ? badge('Übernommen', '', 'check') : badge(d.online ? 'Online' : 'Offline', d.online ? 'green' : '')))
    : h('p', { class: 'muted' }, 'Mit diesem Konto sind keine Drucker verknüpft.'));
  body.replaceChildren(
    h('p', { class: 'muted small' }, `Angemeldet als ${state.bambu.email}. Wähle die Drucker, die Druckwerk überwachen soll.`),
    list,
    h('div', { class: 'row' }, logoutButton(body, sh), h('span', { class: 'spacer' }),
      button(`Übernehmen${fresh.length ? ` (${fresh.length})` : ''}`, {
        primary: true, disabled: !fresh.length, onClick: async () => {
          const chosen = [...list.querySelectorAll('input:checked:not(:disabled)')].map((i) => devices.find((d) => d.serial === i.value));
          for (const [i, d] of chosen.entries()) {
            const [powerW, price] = BAMBU_DEFAULTS[d.model] ?? [120, 800];
            await save('printers', {
              name: d.name, brand: 'Bambu Lab', model: d.model, source: 'bambu', serial: d.serial,
              color: Object.keys(PRINTER_COLORS)[(state.printers.length + i) % 8], powerW, price, lifetimeHours: 5000, maintenancePerHour: 0.06,
              nozzle: Number(d.nozzle) || 0.4, ams: true,
            });
          }
          toast(`${chosen.length} Drucker übernommen`);
          sh.close();
        },
      })));
}

function logoutButton(body, sh) {
  return button('Abmelden', { danger: true, onClick: async () => {
    refreshBambu(await api('/api/bambu/logout', { method: 'POST' }));
    toast('Von der Bambu Cloud abgemeldet');
    sh.close();
  } });
}

// Druckhistorie aus der Cloud: Gewicht und Dauer direkt in den Kostenrechner übernehmen
export async function openHistorySheet(printer) {
  const body = h('div', {}, h('p', { class: 'muted' }, 'Druckhistorie wird geladen …'));
  const sh = sheet({ title: printer ? `Druckhistorie · ${printer.name}` : 'Druckhistorie', body, size: 'wide' });
  try {
    const tasks = await api('/api/bambu/tasks' + (printer ? `?deviceId=${encodeURIComponent(printer.serial)}` : ''));
    if (!tasks.length) { body.replaceChildren(emptyState({ icon: 'clock', title: 'Keine Drucke gefunden', text: 'Die Bambu Cloud hat für dieses Konto noch keine Drucke gespeichert.' })); return; }
    body.replaceChildren(h('div', { class: 'card flush', style: { boxShadow: 'none' } }, h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Druck'), h('th', { class: 'hide-s' }, 'Drucker'), h('th', {}, 'Datum'), h('th', { class: 'num' }, 'Gewicht'), h('th', { class: 'num' }, 'Dauer'), h('th', {}))),
      h('tbody', {}, tasks.map((t) => h('tr', { style: { cursor: 'default' } },
        h('td', {}, h('div', { class: 'row' }, t.cover ? h('img', { src: t.cover, alt: '', width: 36, height: 36, loading: 'lazy', style: { borderRadius: '6px', objectFit: 'cover' } }) : null, h('span', {}, t.title))),
        h('td', { class: 'hide-s' }, t.deviceName ?? ''),
        h('td', { class: 'nowrap' }, t.start ? fmt.date(t.start) : '–'),
        h('td', { class: 'num' }, t.weight != null ? fmt.grams(t.weight) : '–'),
        h('td', { class: 'num' }, t.seconds ? fmt.duration(t.seconds / 60) : '–'),
        h('td', {}, button('Kalkulieren', { plain: true, onClick: () => {
          const local = state.printers.find((p) => p.serial === t.deviceId);
          const q = new URLSearchParams({ title: t.title, grams: Math.round(t.weight || 0), minutes: Math.round((t.seconds || 0) / 60), ...(local ? { printer: local.id } : {}) });
          if (t.amsDetailMapping?.[0]?.type) q.set('material', t.amsDetailMapping[0].type);
          sh.close();
          go('calculator?' + q);
        } })))))))));
  } catch (err) {
    body.replaceChildren(h('p', { style: { color: 'var(--red)' } }, err.message));
  }
}
