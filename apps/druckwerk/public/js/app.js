// App-Rahmen: Navigation, Routing über den URL-Hash und die Kopfzeile beim Scrollen.
import { h, icon, button, toast, go } from './ui.js';
import { state, load, on, connectLive, replaceAll, lowSpools, invoiceStatus } from './store.js';
import dashboard from './views/dashboard.js';
import calendar from './views/calendar.js';
import orders from './views/orders.js';
import printers from './views/printers.js';
import filament from './views/filament.js';
import designs from './views/designs.js';
import calculator from './views/calculator.js';
import customers from './views/customers.js';
import invoices, { invoiceDocument } from './views/invoices.js';
import settings from './views/settings.js';

const NAV = [
  ['Übersicht', [
    ['', 'Dashboard', 'dashboard', dashboard],
    ['calendar', 'Kalender', 'calendar', calendar],
  ]],
  ['Produktion', [
    ['orders', 'Aufträge', 'orders', orders],
    ['printers', 'Drucker', 'printer', printers],
    ['filament', 'Filament', 'spool', filament],
  ]],
  ['Katalog', [
    ['designs', 'Designs', 'cube', designs],
    ['calculator', 'Kostenrechner', 'calculator', calculator],
  ]],
  ['Geschäft', [
    ['customers', 'Kunden', 'people', customers],
    ['invoices', 'Rechnungen', 'invoice', invoices],
  ]],
  ['App', [
    ['settings', 'Einstellungen', 'gear', settings],
  ]],
];
const VIEWS = Object.fromEntries(NAV.flatMap(([, items]) => items.map(([path, title, , view]) => [path, { title, view }])));

const main = document.getElementById('main');
const nav = document.getElementById('nav');
const app = document.getElementById('app');

export function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return { parts, name: parts[0] ?? '', params: Object.fromEntries(new URLSearchParams(query ?? '')) };
}


function counts() {
  const today = new Date().toDateString();
  return {
    orders: state.orders.filter((o) => o.status === 'printing' || (o.status === 'planned' && new Date(o.start).toDateString() === today)).length,
    filament: lowSpools().length,
    invoices: state.invoices.filter((i) => invoiceStatus(i).key === 'overdue').length,
  };
}

function renderNav(current) {
  const c = counts();
  nav.replaceChildren(...NAV.map(([title, items]) => h('div', { class: 'nav-section' },
    h('div', { class: 'nav-title', id: 'nav-' + title }, title),
    h('ul', { class: 'list', 'aria-labelledby': 'nav-' + title, role: 'list' }, items.map(([path, label, ic]) => {
      const count = c[path];
      const alert = (path === 'filament' || path === 'invoices') && count > 0;
      return h('li', { style: { border: 0 } }, h('a', {
        class: 'nav-item', href: '#/' + path, 'aria-current': current === path ? 'page' : null,
        onclick: () => app.classList.remove('nav-open'),
      }, icon(ic), label, count ? h('span', { class: ['count', alert && 'alert'], 'aria-label': alertLabel(path, count) }, count) : null));
    })))));
}

function alertLabel(path, count) {
  return { orders: `${count} aktiv heute`, filament: `${count} Spulen fast leer`, invoices: `${count} überfällig` }[path];
}

function isEmpty() {
  return !state.printers.length && !state.customers.length && !state.designs.length && !state.orders.length && !state.invoices.length;
}

function welcome() {
  const features = [
    ['printer', 'Drucker & Bambu Cloud'], ['calendar', 'Auftragskalender'], ['calculator', 'Kostenrechner'],
    ['people', 'Kundenstamm'], ['invoice', 'Rechnungen'], ['spool', 'Filamentlager'],
  ];
  return h('div', { class: 'page' }, h('div', { class: 'welcome' },
    h('img', { src: '/icon.svg', alt: '' }),
    h('h1', {}, 'Willkommen bei Druckwerk'),
    h('p', {}, 'Dein Arbeitsplatz für den 3D-Druck-Betrieb: Drucker überwachen, Aufträge planen, Kosten kalkulieren und Rechnungen schreiben.'),
    h('div', { class: 'features' }, features.map(([ic, t]) => h('div', { class: 'feature' }, icon(ic), t))),
    h('div', { class: 'row wrap', style: { justifyContent: 'center' } },
      button('Mit Beispieldaten starten', { primary: true, large: true, onClick: async () => { await replaceAll('/api/seed'); toast('Beispieldaten geladen'); } }),
      button('Leer starten', { large: true, onClick: () => { localStorage.setItem('druckwerk.started', '1'); render(); go('printers'); } }),
    ),
  ));
}

let lastRouteKey = '';
export function render() {
  if (!state.loaded) return;
  const route = parseRoute();
  renderNav(route.name);
  const key = location.hash;
  const sameRoute = key === lastRouteKey;
  const y = window.scrollY;

  let started = false;
  try { started = localStorage.getItem('druckwerk.started') === '1'; } catch {}
  let page;
  if (route.name === '' && isEmpty() && !started) page = welcome();
  else if (route.name === 'invoices' && route.parts[1]) page = invoiceDocument(route.parts[1]);
  else page = (VIEWS[route.name] ?? VIEWS['']).view(route);

  main.replaceChildren(page);
  document.title = `${VIEWS[route.name]?.title ?? 'Dashboard'} · Druckwerk`;
  if (sameRoute) window.scrollTo(0, y);
  else { window.scrollTo(0, 0); if (lastRouteKey) main.focus({ preventScroll: true }); }
  lastRouteKey = key;
  updateBar();
}

function updateBar() {
  document.querySelector('.page-bar')?.classList.toggle('scrolled', window.scrollY > 8);
}

window.addEventListener('scroll', updateBar, { passive: true });
window.addEventListener('hashchange', render);
document.getElementById('scrim').addEventListener('click', () => app.classList.remove('nav-open'));
new MutationObserver(() => { document.getElementById('scrim').hidden = !app.classList.contains('nav-open'); })
  .observe(app, { attributes: true, attributeFilter: ['class'] });

// Daten ändern sich: einmal pro Durchlauf neu zeichnen (Sheets liegen außerhalb und bleiben offen)
let queued = false;
on('change', () => {
  if (queued) return;
  queued = true;
  queueMicrotask(() => { queued = false; render(); });
});

load().then(connectLive).catch((err) => {
  main.replaceChildren(h('div', { class: 'page' }, h('div', { class: 'empty' }, icon('warning'), h('h3', {}, 'Server nicht erreichbar'), h('p', {}, err.message))));
});
