// 3D-Druck-Kostenrechnung. Alle Werte gelten für einen Druck (eine Druckplatte).
//
//   Material   = Gramm × Preis pro kg ÷ 1000 × (1 + Ausschuss %)
//   Strom      = Leistung (W) ÷ 1000 × Druckzeit (h) × Strompreis (€/kWh)
//   Maschine   = (Anschaffung ÷ Lebensdauer (h) + Wartung €/h) × Druckzeit (h)
//   Arbeit     = (Vorbereitung + Nachbearbeitung) (min) ÷ 60 × Stundensatz
//   Risiko     = Zwischensumme × Fehldruckquote %
//   Netto      = Selbstkosten × (1 + Gewinnaufschlag %)

export const MATERIALS = {
  PLA: { density: 1.24, pricePerKg: 22 },
  'PLA+': { density: 1.24, pricePerKg: 24 },
  PETG: { density: 1.27, pricePerKg: 25 },
  ABS: { density: 1.04, pricePerKg: 24 },
  ASA: { density: 1.07, pricePerKg: 28 },
  TPU: { density: 1.21, pricePerKg: 35 },
  PA: { density: 1.14, pricePerKg: 60 },
  'PA-CF': { density: 1.2, pricePerKg: 80 },
  PC: { density: 1.2, pricePerKg: 45 },
  'PETG-CF': { density: 1.3, pricePerKg: 40 },
  PVA: { density: 1.23, pricePerKg: 70 },
  Resin: { density: 1.1, pricePerKg: 40 },
};
export const MATERIAL_NAMES = Object.keys(MATERIALS);

export function calculate(input) {
  const n = (v, d = 0) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);
  const hours = n(input.printMinutes) / 60;
  const waste = 1 + n(input.wastePercent) / 100;

  const materialLines = (input.materials ?? []).map((m) => ({
    ...m,
    cost: (n(m.grams) * n(m.pricePerKg)) / 1000 * waste,
  }));
  const grams = materialLines.reduce((a, m) => a + n(m.grams), 0);
  const material = materialLines.reduce((a, m) => a + m.cost, 0);
  const energyKwh = (n(input.powerW) / 1000) * hours;
  const energy = energyKwh * n(input.electricityPrice);
  const machine = (n(input.lifetimeHours) > 0 ? n(input.printerPrice) / n(input.lifetimeHours) : 0) * hours + n(input.maintenancePerHour) * hours;
  const labor = ((n(input.prepMinutes) + n(input.postMinutes)) / 60) * n(input.hourlyRate);
  const extras = n(input.extras);
  const subtotal = material + energy + machine + labor + extras;
  const risk = subtotal * (n(input.failureRate) / 100);
  const cost = subtotal + risk;
  const profit = cost * (n(input.markup) / 100);
  const net = cost + profit;
  const vatRate = input.smallBusiness ? 0 : n(input.vatRate, 19);
  const vat = net * (vatRate / 100);
  const gross = net + vat;
  const quantity = Math.max(1, Math.round(n(input.quantity, 1)));
  const pieces = Math.max(1, Math.round(n(input.piecesPerPrint, 1)));

  return {
    grams, energyKwh, materialLines,
    parts: { material, energy, machine, labor, extras, risk },
    cost, profit, net, vatRate, vat, gross,
    quantity, pieces,
    perPiece: { cost: cost / pieces, net: net / pieces, gross: gross / pieces },
    total: { cost: cost * quantity, net: net * quantity, vat: vat * quantity, gross: gross * quantity, grams: grams * quantity, minutes: n(input.printMinutes) * quantity },
  };
}

export const PART_LABELS = {
  material: 'Material', energy: 'Strom', machine: 'Maschine & Wartung', labor: 'Arbeitszeit', extras: 'Zusatzkosten', risk: 'Fehldruckrisiko',
};

// ---------- STL: Volumen und Vorschaubild ----------
export function parseSTL(buffer) {
  const view = new DataView(buffer);
  const isBinary = buffer.byteLength >= 84 && 84 + view.getUint32(80, true) * 50 === buffer.byteLength;
  const tris = [];
  if (isBinary) {
    const count = view.getUint32(80, true);
    for (let i = 0; i < count; i++) {
      const o = 84 + i * 50 + 12;
      const t = [];
      for (let v = 0; v < 3; v++) t.push([view.getFloat32(o + v * 12, true), view.getFloat32(o + v * 12 + 4, true), view.getFloat32(o + v * 12 + 8, true)]);
      tris.push(t);
    }
  } else {
    const text = new TextDecoder().decode(buffer);
    const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
    let m, cur = [];
    while ((m = re.exec(text))) {
      cur.push([+m[1], +m[2], +m[3]]);
      if (cur.length === 3) { tris.push(cur); cur = []; }
    }
  }
  return tris;
}

export function meshInfo(tris) {
  let vol = 0;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const [a, b, c] of tris) {
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    for (const p of [a, b, c]) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
  }
  return { volumeCm3: Math.abs(vol) / 1000, size: max.map((v, k) => v - min[k]), min, max, triangles: tris.length };
}

// Schätzung: Außenwände voll, Inneres mit Infill. Ergibt einen brauchbaren Startwert.
export function estimateGrams(volumeCm3, material = 'PLA', infill = 15) {
  const density = MATERIALS[material]?.density ?? 1.24;
  const solidShare = 0.35;
  return volumeCm3 * density * (solidShare + (1 - solidShare) * (infill / 100));
}

// Isometrische Vorschau, Flächen nach Tiefe sortiert und nach Lichteinfall schattiert
export function renderThumbnail(tris, info, { size = 480, color = '#3478f6', dark = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = Math.round(size * 0.75);
  const ctx = canvas.getContext('2d');
  const cx = (info.min[0] + info.max[0]) / 2, cy = (info.min[1] + info.max[1]) / 2, cz = (info.min[2] + info.max[2]) / 2;
  const ay = -Math.PI / 4, ax = Math.atan(1 / Math.SQRT2) * 0.9;
  const cosY = Math.cos(ay), sinY = Math.sin(ay), cosX = Math.cos(ax), sinX = Math.sin(ax);
  const project = ([x, y, z]) => {
    x -= cx; y -= cy; z -= cz;
    const x1 = x * cosY - y * sinY, y1 = x * sinY + y * cosY;
    return [x1, -(z * cosX - y1 * sinX), z * sinX + y1 * cosX];
  };
  const step = Math.max(1, Math.floor(tris.length / 60000));
  const faces = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < tris.length; i += step) {
    const p = tris[i].map(project);
    for (const q of p) { minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]); minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]); }
    const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const v = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    const nrm = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(...nrm) || 1;
    const light = Math.abs((nrm[0] * -0.4 + nrm[1] * -0.7 + nrm[2] * -0.6) / len);
    faces.push({ p, depth: (p[0][2] + p[1][2] + p[2][2]) / 3, light });
  }
  faces.sort((a, b) => b.depth - a.depth);
  const pad = 0.12;
  const scale = Math.min(canvas.width * (1 - 2 * pad) / (maxX - minX || 1), canvas.height * (1 - 2 * pad) / (maxY - minY || 1));
  const ox = canvas.width / 2 - ((minX + maxX) / 2) * scale, oy = canvas.height / 2 - ((minY + maxY) / 2) * scale;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  ctx.fillStyle = dark ? '#2c2c2e' : '#f5f5f7';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const f of faces) {
    const k = 0.45 + 0.55 * f.light;
    ctx.fillStyle = ctx.strokeStyle = `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
    ctx.beginPath();
    ctx.moveTo(f.p[0][0] * scale + ox, f.p[0][1] * scale + oy);
    ctx.lineTo(f.p[1][0] * scale + ox, f.p[1][1] * scale + oy);
    ctx.lineTo(f.p[2][0] * scale + ox, f.p[2][1] * scale + oy);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
  return canvas.toDataURL('image/png');
}
