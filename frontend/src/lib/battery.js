// Akü testi ortak yardımcıları (masaüstü + mobil). Durum kuralları backend'de (_battery_assess);
// burada yalnız alan tanımları, renkler ve istemci tarafı görsel döndürme.

// Etiketler backend assessment.lines[i][0] ile birebir aynı (satır eşleştirmesi için)
export const FIELDS = [
  { key: 'soh', label: 'Sağlık (SOH)', unit: '%' },
  { key: 'soc', label: 'Şarj (SOC)', unit: '%' },
  { key: 'voltage', label: 'Voltaj', unit: 'V' },
  { key: 'internal_resistance', label: 'İç direnç', unit: 'mΩ' },
];

export const STATUS_STYLE = {
  good: { bg: '#ECFDF5', accent: '#10B981', fg: '#065F46' },
  weak: { bg: '#FFFBEB', accent: '#F59E0B', fg: '#92400E' },
  replace: { bg: '#FEF2F2', accent: '#EF4444', fg: '#991B1B' },
  unknown: { bg: '#F1F5F9', accent: '#94A3B8', fg: '#334155' },
};

export const toNum = (v) => {
  if (v === '' || v == null) return null;
  const f = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(f) ? f : null;
};

export const lineFor = (assess, label) => (assess?.lines || []).find((l) => l[0] === label) || null;

// base64 JPEG'i saat yönünde 90° döndür (önek yok → önek yok döner)
export function rotateB64(b64) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.height; c.height = img.width;
      const ctx = c.getContext('2d');
      ctx.translate(c.width / 2, c.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      resolve(c.toDataURL('image/jpeg', 0.88).split(',')[1]);
    };
    img.onerror = reject;
    img.src = `data:image/jpeg;base64,${b64}`;
  });
}
