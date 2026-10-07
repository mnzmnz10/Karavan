import React, { useEffect, useMemo, useState } from "react";
import { Search, Package, Minus, Plus, Star } from "lucide-react";
import { Sheet, money } from "./ui";
import { useCatalog } from "./catalog";
import { categories as categoriesApi } from "./api";
import { cache } from "./cache";
import { imgOf } from "./img";
import { searchProducts } from "../lib/productSearch";

const MAX_ROWS = 150;

// Mobil kapsamlı ürün seçici: arama + kategori çipleri + favoriler; adetle çoklu seçim.
// onAdd([{ product, qty }]) — product: katalog (useCatalog) kaydı.
export default function ProductPickerSheet({ open, onClose, onAdd, title = "Ürün Ekle", addLabel = "Ekle" }) {
  const catalog = useCatalog(open);
  const [cats, setCats] = useState(() => cache.get("categories") || []);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [favOnly, setFavOnly] = useState(false);
  const [picked, setPicked] = useState([]);

  useEffect(() => {
    if (!open) return;
    setQ(""); setCat("all"); setFavOnly(false); setPicked([]);
    categoriesApi.list().then((c) => { const a = Array.isArray(c) ? c : []; if (a.length) { setCats(a); cache.set("categories", a); } }).catch(() => {});
  }, [open]);

  const catName = useMemo(() => new Map(cats.map((c) => [c.id, c.name])), [cats]);
  const base = useMemo(() => {
    const list = favOnly ? catalog.filter((p) => p.is_favorite) : catalog;
    return searchProducts(list, q, { extra: (p) => catName.get(p.category_id) || "" });
  }, [catalog, q, favOnly, catName]);
  const counts = useMemo(() => {
    const m = new Map();
    base.forEach((p) => m.set(p.category_id || "none", (m.get(p.category_id || "none") || 0) + 1));
    return m;
  }, [base]);
  const shown = cat === "all" ? base : base.filter((p) => (p.category_id || "none") === cat);
  const catChips = cats.filter((c) => counts.get(c.id)).sort((a, b) => (a.name || "").localeCompare(b.name || "", "tr"));

  const qtyOf = (id) => picked.find((x) => x.product.id === id)?.qty || 0;
  const setQty = (product, qty) => setPicked((prev) => {
    const rest = prev.filter((x) => x.product.id !== product.id);
    if (qty <= 0) return rest;
    return prev.some((x) => x.product.id === product.id)
      ? prev.map((x) => (x.product.id === product.id ? { ...x, qty } : x))
      : [...prev, { product, qty }];
  });
  const total = picked.reduce((a, x) => a + (x.product.list_price_try || 0) * x.qty, 0);
  const submit = () => { if (picked.length) { onAdd(picked); onClose(); } };

  return (
    <Sheet open={open} onClose={onClose} title={title} full>
      <div className="flex h-full flex-col">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ürün, marka veya kategori ara"
            className="w-full rounded-xl bg-slate-100 py-2.5 pl-9 pr-3 text-[16px] placeholder:text-slate-400" />
        </div>
        <div className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1">
          <PChip on={favOnly} onClick={() => setFavOnly((v) => !v)}><Star className="h-3.5 w-3.5" /> Favori</PChip>
          <PChip on={cat === "all"} onClick={() => setCat("all")}>Tümü {base.length}</PChip>
          {catChips.map((c) => <PChip key={c.id} on={cat === c.id} onClick={() => setCat(cat === c.id ? "all" : c.id)}>{c.name} {counts.get(c.id)}</PChip>)}
        </div>

        <div className="m-scroll -mx-1 mt-2 min-h-0 flex-1 px-1">
          {catalog.length === 0 && <div className="py-10 text-center text-[13px] text-slate-400">Katalog yükleniyor…</div>}
          {catalog.length > 0 && shown.length === 0 && <div className="py-10 text-center text-[13px] text-slate-400">Eşleşen ürün yok</div>}
          <div className="space-y-1.5">
            {shown.slice(0, MAX_ROWS).map((p) => {
              const n = qtyOf(p.id);
              const src = imgOf(p);
              return (
                <div key={p.id} onClick={() => setQty(p, n + 1)}
                  className="m-press flex items-center gap-3 rounded-2xl bg-white p-2.5"
                  style={n ? { boxShadow: "inset 0 0 0 2px var(--m-primary-2)" } : undefined}>
                  {src ? <img src={src} alt="" loading="lazy" className="m-img h-12 w-12 shrink-0 rounded-xl object-cover" />
                    : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-300"><Package className="h-5 w-5" /></div>}
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-[14px] font-semibold leading-snug">{p.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-slate-400">
                      <span className="m-tnum font-bold" style={{ color: "var(--m-primary)" }}>₺{money(p.list_price_try)}</span>
                      <span className="truncate">{[p.brand, catName.get(p.category_id)].filter(Boolean).join(" · ")}</span>
                    </div>
                  </div>
                  {n > 0 && (
                    <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setQty(p, n - 1)} aria-label="Azalt" className="m-press flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100"><Minus className="h-4 w-4" /></button>
                      <span className="m-tnum w-6 text-center text-[14px] font-bold">{n}</span>
                      <button onClick={() => setQty(p, n + 1)} aria-label="Artır" className="m-press flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100"><Plus className="h-4 w-4" /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {shown.length > MAX_ROWS && <div className="py-3 text-center text-[12px] text-slate-400">İlk {MAX_ROWS} ürün gösteriliyor — aramayı daraltın</div>}
        </div>

        <button onClick={submit} disabled={!picked.length}
          className="m-press mt-2 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[16px] font-bold text-white disabled:opacity-40"
          style={{ background: "var(--m-grad)" }}>
          {picked.length ? `${addLabel} (${picked.length}) · ₺${money(total)}` : "Ürün seçin"}
        </button>
      </div>
    </Sheet>
  );
}

function PChip({ on, onClick, children }) {
  return (
    <button onClick={onClick} className="m-press flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold"
      style={on ? { background: "var(--m-primary)", color: "#fff" } : { background: "var(--m-card, #fff)", color: "var(--m-ink-2)" }}>
      {children}
    </button>
  );
}
