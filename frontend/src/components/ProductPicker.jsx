import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X, Package, Minus, Plus, Check, Star } from "lucide-react";
import { searchProducts } from "../lib/productSearch";

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("tr-TR");
const MAX_ROWS = 250;

// Kapsamlı katalog penceresi (masaüstü): kategori listesi + arama + marka/firma filtresi +
// fotoğraflı ürün listesi; birden çok ürün adetiyle işaretlenip tek seferde eklenir.
// onAdd([{ product, qty }]) — seçimler eklenme sırasıyla.
export default function ProductPicker({ open, onClose, onAdd, products = [], categories = [], companies = [], imgOf, title = "Ürün Ekle", addLabel = "Ekle" }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [brand, setBrand] = useState("");
  const [company, setCompany] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [picked, setPicked] = useState([]); // [{ product, qty }]
  const searchRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQ(""); setCat("all"); setBrand(""); setCompany(""); setFavOnly(false); setPicked([]);
    const t = setTimeout(() => searchRef.current?.focus(), 30);
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const companyName = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);

  // Arama + firma + favori filtresinden geçen ürünler (kategori/marka sayaçları bunlardan)
  const base = useMemo(() => {
    let list = products.filter((p) => !p.archived);
    if (company) list = list.filter((p) => p.company_id === company);
    if (favOnly) list = list.filter((p) => p.is_favorite);
    return searchProducts(list, q, { extra: (p) => catName.get(p.category_id) || "" });
  }, [products, q, company, favOnly, catName]);

  const catCounts = useMemo(() => {
    const m = new Map();
    base.forEach((p) => m.set(p.category_id || "none", (m.get(p.category_id || "none") || 0) + 1));
    return m;
  }, [base]);

  const inCat = useMemo(() => (cat === "all" ? base : base.filter((p) => (p.category_id || "none") === cat)), [base, cat]);
  const brands = useMemo(() => {
    const m = new Map();
    inCat.forEach((p) => { const b = (p.brand || "").trim(); if (b) m.set(b, (m.get(b) || 0) + 1); });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "tr"));
  }, [inCat]);
  const shown = useMemo(() => (brand ? inCat.filter((p) => (p.brand || "").trim() === brand) : inCat), [inCat, brand]);

  const qtyOf = (id) => picked.find((x) => x.product.id === id)?.qty || 0;
  const setQty = (product, qty) => setPicked((prev) => {
    const rest = prev.filter((x) => x.product.id !== product.id);
    if (qty <= 0) return rest;
    const ex = prev.find((x) => x.product.id === product.id);
    return ex ? prev.map((x) => (x.product.id === product.id ? { ...x, qty } : x)) : [...prev, { product, qty }];
  });
  const total = picked.reduce((a, x) => a + (Number(x.product.list_price_try) || 0) * x.qty, 0);
  const pickedCount = picked.reduce((a, x) => a + x.qty, 0);

  const submit = () => { if (picked.length) { onAdd(picked); onClose(); } };

  if (!open) return null;
  const catList = [...categories].filter((c) => catCounts.get(c.id))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.name || "").localeCompare(b.name || "", "tr"));
  const noneCount = catCounts.get("none") || 0;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" role="dialog" aria-label={title}>
        {/* Başlık + arama */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-3.5">
          <div className="text-base font-black text-slate-800">{title}</div>
          <div className="relative min-w-[260px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" />
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && shown.length === 1) setQty(shown[0], qtyOf(shown[0].id) + 1); }}
              placeholder="Ürün adı, marka, kod veya kategori — kelimeler ayrı ayrı aranır"
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <select value={company} onChange={(e) => setCompany(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-2 text-sm" aria-label="Firma">
            <option value="">Tüm firmalar</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button type="button" onClick={() => setFavOnly((v) => !v)} className={`flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold ${favOnly ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
            <Star className={`h-4 w-4 ${favOnly ? "fill-amber-400 text-amber-500" : ""}`} /> Favoriler
          </button>
          <button type="button" onClick={onClose} aria-label="Kapat" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Kategoriler */}
          <div className="w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50/60 p-2">
            <CatBtn active={cat === "all"} onClick={() => { setCat("all"); setBrand(""); }} label="Tümü" count={base.length} />
            {catList.map((c) => (
              <CatBtn key={c.id} active={cat === c.id} onClick={() => { setCat(c.id); setBrand(""); }} label={c.name} count={catCounts.get(c.id)} color={c.color} img={c.image_url ? (imgOf ? imgOf(c) : c.image_url) : null} />
            ))}
            {noneCount > 0 && <CatBtn active={cat === "none"} onClick={() => { setCat("none"); setBrand(""); }} label="Kategorisiz" count={noneCount} />}
          </div>

          {/* Ürünler */}
          <div className="flex min-w-0 flex-1 flex-col">
            {brands.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto border-b border-slate-100 px-4 py-2">
                <Chip active={!brand} onClick={() => setBrand("")}>Tüm markalar</Chip>
                {brands.map(([b, n]) => <Chip key={b} active={brand === b} onClick={() => setBrand(brand === b ? "" : b)}>{b} <span className="opacity-60">{n}</span></Chip>)}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {shown.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-400">Eşleşen ürün yok. Aramayı kısaltmayı ya da filtreleri kaldırmayı deneyin.</div>
              ) : (
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  {shown.slice(0, MAX_ROWS).map((p) => {
                    const n = qtyOf(p.id);
                    const src = imgOf ? imgOf(p) : p.image_url;
                    return (
                      <div key={p.id} onClick={() => setQty(p, n + 1)}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 transition-colors ${n ? "border-emerald-400 bg-emerald-50/60" : "border-slate-200 hover:border-emerald-300 hover:bg-slate-50"}`}>
                        {src ? <img src={src} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-lg border border-slate-100 object-cover" />
                          : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-300"><Package className="h-6 w-6" /></div>}
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-2 text-sm font-bold leading-snug text-slate-800" title={p.name}>{p.name}</div>
                          <div className="mt-0.5 truncate text-[11px] text-slate-400">
                            {[p.brand, catName.get(p.category_id), companyName.get(p.company_id) || p.company_name].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-extrabold tabular-nums text-emerald-700">₺{fmt(p.list_price_try)}</div>
                          {n > 0 ? (
                            <div className="mt-1 flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                              <button type="button" onClick={() => setQty(p, n - 1)} aria-label="Azalt" className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-slate-600 shadow-sm ring-1 ring-slate-200"><Minus className="h-3.5 w-3.5" /></button>
                              <span className="w-6 text-center text-sm font-black tabular-nums">{n}</span>
                              <button type="button" onClick={() => setQty(p, n + 1)} aria-label="Artır" className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-slate-600 shadow-sm ring-1 ring-slate-200"><Plus className="h-3.5 w-3.5" /></button>
                            </div>
                          ) : (
                            <div className="mt-1 text-[11px] font-semibold text-slate-400">eklemek için tıkla</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {shown.length > MAX_ROWS && <div className="py-3 text-center text-xs text-slate-400">İlk {MAX_ROWS} ürün gösteriliyor ({shown.length} eşleşme). Aramayı daraltın.</div>}
            </div>
          </div>
        </div>

        {/* Alt çubuk */}
        <div className="flex items-center gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <div className="min-w-0 flex-1 truncate text-sm text-slate-500">
            {picked.length ? <>Seçili: <b className="text-slate-800">{picked.length} ürün · {pickedCount} adet</b> · Liste toplamı <b className="tabular-nums text-slate-800">₺{fmt(total)}</b></> : `${shown.length} ürün listeleniyor`}
          </div>
          {picked.length > 0 && <button type="button" onClick={() => setPicked([])} className="text-sm font-semibold text-slate-400 hover:text-rose-600">Seçimi temizle</button>}
          <button type="button" onClick={submit} disabled={!picked.length}
            className="flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40">
            <Check className="h-4 w-4" /> {addLabel}{picked.length ? ` (${picked.length})` : ""}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function CatBtn({ active, onClick, label, count, color, img }) {
  return (
    <button type="button" onClick={onClick}
      className={`mb-0.5 flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-sm ${active ? "bg-emerald-600 font-bold text-white" : "text-slate-700 hover:bg-white"}`}>
      {img ? (
        <img src={img} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 bg-white object-cover" />
      ) : color ? (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: `${color}22` }}>
          <span className="h-3 w-3 rounded-full" style={{ background: color }} />
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className={`text-xs tabular-nums ${active ? "text-white/80" : "text-slate-400"}`}>{count || 0}</span>
    </button>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ${active ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
      {children}
    </button>
  );
}
