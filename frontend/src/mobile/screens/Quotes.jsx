import React, { useEffect, useMemo, useState } from "react";
import { FileText, User, Calendar, Share2 } from "lucide-react";
import { quotes as quotesApi, docUrl, openDoc } from "../api";
import { Header, SearchBar, Card, EmptyState, SkeletonList, Sheet, money, Pill } from "../ui";

const fmtDate = (s) => {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleDateString("tr-TR");
};

function Row({ q, onOpen }) {
  const total = Number(q.total_net_price || q.total_discounted_price || q.total_list_price || 0);
  return (
    <Card onClick={() => onOpen(q)} className="p-3.5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: "#fff5e6" }}>
          <FileText className="h-5 w-5" style={{ color: "#d9820a" }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold leading-tight">{q.name || "Teklif"}</div>
          <div className="mt-0.5 flex items-center gap-2 text-[12px]" style={{ color: "var(--m-ink-2)" }}>
            {q.customer_name ? <span className="truncate">{q.customer_name}</span> : <span className="italic text-slate-400">müşteri yok</span>}
            <span>·</span>
            <span className="shrink-0">{fmtDate(q.created_at)}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="m-tnum text-[15px] font-extrabold" style={{ color: "var(--m-primary)" }}>₺{money(total)}</span>
            <Pill color="slate">{(q.products || []).length} kalem</Pill>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Detail({ q, onClose }) {
  if (!q) return null;
  const total = Number(q.total_net_price || q.total_discounted_price || q.total_list_price || 0);
  return (
    <Sheet open={!!q} onClose={onClose} title="Teklif" full>
      <button onClick={() => openDoc(docUrl.quote(q.id))} className="m-press mb-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[15px] font-bold text-white" style={{ background: "var(--m-primary)" }}>
        <Share2 className="h-4.5 w-4.5" /> PDF Paylaş
      </button>
      <div className="rounded-2xl bg-white p-4">
        <div className="text-[19px] font-bold leading-snug">{q.name || "Teklif"}</div>
        <div className="mt-2 space-y-1 text-[13px]" style={{ color: "var(--m-ink-2)" }}>
          <div className="flex items-center gap-2"><User className="h-4 w-4" /> {q.customer_name || "—"}</div>
          <div className="flex items-center gap-2"><Calendar className="h-4 w-4" /> {fmtDate(q.created_at)}</div>
        </div>
      </div>

      <div className="mt-3 rounded-2xl bg-white p-2">
        {(q.products || []).map((it, i) => (
          <div key={i} className="flex items-center justify-between gap-2 border-b border-slate-50 px-2 py-2.5 last:border-0">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-medium">{it.name || it.product_name || "Ürün"}</div>
              {(it.quantity || it.qty) > 1 && <div className="text-[12px] text-slate-400">× {it.quantity || it.qty}</div>}
            </div>
            <div className="m-tnum shrink-0 text-[14px] font-semibold" style={{ color: "var(--m-ink)" }}>
              ₺{money(it.total_price || it.net_price || it.list_price_try || it.price || 0)}
            </div>
          </div>
        ))}
        {(q.products || []).length === 0 && <div className="px-2 py-4 text-center text-[13px] text-slate-400">Kalem yok</div>}
      </div>

      <div className="mt-3 flex items-center justify-between rounded-2xl bg-white px-4 py-3.5">
        <span className="text-[14px] font-semibold" style={{ color: "var(--m-ink-2)" }}>Genel Toplam</span>
        <span className="m-tnum text-[20px] font-extrabold" style={{ color: "var(--m-primary)" }}>₺{money(total)}</span>
      </div>

      {q.notes && (
        <div className="mt-3 rounded-2xl bg-white p-4">
          <div className="mb-1 text-[12px] font-bold uppercase tracking-wide text-slate-400">Notlar</div>
          <div className="whitespace-pre-wrap text-[14px] leading-relaxed">{q.notes}</div>
        </div>
      )}
    </Sheet>
  );
}

export default function Quotes() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { setItems(await quotesApi.list()); } catch { setItems([]); } finally { setLoading(false); }
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLocaleLowerCase("tr");
    if (!s) return items;
    return items.filter((x) =>
      (x.name || "").toLocaleLowerCase("tr").includes(s) || (x.customer_name || "").toLocaleLowerCase("tr").includes(s)
    );
  }, [items, q]);

  return (
    <div className="flex h-full flex-col">
      <Header title="Teklifler" subtitle={loading ? "Yükleniyor…" : `${items.length} teklif`} />
      <SearchBar value={q} onChange={setQ} placeholder="Teklif veya müşteri" />
      <div className="m-scroll flex-1 pb-[calc(var(--m-tabbar-h)+env(safe-area-inset-bottom)+8px)]">
        {loading ? (
          <SkeletonList />
        ) : filtered.length === 0 ? (
          <EmptyState icon={FileText} title="Teklif bulunamadı" hint={q ? "Aramayı değiştir" : "Henüz teklif yok"} />
        ) : (
          <div className="space-y-2 px-4 pt-1">{filtered.map((x) => <Row key={x.id} q={x} onOpen={setSel} />)}</div>
        )}
      </div>
      <Detail q={sel} onClose={() => setSel(null)} />
    </div>
  );
}
