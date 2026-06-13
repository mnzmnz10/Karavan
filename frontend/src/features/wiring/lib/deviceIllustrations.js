// Cihaz illüstrasyonları — Victron tarzı yarı-gerçekçi SVG çizimler.
// Her fonksiyon: (w, h) => SVG inner-markup STRING (koordinatlar 0..w, 0..h).
// Tek kaynak: hem editör (Canvas, dangerouslySetInnerHTML) hem PDF (string concat) kullanır.
// İsim/portlar dışarıda çizilir; burada SADECE cihaz gövdesi.

const VICTRON_BLUE = '#1C3D5A';
const VICTRON_BLUE_LT = '#2E5A82';
const STEEL = '#C3CAD3';
const STEEL_DK = '#8A93A0';
const DARK = '#14222F';

// Yardımcı: yuvarlatılmış gövde
function body(w, h, fill, stroke = '#0d1620') {
  return `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
}

export const DEVICE_ILLUSTRATIONS = {
  // Güneş paneli — mavi hücre ızgarası + çerçeve
  solar_panel: (w, h) => {
    const m = 6, gw = w - 2 * m, gh = h - 2 * m;
    const cols = 4, rows = 3;
    let cells = '';
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const cw = gw / cols, ch = gh / rows;
      cells += `<rect x="${m + c * cw + 1}" y="${m + r * ch + 1}" width="${cw - 2}" height="${ch - 2}" fill="#1B3A6B" stroke="#3E62A0" stroke-width="0.6"/>`;
    }
    return `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="4" fill="#0E1F3D" stroke="${STEEL_DK}" stroke-width="2"/>${cells}`;
  },

  // Akü — gri gövde, üstte +/- terminaller, kapasite şeritleri
  battery: (w, h) => `${body(w, h, '#3A4250')}
    <rect x="${w * 0.2}" y="0" width="14" height="8" rx="2" fill="${STEEL}"/>
    <rect x="${w * 0.62}" y="0" width="14" height="8" rx="2" fill="${STEEL}"/>
    <text x="${w * 0.2 + 7}" y="${h * 0.42}" text-anchor="middle" fill="#FF4D4D" font-size="14" font-weight="bold">+</text>
    <text x="${w * 0.62 + 7}" y="${h * 0.42}" text-anchor="middle" fill="#7FB3FF" font-size="14" font-weight="bold">−</text>
    <rect x="8" y="${h * 0.58}" width="${w - 16}" height="${h * 0.28}" rx="2" fill="#2A3340"/>
    <rect x="11" y="${h * 0.62}" width="${(w - 22) * 0.7}" height="${h * 0.2}" rx="1" fill="#34C759"/>`,

  // LiFePO4 — mavi gövde, LiFePO4 yazısı, terminaller
  lifepo4: (w, h) => `${body(w, h, VICTRON_BLUE)}
    <rect x="${w * 0.2}" y="0" width="14" height="8" rx="2" fill="${STEEL}"/>
    <rect x="${w * 0.62}" y="0" width="14" height="8" rx="2" fill="${STEEL}"/>
    <text x="${w / 2}" y="${h * 0.44}" text-anchor="middle" fill="#E8EEF4" font-size="11" font-weight="bold" letter-spacing="1">LiFePO4</text>
    <rect x="10" y="${h * 0.56}" width="${w - 20}" height="${h * 0.28}" rx="3" fill="#15293f"/>
    <rect x="13" y="${h * 0.6}" width="${(w - 26) * 0.85}" height="${h * 0.2}" rx="1.5" fill="#34C759"/>`,

  // MPPT solar şarj — Victron mavi, üstte ekran, marka şeridi
  mppt: (w, h) => `${body(w, h, VICTRON_BLUE)}
    <rect x="0" y="2" width="${w}" height="5" rx="2" fill="#FF9500" opacity="0.85"/>
    <rect x="${w * 0.18}" y="${h * 0.22}" width="${w * 0.64}" height="${h * 0.34}" rx="3" fill="#0B1A2B"/>
    <rect x="${w * 0.22}" y="${h * 0.28}" width="${w * 0.5}" height="3" rx="1.5" fill="#36C5F0"/>
    <rect x="${w * 0.22}" y="${h * 0.36}" width="${w * 0.34}" height="3" rx="1.5" fill="#2E5A82"/>
    <text x="${w / 2}" y="${h * 0.8}" text-anchor="middle" fill="#9FB7D1" font-size="9" font-weight="bold" letter-spacing="1">MPPT</text>`,

  // İnverter — dikdörtgen mavi gövde, fan ızgarası
  inverter: (w, h) => `${body(w, h, VICTRON_BLUE)}
    <rect x="0" y="2" width="${w}" height="5" rx="2" fill="#FF9500" opacity="0.85"/>
    <circle cx="${w / 2}" cy="${h * 0.42}" r="${Math.min(w, h) * 0.2}" fill="none" stroke="${STEEL_DK}" stroke-width="1.5"/>
    ${[0, 45, 90, 135].map((a) => {
      const r = Math.min(w, h) * 0.2, cx = w / 2, cy = h * 0.42;
      const rad = a * Math.PI / 180;
      return `<line x1="${cx - r * Math.cos(rad)}" y1="${cy - r * Math.sin(rad)}" x2="${cx + r * Math.cos(rad)}" y2="${cy + r * Math.sin(rad)}" stroke="${STEEL_DK}" stroke-width="1"/>`;
    }).join('')}
    <text x="${w / 2}" y="${h * 0.82}" text-anchor="middle" fill="#9FB7D1" font-size="8" font-weight="bold">İNVERTER</text>`,

  // İnverter/şarj kombi — inverter benzeri + AC/DC etiketi
  inverter_charger: (w, h) => `${body(w, h, VICTRON_BLUE)}
    <rect x="0" y="2" width="${w}" height="5" rx="2" fill="#FF9500" opacity="0.85"/>
    <circle cx="${w / 2}" cy="${h * 0.4}" r="${Math.min(w, h) * 0.18}" fill="none" stroke="${STEEL_DK}" stroke-width="1.5"/>
    <text x="${w / 2}" y="${h * 0.44}" text-anchor="middle" fill="${STEEL}" font-size="9" font-weight="bold">AC/DC</text>
    <text x="${w / 2}" y="${h * 0.82}" text-anchor="middle" fill="#9FB7D1" font-size="8" font-weight="bold">MULTIPLUS</text>`,

  // DC-DC şarj — mavi kutu, çift ok (giriş/çıkış)
  dcdc: (w, h) => `${body(w, h, VICTRON_BLUE_LT)}
    <text x="${w / 2}" y="${h * 0.4}" text-anchor="middle" fill="#E8EEF4" font-size="12" font-weight="bold">DC·DC</text>
    <path d="M${w * 0.25} ${h * 0.62} L${w * 0.45} ${h * 0.62} M${w * 0.41} ${h * 0.58} L${w * 0.45} ${h * 0.62} L${w * 0.41} ${h * 0.66}" stroke="#FF9500" stroke-width="1.5" fill="none"/>
    <path d="M${w * 0.55} ${h * 0.62} L${w * 0.75} ${h * 0.62} M${w * 0.71} ${h * 0.58} L${w * 0.75} ${h * 0.62} L${w * 0.71} ${h * 0.66}" stroke="#34C759" stroke-width="1.5" fill="none"/>`,

  // 12V sigorta kutusu — gri gövde, sigorta yuvaları sırası
  fuse_box_12v: (w, h) => {
    const n = 6, sw = (w - 16) / n;
    let slots = '';
    for (let i = 0; i < n; i++) {
      slots += `<rect x="${8 + i * sw + 1}" y="${h * 0.3}" width="${sw - 2}" height="${h * 0.4}" rx="1" fill="#1F2730"/>
        <rect x="${8 + i * sw + sw / 2 - 2}" y="${h * 0.34}" width="4" height="${h * 0.32}" rx="1" fill="#FFB300"/>`;
    }
    return `${body(w, h, '#2A3340')}<rect x="0" y="2" width="${w}" height="5" rx="2" fill="#FFB300" opacity="0.7"/>${slots}`;
  },

  fuse_box: (w, h) => DEVICE_ILLUSTRATIONS.fuse_box_12v(w, h),

  // Pozitif bara — kırmızı çubuk + terminal vidaları
  positive_bus: (w, h) => {
    const n = 5; let bolts = '';
    for (let i = 0; i < n; i++) bolts += `<circle cx="${(w / (n + 1)) * (i + 1)}" cy="${h / 2}" r="4" fill="#7A1010" stroke="#FF4D4D" stroke-width="1.2"/>`;
    return `<rect x="2" y="${h * 0.3}" width="${w - 4}" height="${h * 0.4}" rx="4" fill="#C0392B"/>${bolts}`;
  },

  // Negatif bara — siyah çubuk + terminaller
  negative_bus: (w, h) => {
    const n = 5; let bolts = '';
    for (let i = 0; i < n; i++) bolts += `<circle cx="${(w / (n + 1)) * (i + 1)}" cy="${h / 2}" r="4" fill="#2A2A2A" stroke="#9FB3C8" stroke-width="1.2"/>`;
    return `<rect x="2" y="${h * 0.3}" width="${w - 4}" height="${h * 0.4}" rx="4" fill="#1C1C1E"/>${bolts}`;
  },

  // Sahil bağlantısı / priz — fiş sembolü
  outlet: (w, h) => `${body(w, h, '#3A4250')}
    <circle cx="${w / 2}" cy="${h * 0.42}" r="${Math.min(w, h) * 0.22}" fill="#15293f" stroke="${STEEL_DK}" stroke-width="1.5"/>
    <circle cx="${w * 0.42}" cy="${h * 0.42}" r="2.5" fill="${STEEL}"/>
    <circle cx="${w * 0.58}" cy="${h * 0.42}" r="2.5" fill="${STEEL}"/>
    <text x="${w / 2}" y="${h * 0.82}" text-anchor="middle" fill="#9FB7D1" font-size="8" font-weight="bold">220V</text>`,
};

export function getDeviceIllustration(templateId, w, h) {
  const fn = DEVICE_ILLUSTRATIONS[templateId];
  try {
    return fn ? fn(w, h) : null;
  } catch {
    return null;
  }
}
