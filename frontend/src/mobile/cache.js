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
};
