// Kablo Şeması v2 — Victron-tarzı cihaz ikonları (flat 2D line-art, beyaz zemin).
// Her builder SADECE cihaz GÖVDESİNİ çizer (terminal/port YOK) — portlar (stub +
// renkli nokta + etiket) Canvas renderer'ında katalog tanımından generic çizilir.
// Böylece ikon sanatı ile portlar her zaman hizalı kalır ve SVG svglib PDF'inde
// birebir render eder (foreignObject yok, gömülü <text> yok). Çizim alanı 0..100
// (genişlik) × 0..72 (yükseklik); cihaz w/h'ye ölçeklenir.

const BLK = '#1A1A1A';   // outline kömür
const BLU = '#0A4C9E';   // Victron mavi (gövde header)
const CYA = '#1CA0E2';   // cyan vurgu/detay
const GRY = '#8A9199';   // ikincil detay/gri
const LF = '#F4F6F8';    // açık dolgu

// ---- yardımcılar ----
const cells = (x, y, w, h, cols, rows) => {
  let s = '';
  for (let i = 1; i < rows; i++) s += `<line x1="${x}" y1="${(y + (h * i) / rows).toFixed(1)}" x2="${x + w}" y2="${(y + (h * i) / rows).toFixed(1)}" stroke="${BLK}" stroke-width="1"/>`;
  for (let i = 1; i < cols; i++) s += `<line x1="${(x + (w * i) / cols).toFixed(1)}" y1="${y}" x2="${(x + (w * i) / cols).toFixed(1)}" y2="${y + h}" stroke="${BLK}" stroke-width="1"/>`;
  return s;
};
const sun = (cx, cy, r, col) => {
  let s = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="2"/>`;
  for (let a = 0; a < 8; a++) {
    const dx = Math.cos((a * Math.PI) / 4), dy = Math.sin((a * Math.PI) / 4);
    s += `<line x1="${(cx + dx * (r + 2)).toFixed(1)}" y1="${(cy + dy * (r + 2)).toFixed(1)}" x2="${(cx + dx * (r + 5)).toFixed(1)}" y2="${(cy + dy * (r + 5)).toFixed(1)}" stroke="${col}" stroke-width="1.5"/>`;
  }
  return s;
};
const sine = (x, y, w, col) => `<path d="M${x} ${y} q${w / 4} -8 ${w / 2} 0 t${w / 2} 0" fill="none" stroke="${col}" stroke-width="2"/>`;
const label = (x, y, t, col = BLK, size = 11, weight = 'bold') =>
  `<text x="${x}" y="${y}" text-anchor="middle" font-size="${size}" font-family="Montserrat, sans-serif" fill="${col}" font-weight="${weight}">${t}</text>`;

// ---- cihaz gövdeleri (terminal YOK) ----
export const ICON_BUILDERS = {
  solar_panel: () =>
    `<rect x="4" y="6" width="92" height="54" rx="3" fill="${LF}" stroke="${BLK}" stroke-width="2"/>` +
    cells(4, 6, 92, 54, 5, 3) +
    `<line x1="10" y1="12" x2="20" y2="12" stroke="#FFFFFF" stroke-width="2" opacity="0.6"/>`,

  battery: () =>
    `<rect x="10" y="12" width="80" height="50" rx="4" fill="${LF}" stroke="${BLK}" stroke-width="2"/>` +
    `<rect x="22" y="6" width="14" height="8" rx="1.5" fill="${BLK}"/><rect x="64" y="6" width="14" height="8" rx="1.5" fill="${BLK}"/>` +
    [0, 1, 2, 3].map((i) => `<rect x="${20 + i * 16}" y="26" width="7" height="22" rx="1" fill="${CYA}"/>`).join('') +
    label(50, 58, 'LiFePO₄', GRY, 8, 'normal'),

  mppt: () =>
    `<rect x="14" y="4" width="72" height="64" rx="5" fill="#FFFFFF" stroke="${BLK}" stroke-width="2"/>` +
    `<rect x="14" y="4" width="72" height="13" rx="5" fill="${BLU}"/>` +
    `<rect x="14" y="11" width="72" height="6" fill="${BLU}"/>` +
    sun(50, 33, 7, CYA) +
    label(50, 56, 'MPPT', BLK, 11),

  inverter: () =>
    `<rect x="10" y="6" width="80" height="60" rx="5" fill="#FFFFFF" stroke="${BLK}" stroke-width="2"/>` +
    `<line x1="50" y1="14" x2="50" y2="58" stroke="${GRY}" stroke-width="1" stroke-dasharray="3 3"/>` +
    label(30, 40, '=', BLK, 18, 'normal') +
    sine(56, 36, 26, BLK),

  inverter_charger: () =>
    `<rect x="8" y="6" width="84" height="60" rx="5" fill="#FFFFFF" stroke="${BLK}" stroke-width="2"/>` +
    label(28, 28, '=', BLK, 13, 'normal') +
    sine(54, 24, 22, BLK) +
    `<path d="M30 42 l34 0 m-7 -4 l7 4 l-7 4" fill="none" stroke="${CYA}" stroke-width="2"/>` +
    `<path d="M64 54 l-34 0 m7 -4 l-7 4 l7 4" fill="none" stroke="#E2231A" stroke-width="2"/>`,

  dcdc: () =>
    `<rect x="12" y="14" width="76" height="44" rx="5" fill="#FFFFFF" stroke="${BLK}" stroke-width="2"/>` +
    label(50, 41, 'DC/DC', BLK, 12),

  acdc_charger: () =>
    `<rect x="12" y="12" width="76" height="48" rx="5" fill="#FFFFFF" stroke="${BLK}" stroke-width="2"/>` +
    sine(20, 30, 20, BLK) +
    label(64, 35, '=', BLK, 13, 'normal') +
    label(50, 52, 'ŞARJ', GRY, 7, 'normal'),

  fuse: () =>
    `<rect x="22" y="26" width="56" height="20" rx="3" fill="${LF}" stroke="${BLK}" stroke-width="2"/>` +
    `<line x1="22" y1="36" x2="78" y2="36" stroke="${BLK}" stroke-width="2"/>`,

  fuse_box: () =>
    `<rect x="8" y="10" width="84" height="52" rx="4" fill="${LF}" stroke="${BLK}" stroke-width="2"/>` +
    [0, 1, 2, 3].map((i) => `<rect x="18" y="${16 + i * 11}" width="64" height="7" rx="1.5" fill="#FFFFFF" stroke="${BLK}" stroke-width="1.2"/><line x1="18" y1="${19.5 + i * 11}" x2="82" y2="${19.5 + i * 11}" stroke="${BLK}" stroke-width="1"/>`).join(''),

  busbar_pos: () =>
    `<rect x="6" y="28" width="88" height="16" rx="8" fill="#E2231A" stroke="${BLK}" stroke-width="1.5"/>` +
    [0, 1, 2, 3, 4].map((i) => `<circle cx="${16 + i * 16}" cy="36" r="4" fill="#FFFFFF" stroke="${BLK}" stroke-width="1.5"/>`).join(''),

  busbar_neg: () =>
    `<rect x="6" y="28" width="88" height="16" rx="8" fill="${BLK}" stroke="${BLK}" stroke-width="1.5"/>` +
    [0, 1, 2, 3, 4].map((i) => `<circle cx="${16 + i * 16}" cy="36" r="4" fill="#FFFFFF" stroke="${BLK}" stroke-width="1.5"/>`).join(''),

  shunt: () =>
    `<rect x="22" y="30" width="56" height="14" rx="2" fill="${LF}" stroke="${BLK}" stroke-width="2"/>` +
    `<circle cx="30" cy="37" r="3" fill="${GRY}"/><circle cx="70" cy="37" r="3" fill="${GRY}"/>` +
    `<rect x="40" y="10" width="20" height="14" rx="2" fill="#FFFFFF" stroke="${BLK}" stroke-width="1.5"/>` +
    `<line x1="50" y1="24" x2="50" y2="30" stroke="${GRY}" stroke-width="1.2"/>` +
    label(50, 21, '%', BLK, 8, 'normal'),

  switch: () =>
    `<circle cx="22" cy="36" r="3.5" fill="${BLK}"/><circle cx="78" cy="36" r="3.5" fill="${BLK}"/>` +
    `<line x1="22" y1="36" x2="66" y2="20" stroke="${BLK}" stroke-width="2.5" stroke-linecap="round"/>`,

  breaker: () =>
    `<rect x="18" y="20" width="64" height="32" rx="4" fill="#FFFFFF" stroke="${BLK}" stroke-width="2"/>` +
    `<circle cx="34" cy="36" r="3" fill="${BLK}"/><circle cx="66" cy="36" r="3" fill="${BLK}"/>` +
    `<path d="M34 36 q16 -14 32 0" fill="none" stroke="${BLK}" stroke-width="2"/>`,

  outlet: () =>
    `<rect x="24" y="10" width="52" height="52" rx="8" fill="${LF}" stroke="${BLK}" stroke-width="2"/>` +
    `<circle cx="50" cy="36" r="17" fill="none" stroke="${BLK}" stroke-width="1.5"/>` +
    `<circle cx="43" cy="36" r="2.6" fill="${BLK}"/><circle cx="57" cy="36" r="2.6" fill="${BLK}"/>`,

  pump: () =>
    `<circle cx="50" cy="36" r="24" fill="${LF}" stroke="${BLK}" stroke-width="2"/>` +
    label(50, 42, 'P', BLK, 18),

  light: () =>
    `<circle cx="50" cy="36" r="22" fill="#FFFCEB" stroke="${BLK}" stroke-width="2"/>` +
    `<line x1="38" y1="24" x2="62" y2="48" stroke="${BLK}" stroke-width="1.5"/><line x1="62" y1="24" x2="38" y2="48" stroke="${BLK}" stroke-width="1.5"/>` +
    `<line x1="50" y1="14" x2="50" y2="58" stroke="${BLK}" stroke-width="1.5"/><line x1="28" y1="36" x2="72" y2="36" stroke="${BLK}" stroke-width="1.5"/>`,

  fan: () =>
    `<circle cx="50" cy="36" r="24" fill="${LF}" stroke="${BLK}" stroke-width="2"/>` +
    [0, 1, 2].map((i) => `<path d="M50 36 q${Math.cos((i * 2 * Math.PI) / 3 - 0.5) * 18} ${Math.sin((i * 2 * Math.PI) / 3 - 0.5) * 18} ${Math.cos((i * 2 * Math.PI) / 3) * 20} ${Math.sin((i * 2 * Math.PI) / 3) * 20}" fill="none" stroke="${BLK}" stroke-width="2"/>`).join('') +
    `<circle cx="50" cy="36" r="3" fill="${BLK}"/>`,

  fridge: () =>
    `<rect x="26" y="6" width="48" height="60" rx="5" fill="${LF}" stroke="${BLK}" stroke-width="2"/>` +
    `<line x1="26" y1="28" x2="74" y2="28" stroke="${BLK}" stroke-width="1.5"/>` +
    `<line x1="32" y1="14" x2="32" y2="22" stroke="${BLK}" stroke-width="2"/><line x1="32" y1="34" x2="32" y2="46" stroke="${BLK}" stroke-width="2"/>`,

  ground: () =>
    `<line x1="50" y1="8" x2="50" y2="34" stroke="#2E9E4F" stroke-width="2.5"/>` +
    `<line x1="34" y1="34" x2="66" y2="34" stroke="#2E9E4F" stroke-width="2.5"/>` +
    `<line x1="40" y1="42" x2="60" y2="42" stroke="#2E9E4F" stroke-width="2.5"/>` +
    `<line x1="45" y1="50" x2="55" y2="50" stroke="#2E9E4F" stroke-width="2.5"/>`,
};

export function getDeviceIcon(type) {
  const fn = ICON_BUILDERS[type];
  return fn ? fn() : `<rect x="10" y="10" width="80" height="52" rx="4" fill="${LF}" stroke="${BLK}" stroke-width="2"/>`;
}
