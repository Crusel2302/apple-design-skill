// Bereich, der sich bei jedem Live-Update neu zeichnet, ohne den Rest der Seite anzufassen.
import { h } from './ui.js';
import { on } from './store.js';

export function liveRegion(render, attrs = {}) {
  const el = h('div', attrs);
  el.append(render());
  const off = on('live', () => {
    if (!el.isConnected) { off(); return; }
    el.replaceChildren(render());
  });
  return el;
}
