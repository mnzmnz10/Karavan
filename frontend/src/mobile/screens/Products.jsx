import React, { useCallback, useEffect, useRef, useState } from "react";
import { Package, Boxes, Plus, User, LogOut } from "lucide-react";
import { products as productsApi, categories as categoriesApi } from "../api";
import { Header, SearchBar, Card, EmptyState, SkeletonList, Sheet, money, Pill } from "../ui";
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
        <button onClick={() => { setOpen(false); s?.logout?.(); }} className="m-press mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-[15px] font-bold text-rose-500">
          <LogOut className="h-5 w-5" /> Çıkış Yap
        </button>
      </Sheet>
    </>
  );
}

function CategoryBar({ cats, sel, onSel }) {
  if (!cats.length) return null;
  const Chip = ({ id, label }) => {
    const on = sel === id;
    return (
      <button
        onClick={() => onSel(id)}
        className="m-press shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold"
        style={on
          ? { background: "var(--m-primary)", color: "#fff" }
          : { background: "#e9e9ee", color: "var(--m-ink-2)" }}
      >
        {label}
      </button>
    );
  };
  return (
    <div className="flex gap-2 overflow-x-auto px-4 pb-2" style={{ scrollbarWidth: "none" }}>
      <Chip id="" label="Tümü" />
      {cats.map((c) => <Chip key={c.id} id={c.id} label={c.name} />)}
    </div>
  );
}

function priceTRY(p) {
  const disc = Number(p.discounted_price_try);
  const list = Number(p.list_price_try);
  if (disc > 0 && disc < list) return { main: disc, old: list };
  return { main: list || 0, old: null };
}

function Row({ p, onOpen, onAdd }) {
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
            <span className="m-tnum text-[15px] font-extrabold" style={{ color: "var(--m-primary-2)" }}>₺{money(pr.main)}</span>
            {pr.old && <span className="m-tnum text-[12px] text-slate-400 line-through">₺{money(pr.old)}</span>}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onAdd(p); }}
          className="m-press flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: "#e7f3ee", color: "var(--m-primary-2)" }}
          title="Teklife ekle"
        >
          <Plus className="h-5 w-5" strokeWidth={2.6} />
        </button>
      </div>
    </Card>
  );
}

function Detail({ p, onClose, onAdd }) {
  if (!p) return null;
  const pr = priceTRY(p);
  return (
    <Sheet open={!!p} onClose={onClose} title="Ürün" full>
      {p.image_url && (
        <div className="mb-3 flex items-center justify-center overflow-hidden rounded-2xl bg-white p-2">
          <img src={p.image_url} alt="" className="max-h-56 w-auto object-contain" />
        </div>
      )}
      <div className="rounded-2xl bg-white p-4">
        <div className="text-[19px] font-bold leading-snug">{p.name}</div>
        {p.brand && <div className="mt-1"><Pill color="slate">{p.brand}</Pill></div>}
        <div className="mt-3 flex items-baseline gap-2">
          <span className="m-tnum text-[24px] font-extrabold" style={{ color: "var(--m-primary-2)" }}>₺{money(pr.main)}</span>
          {pr.old && <span className="m-tnum text-[14px] text-slate-400 line-through">₺{money(pr.old)}</span>}
        </div>
        <button onClick={() => { onAdd(p); onClose(); }} className="m-press mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[15px] font-bold text-white" style={{ background: "var(--m-primary-2)" }}>
          <Plus className="h-5 w-5" strokeWidth={2.6} /> Teklife Ekle
        </button>
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
  const [items, setItems] = useState([]);
  const [cats, setCats] = useState([]);
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);
  const debRef = useRef();
  const cart = useCart();

  const load = useCallback(async (search, category_id) => {
    setLoading(true);
    try {
      const data = await productsApi.list({ search, category_id: category_id || undefined, page: 1, limit: 60 });
      setItems(Array.isArray(data) ? data : data?.products || []);
    } catch (e) {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { categoriesApi.list().then((c) => setCats(Array.isArray(c) ? c : [])).catch(() => {}); }, []);

  useEffect(() => {
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => load(q.trim(), cat), 300);
    return () => clearTimeout(debRef.current);
  }, [q, cat, load]);

  return (
    <div className="flex h-full flex-col">
      <Header title="Ürünler" subtitle={loading ? "Yükleniyor…" : `${items.length} ürün`} right={<AccountButton />} />
      <SearchBar value={q} onChange={setQ} placeholder="Ürün adı veya marka" />
      <CategoryBar cats={cats} sel={cat} onSel={setCat} />
      <div className="m-scroll flex-1 pb-[calc(var(--m-tabbar-h)+env(safe-area-inset-bottom)+8px)]">
        {loading ? (
          <SkeletonList />
        ) : items.length === 0 ? (
          <EmptyState icon={Boxes} title="Ürün bulunamadı" hint={q ? "Aramayı değiştir" : "Henüz ürün yok"} />
        ) : (
          <div className="space-y-2 px-4 pt-1">
            {items.map((p) => <Row key={p.id} p={p} onOpen={setSel} onAdd={cart.add} />)}
          </div>
        )}
      </div>
      <Detail p={sel} onClose={() => setSel(null)} onAdd={cart.add} />
    </div>
  );
}
