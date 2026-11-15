// Servis fiyatsız iş listesi: seçilebilir kalemler + PDF adresi.

// Listeye girebilecek kalemler (adı dolu, adedi > 0); idx = svc.items içindeki sıra (backend skip bununla eşleşir)
// Kategori başlığı { header: true } seçilemez, etiket olarak döner; altında kalem yoksa hiç dönmez.
export const worklistItems = (svc) => {
  const out = [];
  (svc?.items || []).forEach((it, idx) => {
    const name = (it?.name || "").trim();
    if (it?.header) { if (name) out.push({ idx, name, header: true }); return; }
    const qty = Number(it?.qty);
    if (name && qty > 0) out.push({ idx, name, qty, ...(it?.sub ? { sub: true } : {}) });
  });
  return out.filter((x, i, l) => !x.header || (l[i + 1] && !l[i + 1].header));
};

export const hasText = (t) => !!String(t || "").trim();

export const worklistUrl = (api, id, { skip = [], notes = true, ops = true } = {}) => {
  const q = new URLSearchParams({ plain: "1" });
  if (skip.length) q.set("skip", [...skip].sort((a, b) => a - b).join(","));
  if (!notes) q.set("notes", "false");
  if (!ops) q.set("ops", "false");
  return `${api}/services/${id}/pdf?${q.toString()}`;
};
