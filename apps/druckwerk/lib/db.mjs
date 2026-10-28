// JSON-Datei als Datenbank: klein, lesbar, ohne Abhängigkeiten.
// Schreibt atomar (temporäre Datei + rename) und bündelt schnelle Änderungen.
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export const COLLECTIONS = ['printers', 'customers', 'designs', 'orders', 'spools', 'invoices', 'quotes'];

export const DEFAULT_SETTINGS = {
  company: {
    name: '', owner: '', street: '', zip: '', city: '', country: 'Deutschland',
    email: '', phone: '', website: '', vatId: '', taxNumber: '',
    bank: '', iban: '', bic: '',
  },
  invoice: {
    prefix: 'RE-{YYYY}-', nextNumber: 1, paymentDays: 14,
    smallBusiness: false, vatRate: 19,
    footer: 'Vielen Dank für Ihren Auftrag.',
  },
  calc: {
    electricityPrice: 0.35, hourlyRate: 30, markup: 40, failureRate: 5,
    prepMinutes: 10, postMinutes: 10, wastePercent: 5, extras: 0,
  },
  currency: 'EUR',
};

export class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'db.json');
    this.data = null;
    this.timer = null;
    this.writing = Promise.resolve();
  }

  async load() {
    await mkdir(this.dir, { recursive: true });
    if (existsSync(this.file)) {
      this.data = JSON.parse(await readFile(this.file, 'utf8'));
    } else {
      this.data = {};
    }
    for (const c of COLLECTIONS) this.data[c] ??= [];
    this.data.settings = mergeDeep(structuredClone(DEFAULT_SETTINGS), this.data.settings ?? {});
    return this;
  }

  list(collection) {
    this.#check(collection);
    return this.data[collection];
  }

  get(collection, id) {
    return this.list(collection).find((r) => r.id === id) ?? null;
  }

  create(collection, record) {
    const now = new Date().toISOString();
    const row = { ...record, id: record.id || randomUUID(), createdAt: now, updatedAt: now };
    if (collection === 'invoices' && !row.number) row.number = this.nextInvoiceNumber(row.date);
    this.list(collection).push(row);
    this.save();
    return row;
  }

  update(collection, id, patch) {
    const rows = this.list(collection);
    const i = rows.findIndex((r) => r.id === id);
    if (i < 0) return null;
    rows[i] = { ...rows[i], ...patch, id, createdAt: rows[i].createdAt, updatedAt: new Date().toISOString() };
    this.save();
    return rows[i];
  }

  remove(collection, id) {
    const rows = this.list(collection);
    const i = rows.findIndex((r) => r.id === id);
    if (i < 0) return false;
    rows.splice(i, 1);
    this.save();
    return true;
  }

  settings() {
    return this.data.settings;
  }

  updateSettings(patch) {
    this.data.settings = mergeDeep(this.data.settings, patch);
    this.save();
    return this.data.settings;
  }

  nextInvoiceNumber(date) {
    const s = this.data.settings.invoice;
    const year = String(new Date(date || Date.now()).getFullYear());
    const n = Number(s.nextNumber) || 1;
    s.nextNumber = n + 1;
    return s.prefix.replace('{YYYY}', year) + String(n).padStart(4, '0');
  }

  snapshot() {
    return structuredClone(this.data);
  }

  replace(data) {
    const next = {};
    for (const c of COLLECTIONS) next[c] = Array.isArray(data?.[c]) ? data[c] : [];
    next.settings = mergeDeep(structuredClone(DEFAULT_SETTINGS), data?.settings ?? {});
    this.data = next;
    this.save();
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 150);
  }

  flush() {
    clearTimeout(this.timer);
    const json = JSON.stringify(this.data, null, 2);
    this.writing = this.writing.then(async () => {
      const tmp = this.file + '.tmp';
      await writeFile(tmp, json);
      await rename(tmp, this.file);
    });
    return this.writing;
  }

  #check(collection) {
    if (!COLLECTIONS.includes(collection)) throw Object.assign(new Error('Unbekannte Sammlung'), { status: 404 });
  }
}

export function mergeDeep(target, source) {
  for (const [k, v] of Object.entries(source ?? {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') {
      mergeDeep(target[k], v);
    } else {
      target[k] = v;
    }
  }
  return target;
}
