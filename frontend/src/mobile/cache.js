// Basit localStorage önbellek — çevrimdışı/anlık gösterim için.
// Per-viewer, kalıcılık garantisi yok (private mode/temizlik → boş dönebilir), her erişim try/catch.
const PFX = "mz:";

export const cache = {
  get(key) {
    try {
      const raw = localStorage.getItem(PFX + key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  set(key, val) {
    try {
      localStorage.setItem(PFX + key, JSON.stringify(val));
    } catch {
      // kota/private mode — sessiz geç
    }
  },
  // Çıkışta iş verisini (teklif/servis/maliyet/sepet önbellekleri) sil; sadece `keep` anahtarları kalır
  clearAll(keep = []) {
    try {
      const keepSet = new Set(keep.map((k) => PFX + k));
      Object.keys(localStorage)
        .filter((k) => k.startsWith(PFX) && !keepSet.has(k))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      // erişim yok — sessiz geç
    }
  },
};

// Önbellekteki teklif + servislerden tekil müşteri adları (öneri listesi için; ağ isteği yok)
export function customerNames() {
  const seen = new Map();
  const add = (n) => { const v = String(n || "").trim(); if (v && !seen.has(v.toLocaleLowerCase("tr"))) seen.set(v.toLocaleLowerCase("tr"), v); };
  (cache.get("quotes") || cache.get("dashboard")?.quotes || []).forEach((q) => add(q.customer_name));
  (cache.get("services") || cache.get("dashboard")?.services || []).forEach((x) => add(x.customer_name));
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, "tr"));
}
