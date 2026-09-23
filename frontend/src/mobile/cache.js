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
      localStorage.setItem(PFX + key + "@t", String(Date.now())); // veri yaşı (çevrimdışı çubuğu)
    } catch {
      // kota/private mode — sessiz geç
    }
  },
  // Anahtarın son yazılma zamanı (ms) — yoksa null
  savedAt(key) {
    try { const v = Number(localStorage.getItem(PFX + key + "@t")); return v > 0 ? v : null; } catch { return null; }
  },
  // Çıkışta iş verisini (teklif/servis/maliyet/sepet önbellekleri) sil; sadece `keep` anahtarları kalır
  clearAll(keep = []) {
    try {
      const keepSet = new Set(keep.flatMap((k) => [PFX + k, PFX + k + "@t"]));
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

// Aynı adlı (büyük/küçük harf duyarsız) eski servis kaydındaki telefon — yoksa ""
export function phoneForCustomer(name) {
  const n = String(name || "").trim().toLocaleLowerCase("tr");
  if (!n) return "";
  const svcs = cache.get("services") || cache.get("dashboard")?.services || [];
  return svcs.find((x) => (x.customer_name || "").trim().toLocaleLowerCase("tr") === n && x.phone)?.phone || "";
}
