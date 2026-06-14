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
  // Solar (PV) kablolar — çift izolasyonlu, UV dayanımlı
  { id: 'solar_4', name: '4 mm² Solar (PV)', section: 4, thickness: 2.8, style: 'solid', color: '#FF3B30', desc: 'Panel hattı' },
  { id: 'solar_6', name: '6 mm² Solar (PV)', section: 6, thickness: 3.2, style: 'solid', color: '#FF3B30', desc: 'Panel/MPPT hattı' },
  { id: 'solar_10', name: '10 mm² Solar (PV)', section: 10, thickness: 3.8, style: 'solid', color: '#FF3B30', desc: 'Uzun panel hattı' },
  // Signal
  { id: 'licy_8x05', name: '8x0.5 LiCY sinyal', section: 0.5, thickness: 1.4, style: 'dashed', color: '#FFD600', desc: 'Sinyal/veri' },
];

// ---- Kullanıcının elle eklediği kablo tipleri (tarayıcıda kalıcı) ----
const CUSTOM_WIRES_KEY = 'karavan_wiring_custom_presets';

export function getCustomWirePresets() {
  try {
    const raw = localStorage.getItem(CUSTOM_WIRES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveCustomWirePreset(preset) {
  const list = getCustomWirePresets();
  const id = preset.id || `custom_${Date.now()}`;
  const clean = {
    id,
    name: (preset.name || 'Özel Kablo').slice(0, 60),
    section: parseFloat(preset.section) || 0,
    thickness: Math.max(1, Math.min(12, parseFloat(preset.thickness) || 2.4)),
    style: ['solid', 'dashed', 'dotted'].includes(preset.style) ? preset.style : 'solid',
    color: preset.color || '#FF3B30',
    desc: (preset.desc || '').slice(0, 80),
    custom: true,
  };
  const next = [...list.filter((w) => w.id !== id), clean];
  localStorage.setItem(CUSTOM_WIRES_KEY, JSON.stringify(next));
  return clean;
}

export function deleteCustomWirePreset(id) {
  const next = getCustomWirePresets().filter((w) => w.id !== id);
  localStorage.setItem(CUSTOM_WIRES_KEY, JSON.stringify(next));
}

// Yerleşik + özel kablo tipleri birlikte
export function getAllWirePresets() {
  return [...WIRE_PRESETS, ...getCustomWirePresets()];
}

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
  return WIRE_PRESETS.find(w => w.id === id) || getCustomWirePresets().find(w => w.id === id);
}

// ====== Otomatik kablo kesiti hesabı (Gridless-tarzı) ======
// Bakır özdirenç ρ ≈ 0.0175 Ω·mm²/m (≈20-30°C). Çift yön (gidiş+dönüş) için 2×.
const COPPER_RHO = 0.0175;

// Standart bakır kesitler ve emniyetli sürekli akım (ampacity, A) — bağlı demet,
// karavan/marine pratiği (konservatif). Kaynak: ABYC/Victron kablo tabloları.
export const STANDARD_SECTIONS = [
  { section: 0.75, ampacity: 7 },
  { section: 1, ampacity: 11 },
  { section: 1.5, ampacity: 15 },
  { section: 2.5, ampacity: 20 },
  { section: 4, ampacity: 30 },
  { section: 6, ampacity: 40 },
  { section: 10, ampacity: 60 },
  { section: 16, ampacity: 80 },
  { section: 25, ampacity: 110 },
  { section: 35, ampacity: 140 },
  { section: 50, ampacity: 170 },
  { section: 70, ampacity: 215 },
  { section: 95, ampacity: 270 },
];

// Tek bir kesit için voltaj düşümünü hesapla (volt + %).
export function voltageDrop(currentA, lengthM, sectionMm2, systemV) {
  if (!sectionMm2 || sectionMm2 <= 0) return null;
  const vDropV = (2 * lengthM * currentA * COPPER_RHO) / sectionMm2;
  const vDropPct = systemV > 0 ? (vDropV / systemV) * 100 : 0;
  return { vDropV, vDropPct };
}

// Akım + uzunluk + sistem voltajı + izinli Vdüşüm% → önerilen standart kesit.
// İki kriter birlikte: (1) ampacity ≥ akım, (2) Vdüşüm ≤ izinli.
// Dönüş: { section, ampacity, vDropV, vDropPct, limitedBy, ok }
export function calcWireSection(currentA, lengthM, systemV, maxVdropPct) {
  const I = parseFloat(currentA);
  const L = parseFloat(lengthM);
  const V = parseFloat(systemV);
  const maxPct = parseFloat(maxVdropPct);
  if (!(I > 0) || !(L > 0) || !(V > 0) || !(maxPct > 0)) return null;

  const allowedVdropV = V * (maxPct / 100);
  let ampPick = null; // ampacity'yi karşılayan en küçük kesit
  let chosen = null;  // her iki kriteri karşılayan en küçük kesit
  for (const s of STANDARD_SECTIONS) {
    if (ampPick === null && s.ampacity >= I) ampPick = s;
    const vd = voltageDrop(I, L, s.section, V);
    if (s.ampacity >= I && vd.vDropV <= allowedVdropV) { chosen = s; break; }
  }

  if (chosen) {
    const vd = voltageDrop(I, L, chosen.section, V);
    // Sınırlayan kriter: aynı/küçük ampacity kesiti Vdüşümde kalsaydı ampacity, yoksa Vdüşüm
    const limitedBy = (ampPick && ampPick.section === chosen.section) ? 'ampacity' : 'vdrop';
    return { section: chosen.section, ampacity: chosen.ampacity, ...vd, limitedBy, ok: true };
  }
  // Hiçbir standart kesit yetmiyor (çok uzun/yüksek akım) — en büyüğünü uyarıyla döndür
  const max = STANDARD_SECTIONS[STANDARD_SECTIONS.length - 1];
  const vd = voltageDrop(I, L, max.section, V);
  return { section: max.section, ampacity: max.ampacity, ...vd, limitedBy: 'over', ok: false };
}

// Önerilen kesite uyan en uygun preset (section ≥ önerilen, en küçük). Yoksa null.
export function presetForSection(sectionMm2) {
  const candidates = getAllWirePresets()
    .filter((w) => (w.section || 0) >= sectionMm2)
    .sort((a, b) => (a.section || 0) - (b.section || 0));
  return candidates[0] || null;
}
