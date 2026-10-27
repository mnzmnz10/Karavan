// Servis fiyatsız iş listesi: seçilebilir kalemler + PDF adresi.

// Listeye girebilecek kalemler (adı dolu, adedi > 0); idx = svc.items içindeki sıra (backend skip bununla eşleşir)
export const worklistItems = (svc) =>
  (svc?.items || [])
    .map((it, idx) => ({ idx, name: (it?.name || "").trim(), qty: Number(it?.qty) }))
    .filter((x) => x.name && x.qty > 0);

export const hasText = (t) => !!String(t || "").trim();

export const worklistUrl = (api, id, { skip = [], notes = true, ops = true } = {}) => {
  const q = new URLSearchParams({ plain: "1" });
  if (skip.length) q.set("skip", [...skip].sort((a, b) => a - b).join(","));
  if (!notes) q.set("notes", "false");
  if (!ops) q.set("ops", "false");
  return `${api}/services/${id}/pdf?${q.toString()}`;
};
