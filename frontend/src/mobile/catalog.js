// Ortak katalog önbelleği (teklif kalem editörü, teklif→servis, servis formu).
import { useEffect, useState } from "react";
import { products as productsApi } from "./api";
import { cache } from "./cache";

// Katalog (id → ürün) — kalem editörü için; offline'da önbellekten
let catalogFetchedAt = 0; // oturum içi: 5 dk'da bir tazele (her detay açılışında ~200KB çekme)
export function useCatalog(open) {
  const [cat, setCat] = useState(() => cache.get("catalog_min") || []);
  useEffect(() => {
    if (!open) return;
    const cached = cache.get("catalog_min");
    if (cached?.length && Date.now() - catalogFetchedAt < 5 * 60 * 1000) { setCat(cached); return; }
    productsApi.list({ limit: 2000 }).then((data) => {
      catalogFetchedAt = Date.now();
      const arr = (Array.isArray(data) ? data : data?.products || []).map((p) => ({
        id: p.id, name: p.name, currency: p.currency || "TRY",
        list_price: Number(p.list_price) || 0, list_price_try: Number(p.list_price_try) || 0,
        discounted_price: Number(p.discounted_price) || 0,
      }));
      if (arr.length) { setCat(arr); cache.set("catalog_min", arr); }
    }).catch(() => {});
  }, [open]);
  return cat;
}

export const catRate = (p) => (p.currency === "TRY" ? 1 : (p.list_price > 0 ? p.list_price_try / p.list_price : 0));
