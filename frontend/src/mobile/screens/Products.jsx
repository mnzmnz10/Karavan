import React, { useCallback, useEffect, useRef, useState } from "react";
import { Package, Boxes } from "lucide-react";
import { products as productsApi } from "../api";
import { Header, SearchBar, Card, EmptyState, SkeletonList, Sheet, money, Pill } from "../ui";

function priceTRY(p) {
  const disc = Number(p.discounted_price_try);
  const list = Number(p.list_price_try);
  if (disc > 0 && disc < list) return { main: disc, old: list };
  return { main: list || 0, old: null };
}

function Row({ p, onOpen }) {
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
      </div>
    </Card>
  );
}

function Detail({ p, onClose }) {
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
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);
  const debRef = useRef();

  const load = useCallback(async (search) => {
    setLoading(true);
    try {
      const data = await productsApi.list({ search, page: 1, limit: 40 });
      setItems(Array.isArray(data) ? data : data?.products || []);
    } catch (e) {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(""); }, [load]);

  useEffect(() => {
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => load(q.trim()), 300);
    return () => clearTimeout(debRef.current);
  }, [q, load]);

  return (
    <div className="flex h-full flex-col">
      <Header title="Ürünler" subtitle={loading ? "Yükleniyor…" : `${items.length} ürün`} />
      <SearchBar value={q} onChange={setQ} placeholder="Ürün adı veya marka" />
      <div className="m-scroll flex-1 pb-[calc(var(--m-tabbar-h)+env(safe-area-inset-bottom)+8px)]">
        {loading ? (
          <SkeletonList />
        ) : items.length === 0 ? (
          <EmptyState icon={Boxes} title="Ürün bulunamadı" hint={q ? "Aramayı değiştir" : "Henüz ürün yok"} />
        ) : (
          <div className="space-y-2 px-4 pt-1">
            {items.map((p) => <Row key={p.id} p={p} onOpen={setSel} />)}
          </div>
        )}
      </div>
      <Detail p={sel} onClose={() => setSel(null)} />
    </div>
  );
}
