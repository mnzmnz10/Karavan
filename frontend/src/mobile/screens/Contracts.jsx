import React, { useEffect, useMemo, useState } from "react";
import { ScrollText, User, Share2 } from "lucide-react";
import http, { docUrl, openDoc } from "../api";
import { Header, SearchBar, Card, EmptyState, SkeletonList, Sheet, money, Pill } from "../ui";

const contractsApi = {
  list: () => http.get("/contracts").then((r) => r.data),
};
const STAGE = {
  proposal: { label: "Teklif", color: "amber" },
  agreed: { label: "Anlaşıldı", color: "green" },
};
const fmtDate = (s) => { if (!s) return ""; const d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString("tr-TR"); };
const grand = (c) => Number(c?.data?.grandTotal || c?.grandTotal || 0);
const custName = (c) => c?.customer_name || c?.data?.customer_name || "";

function Row({ c, onOpen }) {
  const st = STAGE[c.stage] || STAGE.proposal;
  return (
    <Card onClick={() => onOpen(c)} className="p-3.5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: "#e8f0fb" }}>
          <ScrollText className="h-5 w-5" style={{ color: "#1e73be" }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-[15px] font-semibold leading-tight">{custName(c) || c.title || "Sözleşme"}</div>
            <span className="ml-auto shrink-0"><Pill color={st.color}>{st.label}</Pill></span>
          </div>
          {c.title && custName(c) && <div className="mt-0.5 truncate text-[12px]" style={{ color: "var(--m-ink-2)" }}>{c.title}</div>}
          <div className="mt-1 flex items-center gap-2">
            {grand(c) > 0 && <span className="m-tnum text-[15px] font-extrabold" style={{ color: "var(--m-primary)" }}>₺{money(grand(c))}</span>}
            <span className="text-[12px] text-slate-400">{fmtDate(c.created_at)}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Detail({ c, onClose }) {
  if (!c) return null;
  const st = STAGE[c.stage] || STAGE.proposal;
  const d = c.data || {};
  const sections = Array.isArray(d.sections) ? d.sections : [];
  const addons = Array.isArray(d.addons) ? d.addons : [];
  return (
    <Sheet open={!!c} onClose={onClose} title="Sözleşme" full>
      <button onClick={() => openDoc(docUrl.contract(c.id))} className="m-press mb-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[15px] font-bold text-white" style={{ background: "var(--m-primary)" }}>
        <Share2 className="h-4 w-4" /> PDF / Excel İndir
      </button>

      <div className="rounded-2xl bg-white p-4">
        <div className="flex items-center gap-2">
          <div className="text-[19px] font-bold leading-snug">{custName(c) || "Sözleşme"}</div>
          <span className="ml-auto"><Pill color={st.color}>{st.label}</Pill></span>
        </div>
        {c.title && <div className="mt-1 text-[13px]" style={{ color: "var(--m-ink-2)" }}>{c.title}</div>}
        <div className="mt-1 text-[12px] text-slate-400">{fmtDate(c.created_at)}</div>
      </div>

      {sections.map((sec, si) => (
        <div key={si} className="mt-3 rounded-2xl bg-white p-2">
          {sec.name && <div className="px-2 pb-1 pt-1 text-[12px] font-bold uppercase tracking-wide text-slate-400">{sec.name}</div>}
          {(sec.items || []).map((it, i) => (
            <div key={i} className="flex items-center justify-between gap-2 border-b border-slate-50 px-2 py-2 last:border-0">
              <div className="min-w-0 text-[14px]">{it.name}{(it.qty > 1) ? <span className="text-slate-400"> ×{it.qty}</span> : ""}</div>
              {it.eurUnit != null && <div className="m-tnum shrink-0 text-[13px] text-slate-500">€{money(it.eurUnit * (it.qty || 1))}</div>}
            </div>
          ))}
        </div>
      ))}

      {addons.length > 0 && (
        <div className="mt-3 rounded-2xl bg-white p-2">
          <div className="px-2 pb-1 pt-1 text-[12px] font-bold uppercase tracking-wide text-slate-400">İlaveler</div>
          {addons.map((a, i) => (
            <div key={i} className="flex items-center justify-between gap-2 border-b border-slate-50 px-2 py-2 last:border-0">
              <div className="min-w-0 text-[14px]">{a.name}{a.is_gift ? <span className="ml-1 text-[11px] font-bold" style={{ color: "#db2777" }}>🎁 HEDİYE</span> : ""}</div>
              {a.amount != null && a.amount !== "" && <div className="m-tnum shrink-0 text-[13px] text-slate-500">{a.currency === "TRY" ? "₺" : a.currency === "USD" ? "$" : "€"}{money((parseFloat(a.amount) || 0) * (parseFloat(a.qty) || 1))}</div>}
            </div>
          ))}
        </div>
      )}

      {grand(c) > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-white px-4 py-3.5">
          <span className="text-[14px] font-semibold" style={{ color: "var(--m-ink-2)" }}>Genel Toplam</span>
          <span className="m-tnum text-[20px] font-extrabold" style={{ color: "var(--m-primary)" }}>₺{money(grand(c))}</span>
        </div>
      )}
    </Sheet>
  );
}

export default function Contracts() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { setItems(await contractsApi.list()); } catch { setItems([]); } finally { setLoading(false); }
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLocaleLowerCase("tr");
    if (!s) return items;
    return items.filter((c) => [custName(c), c.title].filter(Boolean).some((v) => v.toLocaleLowerCase("tr").includes(s)));
  }, [items, q]);

  return (
    <div className="flex h-full flex-col">
      <Header title="Sözleşmeler" subtitle={loading ? "Yükleniyor…" : `${items.length} sözleşme`} />
      <SearchBar value={q} onChange={setQ} placeholder="Müşteri veya başlık" />
      <div className="m-scroll flex-1 pb-[calc(var(--m-tabbar-h)+env(safe-area-inset-bottom)+8px)]">
        {loading ? (
          <SkeletonList />
        ) : filtered.length === 0 ? (
          <EmptyState icon={ScrollText} title="Sözleşme bulunamadı" hint={q ? "Aramayı değiştir" : "Henüz sözleşme yok"} />
        ) : (
          <div className="space-y-2 px-4 pt-1">{filtered.map((c) => <Row key={c.id} c={c} onOpen={setSel} />)}</div>
        )}
      </div>
      <Detail c={sel} onClose={() => setSel(null)} />
    </div>
  );
}
