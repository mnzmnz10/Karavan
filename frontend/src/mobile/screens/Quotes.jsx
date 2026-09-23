import React, { useEffect, useMemo, useState } from "react";
import { FileText, User, Calendar, Share2, Trash2, Loader2, Pencil, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { quotes as quotesApi, docUrl, openDoc } from "../api";
import { Header, SearchBar, Card, EmptyState, ErrorState, SkeletonList, Sheet, money, Pill, RefreshScroll, OfflineBar } from "../ui";
import { cache } from "../cache";

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

function Line({ label, value, strong, color }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 text-[13px]">
      <span style={{ color: "var(--m-ink-2)" }}>{label}</span>
      <span className={`m-tnum ${strong ? "font-extrabold text-[14px]" : "font-semibold"}`} style={color ? { color } : { color: "var(--m-ink)" }}>{value}</span>
    </div>
  );
}

const num = (x) => { const n = parseFloat(x); return Number.isFinite(n) ? n : null; };
const qtyOf = (it) => num(it.quantity ?? it.qty) || 1;
// Kalem satış tutarı (TRY): list_price_try = özel fiyat dahil birim satış
const lineSaleTRY = (it) => num(it.total_price) ?? (num(it.list_price_try) ?? num(it.price) ?? 0) * qtyOf(it);

// Kalem geliş (maliyet) TRY — kayıtlı total_cost_price eski güncellemelerde bayat kalabildiği için
// kalem snapshot'ından canlı hesaplanır (masaüstü quoteItemCostUnit ile aynı kural).
function lineCostTRY(it) {
  const qty = qtyOf(it);
  const cur = it.currency;
  const dp = num(it.discounted_price);
  if (!cur && dp == null) return (num(it.discounted_price_try) ?? num(it.list_price_try) ?? 0) * qty; // eski format: doğrudan TRY
  const list = num(it.list_price) ?? 0;
  const manual = it.manual || it.is_manual === true;
  const unitCost = manual ? (dp ?? list) : (dp || list);
  let rate = 1;
  if (cur && cur !== "TRY") {
    const unitSale = num(it.custom_price) ?? list;
    rate = unitSale > 0 ? (num(it.list_price_try) ?? 0) / unitSale : 0;
  }
  return unitCost * rate * qty;
}

function ProfitBlock({ q, showProfit }) {
  const net = Number(q.total_net_price || 0);
  const labor = Number(q.labor_cost || 0);
  const discPct = Number(q.discount_percentage || 0);
  // Ara toplam net'ten türetilir → her zaman gösterilen Genel Toplam ile tutarlı
  const sub = discPct < 100 ? (net - labor) / (1 - discPct / 100) : Number(q.total_discounted_price || 0);
  const discAmt = sub * (discPct / 100);
  const items = q.products || [];
  const liveCost = items.reduce((s, it) => s + lineCostTRY(it), 0);
  const cost = liveCost > 0 ? liveCost : Number(q.total_cost_price || 0);
  const profit = net - cost;
  const margin = net > 0 ? (profit / net) * 100 : 0;
  const hasCost = showProfit && cost > 0;
  const hasBreakdown = discPct > 0 || labor > 0;
  if (!hasCost && !hasBreakdown) return null;
  const pos = profit >= 0;
  return (
    <>
      {hasBreakdown && (
        <div className="mt-3 divide-y divide-slate-50 rounded-2xl bg-white py-1">
          <Line label="Ara toplam" value={`₺${money(sub)}`} />
          {discPct > 0 && <Line label={`İskonto (%${money(discPct)})`} value={`−₺${money(discAmt)}`} color="#e11d48" />}
          {labor > 0 && <Line label="İşçilik" value={`+₺${money(labor)}`} />}
        </div>
      )}
      {hasCost && (
        <div className="mt-3 divide-y divide-black/5 rounded-2xl py-1" style={{ background: "#f0f7f4" }}>
          <Line label="Maliyet" value={`₺${money(cost)}`} />
          <Line label="Kâr" value={`${pos ? "" : "−"}₺${money(Math.abs(profit))}`} strong color={pos ? "var(--m-primary-2)" : "#e11d48"} />
          <Line label="Marj" value={`%${money(margin)}`} strong color={pos ? "var(--m-primary-2)" : "#e11d48"} />
        </div>
      )}
    </>
  );
}

function QuoteEditSheet({ q, open, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [customer, setCustomer] = useState("");
  const [disc, setDisc] = useState("");
  const [labor, setLabor] = useState("");
  const [notes, setNotes] = useState("");
  const [discTL, setDiscTL] = useState("");
  const [targetNet, setTargetNet] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open && q) {
      setName(q.name || "");
      setCustomer(q.customer_name || "");
      const d0 = Number(q.discount_percentage || 0);
      setDisc(d0 > 0 ? String(d0) : "");
      setDiscTL(d0 > 0 ? String(Math.round(Number(q.total_discounted_price || 0) * d0 / 100)) : "");
      setTargetNet("");
      setLabor(String(q.labor_cost || "") === "0" ? "" : String(q.labor_cost || ""));
      setNotes(q.notes || "");
    }
  }, [open, q]);
  if (!q) return null;
  // Backend net'i bu tabandan hesaplar (PUT /quotes recompute) → önizleme birebir aynı
  const base = Number(q.total_discounted_price || 0);
  const discPct = Math.min(100, Math.max(0, parseFloat(disc) || 0));
  const laborTL = Math.max(0, parseFloat(labor) || 0);
  const net = base - base * (discPct / 100) + laborTL;
  // İndirim çift yön (Cart ile aynı): % → ₺, ₺ → % (tam hassasiyet), hedef net → indirim
  const onPct = (v) => {
    setDisc(v); setTargetNet("");
    const pct = Math.min(100, Math.max(0, parseFloat(v) || 0));
    setDiscTL(pct > 0 && base > 0 ? String(Math.round(base * pct / 100)) : "");
  };
  const onTL = (v) => {
    setDiscTL(v); setTargetNet("");
    const tl = Math.max(0, parseFloat(v) || 0);
    setDisc(tl > 0 && base > 0 ? String(Math.min(100, tl / base * 100)) : "");
  };
  const onTargetNet = (v) => {
    setTargetNet(v);
    const target = parseFloat(v);
    if (isNaN(target)) return;
    const discAmt = Math.max(0, Math.min(base, base + laborTL - target));
    setDisc(base > 0 && discAmt > 0 ? String(discAmt / base * 100) : "");
    setDiscTL(discAmt > 0 ? String(Math.round(discAmt * 100) / 100) : "");
  };

  const save = async () => {
    if (!name.trim()) { toast.error("Teklif adı gerekli"); return; }
    const patch = {};
    if (name.trim() !== (q.name || "")) patch.name = name.trim();
    if (customer.trim() !== (q.customer_name || "")) patch.customer_name = customer.trim();
    if (notes.trim() !== (q.notes || "").trim()) patch.notes = notes.trim();
    // İndirim/işçilik sadece değiştiyse → gereksiz net yeniden hesabı yok
    if (Math.abs(discPct - Number(q.discount_percentage || 0)) > 1e-9) patch.discount_percentage = discPct;
    if (Math.abs(laborTL - Number(q.labor_cost || 0)) > 1e-9) patch.labor_cost = laborTL;
    if (Object.keys(patch).length === 0) { onClose(); return; }
    setBusy(true);
    try {
      const updated = await quotesApi.update(q.id, patch);
      toast.success("Teklif güncellendi");
      onSaved?.(updated);
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Güncellenemedi");
    } finally {
      setBusy(false);
    }
  };
  const field = "w-full rounded-xl bg-slate-100 px-3 py-2.5 text-[15px] placeholder:text-slate-400";
  return (
    <Sheet open={open} onClose={onClose} title="Teklifi Düzenle">
      <div className="space-y-2 rounded-2xl bg-white p-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Teklif adı *" className={field} />
        <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Müşteri adı" className={field} />
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input value={disc} onChange={(e) => onPct(e.target.value)} inputMode="decimal" placeholder="İskonto" className={`${field} pr-7`} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[14px] text-slate-400">%</span>
          </div>
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-slate-400">₺</span>
            <input value={discTL} onChange={(e) => onTL(e.target.value)} inputMode="decimal" placeholder="İskonto ₺" className={`${field} pl-7`} />
          </div>
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-slate-400">₺</span>
          <input value={labor} onChange={(e) => { setLabor(e.target.value); setTargetNet(""); }} inputMode="decimal" placeholder="İşçilik" className={`${field} pl-7`} />
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-emerald-700">Net ₺</span>
          <input value={targetNet} onChange={(e) => onTargetNet(e.target.value)} inputMode="decimal" placeholder="Net toplamı ayarla (indirim otomatik)" className={`${field} pl-16`} style={{ background: "#ecfdf5" }} />
        </div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Not" rows={2} className={`${field} resize-none`} />
      </div>
      <div className="mt-3 flex items-center justify-between rounded-2xl bg-white px-4 py-3">
        <span className="text-[13px]" style={{ color: "var(--m-ink-2)" }}>Yeni net toplam</span>
        <span className="m-tnum text-[17px] font-extrabold" style={{ color: "var(--m-primary)" }}>₺{money(net)}</span>
      </div>
      <button onClick={save} disabled={busy} className="m-press mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-bold text-white disabled:opacity-60" style={{ background: "var(--m-primary)" }}>
        {busy && <Loader2 className="h-5 w-5 animate-spin" />} Kaydet
      </button>
    </Sheet>
  );
}

function Detail({ q, onClose, onDeleted, onSaved }) {
  const [del, setDel] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [showProfit, setShowProfit] = useState(() => cache.get("quote_profit") === true);
  useEffect(() => { cache.set("quote_profit", showProfit); }, [showProfit]);
  if (!q) return null;
  const total = Number(q.total_net_price || q.total_discounted_price || q.total_list_price || 0);
  const remove = async () => {
    if (del) return;
    if (!window.confirm(`"${q.name || "Bu teklif"}" silinsin mi?`)) return;
    setDel(true);
    try { await quotesApi.remove(q.id); toast.success("Teklif silindi"); onDeleted?.(); }
    catch { toast.error("Silinemedi"); setDel(false); }
  };
  return (
    <Sheet open={!!q} onClose={onClose} title="Teklif" full>
      <div className="mb-3 flex gap-2">
        <button onClick={() => setEditOpen(true)} className="m-press flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white py-3 text-[15px] font-bold" style={{ color: "var(--m-primary)" }}>
          <Pencil className="h-4 w-4" /> Düzenle
        </button>
        <button onClick={() => openDoc(docUrl.quote(q.id))} className="m-press flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-[15px] font-bold text-white" style={{ background: "var(--m-primary)" }}>
          <Share2 className="h-4 w-4" /> PDF
        </button>
      </div>
      <QuoteEditSheet q={q} open={editOpen} onClose={() => setEditOpen(false)} onSaved={onSaved} />
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
              {qtyOf(it) > 1 && <div className="m-tnum text-[12px] text-slate-400">{qtyOf(it)} × ₺{money(lineSaleTRY(it) / qtyOf(it))}</div>}
            </div>
            <div className="m-tnum shrink-0 text-[14px] font-semibold" style={{ color: "var(--m-ink)" }}>
              ₺{money(lineSaleTRY(it))}
            </div>
          </div>
        ))}
        {(q.products || []).length === 0 && <div className="px-2 py-4 text-center text-[13px] text-slate-400">Kalem yok</div>}
      </div>

      <div className="mt-3 flex items-center justify-between rounded-2xl bg-white px-4 py-3.5">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold" style={{ color: "var(--m-ink-2)" }}>Genel Toplam</span>
          <button
            onClick={() => setShowProfit((v) => !v)}
            aria-label="Göster/Gizle"
            className="m-press flex h-5 w-5 items-center justify-center"
            style={{ opacity: showProfit ? 0.9 : 0.28 }}
          >
            {showProfit ? <EyeOff className="h-3.5 w-3.5" style={{ color: "var(--m-primary-2)" }} /> : <Eye className="h-3.5 w-3.5" style={{ color: "var(--m-ink-2)" }} />}
          </button>
        </div>
        <span className="m-tnum text-[20px] font-extrabold" style={{ color: "var(--m-primary)" }}>₺{money(total)}</span>
      </div>

      <ProfitBlock q={q} showProfit={showProfit} />

      {q.notes && (
        <div className="mt-3 rounded-2xl bg-white p-4">
          <div className="mb-1 text-[12px] font-bold uppercase tracking-wide text-slate-400">Notlar</div>
          <div className="whitespace-pre-wrap text-[14px] leading-relaxed">{q.notes}</div>
        </div>
      )}
      <button onClick={remove} disabled={del} className="m-press mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3 text-[14px] font-bold text-rose-500 disabled:opacity-60">
        {del ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Teklifi Sil
      </button>
    </Sheet>
  );
}

export default function Quotes() {
  const [items, setItems] = useState(() => cache.get("quotes") || []);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(() => !cache.get("quotes"));
  const [err, setErr] = useState(false);
  const [offline, setOffline] = useState(false);
  const [sel, setSel] = useState(null);

  const reload = async () => {
    setErr(false);
    if (!cache.get("quotes")) setLoading(true);
    try {
      const data = await quotesApi.list();
      setItems(data); cache.set("quotes", data); setOffline(false);
    } catch {
      const c = cache.get("quotes");
      if (c) { setItems(c); setOffline(true); } else { setItems([]); setErr(true); }
    } finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLocaleLowerCase("tr");
    const base = !s ? items : items.filter((x) =>
      (x.name || "").toLocaleLowerCase("tr").includes(s) || (x.customer_name || "").toLocaleLowerCase("tr").includes(s)
    );
    return [...base].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))); // en yeni üstte
  }, [items, q]);

  return (
    <div className="flex h-full flex-col">
      <Header title="Teklifler" subtitle={loading ? "Yükleniyor…" : `${items.length} teklif`} />
      <SearchBar value={q} onChange={setQ} placeholder="Teklif veya müşteri" />
      <OfflineBar show={offline} />
      <RefreshScroll onRefresh={reload} className="flex-1 pb-[calc(var(--m-tabbar-h)+env(safe-area-inset-bottom)+8px)]">
        {loading ? (
          <SkeletonList />
        ) : err ? (
          <ErrorState onRetry={reload} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={FileText} title="Teklif bulunamadı" hint={q ? "Aramayı değiştir" : "Henüz teklif yok"} />
        ) : (
          <div className="space-y-2 px-4 pt-1">{filtered.map((x) => <Row key={x.id} q={x} onOpen={setSel} />)}</div>
        )}
      </RefreshScroll>
      <Detail
        q={sel}
        onClose={() => setSel(null)}
        onDeleted={() => { setSel(null); reload(); }}
        onSaved={(u) => { setSel((s) => (s ? { ...s, ...u } : s)); setItems((prev) => prev.map((x) => (x.id === u.id ? { ...x, ...u } : x))); }}
      />
    </div>
  );
}
