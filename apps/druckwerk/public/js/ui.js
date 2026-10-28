// Bausteine der Oberfläche: Elemente, Symbole, Formatierung, Sheets, Toasts, Formulare.

export function h(tag, attrs, ...children) {
  const el = tag === 'svg' || attrs?.svg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false || k === 'svg') continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v)) {
        if (val == null) continue;
        if (prop.startsWith('--')) el.style.setProperty(prop, String(val)); else el.style[prop] = val;
      }
    }
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'value' && 'value' in el) el.value = v;
    else if (k === 'checked' || k === 'selected' || k === 'disabled') el[k] = Boolean(v);
    else if (k === 'html') el.innerHTML = v; // nur für eigene, statische Inhalte wie Symbole
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

// Symbole im Stil von SF Symbols: 24er Raster, abgerundete Linien
const P = {
  dashboard: '<rect x="3.5" y="3.5" width="7" height="8" rx="2"/><rect x="13.5" y="3.5" width="7" height="5" rx="2"/><rect x="13.5" y="11.5" width="7" height="9" rx="2"/><rect x="3.5" y="14.5" width="7" height="6" rx="2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><circle cx="8.5" cy="14.5" r=".9" fill="currentColor"/><circle cx="12" cy="14.5" r=".9" fill="currentColor"/><circle cx="15.5" cy="14.5" r=".9" fill="currentColor"/>',
  orders: '<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4.2V3h6v1.2M8.5 10h7M8.5 13.5h7M8.5 17h4"/>',
  printer: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M3.5 7.5h17M10 7.5v3h4v-3M12 10.5v2"/><path d="M8 17.5h8M9.5 15.5h5"/>',
  spool: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.6"/>',
  cube: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9Z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  calculator: '<rect x="5" y="3" width="14" height="18" rx="3"/><rect x="8" y="6" width="8" height="3.5" rx="1"/><circle cx="9" cy="13" r=".9" fill="currentColor"/><circle cx="12" cy="13" r=".9" fill="currentColor"/><circle cx="15" cy="13" r=".9" fill="currentColor"/><circle cx="9" cy="17" r=".9" fill="currentColor"/><circle cx="12" cy="17" r=".9" fill="currentColor"/><circle cx="15" cy="17" r=".9" fill="currentColor"/>',
  people: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17" cy="9.5" r="2.6"/><path d="M16.5 14.6c2.6.1 4.4 1.7 5 4.4"/>',
  invoice: '<path d="M6 3h8.5L19 7.5V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5M8 12h8M8 15.5h8M8 8.5h3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/><circle cx="12" cy="12" r="6.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  chevronLeft: '<path d="m15 5-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash: '<path d="M4 6.5h16M9.5 6.5V4.5h5v2M6.5 6.5l1 13.5h9l1-13.5M10 10.5v6M14 10.5v6"/>',
  edit: '<path d="M14.5 5.5 18.5 9.5M4 20l1-5L15.5 4.5a2.1 2.1 0 0 1 3 0l1 1a2.1 2.1 0 0 1 0 3L9 19Z"/>',
  cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.6 1.6A3.3 3.3 0 0 0 7 18.5Z"/>',
  bolt: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6Z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
  thermo: '<path d="M10 4.5a2 2 0 0 1 4 0V14a4 4 0 1 1-4 0Z"/><path d="M12 9v7"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="8.5"/><path d="m8.2 12.3 2.6 2.6 5-5.2"/>',
  warning: '<path d="M12 4 21 19.5H3Z"/><path d="M12 10v4.5"/><circle cx="12" cy="17" r=".9" fill="currentColor"/>',
  pause: '<rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/>',
  play: '<path d="M7 4.5v15l12.5-7.5Z"/>',
  sidebar: '<rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="M9.5 4.5v15M5.5 8h1.5M5.5 11h1.5"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14"/>',
  upload: '<path d="M12 15.5v-11M7 9l5-5 5 5M5 19.5h14"/>',
  print: '<path d="M7 9V3.5h10V9M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="7" y="14" width="10" height="7" rx="1"/>',
  euro: '<path d="M17.5 6.5A7 7 0 1 0 17.5 17.5M4 10.5h9M4 13.5h9"/>',
  tag: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.6 6.6a1.5 1.5 0 0 1-2.1 0Z"/><circle cx="8" cy="8" r="1.3"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.3 1.3M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.3-1.3"/>',
  file: '<path d="M6 3h8.5L19 7.5V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5"/>',
  wrench: '<path d="M14.5 4.2a5 5 0 0 0-6 6.3L3.5 15.5a2.1 2.1 0 0 0 3 3l5-5a5 5 0 0 0 6.3-6l-3 3-2.8-.5-.5-2.8Z"/>',
  wifiOff: '<path d="M3 3l18 18M8.5 16a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4-2.3M19 12.5a10 10 0 0 0-5-2.7M2 9a14.5 14.5 0 0 1 4.5-2.8M22 9A14.5 14.5 0 0 0 10 5.3"/><circle cx="12" cy="19.5" r=".9" fill="currentColor"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  box: '<path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4Z"/><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9M7.8 5.5l8.5 4"/>',
  layers: '<path d="m12 3.5 9 4.5-9 4.5L3 8Z"/><path d="m3 12 9 4.5 9-4.5M3 16l9 4.5 9-4.5"/>',
  minus: '<path d="M5 12h14"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/>',
};

export function icon(name, cls = '') {
  const tpl = document.createElement('template');
  tpl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${cls ? ` class="${cls}"` : ''}>${P[name] ?? ''}</svg>`;
  return tpl.content.firstChild;
}

export const go = (path) => { location.hash = '#/' + path; };
export const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

// ---------- Formatierung ----------
const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const num1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
const num2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmt = {
  money: (v) => money.format(Number(v) || 0),
  num: (v) => num1.format(Number(v) || 0),
  dec: (v) => num2.format(Number(v) || 0),
  grams: (v) => (Math.abs(v) >= 1000 ? `${num1.format(v / 1000)} kg` : `${Math.round(v)} g`),
  date: (d) => (d ? new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–'),
  dateLong: (d) => new Date(d).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }),
  dateShort: (d) => new Date(d).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' }),
  time: (d) => new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
  dateTime: (d) => (d ? `${fmt.dateShort(d)}, ${fmt.time(d)}` : '–'),
  duration(min) {
    min = Math.round(Number(min) || 0);
    if (min < 60) return `${min} min`;
    const hh = Math.floor(min / 60), mm = min % 60;
    if (hh >= 24) return `${Math.floor(hh / 24)} T ${hh % 24} h`;
    return mm ? `${hh} h ${mm} min` : `${hh} h`;
  },
  relDay(d) {
    const a = new Date(d); a.setHours(0, 0, 0, 0);
    const b = new Date(); b.setHours(0, 0, 0, 0);
    const diff = Math.round((a - b) / 864e5);
    return { 0: 'Heute', 1: 'Morgen', '-1': 'Gestern' }[diff] ?? fmt.dateShort(d);
  },
};

export const isoDate = (d = new Date()) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
export const localDateTime = (d) => {
  const x = new Date(d);
  return `${isoDate(x)}T${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
};

// ---------- Kleine Komponenten ----------
export function badge(text, tone = '', ic) {
  return h('span', { class: ['badge', tone] }, ic ? icon(ic) : h('span', { class: 'dot' }), text);
}

export function emptyState({ icon: ic, title, text, action }) {
  return h('div', { class: 'empty' }, icon(ic), h('h3', {}, title), text && h('p', {}, text), action);
}

export function button(label, opts = {}) {
  return h('button', {
    type: opts.type || 'button',
    class: ['btn', opts.primary && 'btn-primary', opts.plain && 'btn-plain', opts.danger && 'btn-danger', opts.large && 'btn-large', opts.class],
    onclick: opts.onClick, disabled: opts.disabled, form: opts.form, 'aria-label': opts.ariaLabel,
  }, opts.icon && icon(opts.icon), label);
}

export function iconButton(name, label, onClick, cls = '') {
  return h('button', { type: 'button', class: ['icon-btn', cls], 'aria-label': label, title: label, onclick: onClick }, icon(name));
}

export function segmented(options, value, onChange, label) {
  return h('div', { class: 'segmented', role: 'group', 'aria-label': label },
    options.map(([v, text]) => h('button', {
      type: 'button', 'aria-pressed': String(v === value),
      onclick: () => onChange(v),
    }, text)));
}

export function searchField(placeholder, value, onInput) {
  const input = h('input', { type: 'search', placeholder, value, 'aria-label': placeholder });
  input.addEventListener('input', () => onInput(input.value));
  return h('label', { class: 'search' }, icon('search'), input);
}

export function pageBar({ title, subtitle, actions = [] }) {
  return h('header', { class: 'page-bar' },
    h('button', { type: 'button', class: 'icon-btn menu-toggle', 'aria-label': 'Seitenleiste ein- oder ausblenden', onclick: () => document.getElementById('app').classList.toggle('nav-open') }, icon('sidebar')),
    h('div', { class: 'titles' }, h('h1', {}, title), subtitle && h('p', { class: 'subtitle' }, subtitle)),
    h('div', { class: 'toolbar' }, actions));
}

// ---------- Formulare ----------
// field({ label, name, type, value, options, unit, span, hint, required })
export function field(o) {
  let control;
  const common = { name: o.name, id: 'f-' + o.name + '-' + Math.random().toString(36).slice(2, 7), required: o.required, placeholder: o.placeholder, disabled: o.disabled };
  if (o.type === 'select') {
    control = h('select', common, (o.options ?? []).map(([v, t]) => h('option', { value: v, selected: String(v) === String(o.value ?? '') }, t)));
  } else if (o.type === 'textarea') {
    control = h('textarea', { ...common, rows: o.rows || 3 }, o.value ?? '');
  } else if (o.type === 'switch') {
    return h('label', { class: ['switch', 'field', o.span && 'span-' + o.span] }, h('span', {}, o.label), h('input', { ...common, type: 'checkbox', role: 'switch', checked: Boolean(o.value), dataset: { type: 'bool' } }));
  } else {
    control = h('input', {
      ...common, type: o.type || 'text', value: o.value ?? '', step: o.step ?? (o.type === 'number' ? 'any' : null), min: o.min, max: o.max,
      inputmode: o.type === 'number' ? 'decimal' : o.inputmode, autocomplete: o.autocomplete || 'off',
      dataset: o.type === 'number' ? { type: 'number' } : undefined,
    });
  }
  if (o.onInput) control.addEventListener('input', o.onInput);
  if (o.onChange) control.addEventListener('change', o.onChange);
  const wrapped = o.unit ? h('div', { class: 'input-unit' }, control, h('em', {}, o.unit)) : control;
  return h('div', { class: ['field', o.span && 'span-' + o.span] },
    h('label', { for: common.id }, o.label), wrapped, o.hint && h('span', { class: 'hint' }, o.hint));
}

export function readForm(form) {
  const out = {};
  for (const el of form.querySelectorAll('[name]')) {
    if (el.dataset.type === 'bool') out[el.name] = el.checked;
    else if (el.dataset.type === 'number') out[el.name] = el.value === '' ? null : Number(String(el.value).replace(',', '.'));
    else out[el.name] = el.value.trim();
  }
  return out;
}

// ---------- Sheets ----------
let sheetStack = [];
export function sheet({ title, body, actions = [], size = '', onClose }) {
  const previous = document.activeElement;
  const close = () => {
    backdrop.remove();
    sheetStack = sheetStack.filter((s) => s !== api);
    document.removeEventListener('keydown', onKey, true);
    onClose?.();
    previous?.focus?.();
  };
  const onKey = (e) => {
    if (sheetStack.at(-1) !== api) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab') trapFocus(e, panel);
  };
  const foot = actions.length ? h('footer', { class: 'sheet-foot' }, actions.map((a) => (a instanceof Node ? a : button(a.label, {
    primary: a.primary, danger: a.danger, icon: a.icon, class: a.left && 'left', type: a.submit ? 'submit' : 'button', form: a.form,
    onClick: a.submit ? undefined : async () => { const r = await a.onClick?.(api); if (r !== false && !a.keepOpen) close(); },
  })))) : null;
  const titleId = 'sheet-title-' + Math.random().toString(36).slice(2, 7);
  const panel = h('div', { class: ['sheet', size], role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('header', { class: 'sheet-head' }, h('h2', { id: titleId }, title), iconButton('close', 'Schließen', () => close())),
    h('div', { class: 'sheet-body' }, body),
    foot);
  const backdrop = h('div', { class: 'sheet-backdrop', onmousedown: (e) => { if (e.target === backdrop) close(); } }, panel);
  document.getElementById('sheet-root').append(backdrop);
  document.addEventListener('keydown', onKey, true);
  const api = { close, panel, body: panel.querySelector('.sheet-body') };
  sheetStack.push(api);
  requestAnimationFrame(() => (panel.querySelector('input:not([type=hidden]), select, textarea') || panel.querySelector('.sheet-foot .btn-primary') || panel.querySelector('button'))?.focus());
  return api;
}

function trapFocus(e, root) {
  const items = [...root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent);
  if (!items.length) return;
  const first = items[0], last = items.at(-1);
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

export function formSheet({ title, fields, submitLabel = 'Sichern', onSubmit, onDelete, size, extra }) {
  const formId = 'form-' + Math.random().toString(36).slice(2, 8);
  const form = h('form', { class: 'form', id: formId, novalidate: false }, fields, extra);
  const actions = [];
  if (onDelete) actions.push({ label: 'Löschen', danger: true, left: true, icon: 'trash', onClick: async () => { if (await confirmSheet({ title: 'Wirklich löschen?', text: 'Das lässt sich nicht rückgängig machen.', confirm: 'Löschen', danger: true })) { await onDelete(); return true; } return false; } });
  actions.push({ label: 'Abbrechen', onClick: () => {} });
  actions.push({ label: submitLabel, primary: true, submit: true, form: formId });
  const s = sheet({ title, body: form, actions, size });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await onSubmit(readForm(form), form);
      if (r !== false) s.close();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  return s;
}

export function confirmSheet({ title, text, confirm = 'OK', danger }) {
  return new Promise((resolve) => {
    let result = false;
    sheet({
      title, size: 'narrow', body: h('p', { class: 'muted' }, text),
      actions: [{ label: 'Abbrechen' }, { label: confirm, primary: !danger, danger, onClick: () => { result = true; } }],
      onClose: () => resolve(result),
    });
  });
}

// ---------- Toasts ----------
export function toast(message, tone = 'success') {
  const el = h('div', { class: ['toast', 'glass', tone] }, icon(tone === 'error' ? 'warning' : 'checkCircle'), message);
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), tone === 'error' ? 6000 : 3000);
}

// ---------- Dateien ----------
export function pickFile(accept, multiple = false) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, multiple, style: { display: 'none' } });
    input.addEventListener('change', () => { resolve([...input.files]); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

export function download(name, content, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
