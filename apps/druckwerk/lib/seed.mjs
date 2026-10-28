// Beispieldaten, damit man die App sofort ausprobieren kann.
import { randomUUID } from 'node:crypto';

export function seedData() {
  const id = () => randomUUID();
  const now = new Date();
  const at = (dayOffset, hour, minute = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };
  const day = (offset) => at(offset, 12).slice(0, 10);
  const stamp = { createdAt: now.toISOString(), updatedAt: now.toISOString() };

  const printers = [
    { id: id(), name: 'X1 Carbon', brand: 'Bambu Lab', model: 'X1C', source: 'manual', serial: '', color: 'blue', powerW: 150, price: 1449, lifetimeHours: 5000, maintenancePerHour: 0.08, nozzle: 0.4, buildVolume: '256 × 256 × 256 mm', ams: true, notes: 'Hauptmaschine, AMS mit 4 Slots', ...stamp },
    { id: id(), name: 'P1S Werkbank', brand: 'Bambu Lab', model: 'P1S', source: 'manual', serial: '', color: 'teal', powerW: 120, price: 799, lifetimeHours: 5000, maintenancePerHour: 0.06, nozzle: 0.4, buildVolume: '256 × 256 × 256 mm', ams: true, notes: '', ...stamp },
    { id: id(), name: 'A1 mini', brand: 'Bambu Lab', model: 'A1 mini', source: 'manual', serial: '', color: 'pink', powerW: 80, price: 249, lifetimeHours: 3000, maintenancePerHour: 0.04, nozzle: 0.4, buildVolume: '180 × 180 × 180 mm', ams: false, notes: 'Für Kleinteile und Prototypen', ...stamp },
    { id: id(), name: 'MK4S', brand: 'Prusa', model: 'MK4S', source: 'manual', serial: '', color: 'purple', powerW: 110, price: 1099, lifetimeHours: 6000, maintenancePerHour: 0.05, nozzle: 0.6, buildVolume: '250 × 210 × 220 mm', ams: false, notes: '0,6-mm-Düse für große Teile', ...stamp },
  ];

  const customers = [
    { id: id(), type: 'business', company: 'Holzmann Möbelbau GmbH', name: 'Sabine Holzmann', email: 'einkauf@holzmann-moebel.de', phone: '+49 89 123456', street: 'Werkstraße 12', zip: '80331', city: 'München', country: 'Deutschland', vatId: 'DE123456789', notes: 'Bestellt regelmäßig Möbelbeschläge', ...stamp },
    { id: id(), type: 'private', company: '', name: 'Jonas Becker', email: 'jonas.becker@example.de', phone: '+49 151 2345678', street: 'Lindenallee 4', zip: '50667', city: 'Köln', country: 'Deutschland', vatId: '', notes: 'Cosplay-Projekte', ...stamp },
    { id: id(), type: 'business', company: 'Fahrradladen Speiche', name: 'Mehmet Yilmaz', email: 'info@speiche-rad.de', phone: '+49 30 9876543', street: 'Oranienstraße 88', zip: '10969', city: 'Berlin', country: 'Deutschland', vatId: 'DE987654321', notes: '', ...stamp },
    { id: id(), type: 'private', company: '', name: 'Lea Hoffmann', email: 'lea.hoffmann@example.de', phone: '', street: 'Am Markt 2', zip: '01067', city: 'Dresden', country: 'Deutschland', vatId: '', notes: 'Bevorzugt Pastellfarben', ...stamp },
    { id: id(), type: 'business', company: 'Studio Nordlicht', name: 'Finn Petersen', email: 'hallo@studio-nordlicht.de', phone: '+49 40 5550123', street: 'Hafenstraße 21', zip: '20457', city: 'Hamburg', country: 'Deutschland', vatId: 'DE456789123', notes: 'Architekturmodelle', ...stamp },
  ];

  const designs = [
    { id: id(), name: 'Möbelbeschlag Eckwinkel', category: 'Funktionsteil', tags: ['Möbel', 'Serie'], material: 'PETG', weight: 38, printMinutes: 95, price: 6.9, license: 'Eigenes Design', source: '', description: 'Verstärkter Eckwinkel für 18-mm-Platten.', files: [], thumbnail: null, ...stamp },
    { id: id(), name: 'Helm-Visier „Nova“', category: 'Cosplay', tags: ['Cosplay', 'Groß'], material: 'PLA', weight: 412, printMinutes: 1260, price: 89, license: 'Kommerzielle Lizenz', source: 'https://www.printables.com', description: 'Dreiteilig, für Nachbearbeitung mit Spachtel vorgesehen.', files: [], thumbnail: null, ...stamp },
    { id: id(), name: 'Fahrrad-Kabelclip', category: 'Ersatzteil', tags: ['Fahrrad', 'Serie'], material: 'PETG', weight: 4, printMinutes: 12, price: 1.5, license: 'Eigenes Design', source: '', description: 'Clip für 5-mm-Bremszüge, 20er-Platte.', files: [], thumbnail: null, ...stamp },
    { id: id(), name: 'Pflanztopf Wave', category: 'Deko', tags: ['Wohnen'], material: 'PLA', weight: 160, printMinutes: 340, price: 24, license: 'CC BY', source: 'https://makerworld.com', description: 'Vasenmodus, 0,6-mm-Düse empfohlen.', files: [], thumbnail: null, ...stamp },
    { id: id(), name: 'Architekturmodell Sockel', category: 'Modellbau', tags: ['Architektur'], material: 'PLA', weight: 220, printMinutes: 480, price: 45, license: 'Kundendaten', source: '', description: 'Maßstab 1:200, Grundplatte mit Gelände.', files: [], thumbnail: null, ...stamp },
    { id: id(), name: 'Flexibler Türstopper', category: 'Funktionsteil', tags: ['TPU'], material: 'TPU', weight: 55, printMinutes: 150, price: 9.5, license: 'Eigenes Design', source: '', description: '', files: [], thumbnail: null, ...stamp },
  ];

  const spools = [
    { id: id(), material: 'PLA', brand: 'Bambu Lab', colorName: 'Schwarz', color: '#1d1d1f', diameter: 1.75, netWeight: 1000, remaining: 640, price: 22.99, location: 'AMS X1C · Slot 1', lowThreshold: 200, purchased: day(-40), ...stamp },
    { id: id(), material: 'PLA', brand: 'Bambu Lab', colorName: 'Jadeweiß', color: '#f4f4f0', diameter: 1.75, netWeight: 1000, remaining: 150, price: 22.99, location: 'AMS X1C · Slot 2', lowThreshold: 200, purchased: day(-60), ...stamp },
    { id: id(), material: 'PETG', brand: 'Bambu Lab', colorName: 'Transparent Blau', color: '#3a7bd5', diameter: 1.75, netWeight: 1000, remaining: 820, price: 24.99, location: 'AMS P1S · Slot 1', lowThreshold: 200, purchased: day(-12), ...stamp },
    { id: id(), material: 'PETG', brand: 'Prusament', colorName: 'Galaxy Black', color: '#2b2b33', diameter: 1.75, netWeight: 1000, remaining: 410, price: 29.99, location: 'Regal A2', lowThreshold: 250, purchased: day(-30), ...stamp },
    { id: id(), material: 'PLA', brand: 'Polymaker', colorName: 'Salbei', color: '#9cb59a', diameter: 1.75, netWeight: 1000, remaining: 930, price: 21.5, location: 'Regal A1', lowThreshold: 200, purchased: day(-5), ...stamp },
    { id: id(), material: 'TPU', brand: 'Bambu Lab', colorName: 'Rot', color: '#d93a2f', diameter: 1.75, netWeight: 1000, remaining: 90, price: 34.99, location: 'Trockenbox', lowThreshold: 150, purchased: day(-90), ...stamp },
    { id: id(), material: 'ASA', brand: 'Extrudr', colorName: 'Grau', color: '#8e8e93', diameter: 1.75, netWeight: 1000, remaining: 1000, price: 27.9, location: 'Regal B1', lowThreshold: 200, purchased: day(-2), ...stamp },
    { id: id(), material: 'PLA', brand: 'Sunlu', colorName: 'Pastellrosa', color: '#f2b8c6', diameter: 1.75, netWeight: 1000, remaining: 520, price: 17.99, location: 'Regal A1', lowThreshold: 200, purchased: day(-20), ...stamp },
  ];

  const [x1, p1s, a1, mk4] = printers;
  const [holz, jonas, speiche, lea, nord] = customers;
  const [beschlag, visier, clip, topf, sockel, stopper] = designs;

  const order = (o) => ({ id: id(), status: 'planned', notes: '', invoiceId: null, spoolId: null, ...o, ...stamp });
  const orders = [
    order({ title: 'Eckwinkel Serie 40 Stk.', customerId: holz.id, designId: beschlag.id, printerId: p1s.id, quantity: 40, start: at(0, Math.max(now.getHours() - 2, 6)), durationMin: 600, status: 'printing', price: 276, spoolId: spools[3].id }),
    order({ title: 'Helm-Visier Nova', customerId: jonas.id, designId: visier.id, printerId: x1.id, quantity: 1, start: at(0, Math.max(now.getHours() - 5, 3)), durationMin: 1260, status: 'printing', price: 89, spoolId: spools[0].id }),
    order({ title: 'Kabelclips 200 Stk.', customerId: speiche.id, designId: clip.id, printerId: a1.id, quantity: 200, start: at(1, 8), durationMin: 240, status: 'planned', price: 300, spoolId: spools[2].id }),
    order({ title: 'Pflanztöpfe Pastell', customerId: lea.id, designId: topf.id, printerId: mk4.id, quantity: 3, start: at(1, 9), durationMin: 1020, status: 'planned', price: 72, spoolId: spools[7].id }),
    order({ title: 'Sockel Wettbewerbsmodell', customerId: nord.id, designId: sockel.id, printerId: x1.id, quantity: 2, start: at(2, 7), durationMin: 960, status: 'planned', price: 90, spoolId: spools[4].id }),
    order({ title: 'Türstopper', customerId: lea.id, designId: stopper.id, printerId: p1s.id, quantity: 4, start: at(3, 10), durationMin: 600, status: 'planned', price: 38, spoolId: spools[5].id }),
    order({ title: 'Eckwinkel Nachbestellung', customerId: holz.id, designId: beschlag.id, printerId: p1s.id, quantity: 20, start: at(5, 8), durationMin: 300, status: 'planned', price: 138, spoolId: spools[3].id }),
    order({ title: 'Kabelclips Muster', customerId: speiche.id, designId: clip.id, printerId: a1.id, quantity: 20, start: at(-6, 9), durationMin: 30, status: 'delivered', price: 30, spoolId: spools[2].id }),
    order({ title: 'Architekturmodell Vorabzug', customerId: nord.id, designId: sockel.id, printerId: mk4.id, quantity: 1, start: at(-3, 8), durationMin: 480, status: 'done', price: 45, spoolId: spools[4].id }),
  ];

  const inv = (o) => ({ id: id(), notes: '', orderIds: [], ...o, ...stamp });
  const item = (description, qty, unitPrice, unit = 'Stk.') => ({ description, qty, unit, unitPrice, vatRate: 19 });
  const invoices = [];
  const monthly = [[-5, 640], [-4, 910], [-3, 780], [-2, 1240], [-1, 1105]];
  monthly.forEach(([m, total], i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + m, 8 + i);
    const c = customers[i % customers.length];
    invoices.push(inv({
      number: `RE-${d.getFullYear()}-${String(i + 1).padStart(4, '0')}`,
      customerId: c.id, date: d.toISOString().slice(0, 10),
      dueDate: new Date(d.getTime() + 14 * 864e5).toISOString().slice(0, 10),
      status: 'paid', paidAt: new Date(d.getTime() + 6 * 864e5).toISOString().slice(0, 10),
      items: [item('3D-Druckauftrag laut Angebot', 1, Math.round((total / 1.19) * 100) / 100, 'Pauschal')],
    }));
  });
  invoices.push(inv({
    number: `RE-${now.getFullYear()}-0006`, customerId: speiche.id, date: day(-20), dueDate: day(-6), status: 'open',
    items: [item('Fahrrad-Kabelclip PETG, Muster', 20, 1.26), item('Versand', 1, 4.9, 'Pauschal')],
  }));
  invoices.push(inv({
    number: `RE-${now.getFullYear()}-0007`, customerId: nord.id, date: day(-2), dueDate: day(12), status: 'open',
    items: [item('Architekturmodell Sockel, Vorabzug', 1, 37.82)], orderIds: [orders[8].id],
  }));
  orders[8].invoiceId = invoices[6].id;

  return {
    printers, customers, designs, spools, orders, invoices, quotes: [],
    settings: {
      company: {
        name: 'Druckwerk 3D', owner: 'Max Mustermann', street: 'Musterstraße 1', zip: '12345', city: 'Musterstadt',
        country: 'Deutschland', email: 'hallo@druckwerk.example', phone: '+49 123 456789', website: 'druckwerk.example',
        vatId: '', taxNumber: '12/345/67890', bank: 'Musterbank', iban: 'DE02 1203 0000 0000 2020 51', bic: 'BYLADEM1001',
      },
      invoice: { nextNumber: 8 },
    },
  };
}
