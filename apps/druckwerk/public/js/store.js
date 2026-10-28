// Datenhaltung im Browser: lädt alles einmal, schreibt über die REST-API zurück und
// verteilt Änderungen sowie den Live-Status der Drucker an die Ansichten.

export const state = {
  printers: [], customers: [], designs: [], orders: [], spools: [], invoices: [], quotes: [],
  settings: null,
  bambu: { connected: false },
  live: {},
  loaded: false,
};

const listeners = { change: new Set(), live: new Set() };
export const on = (event, fn) => { listeners[event].add(fn); return () => listeners[event].delete(fn); };
const emit = (event) => listeners[event].forEach((fn) => fn());

export async function api(path, { method = 'GET', body, headers } = {}) {
  const res = await fetch(path, {
    method,
    headers: body instanceof Blob || body instanceof File ? headers : { 'Content-Type': 'application/json', ...headers },
    body: body == null ? undefined : body instanceof Blob ? body : JSON.stringify(body),
  });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new Error(data?.error || `Fehler ${res.status}`);
  return data;
}

export async function load() {
  const data = await api('/api/state');
  Object.assign(state, data, { loaded: true });
  emit('change');
}

export async function save(collection, record) {
  const saved = record.id
    ? await api(`/api/${collection}/${record.id}`, { method: 'PUT', body: record })
    : await api(`/api/${collection}`, { method: 'POST', body: record });
  const list = state[collection];
  const i = list.findIndex((r) => r.id === saved.id);
  if (i >= 0) list[i] = saved; else list.push(saved);
  if (collection === 'invoices' && !record.id) state.settings = await api('/api/settings');
  emit('change');
  return saved;
}

export async function remove(collection, id) {
  await api(`/api/${collection}/${id}`, { method: 'DELETE' });
  state[collection] = state[collection].filter((r) => r.id !== id);
  emit('change');
}

export async function saveSettings(patch, { silent = false } = {}) {
  state.settings = await api('/api/settings', { method: 'PUT', body: patch });
  if (!silent) emit('change');
}

export async function replaceAll(endpoint, body) {
  const data = await api(endpoint, { method: 'POST', body });
  Object.assign(state, data);
  emit('change');
}

export async function uploadFile(file) {
  return api('/api/files', {
    method: 'POST', body: file,
    headers: { 'X-File-Name': encodeURIComponent(file.name), 'Content-Type': file.type || 'application/octet-stream' },
  });
}

export function refreshBambu(status) {
  state.bambu = status;
  emit('change');
}

export function connectLive() {
  const es = new EventSource('/api/live');
  es.addEventListener('live', (e) => {
    const data = JSON.parse(e.data);
    const wasConnected = state.bambu?.connected;
    state.live = data.printers;
    state.bambu = data.bambu;
    if (wasConnected !== data.bambu.connected) emit('change');
    emit('live');
  });
  // Für Drucker ohne Cloud wird der Fortschritt aus dem Zeitplan berechnet
  setInterval(() => emit('live'), 30000);
}

// ---------- Abfragen ----------
export const byId = (collection, id) => state[collection].find((r) => r.id === id) ?? null;
export const customerName = (c) => (c ? c.company || c.name : 'Ohne Kunde');

export const ORDER_STATUS = {
  planned: { label: 'Geplant', tone: 'blue' },
  printing: { label: 'Im Druck', tone: 'green' },
  done: { label: 'Gedruckt', tone: '' },
  delivered: { label: 'Ausgeliefert', tone: '' },
  cancelled: { label: 'Storniert', tone: 'red' },
};

export function orderEnd(o) {
  return new Date(new Date(o.start).getTime() + (Number(o.durationMin) || 0) * 60000);
}

// Status eines Druckers: live aus der Bambu Cloud oder abgeleitet aus dem Zeitplan
export function printerStatus(p) {
  const live = p.source === 'bambu' ? state.live[p.serial] : null;
  if (p.maintenance) return { state: 'maintenance', label: 'Wartung', tone: 'orange', icon: 'wrench' };
  if (live && live.state !== 'unknown') {
    const map = {
      printing: ['Druckt', 'green'], preparing: ['Bereitet vor', 'green'], paused: ['Pausiert', 'orange'],
      failed: ['Fehler', 'red'], finished: ['Fertig', ''], idle: ['Bereit', ''],
    };
    const [label, tone] = map[live.state] ?? ['Bereit', ''];
    return { ...live, label, tone, isLive: true };
  }
  if (p.source === 'bambu') {
    return { state: 'offline', label: state.bambu?.connected ? 'Keine Daten' : 'Cloud getrennt', tone: '', icon: 'wifiOff' };
  }
  const now = Date.now();
  const job = state.orders.find((o) => o.printerId === p.id && o.status === 'printing');
  if (job) {
    const start = new Date(job.start).getTime();
    const total = (Number(job.durationMin) || 1) * 60000;
    const percent = Math.max(0, Math.min(100, Math.round(((now - start) / total) * 100)));
    const design = byId('designs', job.designId);
    return {
      state: 'printing', label: percent >= 100 ? 'Fertig, bitte entnehmen' : 'Druckt', tone: 'green', percent,
      remainingMin: Math.max(0, Math.round((start + total - now) / 60000)), file: design?.name || job.title, job,
    };
  }
  return { state: 'idle', label: 'Bereit', tone: '' };
}

export function nextOrderFor(printerId) {
  const now = Date.now();
  return state.orders
    .filter((o) => o.printerId === printerId && o.status === 'planned' && new Date(o.start).getTime() >= now - 36e5)
    .sort((a, b) => new Date(a.start) - new Date(b.start))[0] ?? null;
}

export function invoiceTotals(inv, settings = state.settings) {
  const small = settings?.invoice?.smallBusiness;
  let net = 0;
  const vat = {};
  for (const it of inv.items ?? []) {
    const line = (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
    net += line;
    const rate = small ? 0 : Number(it.vatRate ?? settings?.invoice?.vatRate ?? 19);
    if (rate) vat[rate] = (vat[rate] ?? 0) + line * (rate / 100);
  }
  const vatSum = Object.values(vat).reduce((a, b) => a + b, 0);
  return { net: round2(net), vat, vatSum: round2(vatSum), gross: round2(net + vatSum) };
}

export function invoiceStatus(inv) {
  if (inv.status === 'paid') return { key: 'paid', label: 'Bezahlt', tone: 'green' };
  if (inv.status === 'cancelled') return { key: 'cancelled', label: 'Storniert', tone: '' };
  if (inv.status === 'draft') return { key: 'draft', label: 'Entwurf', tone: '' };
  if (inv.dueDate && new Date(inv.dueDate + 'T23:59:59') < new Date()) return { key: 'overdue', label: 'Überfällig', tone: 'red' };
  return { key: 'open', label: 'Offen', tone: 'blue' };
}

export const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

export function lowSpools() {
  return state.spools.filter((s) => Number(s.remaining) <= Number(s.lowThreshold ?? 200));
}

export const PRINTER_COLORS = {
  blue: 'Blau', teal: 'Türkis', indigo: 'Indigo', pink: 'Pink', purple: 'Lila', brown: 'Braun', mint: 'Mint', graphite: 'Graphit',
};
export const printerColor = (p) => `var(--cat-${p?.color && PRINTER_COLORS[p.color] ? p.color : 'graphite'})`;
