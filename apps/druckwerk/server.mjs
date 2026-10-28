#!/usr/bin/env node
// Druckwerk-Server: liefert die Oberfläche aus, speichert Daten als JSON und spricht
// mit der Bambu Cloud. Node 18 oder neuer, keine Abhängigkeiten.
//
//   node server.mjs                     http://127.0.0.1:4321
//   PORT=8080 HOST=0.0.0.0 DRUCKWERK_PASSWORD=geheim node server.mjs
import http from 'node:http';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { readdir, stat, unlink, mkdir } from 'node:fs/promises';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, COLLECTIONS } from './lib/db.mjs';
import { BambuCloud } from './lib/bambu.mjs';
import { seedData } from './lib/seed.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const FILES = path.join(DATA, 'files');
const PORT = Number(process.env.PORT) || 4321;
const HOST = process.env.HOST || '127.0.0.1';
const PASSWORD = process.env.DRUCKWERK_PASSWORD || '';
const MAX_JSON = 25 * 1024 * 1024;
const MAX_FILE = 500 * 1024 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  '.stl': 'model/stl', '.3mf': 'model/3mf', '.pdf': 'application/pdf',
};

const store = await new Store(DATA).load();
const bambu = await new BambuCloud(DATA).load();
await mkdir(FILES, { recursive: true });
watchBambuPrinters();

// Live-Status per Server-Sent Events an alle offenen Fenster
const clients = new Set();
function broadcast() {
  const payload = `event: live\ndata: ${JSON.stringify({ bambu: bambu.status(), printers: bambu.liveStatus() })}\n\n`;
  for (const res of clients) res.write(payload);
}
let pending = null;
bambu.on('update', () => {
  if (pending) return;
  pending = setTimeout(() => { pending = null; broadcast(); }, 500);
});
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25000);

function watchBambuPrinters() {
  bambu.watch(store.list('printers').filter((p) => p.source === 'bambu').map((p) => p.serial));
}

const routes = [
  ['GET', /^\/api\/state$/, () => ({ ...pick(store.snapshot()), bambu: bambu.status() })],
  ['GET', /^\/api\/settings$/, () => store.settings()],
  ['PUT', /^\/api\/settings$/, async (req) => store.updateSettings(await body(req))],
  ['POST', /^\/api\/seed$/, () => { store.replace(seedData()); watchBambuPrinters(); return pick(store.snapshot()); }],
  ['GET', /^\/api\/export$/, (req, res) => {
    res.setHeader('Content-Disposition', `attachment; filename="druckwerk-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    return store.snapshot();
  }],
  ['POST', /^\/api\/import$/, async (req) => { store.replace(await body(req)); watchBambuPrinters(); return pick(store.snapshot()); }],

  ['POST', /^\/api\/files$/, (req) => saveFile(req)],
  ['DELETE', /^\/api\/files\/([\w-]+)$/, async (req, res, [id]) => {
    const f = await findFile(id);
    if (f) await unlink(f.path);
    return { ok: true };
  }],

  ['GET', /^\/api\/bambu\/status$/, () => bambu.status()],
  ['POST', /^\/api\/bambu\/login$/, async (req) => bambu.login(await body(req))],
  ['POST', /^\/api\/bambu\/verify$/, async (req) => bambu.verify(await body(req))],
  ['POST', /^\/api\/bambu\/resend$/, () => bambu.resendCode()],
  ['POST', /^\/api\/bambu\/logout$/, async () => { await bambu.logout(); return bambu.status(); }],
  ['GET', /^\/api\/bambu\/devices$/, () => bambu.devices()],
  ['GET', /^\/api\/bambu\/tasks$/, (req) => bambu.tasks(new URL(req.url, 'http://x').searchParams.get('deviceId'))],
  ['GET', /^\/api\/bambu\/live$/, () => bambu.liveStatus()],

  ['GET', /^\/api\/(\w+)$/, (req, res, [c]) => store.list(c)],
  ['POST', /^\/api\/(\w+)$/, async (req, res, [c]) => { const r = store.create(c, await body(req)); changed(c); res.statusCode = 201; return r; }],
  ['GET', /^\/api\/(\w+)\/([\w-]+)$/, (req, res, [c, id]) => store.get(c, id) ?? notFound()],
  ['PUT', /^\/api\/(\w+)\/([\w-]+)$/, async (req, res, [c, id]) => { const r = store.update(c, id, await body(req)) ?? notFound(); changed(c); return r; }],
  ['DELETE', /^\/api\/(\w+)\/([\w-]+)$/, (req, res, [c, id]) => { store.remove(c, id) || notFound(); changed(c); return { ok: true }; }],
];

function changed(collection) {
  if (collection === 'printers') watchBambuPrinters();
}

function pick(snapshot) {
  const out = { settings: snapshot.settings };
  for (const c of COLLECTIONS) out[c] = snapshot[c];
  return out;
}

const server = http.createServer(async (req, res) => {
  try {
    if (PASSWORD && !authorized(req)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Druckwerk", charset="UTF-8"' });
      return res.end('Anmeldung erforderlich');
    }
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/api/live') return liveStream(req, res);
    if (url.pathname.startsWith('/files/')) return serveFile(url.pathname.slice(7), res);

    if (url.pathname.startsWith('/api/')) {
      for (const [method, re, handler] of routes) {
        const m = url.pathname.match(re);
        if (m && req.method === method) {
          const result = await handler(req, res, m.slice(1));
          return json(res, res.statusCode || 200, result);
        }
      }
      return json(res, 404, { error: 'Nicht gefunden' });
    }

    return serveStatic(url.pathname, res);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    json(res, status, { error: err.message || 'Interner Fehler' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Druckwerk läuft auf http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  if (HOST !== '127.0.0.1' && HOST !== 'localhost' && !PASSWORD) {
    console.warn('Achtung: Der Server ist im Netzwerk erreichbar, aber DRUCKWERK_PASSWORD ist nicht gesetzt.');
  }
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => { await store.flush(); process.exit(0); });
}

function liveStream(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write(`event: live\ndata: ${JSON.stringify({ bambu: bambu.status(), printers: bambu.liveStatus() })}\n\n`);
  clients.add(res);
  req.on('close', () => clients.delete(res));
}

async function serveStatic(pathname, res) {
  let file = path.normalize(path.join(PUBLIC, decodeURIComponent(pathname)));
  if (!file.startsWith(PUBLIC)) return json(res, 403, { error: 'Verboten' });
  if (!existsSync(file) || (await stat(file)).isDirectory()) file = path.join(PUBLIC, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  createReadStream(file).pipe(res);
}

async function saveFile(req) {
  const name = safeName(decodeURIComponent(req.headers['x-file-name'] || 'datei'));
  const size = Number(req.headers['content-length'] || 0);
  if (size > MAX_FILE) throw Object.assign(new Error('Die Datei ist größer als 500 MB.'), { status: 413 });
  const id = randomUUID();
  const target = path.join(FILES, `${id}__${name}`);
  await pipeline(req, createWriteStream(target));
  const info = await stat(target);
  return { id, name, size: info.size, type: req.headers['content-type'] || '', url: `/files/${id}` };
}

async function findFile(id) {
  if (!/^[\w-]+$/.test(id)) return null;
  const entry = (await readdir(FILES)).find((f) => f.startsWith(id + '__'));
  return entry ? { path: path.join(FILES, entry), name: entry.slice(id.length + 2) } : null;
}

async function serveFile(id, res) {
  const f = await findFile(id);
  if (!f) return json(res, 404, { error: 'Datei nicht gefunden' });
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(f.name).toLowerCase()] || 'application/octet-stream',
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    'Cache-Control': 'private, max-age=31536000, immutable',
  });
  createReadStream(f.path).pipe(res);
}

function safeName(name) {
  return path.basename(name).replace(/[^\w.\- äöüÄÖÜß()]/g, '_').slice(0, 120) || 'datei';
}

function body(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_JSON) { reject(Object.assign(new Error('Anfrage zu groß'), { status: 413 })); req.destroy(); }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(Object.assign(new Error('Ungültiges JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function json(res, status, data) {
  if (res.headersSent) return res.end(JSON.stringify(data));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function notFound() {
  throw Object.assign(new Error('Nicht gefunden'), { status: 404 });
}

function authorized(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  const pass = Buffer.from(header.slice(6), 'base64').toString('utf8').split(':').slice(1).join(':');
  const a = Buffer.from(pass), b = Buffer.from(PASSWORD);
  return a.length === b.length && timingSafeEqual(a, b);
}
