import { h, icon, pageBar, button, field, toast, readForm, pickFile, download, confirmSheet, badge } from '../ui.js';
import { state, saveSettings, replaceAll, api } from '../store.js';
import { openBambuSheet } from './printers.js';

// Einstellungen sichern sich beim Verlassen eines Feldes von selbst
function group(title, key, fields, note) {
  const form = h('form', { class: 'fieldset', onsubmit: (e) => e.preventDefault() }, fields);
  form.addEventListener('change', async () => {
    try {
      await saveSettings({ [key]: readForm(form) }, { silent: true });
      toast('Gesichert');
    } catch (err) { toast(err.message, 'error'); }
  });
  return h('section', { class: 'card' },
    h('h2', { class: 'card-title' }, title),
    note ? h('p', { class: 'muted small', style: { margin: '4px 0 14px' } }, note) : h('div', { style: { height: '14px' } }),
    form);
}

export default function settings() {
  const { company: co, invoice: inv, calc } = state.settings;
  const b = state.bambu ?? {};
  return h('div', { class: 'page' },
    pageBar({ title: 'Einstellungen', subtitle: 'Änderungen werden automatisch gesichert' }),
    h('div', { class: 'stack', style: { gap: '20px', maxWidth: '880px' } },
      group('Firma', 'company', [
        field({ label: 'Firmenname', name: 'name', value: co.name, autocomplete: 'organization' }),
        field({ label: 'Inhaber', name: 'owner', value: co.owner, autocomplete: 'name' }),
        field({ label: 'Straße und Hausnummer', name: 'street', value: co.street, span: 'all' }),
        field({ label: 'PLZ', name: 'zip', value: co.zip }),
        field({ label: 'Ort', name: 'city', value: co.city }),
        field({ label: 'Land', name: 'country', value: co.country }),
        field({ label: 'E-Mail', name: 'email', type: 'email', value: co.email }),
        field({ label: 'Telefon', name: 'phone', type: 'tel', value: co.phone }),
        field({ label: 'Website', name: 'website', value: co.website }),
        field({ label: 'Steuernummer', name: 'taxNumber', value: co.taxNumber }),
        field({ label: 'USt-IdNr.', name: 'vatId', value: co.vatId }),
        field({ label: 'Bank', name: 'bank', value: co.bank }),
        field({ label: 'IBAN', name: 'iban', value: co.iban }),
        field({ label: 'BIC', name: 'bic', value: co.bic }),
      ], 'Erscheint im Kopf und in der Fußzeile jeder Rechnung.'),

      group('Rechnungen', 'invoice', [
        field({ label: 'Kleinunternehmer (§ 19 UStG)', name: 'smallBusiness', type: 'switch', value: inv.smallBusiness, span: 'all' }),
        field({ label: 'Umsatzsteuersatz', name: 'vatRate', type: 'number', value: inv.vatRate, unit: '%' }),
        field({ label: 'Zahlungsziel', name: 'paymentDays', type: 'number', value: inv.paymentDays, unit: 'Tage' }),
        field({ label: 'Nummernformat', name: 'prefix', value: inv.prefix, hint: '{YYYY} wird durch das Jahr ersetzt' }),
        field({ label: 'Nächste Nummer', name: 'nextNumber', type: 'number', value: inv.nextNumber, step: 1 }),
        field({ label: 'Schlusstext', name: 'footer', type: 'textarea', value: inv.footer, span: 'all' }),
      ], 'Als Kleinunternehmer weist Druckwerk keine Umsatzsteuer aus und druckt den Pflichthinweis auf jede Rechnung.'),

      group('Standardwerte für den Kostenrechner', 'calc', [
        field({ label: 'Strompreis', name: 'electricityPrice', type: 'number', value: calc.electricityPrice, unit: '€/kWh' }),
        field({ label: 'Stundensatz', name: 'hourlyRate', type: 'number', value: calc.hourlyRate, unit: '€/h' }),
        field({ label: 'Gewinnaufschlag', name: 'markup', type: 'number', value: calc.markup, unit: '%' }),
        field({ label: 'Fehldruckrisiko', name: 'failureRate', type: 'number', value: calc.failureRate, unit: '%' }),
        field({ label: 'Ausschuss / Stützen', name: 'wastePercent', type: 'number', value: calc.wastePercent, unit: '%' }),
        field({ label: 'Vorbereitung', name: 'prepMinutes', type: 'number', value: calc.prepMinutes, unit: 'min' }),
        field({ label: 'Nachbearbeitung', name: 'postMinutes', type: 'number', value: calc.postMinutes, unit: 'min' }),
        field({ label: 'Zusatzkosten pro Druck', name: 'extras', type: 'number', value: calc.extras, unit: '€' }),
      ]),

      h('section', { class: 'card' },
        h('div', { class: 'row wrap' },
          h('h2', { class: 'card-title' }, 'Bambu Cloud'),
          badge(b.connected ? 'Verbunden' : 'Nicht verbunden', b.connected ? 'green' : ''),
          h('span', { class: 'spacer' }),
          button(b.connected ? 'Verwalten' : 'Verbinden', { icon: 'cloud', onClick: openBambuSheet })),
        h('p', { class: 'muted small', style: { marginTop: '8px' } }, b.connected
          ? `Angemeldet als ${b.email}. Live-Status: ${b.mqtt}. Die Anmeldung läuft nach etwa drei Monaten ab und muss dann erneuert werden.`
          : 'Verbinde dein Bambu-Lab-Konto, um Drucker mit Live-Status, AMS-Belegung und Druckhistorie zu übernehmen.')),

      h('section', { class: 'card' },
        h('h2', { class: 'card-title' }, 'Daten'),
        h('p', { class: 'muted small', style: { margin: '4px 0 14px' } }, 'Alle Daten liegen in einer Datei auf deinem Server (data/db.json). Sichere sie regelmäßig.'),
        h('div', { class: 'row wrap' },
          button('Sicherung herunterladen', { icon: 'download', onClick: async () => {
            const data = await api('/api/export');
            download(`druckwerk-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2));
          } }),
          button('Sicherung einspielen', { icon: 'upload', onClick: async () => {
            const [file] = await pickFile('application/json,.json');
            if (!file) return;
            let data;
            try { data = JSON.parse(await file.text()); } catch { return toast('Die Datei ist keine gültige Sicherung.', 'error'); }
            if (!(await confirmSheet({ title: 'Sicherung einspielen?', text: 'Alle aktuellen Daten werden durch die Sicherung ersetzt.', confirm: 'Ersetzen', danger: true }))) return;
            await replaceAll('/api/import', data);
            toast('Sicherung eingespielt');
          } }),
          button('Beispieldaten laden', { plain: true, onClick: async () => {
            if (!(await confirmSheet({ title: 'Beispieldaten laden?', text: 'Alle aktuellen Daten werden durch Beispieldaten ersetzt.', confirm: 'Ersetzen', danger: true }))) return;
            await replaceAll('/api/seed');
            toast('Beispieldaten geladen');
          } }),
          button('Alles löschen', { danger: true, icon: 'trash', onClick: async () => {
            if (!(await confirmSheet({ title: 'Alle Daten löschen?', text: 'Drucker, Kunden, Designs, Aufträge, Filament und Rechnungen werden entfernt. Lade vorher eine Sicherung herunter.', confirm: 'Alles löschen', danger: true }))) return;
            await replaceAll('/api/import', { settings: state.settings });
            toast('Alle Daten gelöscht');
          } })),
        h('p', { class: 'muted small row', style: { marginTop: '14px' } }, icon('bolt'), 'Tipp: Druckwerk lässt sich als App installieren. In Safari: Teilen › Zum Dock hinzufügen.'))));
}
