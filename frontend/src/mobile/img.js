// Ürün/kategori görseli: sunucu arşiv kopyası (/api/img) ya da orijinal link.
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";

// Görsel: sunucu kopyası (/api/img, link ölse de görünür) güncelse onu, değilse orijinal link
export const imgOf = (x) => (x && x.image_cached && x.image_cached_src === x.image_url ? `${BACKEND_URL}${x.image_cached}` : x?.image_url || null);
// Kopya yüklenemezse bir kez orijinal linke düş, o da yoksa gizle
export const imgFallback = (x) => (e) => { const el = e.currentTarget; if (x?.image_url && el.dataset.fb !== "1" && el.src !== x.image_url) { el.dataset.fb = "1"; el.src = x.image_url; } else el.style.visibility = "hidden"; };
