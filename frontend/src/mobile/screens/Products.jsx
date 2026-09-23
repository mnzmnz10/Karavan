import React, { useCallback, useEffect, useRef, useState } from "react";
import { Package, Boxes, Plus, Minus, User, LogOut, Loader2, Eye, EyeOff } from "lucide-react";
import { products as productsApi, categories as categoriesApi } from "../api";
import { Header, SearchBar, Card, EmptyState, ErrorState, SkeletonList, Sheet, money, Pill, RefreshScroll, Lightbox, OfflineBar } from "../ui";
import { cache } from "../cache";
import { useCart } from "../Cart";
import { useSession } from "../session";

function AccountButton() {
  const s = useSession();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="m-press flex h-9 w-9 items-center justify-center rounded-full bg-slate-200/70">
        <User className="h-5 w-5" style={{ color: "var(--m-ink-2)" }} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Hesap">
        <div className="rounded-2xl bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "var(--m-primary)" }}>
              <User className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="text-[15px] font-bold">{s?.username || "Kullanıcı"}</div>
              <div className="text-[12px]" style={{ color: "var(--m-ink-2)" }}>MSZ Karavan</div>
            </div>
          </div>
        </div>
        <div className="mt-3 rounded-2xl bg-white p-3">
          <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-slate-400">Tema</div>
          <div className="m-seg flex">
            {[["system", "Sistem"], ["light", "Açık"], ["dark", "Koyu"]].map(([key, label]) => (
              <button key={key} data-on={(s?.theme || "system") === key} onClick={() => s?.setTheme?.(key)}
                className="m-seg-item flex-1 py-1.5 text-[13px] font-semibold"
                style={{ color: (s?.theme || "system") === key ? "var(--m-primary)" : "var(--m-ink-2)" }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => { if (window.confirm("Çıkış yapmak istediğinize emin misiniz?")) { setOpen(false); s?.logout?.(); } }} className="m-press mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-[15px] font-bold text-rose-500">
          <LogOut className="h-5 w-5" /> Çıkış Yap
        </button>
      </Sheet>
    </>
  );
}

function CategoryCards({ cats, sel, onSel }) {
  if (!cats.length) return null;
  const Tile = ({ id, label, icon: Icon }) => {
    const on = sel === id;
    return (
      <button
        onClick={() => onSel(id)}
        className={`m-press flex min-w-[86px] shrink-0 flex-col items-center gap-1.5 rounded-2xl px-3 py-2.5 ${on ? "" : "bg-white"}`}
        style={on ? { background: "var(--m-primary)", color: "#fff" } : { color: "var(--m-ink-2)" }}
      >
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: on ? "rgba(255,255,255,.22)" : "rgba(120,130,145,.15)" }}
        >
          <Icon className="h-5 w-5" style={{ color: on ? "#fff" : "var(--m-primary)" }} />
        </div>
        <span className="max-w-[76px] truncate text-[12px] font-semibold">{label}</span>
      </button>
    );
  };
  return (
    <div className="flex gap-2 overflow-x-auto px-4 pb-2 pt-1" style={{ scrollbarWidth: "none" }}>
      <Tile id="" label="Tümü" icon={Boxes} />
      {cats.map((c) => <Tile key={c.id} id={c.id} label={c.name} icon={Package} />)}
    </div>
  );
}

function priceTRY(p) {
  const disc = Number(p.discounted_price_try);
  const list = Number(p.list_price_try);
  if (disc > 0 && disc < list) return { main: disc, old: list };
  return { main: list || 0, old: null };
}

function Row({ p, onOpen, onAdd, qty, hide }) {
  const pr = priceTRY(p);
  return (
    <Card onClick={() => onOpen(p)} className="p-3">
      <div className="flex items-center gap-3">
        {p.image_url ? (
          <img src={p.image_url} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" onError={(e) => (e.target.style.visibility = "hidden")} />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-100">
            <Package className="h-6 w-6 text-slate-300" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold leading-tight" style={{ color: "var(--m-ink)" }}>{p.name}</div>
          {p.brand && <div className="mt-0.5 truncate text-[12px] font-bold uppercase tracking-wide" style={{ color: "var(--m-ink-2)" }}>{p.brand}</div>}
          <div className="mt-1 flex items-baseline gap-1.5">
            {hide ? (
              <span className="m-tnum text-[15px] font-extrabold tracking-widest" style={{ color: "var(--m-ink-2)" }}>₺•••</span>
            ) : (
              <>
                <span className="m-tnum text-[15px] font-extrabold" style={{ color: "var(--m-primary-2)" }}>₺{money(pr.main)}</span>
                {pr.old && <span className="m-tnum text-[12px] text-slate-400 line-through">₺{money(pr.old)}</span>}
              </>
            )}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onAdd(p); }}
          className="m-press relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: "#e7f3ee", color: "var(--m-primary-2)" }}
          title="Teklife ekle"
        >
          <Plus className="h-5 w-5" strokeWidth={2.6} />
          {qty > 0 && (
            <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-extrabold text-white" style={{ background: "var(--m-primary-2)" }}>{qty}</span>
          )}
        </button>
      </div>
    </Card>
  );
}

function Detail({ p, onClose, onAdd, hide }) {
  const [lb, setLb] = useState(false);
  const [qty, setQty] = useState(1);
  useEffect(() => { if (p) setQty(1); }, [p]);
  if (!p) return null;
  const pr = priceTRY(p);
  return (
    <Sheet open={!!p} onClose={onClose} title="Ürün" full>
      {p.image_url && (
        <div className="m-press mb-3 flex items-center justify-center overflow-hidden rounded-2xl bg-white p-2" onClick={() => setLb(true)}>
          <img src={p.image_url} alt="" className="max-h-56 w-auto object-contain" />
        </div>
      )}
      <Lightbox src={lb ? p.image_url : null} onClose={() => setLb(false)} />
      <div className="rounded-2xl bg-white p-4">
        <div className="text-[19px] font-bold leading-snug">{p.name}</div>
        {p.brand && <div className="mt-1"><Pill color="slate">{p.brand}</Pill></div>}
        <div className="mt-3 flex items-baseline gap-2">
          {hide ? (
            <span className="m-tnum text-[24px] font-extrabold tracking-widest" style={{ color: "var(--m-ink-2)" }}>₺••••</span>
          ) : (
            <>
              <span className="m-tnum text-[24px] font-extrabold" style={{ color: "var(--m-primary-2)" }}>₺{money(pr.main)}</span>
              {pr.old && <span className="m-tnum text-[14px] text-slate-400 line-through">₺{money(pr.old)}</span>}
            </>
          )}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-2xl bg-slate-100 px-2 py-1.5">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="m-press flex h-8 w-8 items-center justify-center rounded-full bg-white"><Minus className="h-4 w-4" /></button>
            <span className="m-tnum w-8 text-center text-[16px] font-bold">{qty}</span>
            <button onClick={() => setQty((q) => q + 1)} className="m-press flex h-8 w-8 items-center justify-center rounded-full bg-white"><Plus className="h-4 w-4" /></button>
          </div>
          <button onClick={() => { onAdd(p, qty); onClose(); }} className="m-press flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-[15px] font-bold text-white" style={{ background: "var(--m-primary-2)" }}>
            <Plus className="h-5 w-5" strokeWidth={2.6} /> Teklife Ekle
          </button>
        </div>
      </div>
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
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(() => !cache.get("products_home"));
  const [err, setErr] = useState(false);
  const [offline, setOffline] = useState(false);
  const [more, setMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [sel, setSel] = useState(null);
  const [hidePrice, setHidePrice] = useState(() => cache.get("price_hidden") === true);
  const debRef = useRef();
  const cart = useCart();
  const LIMIT = 40;

  useEffect(() => { cache.set("price_hidden", hidePrice); }, [hidePrice]);

  const fetchPage = useCallback(async (search, category_id, pg, append) => {
    const home = !search && !category_id && pg === 1;
    if (append) setMore(true);
    else { setErr(false); if (!(home && cache.get("products_home"))) setLoading(true); }
    try {
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
        subtitle={loading ? "Yükleniyor…" : hidePrice ? `${items.length} ürün · fiyatlar gizli` : `${items.length} ürün`}
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setHidePrice((h) => !h)}
              title={hidePrice ? "Fiyatları göster" : "Fiyatları gizle (müşteri modu)"}
              className="m-press flex h-9 w-9 items-center justify-center rounded-full"
              style={hidePrice ? { background: "var(--m-primary)" } : { background: "rgba(148,163,184,.28)" }}
            >
              {hidePrice ? <EyeOff className="h-5 w-5 text-white" /> : <Eye className="h-5 w-5" style={{ color: "var(--m-ink-2)" }} />}
            </button>
            <AccountButton />
          </div>
        }
      />
      <SearchBar value={q} onChange={setQ} placeholder="Ürün adı veya marka" />
      <CategoryCards cats={cats} sel={cat} onSel={setCat} />
      <OfflineBar show={offline} />
      <RefreshScroll onRefresh={() => fetchPage(q.trim(), cat, 1, false)} onScroll={onScroll} className="flex-1 pb-[calc(var(--m-tabbar-h)+env(safe-area-inset-bottom)+8px)]">
        {loading ? (
          <SkeletonList />
        ) : err ? (
          <ErrorState onRetry={() => fetchPage(q.trim(), cat, 1, false)} />
        ) : items.length === 0 ? (
          <EmptyState icon={Boxes} title="Ürün bulunamadı" hint={q ? "Aramayı değiştir" : "Henüz ürün yok"} />
        ) : (
          <>
            <div className="space-y-2 px-4 pt-1">
              {items.map((p) => <Row key={p.id} p={p} onOpen={setSel} onAdd={cart.add} qty={cart.items.get(p.id)?.qty || 0} hide={hidePrice} />)}
            </div>
            {more && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>}
          </>
        )}
      </RefreshScroll>
      <Detail p={sel} onClose={() => setSel(null)} onAdd={cart.add} hide={hidePrice} />
    </div>
  );
}
