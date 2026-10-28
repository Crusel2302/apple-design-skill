import { h, icon, fmt, pageBar, button, field, formSheet, searchField, toast, emptyState, pickFile, go, iconButton, segmented, rerender } from '../ui.js';
import { state, save, remove, uploadFile, api } from '../store.js';
import { MATERIAL_NAMES, parseSTL, meshInfo, estimateGrams, renderThumbnail } from '../calc.js';

const view = { query: '', category: 'all' };
const MODEL_EXT = '.stl,.3mf,.step,.stp,.obj,.gcode,.zip';

export default function designs() {
  const categories = [...new Set(state.designs.map((d) => d.category).filter(Boolean))].sort();
  if (view.category !== 'all' && !categories.includes(view.category)) view.category = 'all';
  const host = h('div');
  const draw = () => host.replaceChildren(gallery());
  draw();
  return h('div', { class: 'page' },
    pageBar({
      title: 'Designs',
      subtitle: `${state.designs.length} Modelle in der Datenbank`,
      actions: [
        searchField('Name, Tag, Material', view.query, (q) => { view.query = q; draw(); }),
        button('Design hinzufügen', { primary: true, icon: 'plus', onClick: () => openDesignSheet() }),
      ],
    }),
    categories.length > 1 ? h('div', { style: { marginBottom: '16px', overflowX: 'auto' } },
      segmented([['all', 'Alle'], ...categories.map((c) => [c, c])], view.category, (c) => { view.category = c; rerender(); }, 'Kategorie')) : null,
    host);
}

function gallery() {
  const q = view.query.toLowerCase();
  const rows = state.designs
    .filter((d) => view.category === 'all' || d.category === view.category)
    .filter((d) => !q || [d.name, d.category, d.material, ...(d.tags ?? [])].join(' ').toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  if (!rows.length) {
    return h('div', { class: 'card' }, emptyState({
      icon: 'cube', title: q ? 'Keine Treffer' : 'Noch keine Designs',
      text: q ? `Kein Design passt zu „${view.query}“.` : 'Lade STL- oder 3MF-Dateien hoch. Druckwerk erstellt eine Vorschau und schätzt das Gewicht.',
      action: q ? null : button('Design hinzufügen', { primary: true, icon: 'plus', onClick: () => openDesignSheet() }),
    }));
  }
  return h('div', { class: 'grid grid-designs' }, rows.map((d) => h('button', { type: 'button', class: 'card interactive design-card', onclick: () => openDesignSheet(d) },
    h('div', { class: 'design-thumb' }, d.thumbnail ? h('img', { src: d.thumbnail, alt: '', loading: 'lazy' }) : icon('cube')),
    h('div', { class: 'design-body' },
      h('div', { class: 'card-title' }, d.name),
      h('div', { class: 'muted small' }, [d.category, d.material].filter(Boolean).join(' · ')),
      h('div', { class: 'row small', style: { justifyContent: 'space-between', marginTop: '4px' } },
        h('span', { class: 'muted tabular' }, [d.weight ? fmt.grams(d.weight) : null, d.printMinutes ? fmt.duration(d.printMinutes) : null].filter(Boolean).join(' · ') || '–'),
        d.price ? h('span', { class: 'tabular', style: { fontWeight: 600 } }, fmt.money(d.price)) : null)))));
}

export function openDesignSheet(design) {
  const d = structuredClone(design ?? { material: 'PLA', files: [], tags: [] });
  d.files ??= [];
  const thumb = h('div', { class: 'design-thumb', style: { borderRadius: '12px', overflow: 'hidden', border: 0 } });
  const drawThumb = () => thumb.replaceChildren(d.thumbnail ? h('img', { src: d.thumbnail, alt: 'Vorschau' }) : icon('cube'));
  drawThumb();
  const filesHost = h('div', { class: 'grouped' });
  const info = h('p', { class: 'small muted' });
  let formEl;

  const drawFiles = () => filesHost.replaceChildren(...(d.files.length ? d.files.map((f) => h('div', { class: 'row' },
    icon('file'),
    h('a', { href: f.url, download: f.name, style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, f.name),
    h('span', { class: 'muted small tabular' }, f.size >= 1048576 ? `${fmt.num(f.size / 1048576)} MB` : `${Math.max(1, Math.round(f.size / 1024))} KB`),
    iconButton('trash', `${f.name} entfernen`, async () => {
      d.files = d.files.filter((x) => x.id !== f.id);
      await api('/api/files/' + f.id, { method: 'DELETE' }).catch(() => {});
      drawFiles();
    }, 'danger'))) : [h('p', { class: 'muted small' }, 'Noch keine Dateien.')]));
  drawFiles();

  const addFiles = async () => {
    const files = await pickFile(MODEL_EXT, true);
    for (const file of files) {
      try {
        const meta = await uploadFile(file);
        d.files.push(meta);
        if (/\.stl$/i.test(file.name)) await analyseSTL(file);
        if (!formEl.elements.name.value) formEl.elements.name.value = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
      } catch (err) { toast(`${file.name}: ${err.message}`, 'error'); }
    }
    drawFiles();
  };

  const analyseSTL = async (file) => {
    const tris = parseSTL(await file.arrayBuffer());
    if (!tris.length) return;
    const m = meshInfo(tris);
    const material = formEl.elements.material.value;
    const grams = estimateGrams(m.volumeCm3, material);
    if (!d.thumbnail) {
      d.thumbnail = renderThumbnail(tris, m, { color: '#3478f6', dark: matchMedia('(prefers-color-scheme: dark)').matches });
      drawThumb();
    }
    if (!Number(formEl.elements.weight.value)) formEl.elements.weight.value = Math.round(grams);
    info.textContent = `${m.size.map((v) => fmt.num(v)).join(' × ')} mm · Volumen ${fmt.num(m.volumeCm3)} cm³ · geschätzt ${Math.round(grams)} g bei 15 % Infill`;
  };

  const sh = formSheet({
    title: design ? design.name : 'Design hinzufügen',
    size: 'wide',
    fields: [
      h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', alignItems: 'start' } },
        h('div', { class: 'stack', style: { gap: '10px' } },
          thumb,
          h('div', { class: 'row wrap' },
            button('Modell hochladen', { icon: 'upload', onClick: addFiles }),
            button('Bild wählen', { plain: true, onClick: async () => {
              const [img] = await pickFile('image/*');
              if (!img) return;
              const meta = await uploadFile(img);
              d.thumbnail = meta.url;
              drawThumb();
            } })),
          info),
        h('fieldset', { class: 'fieldset' },
          field({ label: 'Name', name: 'name', value: d.name, required: true, span: 'all' }),
          field({ label: 'Kategorie', name: 'category', value: d.category, placeholder: 'Ersatzteil, Deko …' }),
          field({ label: 'Material', name: 'material', type: 'select', value: d.material, options: MATERIAL_NAMES.map((m) => [m, m]) }),
          field({ label: 'Gewicht pro Stück', name: 'weight', type: 'number', value: d.weight, unit: 'g' }),
          field({ label: 'Druckzeit pro Stück', name: 'printMinutes', type: 'number', value: d.printMinutes, unit: 'min' }),
          field({ label: 'Verkaufspreis (netto)', name: 'price', type: 'number', value: d.price, unit: '€', step: '0.01' }),
          field({ label: 'Tags', name: 'tags', value: (d.tags ?? []).join(', '), placeholder: 'kommagetrennt' }))),
      h('fieldset', { class: 'fieldset' }, h('legend', {}, 'Dateien'), h('div', { class: 'field span-all' }, filesHost)),
      h('fieldset', { class: 'fieldset' }, h('legend', {}, 'Herkunft'),
        field({ label: 'Lizenz', name: 'license', value: d.license, placeholder: 'Eigenes Design, CC BY …', hint: 'Bei fremden Modellen: Ist kommerzielle Nutzung erlaubt?' }),
        field({ label: 'Quelle', name: 'source', type: 'url', value: d.source, placeholder: 'https://' }),
        field({ label: 'Beschreibung und Druckeinstellungen', name: 'description', type: 'textarea', value: d.description, span: 'all' })),
    ],
    extra: design ? h('div', { class: 'row wrap' },
      button('Kosten berechnen', { icon: 'calculator', onClick: () => { sh.close(); go(`calculator?design=${design.id}`); } }),
      button('Auftrag anlegen', { icon: 'orders', onClick: async () => { sh.close(); const { openOrderSheet } = await import('./orders.js'); openOrderSheet(null, { designId: design.id, title: design.name, durationMin: design.printMinutes || 60, price: design.price, grams: design.weight }); } })) : null,
    onDelete: design ? async () => {
      for (const f of design.files ?? []) await api('/api/files/' + f.id, { method: 'DELETE' }).catch(() => {});
      await remove('designs', design.id);
      toast('Design gelöscht');
    } : null,
    onSubmit: async (f) => {
      await save('designs', { ...d, ...f, tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean) });
      toast(design ? 'Design gesichert' : 'Design hinzugefügt');
    },
  });
  formEl = sh.panel.querySelector('form');
}
