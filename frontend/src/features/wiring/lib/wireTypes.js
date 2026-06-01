// Pre-defined wire types used in caravan installations.
// Each: { id, name, section (mm²), thickness (px), style: solid|dashed|dotted, color, description }

export const WIRE_PRESETS = [
  // NYAF series
  { id: 'nyaf_075', name: '0.75 mm² NYAF', section: 0.75, thickness: 1.6, style: 'solid', color: '#FF3B30', desc: 'Düşük güç' },
  { id: 'nyaf_1', name: '1 mm² NYAF', section: 1, thickness: 1.8, style: 'solid', color: '#FF3B30', desc: '' },
  { id: 'nyaf_15', name: '1.5 mm² NYAF', section: 1.5, thickness: 2.0, style: 'solid', color: '#FF3B30', desc: 'Aydınlatma' },
  { id: 'nyaf_25', name: '2.5 mm² NYAF', section: 2.5, thickness: 2.4, style: 'solid', color: '#FF3B30', desc: 'Priz/genel' },
  { id: 'nyaf_4', name: '4 mm² NYAF', section: 4, thickness: 2.8, style: 'solid', color: '#FF3B30', desc: '' },
  { id: 'nyaf_6', name: '6 mm² NYAF', section: 6, thickness: 3.2, style: 'solid', color: '#FF3B30', desc: '' },
  { id: 'nyaf_10', name: '10 mm² NYAF', section: 10, thickness: 3.8, style: 'solid', color: '#FF3B30', desc: 'DC-DC' },
  { id: 'nyaf_16', name: '16 mm² NYAF', section: 16, thickness: 4.4, style: 'solid', color: '#FF3B30', desc: 'MPPT/inverter' },
  { id: 'nyaf_25mm', name: '25 mm² NYAF', section: 25, thickness: 5.0, style: 'solid', color: '#FF3B30', desc: '' },
  { id: 'nyaf_35', name: '35 mm² NYAF', section: 35, thickness: 5.8, style: 'solid', color: '#FF3B30', desc: '' },
  { id: 'nyaf_50', name: '50 mm² NYAF', section: 50, thickness: 6.5, style: 'solid', color: '#FF3B30', desc: 'Ana hat' },
  { id: 'nyaf_70', name: '70 mm² NYAF', section: 70, thickness: 7.5, style: 'solid', color: '#FF3B30', desc: 'Inverter ana' },
  { id: 'nyaf_90', name: '90 mm² NYAF', section: 90, thickness: 8.5, style: 'solid', color: '#FF3B30', desc: '' },
  // TTR
  { id: 'ttr_2x15', name: '2x1.5 TTR', section: 1.5, thickness: 2.4, style: 'solid', color: '#8B4513', desc: 'AC iki damarlı' },
  { id: 'ttr_2x25', name: '2x2.5 TTR', section: 2.5, thickness: 2.8, style: 'solid', color: '#8B4513', desc: 'AC iki damarlı' },
  // Signal
  { id: 'licy_8x05', name: '8x0.5 LiCY sinyal', section: 0.5, thickness: 1.4, style: 'dashed', color: '#FFD600', desc: 'Sinyal/veri' },
];

// Quick color palette (most common)
export const COLOR_PALETTE = [
  { name: 'Kırmızı (+)', value: '#FF3B30' },
  { name: 'Siyah (-)', value: '#1C1C1E' },
  { name: 'Mavi (N)', value: '#0A84FF' },
  { name: 'Kahverengi (L)', value: '#8B4513' },
  { name: 'Sarı-Yeşil (PE)', value: '#9ACD32' },
  { name: 'Sarı', value: '#FFCC00' },
  { name: 'Turuncu', value: '#FF9500' },
  { name: 'Gri', value: '#A0A0A0' },
  { name: 'Yeşil', value: '#00C853' },
  { name: 'Beyaz', value: '#F8F9FA' },
];

export function getWirePreset(id) {
  return WIRE_PRESETS.find(w => w.id === id);
}
