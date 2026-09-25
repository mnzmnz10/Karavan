import React, { useCallback, useEffect, useRef, useState } from "react";
import { Package, Boxes, Plus, Minus, Loader2, Eye, EyeOff, Star, MessageCircle } from "lucide-react";
import { toast } from "../toast";
import { products as productsApi, categories as categoriesApi } from "../api";
import { imgOf, imgFallback } from "../img";
import { Header, SearchBar, Card, EmptyState, ErrorState, SkeletonList, Sheet, money, Pill, RefreshScroll, Lightbox, OfflineBar } from "../ui";
import { cache } from "../cache";
import { useCart } from "../Cart";
import { useSession } from "../session";
import { AccountButton } from "../Account";

const FAV = "__fav"; // sanal kategori: favori ürünler

function CategoryCards({ cats, sel, onSel }) {
  if (!cats.length) return null;
  const Tile = ({ id, label, icon: Icon, img }) => {
    const on = sel === id;
    return (
      <button
        onClick={() => onSel(id)}
        className={`m-press flex min-w-[86px] shrink-0 flex-col items-center gap-1.5 rounded-2xl px-3 py-2.5 ${on ? "" : "bg-white"}`}
        style={on ? { background: "var(--m-grad)", color: "#fff" } : { color: "var(--m-ink-2)" }}
      >
        {img ? (
          <img src={img.src} alt="" loading="lazy" decoding="async" onError={img.onError}
            className="m-img h-11 w-11 rounded-xl bg-white object-contain p-0.5"
            style={on ? { boxShadow: "0 0 0 2px rgba(255,255,255,.85)" } : undefined} />
        ) : (
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl"
            style={{ background: on ? "rgba(255,255,255,.22)" : "rgba(120,130,145,.15)" }}
          >
            <Icon className="h-5 w-5" style={{ color: on ? "#fff" : "var(--m-primary)" }} />
          </div>
        )}
        <span className="max-w-[76px] truncate text-[12px] font-semibold">{label}</span>
      </button>
    );
  };
  return (
    <div className="flex gap-2 overflow-x-auto px-4 pb-2 pt-1" style={{ scrollbarWidth: "none" }}>
      <Tile id="" label="Tümü" icon={Boxes} />
      <Tile id={FAV} label="Favoriler" icon={Star} />
      {cats.map((c) => <Tile key={c.id} id={c.id} label={c.name} icon={Package} img={imgOf(c) ? { src: imgOf(c), onError: imgFallback(c) } : null} />)}
    </div>
  );
}

// Varsayılan: liste fiyatı gösterilir (müşteriye açık). Göz açıkken indirimli (alış) fiyatı da açılır.
function priceTRY(p) {
  const list = Number(p.list_price_try) || 0;
  const grouped = p.suppliers?.length > 1; // aynı ürün birden çok firmada → alış en ucuzdan
  const discRaw = Number(grouped ? p.best_discounted_price_try : p.discounted_price_try);
  const disc = discRaw > 0 ? discRaw : null;
  // Döviz girişli ürün: girilen para biriminden fiyat da (€/$)
  const cur = p.currency && p.currency !== "TRY" ? p.currency : null;
  const oList = cur ? Number(p.list_price) || 0 : null;
  const oDiscRaw = Number(grouped ? p.best_discounted_price : p.discounted_price);
  const oDisc = cur && oDiscRaw > 0 ? oDiscRaw : null;
  return { list, disc, cur, oList, oDisc };
}

const FX_SYM = { EUR: "€", USD: "$" };
const fx = (cur, n) => `${FX_SYM[cur] || cur + " "}${(Number(n) || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`;

// Satırda/detayda TL fiyatın yanında girilen döviz fiyatı (göz açık + alış varsa alış dövizi)
function FxTag({ pr, showDisc, big = false }) {
  if (!pr.cur) return null;
  const v = showDisc && pr.disc != null && pr.oDisc != null ? pr.oDisc : pr.oList;
  return (
    <span className={`m-tnum rounded-md px-1.5 py-0.5 font-bold ${big ? "text-[14px]" : "text-[12px]"}`} style={{ background: "rgba(30,115,190,.1)", color: "#1e73be" }}>
      {fx(pr.cur, v)}
    </span>
  );
}

function Row({ p, onOpen, onAdd, onDec, qty, showDisc }) {
  const pr = priceTRY(p);
  return (
    <Card onClick={() => onOpen(p)} className="p-3">
      <div className="flex items-center gap-3">
        {p.image_url ? (
          <img src={imgOf(p)} alt="" loading="lazy" decoding="async" className="m-img h-14 w-14 shrink-0 rounded-xl object-cover" onError={imgFallback(p)} />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-100">
            <Package className="h-6 w-6 text-slate-300" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            {p.is_favorite && <Star className="h-3 w-3 shrink-0" style={{ color: "#f5a524", fill: "#f5a524" }} />}
            <div className="truncate text-[15px] font-semibold leading-tight" style={{ color: "var(--m-ink)" }}>{p.name}</div>
          </div>
          {p.brand && <div className="mt-0.5 truncate text-[12px] font-bold uppercase tracking-wide" style={{ color: "var(--m-ink-2)" }}>{p.brand}</div>}
          {showDisc && p.suppliers?.length > 1 && <div className="mt-0.5 truncate text-[11px] font-semibold" style={{ color: "#2e8b7a" }}>{p.suppliers.length} firma · en ucuz {p.best_company_name}</div>}
          <div className="mt-1 flex items-baseline gap-1.5">
            {showDisc && pr.disc != null ? (
              <>
                <span className="m-tnum text-[15px] font-extrabold" style={{ color: "var(--m-primary-2)" }}>₺{money(pr.disc)}</span>
                <span className="m-tnum text-[12px] text-slate-400 line-through">₺{money(pr.list)}</span>
              </>
            ) : (
              <span className="m-tnum text-[15px] font-extrabold" style={{ color: "var(--m-ink)" }}>₺{money(pr.list)}</span>
            )}
            <FxTag pr={pr} showDisc={showDisc} />
          </div>
        </div>
        {qty > 0 && onDec && (
          <button
            onClick={(e) => { e.stopPropagation(); onDec(p); }}
            aria-label="Sepetten bir azalt"
            className="m-press flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"
          >
            <Minus className="h-5 w-5" strokeWidth={2.6} />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onAdd(p); }}
          className="m-press relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: "#e7f3ee", color: "var(--m-primary-2)" }}
          title="Teklife ekle"
        >
          <Plus className="h-5 w-5" strokeWidth={2.6} />
          {qty > 0 && (
            <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-extrabold text-white" style={{ background: "var(--m-grad-green)" }}>{qty}</span>
          )}
        </button>
      </div>
    </Card>
  );
}

// Müşteriye ürün bilgisi (liste fiyatı; alış/indirimli fiyat YOK)
function productShareText(p) {
  const L = [`*${p.name}*`];
  if (p.brand) L.push(p.brand);
  L.push(`Fiyat: ₺${money(priceTRY(p).list)}`);
  const spec = String(p.specs || p.description || "").trim();
  if (spec) L.push("", spec.length > 600 ? spec.slice(0, 600) + "…" : spec);
  return L.join("\n");
}

function Detail({ p, onClose, onAdd, showDisc, onFav, inCart = 0 }) {
  const [lb, setLb] = useState(false);
  const [qty, setQty] = useState(1);
  useEffect(() => { if (p) setQty(1); }, [p]);
  if (!p) return null;
  const pr = priceTRY(p);
  return (
    <Sheet open={!!p} onClose={onClose} title="Ürün" full>
      {p.image_url && (
        <div className="m-press mb-3 flex items-center justify-center overflow-hidden rounded-2xl bg-white p-2" onClick={() => setLb(true)}>
          <img src={imgOf(p)} alt="" className="max-h-56 w-auto object-contain" onError={imgFallback(p)} />
        </div>
      )}
      <Lightbox src={lb ? imgOf(p) : null} onClose={() => setLb(false)} />
      <div className="rounded-2xl bg-white p-4">
        <div className="flex items-start gap-2">
          <div className="flex-1 text-[19px] font-bold leading-snug">{p.name}</div>
          <a href={`https://wa.me/?text=${encodeURIComponent(productShareText(p))}`} target="_blank" rel="noreferrer" aria-label="WhatsApp ile paylaş" className="m-press flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
            <MessageCircle className="h-5 w-5" style={{ color: "#25d366" }} />
          </a>
          <button onClick={() => onFav?.(p)} aria-label="Favori" className="m-press -mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
            <Star className="h-5 w-5" style={p.is_favorite ? { color: "#f5a524", fill: "#f5a524" } : { color: "var(--m-ink-2)", opacity: 0.45 }} />
          </button>
        </div>
        {p.brand && <div className="mt-1"><Pill color="slate">{p.brand}</Pill></div>}
        <div className="mt-3 flex items-baseline gap-2">
          {showDisc && pr.disc != null ? (
            <>
              <span className="m-tnum text-[24px] font-extrabold" style={{ color: "var(--m-primary-2)" }}>₺{money(pr.disc)}</span>
              <span className="m-tnum text-[14px] text-slate-400 line-through">₺{money(pr.list)}</span>
            </>
          ) : (
            <span className="m-tnum text-[24px] font-extrabold" style={{ color: "var(--m-ink)" }}>₺{money(pr.list)}</span>
          )}
          <FxTag pr={pr} showDisc={showDisc} big />
        </div>
        {showDisc && p.suppliers?.length > 1 && (
          <div className="mt-3 space-y-1 rounded-xl bg-slate-50 p-2.5">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Tedarikçiler (alış)</div>
            {p.suppliers.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-[13px]">
                <span className="font-semibold">{s.company_name}</span>
                <span className="m-tnum" style={{ color: s.is_best ? "#2e8b7a" : "var(--m-ink-2)", fontWeight: s.is_best ? 800 : 500 }}>
                  {s.currency === "TRY" ? "₺" : s.currency === "EUR" ? "€" : "$"}{(Number(s.discounted_price || s.list_price) || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}{s.is_best ? " · en ucuz" : ""}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-2xl bg-slate-100 px-2 py-1.5">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="m-press flex h-8 w-8 items-center justify-center rounded-full bg-white"><Minus className="h-4 w-4" /></button>
            <span className="m-tnum w-8 text-center text-[16px] font-bold">{qty}</span>
            <button onClick={() => setQty((q) => q + 1)} className="m-press flex h-8 w-8 items-center justify-center rounded-full bg-white"><Plus className="h-4 w-4" /></button>
          </div>
          <button onClick={() => { onAdd(p, qty); onClose(); }} className="m-press flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-[15px] font-bold text-white" style={{ background: "var(--m-grad-green)" }}>
            <Plus className="h-5 w-5" strokeWidth={2.6} /> Teklife Ekle
          </button>
        </div>
        {inCart > 0 && <div className="mt-2 text-center text-[12px] font-semibold" style={{ color: "var(--m-primary-2)" }}>Sepette {inCart} adet var</div>}
      </div>
      {showDisc && (() => {
        // Ürünün geçtiği son teklifler (önbellekten; ağ isteği yok) — fiyat verirken referans
        const qs = cache.get("quotes") || cache.get("dashboard")?.quotes || [];
        const hits = [];
        for (const q of qs) {
          const it = (q.products || []).find((x) => x.id === p.id);
          if (it) hits.push({ id: q.id, name: q.name, date: q.created_at, unit: Number(it.list_price_try) || 0, qty: Number(it.quantity) || 1, custom: it.custom_price != null });
        }
        hits.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
        if (!hits.length) return null;
        return (
          <div className="mt-3 rounded-2xl bg-white p-4">
            <div className="mb-1 text-[12px] font-bold uppercase tracking-wide text-slate-400">Son tekliflerde ({hits.length})</div>
            {hits.slice(0, 3).map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-2 border-b border-slate-50 py-2 last:border-0">
                <div className="min-w-0">
                  <div className="truncate text-[14px]">{h.name || "Teklif"}</div>
                  <div className="text-[12px] text-slate-400">{h.date ? new Date(h.date).toLocaleDateString("tr-TR") : ""}{h.qty > 1 ? ` · ${h.qty} adet` : ""}{h.custom ? " · özel fiyat" : ""}</div>
                </div>
                <span className="m-tnum shrink-0 text-[14px] font-semibold">₺{money(h.unit)}</span>
              </div>
            ))}
          </div>
        );
      })()}
      {p.description && (
        <div className="mt-3 rounded-2xl bg-white p-4">
          <div className="mb-1 text-[12px] font-bold uppercase tracking-wide text-slate-400">Açıklama</div>
          <div className="whitespace-pre-wrap text-[14px] leading-relaxed" style={{ color: "var(--m-ink)" }}>{p.description}</div>
        </div>
      )}
      {p.specs && (
        <div className="mt-3 rounded-2xl bg-white p-4">
          <div className="mb-1 text-[12px] font-bold uppercase tracking-wide text-slate-400">Teknik Özellikler</div>
          <div className="whitespace-pre-wrap text-[14px] leading-relaxed" style={{ color: "var(--m-ink)" }}>{p.specs}</div>
        </div>
      )}
    </Sheet>
  );
}

export default function Products() {
  const [items, setItems] = useState(() => cache.get("products_home") || []);
  const [cats, setCats] = useState(() => cache.get("categories") || []);
  const [cat, setCat] = useState("");
  // Genel aramadan gelen ürün adı (tek seferlik)
  const [q, setQ] = useState(() => { const v = cache.get("prod_search"); if (v) cache.set("prod_search", null); return v || ""; });
  const [loading, setLoading] = useState(() => !cache.get("products_home"));
  const [err, setErr] = useState(false);
  const [offline, setOffline] = useState(false);
  const [more, setMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [sel, setSel] = useState(null);
  const [showDisc, setShowDisc] = useState(() => cache.get("show_disc") === true);
  const debRef = useRef();
  const cart = useCart();
  const LIMIT = 40;

  useEffect(() => { cache.set("show_disc", showDisc); }, [showDisc]);

  const fetchPage = useCallback(async (search, category_id, pg, append) => {
    const home = !search && !category_id && pg === 1;
    if (append) setMore(true);
    else { setErr(false); if (!(home && cache.get("products_home"))) setLoading(true); }
    try {
      if (category_id === FAV) {
        // Favoriler tek istekte gelir (sayfalama yok) → arama yerelde
        const all = await productsApi.favorites();
        const s = (search || "").toLocaleLowerCase("tr");
        const arr = (Array.isArray(all) ? all : []).filter((p) => !s || `${p.name} ${p.brand || ""}`.toLocaleLowerCase("tr").includes(s));
        setItems(arr); setHasMore(false); setPage(1); setOffline(false);
        return;
      }
      const data = await productsApi.list({ search, category_id: category_id || undefined, page: pg, limit: LIMIT });
      const arr = Array.isArray(data) ? data : data?.products || [];
      setItems((prev) => (append ? [...prev, ...arr] : arr));
      setHasMore(arr.length === LIMIT);
      setPage(pg);
      if (home) { cache.set("products_home", arr); setOffline(false); }
      else if (!append) setOffline(false);
    } catch (e) {
      if (!append) {
        const c = home ? cache.get("products_home") : null;
        if (c) { setItems(c); setOffline(true); } else { setItems([]); setErr(true); }
      }
      setHasMore(false);
    } finally {
      append ? setMore(false) : setLoading(false);
    }
  }, []);

  useEffect(() => { categoriesApi.list().then((c) => { const a = Array.isArray(c) ? c : []; setCats(a); cache.set("categories", a); }).catch(() => {}); }, []);

  useEffect(() => {
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => fetchPage(q.trim(), cat, 1, false), 300);
    return () => clearTimeout(debRef.current);
  }, [q, cat, fetchPage]);

  const toggleFav = async (p) => {
    const next = !p.is_favorite;
    const apply = (v) => {
      setSel((s) => (s && s.id === p.id ? { ...s, is_favorite: v } : s));
      setItems((prev) => (cat === FAV && !v ? prev.filter((x) => x.id !== p.id) : prev.map((x) => (x.id === p.id ? { ...x, is_favorite: v } : x))));
    };
    apply(next); // optimistic
    try {
      const r = await productsApi.toggleFavorite(p.id);
      if (typeof r?.is_favorite === "boolean" && r.is_favorite !== next) apply(r.is_favorite);
      toast.success(next ? "Favorilere eklendi" : "Favorilerden çıkarıldı");
    } catch {
      apply(!next);
      toast.error("Favori güncellenemedi");
    }
  };

  const onScroll = (e) => {
    const el = e.currentTarget;
    if (hasMore && !more && !loading && el.scrollHeight - el.scrollTop - el.clientHeight < 320) {
      fetchPage(q.trim(), cat, page + 1, true);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <Header
        title="Ürünler"
        subtitle={loading ? "Yükleniyor…" : `${items.length} ürün`}
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDisc((v) => !v)}
              aria-label="Göster/Gizle"
              className="m-press flex h-7 w-7 items-center justify-center"
              style={{ opacity: showDisc ? 0.9 : 0.28 }}
            >
              {showDisc ? <EyeOff className="h-3.5 w-3.5" style={{ color: "var(--m-primary-2)" }} /> : <Eye className="h-3.5 w-3.5" style={{ color: "var(--m-ink-2)" }} />}
            </button>
            <AccountButton />
          </div>
        }
      />
      <SearchBar value={q} onChange={setQ} placeholder="Ürün adı veya marka" />
      <CategoryCards cats={cats} sel={cat} onSel={setCat} />
      <OfflineBar show={offline} cacheKey="products_home" />
      <RefreshScroll onRefresh={() => fetchPage(q.trim(), cat, 1, false)} onScroll={onScroll} className="flex-1 pb-[calc(var(--m-tabbar-h)+env(safe-area-inset-bottom)+8px)]">
        {loading ? (
          <SkeletonList />
        ) : err ? (
          <ErrorState onRetry={() => fetchPage(q.trim(), cat, 1, false)} />
        ) : items.length === 0 ? (
          <EmptyState icon={cat === FAV ? Star : Boxes} title={cat === FAV ? "Favori yok" : "Ürün bulunamadı"} hint={q ? "Aramayı değiştir" : cat === FAV ? "Ürün detayındaki yıldıza dokun" : "Henüz ürün yok"} />
        ) : (
          <>
            <div className="m-stagger space-y-2 px-4 pt-1">
              {items.map((p) => <Row key={p.id} p={p} onOpen={setSel} onAdd={cart.add} onDec={(x) => cart.setQty(x.id, (cart.items.get(x.id)?.qty || 0) - 1)} qty={cart.items.get(p.id)?.qty || 0} showDisc={showDisc} />)}
            </div>
            {more && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>}
          </>
        )}
      </RefreshScroll>
      <Detail p={sel} onClose={() => setSel(null)} onAdd={cart.add} showDisc={showDisc} onFav={toggleFav} inCart={sel ? cart.items.get(sel.id)?.qty || 0 : 0} />
    </div>
  );
}
