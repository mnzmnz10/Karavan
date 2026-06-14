// Kablo Şeması v2 — cihaz kataloğu.
// Her cihaz: { type, name, category, w, h, ports[], specs{} }.
// Port: { id, name, side: top|right|bottom|left, offset 0..1, polarity }.
// İkon gövdesi icons/deviceIcons.js'ten (type ile eşleşir); portları Canvas
// renderer'ı polarity→renk haritasıyla generic çizer (stub + nokta + etiket).

// Polarite → kablo/terminal rengi (Victron konvansiyonu)
export const POLARITY_COLORS = {
  pos: '#E2231A',     // + kırmızı
  neg: '#1A1A1A',     // − siyah
  pv_pos: '#E2231A',
  pv_neg: '#1A1A1A',
  ac_l: '#8B5A2B',    // faz kahve
  ac_n: '#0A84FF',    // nötr mavi
  pe: '#2E9E4F',      // toprak yeşil
  sig: '#CA8A04',     // sinyal sarı
};

export const POLARITY_LABEL_COLOR = '#475569';

export const DEVICE_CATEGORIES = [
  { id: 'source', label: 'Kaynak' },
  { id: 'storage', label: 'Depolama' },
  { id: 'charger', label: 'Şarj / Dönüştürücü' },
  { id: 'protect', label: 'Koruma / Sigorta' },
  { id: 'bus', label: 'Bara / Topraklama' },
  { id: 'sensor', label: 'Ölçüm' },
  { id: 'load', label: 'Tüketici' },
];

const p = (id, name, side, offset, polarity) => ({ id, name, side, offset, polarity });

export const DEVICE_CATALOG = [
  {
    type: 'solar_panel', name: 'Güneş Paneli', category: 'source', w: 130, h: 94,
    specs: { watt: 455, voc: 49.5, isc: 11.6 },
    ports: [p('pv_plus', 'PV+', 'bottom', 0.40, 'pv_pos'), p('pv_minus', 'PV−', 'bottom', 0.60, 'pv_neg')],
  },
  {
    type: 'battery', name: 'LiFePO4 Akü', category: 'storage', w: 120, h: 90,
    specs: { ah: 200, voltage: 12 },
    ports: [p('plus', '+', 'top', 0.32, 'pos'), p('minus', '−', 'top', 0.68, 'neg')],
  },
  {
    type: 'mppt', name: 'MPPT', category: 'charger', w: 110, h: 100,
    specs: { current: 30, voltage: 12 },
    ports: [
      p('pv_plus', 'PV+', 'top', 0.40, 'pv_pos'), p('pv_minus', 'PV−', 'top', 0.56, 'pv_neg'),
      p('bat_plus', 'BAT+', 'bottom', 0.40, 'pos'), p('bat_minus', 'BAT−', 'bottom', 0.56, 'neg'),
    ],
  },
  {
    type: 'inverter', name: 'İnverter', category: 'charger', w: 130, h: 100,
    specs: { watt: 2000, voltage: 12 },
    ports: [
      p('dc_plus', 'DC+', 'left', 0.35, 'pos'), p('dc_minus', 'DC−', 'left', 0.65, 'neg'),
      p('ac_l', 'L', 'right', 0.35, 'ac_l'), p('ac_n', 'N', 'right', 0.65, 'ac_n'),
    ],
  },
  {
    type: 'inverter_charger', name: 'İnverter/Şarj', category: 'charger', w: 140, h: 104,
    specs: { watt: 3000, voltage: 12 },
    ports: [
      p('dc_plus', 'DC+', 'left', 0.30, 'pos'), p('dc_minus', 'DC−', 'left', 0.70, 'neg'),
      p('acin_l', 'AC IN L', 'top', 0.38, 'ac_l'), p('acin_n', 'AC IN N', 'top', 0.54, 'ac_n'),
      p('acout_l', 'AC OUT L', 'right', 0.35, 'ac_l'), p('acout_n', 'AC OUT N', 'right', 0.65, 'ac_n'),
    ],
  },
  {
    type: 'dcdc', name: 'DC-DC Şarj', category: 'charger', w: 120, h: 84,
    specs: { current: 30 },
    ports: [
      p('in_plus', 'IN+', 'left', 0.30, 'pos'), p('in_minus', 'IN−', 'left', 0.70, 'neg'),
      p('out_plus', 'OUT+', 'right', 0.30, 'pos'), p('out_minus', 'OUT−', 'right', 0.70, 'neg'),
    ],
  },
  {
    type: 'acdc_charger', name: 'AC-DC Şarj', category: 'charger', w: 130, h: 92,
    specs: { current: 30 },
    ports: [
      p('ac_l', 'L', 'left', 0.25, 'ac_l'), p('ac_n', 'N', 'left', 0.50, 'ac_n'), p('pe', 'PE', 'left', 0.75, 'pe'),
      p('out_plus', '+', 'right', 0.35, 'pos'), p('out_minus', '−', 'right', 0.65, 'neg'),
    ],
  },
  {
    type: 'fuse', name: 'Sigorta', category: 'protect', w: 100, h: 64,
    specs: { amp: 0 },
    ports: [p('a', 'A', 'left', 0.5, 'pos'), p('b', 'B', 'right', 0.5, 'pos')],
  },
  {
    type: 'fuse_box', name: 'Sigorta Kutusu', category: 'protect', w: 140, h: 92,
    specs: {},
    ports: [
      p('in', 'IN', 'left', 0.5, 'pos'),
      p('f1', '1', 'right', 0.22, 'pos'), p('f2', '2', 'right', 0.40, 'pos'),
      p('f3', '3', 'right', 0.58, 'pos'), p('f4', '4', 'right', 0.76, 'pos'),
    ],
  },
  {
    type: 'busbar_pos', name: 'Pozitif Bara', category: 'bus', w: 150, h: 52,
    specs: {},
    ports: [
      p('t1', '1', 'top', 0.16, 'pos'), p('t2', '2', 'top', 0.33, 'pos'), p('t3', '3', 'top', 0.5, 'pos'),
      p('t4', '4', 'top', 0.67, 'pos'), p('t5', '5', 'bottom', 0.5, 'pos'),
    ],
  },
  {
    type: 'busbar_neg', name: 'Negatif Bara', category: 'bus', w: 150, h: 52,
    specs: {},
    ports: [
      p('t1', '1', 'top', 0.16, 'neg'), p('t2', '2', 'top', 0.33, 'neg'), p('t3', '3', 'top', 0.5, 'neg'),
      p('t4', '4', 'top', 0.67, 'neg'), p('t5', '5', 'bottom', 0.5, 'neg'),
    ],
  },
  {
    type: 'shunt', name: 'Shunt / Monitör', category: 'sensor', w: 120, h: 84,
    specs: {},
    ports: [
      p('bat', 'BATT−', 'left', 0.7, 'neg'), p('load', 'YÜK−', 'right', 0.7, 'neg'),
      p('sig', 'SIG', 'top', 0.5, 'sig'),
    ],
  },
  {
    type: 'switch', name: 'Şalter', category: 'protect', w: 100, h: 64,
    specs: {},
    ports: [p('a', 'A', 'left', 0.5, 'pos'), p('b', 'B', 'right', 0.5, 'pos')],
  },
  {
    type: 'breaker', name: 'Otomatik Sigorta', category: 'protect', w: 100, h: 70,
    specs: { amp: 0 },
    ports: [p('a', 'A', 'left', 0.5, 'pos'), p('b', 'B', 'right', 0.5, 'pos')],
  },
  {
    type: 'outlet', name: 'Priz', category: 'load', w: 96, h: 80,
    specs: {},
    ports: [p('l', 'L', 'left', 0.3, 'ac_l'), p('n', 'N', 'left', 0.5, 'ac_n'), p('pe', 'PE', 'left', 0.7, 'pe')],
  },
  {
    type: 'pump', name: 'Su Pompası', category: 'load', w: 96, h: 80,
    specs: { current: 6 },
    ports: [p('plus', '+', 'left', 0.35, 'pos'), p('minus', '−', 'left', 0.65, 'neg')],
  },
  {
    type: 'light', name: 'Aydınlatma', category: 'load', w: 96, h: 80,
    specs: { current: 1 },
    ports: [p('plus', '+', 'left', 0.35, 'pos'), p('minus', '−', 'left', 0.65, 'neg')],
  },
  {
    type: 'fan', name: 'Fan', category: 'load', w: 96, h: 80,
    specs: { current: 2 },
    ports: [p('plus', '+', 'left', 0.35, 'pos'), p('minus', '−', 'left', 0.65, 'neg')],
  },
  {
    type: 'fridge', name: 'Buzdolabı', category: 'load', w: 110, h: 96,
    specs: { current: 5 },
    ports: [p('plus', '+', 'left', 0.30, 'pos'), p('minus', '−', 'left', 0.70, 'neg')],
  },
  {
    type: 'ground', name: 'Topraklama', category: 'bus', w: 80, h: 70,
    specs: {},
    ports: [p('g', 'GND', 'top', 0.5, 'pe')],
  },
];

export function getCatalogDevice(type) {
  return DEVICE_CATALOG.find((d) => d.type === type) || null;
}

export function devicesByCategory() {
  const out = {};
  for (const c of DEVICE_CATEGORIES) out[c.id] = [];
  for (const d of DEVICE_CATALOG) (out[d.category] = out[d.category] || []).push(d);
  return out;
}
