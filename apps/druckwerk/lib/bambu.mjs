// Bambu-Cloud-Anbindung: Anmeldung (Passwort, E-Mail-Code, Zwei-Faktor), Geräteliste,
// Druckhistorie und Live-Status per MQTT. Das Token bleibt auf dem Server und wird nie
// an den Browser ausgeliefert.
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { MqttClient } from './mqtt.mjs';

const REGIONS = {
  global: { api: 'https://api.bambulab.com', web: 'https://bambulab.com', mqtt: 'us.mqtt.bambulab.com' },
  china: { api: 'https://api.bambulab.cn', web: 'https://bambulab.cn', mqtt: 'cn.mqtt.bambulab.com' },
};

const HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'bambu_network_agent/01.09.05.01',
  'X-BBL-Client-Name': 'OrcaSlicer',
  'X-BBL-Client-Type': 'slicer',
  'X-BBL-Client-Version': '01.09.05.51',
  'X-BBL-Language': 'de-DE',
};

export class BambuCloud extends EventEmitter {
  constructor(dataDir) {
    super();
    this.file = path.join(dataDir, 'bambu.json');
    this.account = null; // { region, email, token, uid }
    this.pending = null; // { email, region, tfaKey }
    this.live = new Map(); // seriennummer -> Rohdaten "print"
    this.serials = new Set();
    this.mqtt = null;
    this.mqttState = 'getrennt';
    this.lastError = null;
  }

  async load() {
    if (existsSync(this.file)) {
      this.account = JSON.parse(await readFile(this.file, 'utf8'));
      if (this.account?.token) this.#startMqtt();
    }
    return this;
  }

  status() {
    return {
      connected: Boolean(this.account?.token),
      email: this.account?.email ?? null,
      region: this.account?.region ?? 'global',
      mqtt: this.mqttState,
      pending: this.pending ? { email: this.pending.email, type: this.pending.tfaKey ? 'tfa' : 'verifyCode' } : null,
      error: this.lastError,
    };
  }

  // Schritt 1: Passwort. Antwort: ok | verifyCode | tfa
  async login({ email, password, region = 'global' }) {
    const r = REGIONS[region] ?? REGIONS.global;
    const res = await this.#post(`${r.api}/v1/user-service/user/login`, { account: email, password, apiError: '' });
    if (res.json.accessToken) return this.#finish(email, region, res.json.accessToken);
    if (res.json.loginType === 'verifyCode') {
      this.pending = { email, region };
      await this.#post(`${r.api}/v1/user-service/user/sendemail/code`, { email, type: 'codeLogin' });
      return { step: 'verifyCode' };
    }
    if (res.json.loginType === 'tfa') {
      this.pending = { email, region, tfaKey: res.json.tfaKey };
      return { step: 'tfa' };
    }
    throw httpError(401, res.json.message || res.json.error || 'Anmeldung fehlgeschlagen. Bitte E-Mail und Passwort prüfen.');
  }

  // Schritt 2: Code aus der E-Mail oder aus der Authenticator-App
  async verify({ code }) {
    if (!this.pending) throw httpError(400, 'Keine Anmeldung offen. Bitte erneut anmelden.');
    const { email, region, tfaKey } = this.pending;
    const r = REGIONS[region] ?? REGIONS.global;
    if (tfaKey) {
      const res = await this.#post(`${r.web}/api/sign-in/tfa`, { tfaKey, tfaCode: code });
      const token = res.json.accessToken || res.json.token || cookie(res.headers, 'token');
      if (!token) throw httpError(401, 'Der Bestätigungscode wurde nicht akzeptiert.');
      return this.#finish(email, region, token);
    }
    const res = await this.#post(`${r.api}/v1/user-service/user/login`, { account: email, code });
    if (!res.json.accessToken) throw httpError(401, res.json.message || 'Der Code aus der E-Mail wurde nicht akzeptiert.');
    return this.#finish(email, region, res.json.accessToken);
  }

  async resendCode() {
    if (!this.pending || this.pending.tfaKey) throw httpError(400, 'Kein E-Mail-Code angefordert.');
    const r = REGIONS[this.pending.region] ?? REGIONS.global;
    await this.#post(`${r.api}/v1/user-service/user/sendemail/code`, { email: this.pending.email, type: 'codeLogin' });
    return { step: 'verifyCode' };
  }

  async logout() {
    this.account = null;
    this.pending = null;
    this.live.clear();
    this.mqtt?.end();
    this.mqtt = null;
    this.mqttState = 'getrennt';
    await writeFile(this.file, 'null');
    this.emit('update');
  }

  async devices() {
    const json = await this.#get('/v1/iot-service/api/user/bind');
    return (json.devices ?? []).map((d) => ({
      serial: d.dev_id,
      name: d.name,
      model: d.dev_product_name || d.dev_model_name,
      online: Boolean(d.online),
      printStatus: d.print_status,
      nozzle: d.nozzle_diameter,
    }));
  }

  async tasks(deviceId, limit = 20) {
    const q = new URLSearchParams({ limit: String(limit) });
    if (deviceId) q.set('deviceId', deviceId);
    const json = await this.#get(`/v1/user-service/my/tasks?${q}`);
    return (json.hits ?? json.tasks ?? []).map((t) => ({
      id: t.id,
      title: t.designTitle || t.title || 'Unbenannter Druck',
      deviceId: t.deviceId,
      deviceName: t.deviceName,
      status: t.status,
      weight: t.weight,
      length: t.length,
      seconds: t.costTime,
      start: t.startTime,
      end: t.endTime,
      cover: t.cover,
      amsDetailMapping: (t.amsDetailMapping ?? []).map((m) => ({ type: m.filamentType, color: m.sourceColor, weight: m.weight })),
    }));
  }

  // Welche Drucker sollen live verfolgt werden?
  watch(serials) {
    this.serials = new Set(serials.filter(Boolean));
    if (!this.mqtt) return;
    this.mqtt.unsubscribeAll();
    for (const s of this.serials) {
      this.mqtt.subscribe(`device/${s}/report`);
      this.#pushAll(s);
    }
  }

  liveStatus() {
    const out = {};
    for (const [serial, raw] of this.live) out[serial] = normalize(raw);
    return out;
  }

  async #finish(email, region, token) {
    this.pending = null;
    this.account = { email, region, token, uid: null };
    try {
      const pref = await this.#get('/v1/design-user-service/my/preference');
      this.account.uid = pref.uid;
    } catch (err) {
      this.lastError = 'Benutzerkennung konnte nicht geladen werden: ' + err.message;
    }
    await writeFile(this.file, JSON.stringify(this.account, null, 2), { mode: 0o600 });
    this.#startMqtt();
    this.emit('update');
    return { step: 'ok' };
  }

  #startMqtt() {
    this.mqtt?.end();
    if (!this.account?.uid) { this.mqttState = 'keine Benutzerkennung'; return; }
    const r = REGIONS[this.account.region] ?? REGIONS.global;
    this.mqtt = new MqttClient({ host: r.mqtt, username: `u_${this.account.uid}`, password: this.account.token });
    this.mqttState = 'verbindet';
    this.mqtt.on('connect', () => {
      this.mqttState = 'verbunden';
      this.lastError = null;
      for (const s of this.serials) this.#pushAll(s);
      this.emit('update');
    });
    this.mqtt.on('offline', () => { this.mqttState = 'getrennt'; this.emit('update'); });
    this.mqtt.on('error', (err) => { this.lastError = err.message; this.mqttState = 'Fehler'; this.emit('update'); });
    this.mqtt.on('message', (topic, payload) => {
      const serial = topic.split('/')[1];
      let msg;
      try { msg = JSON.parse(payload.toString('utf8')); } catch { return; }
      if (!msg.print) return;
      const prev = this.live.get(serial) ?? {};
      this.live.set(serial, { ...prev, ...msg.print, _at: Date.now() });
      this.emit('update', serial);
    });
    for (const s of this.serials) this.mqtt.subscribe(`device/${s}/report`);
    this.mqtt.connect();
  }

  #pushAll(serial) {
    this.mqtt?.publish(`device/${serial}/request`, { pushing: { sequence_id: '0', command: 'pushall', version: 1, push_target: 1 } });
  }

  async #get(p) {
    if (!this.account?.token) throw httpError(401, 'Nicht mit der Bambu Cloud verbunden.');
    const r = REGIONS[this.account.region] ?? REGIONS.global;
    const res = await reach(r.api + p, { headers: { ...HEADERS, Authorization: `Bearer ${this.account.token}` } });
    if (res.status === 401) throw httpError(401, 'Die Bambu-Cloud-Anmeldung ist abgelaufen. Bitte erneut verbinden.');
    if (!res.ok) throw httpError(502, `Bambu Cloud antwortet mit ${res.status}.`);
    return res.json();
  }

  async #post(url, body) {
    const res = await reach(url, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
    let json = {};
    try { json = await res.json(); } catch {}
    if (res.status >= 500) throw httpError(502, `Bambu Cloud antwortet mit ${res.status}.`);
    return { status: res.status, json, headers: res.headers };
  }
}

const STATES = {
  RUNNING: 'printing', PREPARE: 'preparing', SLICING: 'preparing', PAUSE: 'paused',
  FINISH: 'finished', FAILED: 'failed', IDLE: 'idle',
};

export function normalize(p) {
  const trays = [];
  for (const unit of p.ams?.ams ?? []) {
    for (const t of unit.tray ?? []) {
      trays.push({
        unit: Number(unit.id), slot: Number(t.id),
        type: t.tray_type || null,
        color: t.tray_color ? '#' + t.tray_color.slice(0, 6) : null,
        remain: typeof t.remain === 'number' && t.remain >= 0 ? t.remain : null,
        name: t.tray_sub_brands || null,
      });
    }
  }
  return {
    state: STATES[p.gcode_state] ?? (p.gcode_state ? 'idle' : 'unknown'),
    rawState: p.gcode_state ?? null,
    percent: num(p.mc_percent),
    remainingMin: num(p.mc_remaining_time),
    nozzle: num(p.nozzle_temper),
    nozzleTarget: num(p.nozzle_target_temper),
    bed: num(p.bed_temper),
    bedTarget: num(p.bed_target_temper),
    chamber: num(p.chamber_temper),
    file: p.subtask_name || p.gcode_file || null,
    layer: num(p.layer_num),
    totalLayers: num(p.total_layer_num),
    error: p.print_error ? Number(p.print_error) : 0,
    trays,
    updatedAt: p._at ?? null,
  };
}

async function reach(url, init) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  } catch (err) {
    throw httpError(502, `Bambu Cloud nicht erreichbar (${new URL(url).host}). Bitte Internetverbindung prüfen.`);
  }
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function cookie(headers, name) {
  const all = headers.getSetCookie?.() ?? [headers.get('set-cookie') ?? ''];
  for (const c of all) {
    const m = c.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    if (m) return m[1];
  }
  return null;
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
