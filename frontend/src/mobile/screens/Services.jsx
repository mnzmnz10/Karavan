import React, { useEffect, useMemo, useState } from "react";
import { Wrench, Car, Phone, MessageCircle, Image as ImageIcon, Loader2, Plus, Pencil, Share2, Trash2, Eye, EyeOff, Wallet, X, FileText, Camera } from "lucide-react";
import { toast } from "sonner";
import { services as servicesApi, rates as ratesApi, docUrl, openDoc } from "../api";
import { useCatalog, catRate } from "../catalog";
import { Header, SearchBar, Card, EmptyState, ErrorState, SkeletonList, Sheet, money, Pill, Lightbox, RefreshScroll, OfflineBar, todayISO, waNumber, fmtDate } from "../ui";
import { cache } from "../cache";
import ServiceForm, { compressImage } from "./ServiceForm";

const STATUS = {
  received: { label: "Geldi", color: "amber" },
  in_progress: { label: "İşlemde", color: "blue" },
  delivered: { label: "Teslim", color: "green" },
};
const STATUS_CYCLE = ["received", "in_progress", "delivered"];
const nextStatus = (s) => STATUS_CYCLE[(STATUS_CYCLE.indexOf(s) + 1) % STATUS_CYCLE.length];
const vehicleLine = (s) => [s.vehicle_brand, s.vehicle_model].filter(Boolean).join(" ") || (s.is_trailer ? "Çekme karavan" : "");
// Teslim uyarısı: teslim edilmemiş + teslim tarihi bugün/geçmiş
const dueBadge = (s) => {
  if (!s.delivery_date || s.status === "delivered") return null;
  const today = todayISO();
  const dd = String(s.delivery_date).slice(0, 10);
  if (dd < today) return { label: "Gecikmiş", color: "red" };
  if (dd === today) return { label: "Bugün teslim", color: "amber" };
  return null;
};
// Teslim edilmemiş araç kaç gündür serviste (geliş tarihinden bugüne; 0 → null)
export const daysIn = (s) => {
  if (!s || s.status === "delivered" || !s.arrival_date) return null;
  const a = new Date(String(s.arrival_date).slice(0, 10) + "T00:00:00");
  if (isNaN(a)) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = Math.round((t - a) / 86400000);
  return d > 0 ? d : null;
};
// WhatsApp hazır mesaj (duruma göre; gönderilmeden önce kullanıcı düzenleyebilir)
const waText = (s) => {
  const ad = (s.customer_name || "").trim();
  const hi = ad ? `Merhaba ${ad}, ` : "Merhaba, ";
  const arac = vehicleLine(s) || (s.plate ? s.plate : "aracınız");
  if (s.status === "delivered") return `${hi}Çorlu Karavan'ı tercih ettiğiniz için teşekkür ederiz.`;
  if (s.status === "in_progress") return `${hi}${arac} için servis işlemleriniz devam ediyor.`;
  return `${hi}${arac} servisimize ulaştı.`;
};
// Müşteriye hesap özeti (kalemler, iskonto, toplam, ödenen, kalan) — maliyet YOK
const statementText = (s) => {
  const lineTL = (it) => (parseFloat(it.unit_price) || 0) * (parseFloat(it.qty) || 1) * (it.currency && it.currency !== "TRY" ? (parseFloat(it.rate) || 1) : 1);
  const L = [`Merhaba ${(s.customer_name || "").trim()},`.replace(" ,", ","), "", `*Servis hesap özeti${s.order_no ? " (" + s.order_no + ")" : ""}*`];
  (s.items || []).forEach((it) => {
    const q = parseFloat(it.qty) || 1;
    L.push(`• ${it.name || "Kalem"}${q > 1 ? " × " + q : ""} — ₺${money(lineTL(it))}`);
  });
  const net = serviceNet(s);
  const gross = (s.items || []).length ? (s.items || []).reduce((a, it) => a + lineTL(it), 0) : net;
  if (gross - net > 0.5) L.push(`İskonto: −₺${money(gross - net)}`);
  const got = collectedTRY(s);
  const left = net - got;
  L.push("", `*Toplam: ₺${money(net)}*`);
  if (got > 0) L.push(`Ödenen: ₺${money(got)}`);
  L.push(left > 0.5 ? `*Kalan: ₺${money(left)}*` : "Ödeme tamamlandı, teşekkür ederiz.");
  L.push("", "Çorlu Karavan");
  return L.join("\n");
};

// Liste satırı için net tutar (Detail ile aynı: kalemler TL − iskonto; kalemsiz eski kayıt → cost)
export const serviceNet = (s) => {
  const items = s.items || [];
  const gross = items.length === 0 && s.cost != null
    ? Number(s.cost) || 0
    : items.reduce((a, it) => a + (parseFloat(it.unit_price) || 0) * (parseFloat(it.qty) || 1) * (it.currency && it.currency !== "TRY" ? (parseFloat(it.rate) || 1) : 1), 0);
  return gross - Math.min(Math.max(0, parseFloat(s.discount_amount) || 0), gross);
};

function Row({ s, onOpen, onCycle, busy }) {
  const st = STATUS[s.status] || STATUS.received;
  return (
    <Card onClick={() => onOpen(s)} className="p-3.5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: "#fef0e8" }}>
          <Wrench className="h-5 w-5" style={{ color: "#e56a1f" }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-[15px] font-semibold leading-tight">{s.customer_name || "İsimsiz"}</div>
            <button
              onClick={(e) => { e.stopPropagation(); if (!busy) onCycle(s); }}
              className="m-press ml-auto shrink-0"
              title="Durumu değiştir"
            >
              {busy ? (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5"><Loader2 className="h-3 w-3 animate-spin text-slate-400" /></span>
              ) : (
                <Pill color={st.color}>{st.label}</Pill>
              )}
            </button>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[12px]" style={{ color: "var(--m-ink-2)" }}>
            {vehicleLine(s) && <span className="truncate">{vehicleLine(s)}</span>}
            {s.plate && <><span>·</span><span className="shrink-0 font-semibold">{s.plate}</span></>}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[12px] text-slate-400">
            {s.order_no && <span className="font-bold">{s.order_no}</span>}
            <span>{fmtDate(s.arrival_date || s.created_at)}</span>
            {(() => { const b = dueBadge(s); return b ? <Pill color={b.color}>{b.label}</Pill> : null; })()}
            {!dueBadge(s) && daysIn(s) >= 3 && <Pill color="slate">{daysIn(s)} gün</Pill>}
            {(() => { const left = serviceNet(s) - collectedTRY(s); return left > 0.5 && serviceNet(s) > 0 ? <Pill color="red">Kalan ₺{money(left)}</Pill> : null; })()}
            {serviceNet(s) > 0 && <span className="m-tnum ml-auto shrink-0 text-[13px] font-extrabold" style={{ color: "var(--m-primary)" }}>₺{money(serviceNet(s))}</span>}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---- Tahsilat (masaüstü serviceCollectedTotalTRY ile aynı): collections doluysa SADECE onlar, yoksa eski advance_amount
const CUR_SYM = { TRY: "₺", EUR: "€", USD: "$" };
const collTRY = (c) => {
  const a = parseFloat(c.amount); if (isNaN(a)) return 0;
  if (!c.currency || c.currency === "TRY") return a;
  return a * (parseFloat(c.rate) || 0);
};
export const collectedTRY = (s) => {
  const colls = Array.isArray(s.collections) ? s.collections : [];
  if (colls.length > 0) return colls.reduce((a, c) => a + collTRY(c), 0);
  return parseFloat(s.advance_amount) || 0;
};
// Eski avans → tahsilat satırı (masaüstü edit migrasyonu ile aynı), yoksa mevcut liste
const baseCollections = (s) => {
  const colls = Array.isArray(s.collections) ? s.collections.map((c) => ({ ...c })) : [];
  if (colls.length === 0 && parseFloat(s.advance_amount) > 0) {
    return [{ id: "avans", date: s.arrival_date || "", description: "Avans", amount: parseFloat(s.advance_amount), currency: "TRY", rate: null }];
  }
  return colls;
};

function CollectionSheet({ open, onClose, onAdd }) {
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("TRY");
  const [rate, setRate] = useState("");
  const [live, setLive] = useState(() => cache.get("rates") || {});
  const [date, setDate] = useState(() => todayISO());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setDesc(""); setAmount(""); setCurrency("TRY"); setRate(""); setDate(todayISO());
    ratesApi.get().then((r) => { if (r && r.EUR) { setLive(r); cache.set("rates", r); } }).catch(() => {});
  }, [open]);
  // Döviz değişince kur DAİMA o dövizin güncel kuruna (masaüstü ile aynı); kullanıcı ezebilir
  const onCur = (c) => { setCurrency(c); setRate(c === "TRY" ? "" : (Number(live[c]) > 0 ? Number(live[c]).toFixed(2) : "")); };
  const amt = parseFloat(amount) || 0;
  const r = parseFloat(rate) || 0;
  const save = async () => {
    if (amt <= 0) { toast.error("Tutar girin"); return; }
    if (currency !== "TRY" && r <= 0) { toast.error("Kur girin"); return; }
    setBusy(true);
    try {
      const ok = await onAdd({ id: Math.random().toString(36).slice(2, 10), date, description: desc.trim() || null, amount: amt, currency, rate: currency === "TRY" ? null : r });
      if (ok) onClose();
    } finally { setBusy(false); }
  };
  const field = "w-full rounded-xl bg-slate-100 px-3 py-2.5 text-[15px] placeholder:text-slate-400";
  return (
    <Sheet open={open} onClose={onClose} title="Tahsilat Ekle">
      <div className="space-y-2 rounded-2xl bg-white p-3">
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Açıklama (Nakit, EFT, Kart…)" className={field} />
        <div className="flex gap-2">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Tutar" className={`${field} flex-1`} />
          <select value={currency} onChange={(e) => onCur(e.target.value)} className="rounded-xl bg-slate-100 px-3 text-[15px]">
            <option value="TRY">₺</option><option value="EUR">€</option><option value="USD">$</option>
          </select>
        </div>
        {currency !== "TRY" && (
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[13px] text-slate-500">Kur (1 {CUR_SYM[currency]} = ₺)</span>
            <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" placeholder="kur" className={`${field} flex-1 text-right`} />
          </div>
        )}
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
      </div>
      {currency !== "TRY" && amt > 0 && r > 0 && (
        <div className="mt-2 px-1 text-[12px]" style={{ color: "var(--m-ink-2)" }}>≈ ₺{money(amt * r)}</div>
      )}
      <button onClick={save} disabled={busy} className="m-press mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-bold text-white disabled:opacity-60" style={{ background: "var(--m-primary-2)" }}>
        {busy && <Loader2 className="h-5 w-5 animate-spin" />} Kaydet
      </button>
    </Sheet>
  );
}

function Detail({ id, onClose, onEdit, onDeleted, onChanged, onRepeat, onOpenQuote, prodCost }) {
  const [s, setS] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lb, setLb] = useState(null);
  const [del, setDel] = useState(false);
  const [showProfit, setShowProfit] = useState(() => cache.get("svc_profit") === true);
  useEffect(() => { cache.set("svc_profit", showProfit); }, [showProfit]);
  const [collOpen, setCollOpen] = useState(false);
  // Hızlı foto ekleme (düzenleme formuna girmeden): sıkıştır → photos'a ekle → PUT
  const [photoBusy, setPhotoBusy] = useState(false);
  // Durumu ilerlet: Geldi → İşlemde → Teslim (teslimde boş teslim tarihi = bugün)
  const [advancing, setAdvancing] = useState(false);
  const advance = async () => {
    if (!s || s.status === "delivered" || advancing) return;
    const next = s.status === "in_progress" ? "delivered" : "in_progress";
    const patch = { status: next };
    if (next === "delivered" && !s.delivery_date) patch.delivery_date = todayISO();
    setAdvancing(true);
    try {
      await servicesApi.update(s.id, patch);
      setS((prev) => ({ ...prev, ...patch }));
      onChanged?.();
      toast.success(STATUS[next].label);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Güncellenemedi");
    } finally { setAdvancing(false); }
  };
  const removePhoto = async (idx) => {
    if (!s || !window.confirm("Fotoğraf silinsin mi?")) return;
    const photos = (s.photos || []).filter((_, j) => j !== idx);
    try {
      await servicesApi.update(s.id, { photos });
      setS((prev) => ({ ...prev, photos }));
      onChanged?.();
      toast.success("Fotoğraf silindi");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Silinemedi");
    }
  };
  const addPhotos = async (files) => {
    if (!files?.length || !s) return;
    setPhotoBusy(true);
    try {
      const arr = [];
      for (const f of Array.from(files)) { try { arr.push(await compressImage(f)); } catch {} }
      if (!arr.length) return;
      const photos = [...(s.photos || []), ...arr];
      await servicesApi.update(s.id, { photos });
      setS((prev) => ({ ...prev, photos }));
      onChanged?.();
      toast.success(`${arr.length} foto eklendi`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Foto eklenemedi");
    } finally { setPhotoBusy(false); }
  };
  const saveCollections = async (list, okMsg) => {
    try {
      // Eski avans listeye taşındı (baseCollections) → advance_amount sıfırlanır, çift sayım/geri gelme yok
      const patch = { collections: list };
      if (parseFloat(s.advance_amount) > 0) patch.advance_amount = 0;
      await servicesApi.update(s.id, patch);
      setS((prev) => ({ ...prev, ...patch }));
      onChanged?.();
      toast.success(okMsg);
      return true;
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Kaydedilemedi");
      return false;
    }
  };
  const addCollection = (c) => saveCollections([...baseCollections(s), c], "Tahsilat eklendi");
  const removeCollection = (id) => {
    if (!window.confirm("Bu tahsilat silinsin mi?")) return;
    saveCollections(baseCollections(s).filter((c) => c.id !== id), "Tahsilat silindi");
  };
  const remove = async () => {
    if (!s || del) return;
    if (!window.confirm(`"${s.customer_name || "Bu kayıt"}" servis kaydı silinsin mi?`)) return;
    setDel(true);
    try { await servicesApi.remove(s.id); toast.success("Servis kaydı silindi"); onDeleted?.(); }
    catch { toast.error("Silinemedi"); setDel(false); }
  };
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    servicesApi.get(id).then(setS).catch(() => setS(null)).finally(() => setLoading(false));
  }, [id]);

  const lineTRY = (it, field) => {
    const q = parseFloat(it.qty) || 1;
    const v = parseFloat(it[field]) || 0;
    const rate = it.currency && it.currency !== "TRY" ? (parseFloat(it.rate) || 1) : 1;
    return v * q * rate;
  };
  // Ürünün indirimli fiyatı = maliyet (TL). Kalem maliyeti boşsa ürün adından türet.
  const prodCostUnit = (name) => {
    const c = prodCost && prodCost[String(name || "").trim().toLocaleLowerCase("tr")];
    return c != null ? c : null;
  };
  const costLineTRY = (it) => {
    if (it.unit_cost !== "" && it.unit_cost != null) return lineTRY(it, "unit_cost");
    const pc = prodCostUnit(it.name);
    if (pc != null) return pc * (parseFloat(it.qty) || 1);
    return lineTRY(it, "unit_price"); // bilinmiyor → kâr 0
  };
  const itemHasCost = (it) => (it.unit_cost !== "" && it.unit_cost != null) || prodCostUnit(it.name) != null;
  const gross = useMemo(() => {
    if (!s) return 0;
    if ((s.items || []).length === 0 && s.cost != null) return Number(s.cost) || 0;
    return (s.items || []).reduce((a, it) => a + lineTRY(it, "unit_price"), 0);
  }, [s]);
  const discount = Math.min(Math.max(0, parseFloat(s?.discount_amount) || 0), gross); // servis iskontosu (teklif net'i buraya yansır)
  const total = gross - discount; // net (indirimli)
  const costTotal = useMemo(() => {
    if (!s) return 0;
    return (s.items || []).reduce((a, it) => a + costLineTRY(it), 0);
  }, [s, prodCost]);
  const profit = total - costTotal;
  const margin = total > 0 ? Math.round((profit / total) * 100) : 0;
  const hasCost = !!s && (s.items || []).some(itemHasCost);

  const st = s ? STATUS[s.status] || STATUS.received : null;

  return (
    <Sheet open={!!id} onClose={onClose} title="Servis Kaydı" full>
      {loading || !s ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : (
        <>
          <div className="mb-3 flex gap-2">
            <button onClick={() => onEdit?.(s)} className="m-press flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white py-2.5 text-[14px] font-bold" style={{ color: "var(--m-primary)" }}>
              <Pencil className="h-4 w-4" /> Düzenle
            </button>
            <button onClick={() => openDoc(docUrl.service(s.id))} className="m-press flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-2.5 text-[14px] font-bold text-white" style={{ background: "var(--m-primary)" }}>
              <Share2 className="h-4 w-4" /> PDF
            </button>
          </div>
          <div className="rounded-2xl bg-white p-4">
            <div className="flex items-center gap-2">
              <div className="text-[19px] font-bold">{s.customer_name || "İsimsiz"}</div>
              {st && <span className="ml-auto"><Pill color={st.color}>{st.label}</Pill></span>}
            </div>
            <div className="mt-2 space-y-1 text-[13px]" style={{ color: "var(--m-ink-2)" }}>
              {vehicleLine(s) && <div className="flex items-center gap-2"><Car className="h-4 w-4" /> {vehicleLine(s)}{s.plate ? ` · ${s.plate}` : ""}</div>}
              {s.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4" /> {s.phone}</div>}
            </div>
            <div className="mt-2 text-[12px] text-slate-400">
              {s.order_no ? `${s.order_no} · ` : ""}Geliş: {fmtDate(s.arrival_date)}{s.delivery_date ? ` · Teslim: ${fmtDate(s.delivery_date)}` : ""}{daysIn(s) != null ? ` · ${daysIn(s)} gündür serviste` : ""}
            </div>
            {s.phone && (
              <div className="mt-3 flex gap-2">
                <a href={`tel:${s.phone}`} className="m-press flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[14px] font-bold text-white" style={{ background: "var(--m-primary)" }}>
                  <Phone className="h-4 w-4" /> Ara
                </a>
                <a href={`https://wa.me/${waNumber(s.phone)}?text=${encodeURIComponent(waText(s))}`} target="_blank" rel="noreferrer" className="m-press flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[14px] font-bold text-white" style={{ background: "#25d366" }}>
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </a>
              </div>
            )}
          </div>

          {s.operations && (
            <div className="mt-3 rounded-2xl bg-white p-4">
              <div className="mb-1 text-[12px] font-bold uppercase tracking-wide text-slate-400">Yapılan İşlemler</div>
              <div className="whitespace-pre-wrap text-[14px] leading-relaxed">{s.operations}</div>
            </div>
          )}

          {(s.items || []).length > 0 && (
            <div className="mt-3 rounded-2xl bg-white p-2">
              <div className="px-2 pb-1 pt-1 text-[12px] font-bold uppercase tracking-wide text-slate-400">Parça / İşlem</div>
              {s.items.map((it, i) => {
                const q = parseFloat(it.qty) || 1;
                const up = parseFloat(it.unit_price) || 0;
                const rate = it.currency && it.currency !== "TRY" ? (parseFloat(it.rate) || 1) : 1;
                return (
                  <div key={i} className="flex items-center justify-between gap-2 border-b border-slate-50 px-2 py-2.5 last:border-0">
                    <div className="min-w-0"><div className="truncate text-[14px] font-medium">{it.name}</div>{q > 1 && <div className="m-tnum text-[12px] text-slate-400">{q} × ₺{money(up * rate)}</div>}</div>
                    <div className="shrink-0 text-right">
                      <div className="m-tnum text-[14px] font-semibold">₺{money(up * q * rate)}</div>
                      {showProfit && itemHasCost(it) && (
                        <div className="m-tnum text-[11px] text-slate-400">geliş ₺{money(costLineTRY(it))}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-3 rounded-2xl bg-white px-4 py-3.5">
            {discount > 0 && (
              <div className="mb-2 space-y-1 border-b border-slate-100 pb-2 text-[12px]">
                <div className="flex items-center justify-between"><span style={{ color: "var(--m-ink-2)" }}>Ara toplam</span><span className="m-tnum">₺{money(gross)}</span></div>
                <div className="flex items-center justify-between"><span style={{ color: "#e11d48" }}>İskonto</span><span className="m-tnum" style={{ color: "#e11d48" }}>−₺{money(discount)}</span></div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold" style={{ color: "var(--m-ink-2)" }}>Toplam</span>
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
            {showProfit && (
              <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between text-[13px]">
                  <span style={{ color: "var(--m-ink-2)" }}>Maliyet</span>
                  <span className="m-tnum font-semibold" style={{ color: "var(--m-ink-2)" }}>₺{money(costTotal)}</span>
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-semibold" style={{ color: "var(--m-ink-2)" }}>Kâr</span>
                  <span className="m-tnum text-[15px] font-extrabold" style={{ color: profit >= 0 ? "var(--m-primary-2)" : "#e11d48" }}>₺{money(profit)}</span>
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span style={{ color: "var(--m-ink-2)" }}>Marj</span>
                  <span className="m-tnum font-semibold" style={{ color: profit >= 0 ? "var(--m-primary-2)" : "#e11d48" }}>%{margin}</span>
                </div>
                {!hasCost && <div className="pt-0.5 text-[11px] text-slate-400">Maliyet bulunamadı (kalem adı ürünle eşleşmiyor). Düzenle'den maliyet gir.</div>}
              </div>
            )}
          </div>

          {(() => {
            const colls = baseCollections(s);
            const got = collectedTRY(s);
            const left = total - got;
            return (
              <div className="mt-3 rounded-2xl bg-white p-4">
                <div className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-slate-400">
                  <Wallet className="h-3.5 w-3.5" /> Tahsilatlar
                </div>
                {colls.map((c, i) => (
                  <div key={c.id || i} className="flex items-center gap-2 border-b border-slate-50 py-2 last:border-0">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium">{c.description || "Tahsilat"}</div>
                      <div className="text-[12px] text-slate-400">{fmtDate(c.date)}{c.currency && c.currency !== "TRY" ? ` · ${CUR_SYM[c.currency] || c.currency}${money(c.amount)} × ${c.rate}` : ""}</div>
                    </div>
                    <span className="m-tnum text-[14px] font-semibold">₺{money(collTRY(c))}</span>
                    {c.id && <button onClick={() => removeCollection(c.id)} aria-label="Tahsilatı sil" className="m-press flex h-7 w-7 items-center justify-center text-rose-400"><X className="h-4 w-4" /></button>}
                  </div>
                ))}
                {colls.length === 0 && <div className="py-1 text-[13px] text-slate-400">Henüz tahsilat yok</div>}
                <div className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-[13px]">
                  <div className="flex justify-between"><span style={{ color: "var(--m-ink-2)" }}>Tahsil edilen</span><span className="m-tnum font-semibold">₺{money(got)}</span></div>
                  <div className="flex justify-between">
                    <span className="font-semibold" style={{ color: "var(--m-ink-2)" }}>{left < -0.5 ? "Fazla ödeme" : "Kalan"}</span>
                    <span className="m-tnum text-[15px] font-extrabold" style={{ color: Math.abs(left) <= 0.5 ? "var(--m-primary-2)" : left > 0 ? "#e11d48" : "#d9820a" }}>
                      {Math.abs(left) <= 0.5 ? "Ödendi" : `₺${money(Math.abs(left))}`}
                    </span>
                  </div>
                </div>
                <button onClick={() => setCollOpen(true)} className="m-press mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2.5 text-[14px] font-bold" style={{ color: "var(--m-primary-2)" }}>
                  <Plus className="h-4 w-4" /> Tahsilat Ekle
                </button>
                {s.phone && (
                  <a href={`https://wa.me/${waNumber(s.phone)}?text=${encodeURIComponent(statementText(s))}`} target="_blank" rel="noreferrer" className="m-press mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-[14px] font-bold text-white" style={{ background: "#25d366" }}>
                    <MessageCircle className="h-4 w-4" /> Hesap özeti gönder
                  </a>
                )}
                <CollectionSheet open={collOpen} onClose={() => setCollOpen(false)} onAdd={addCollection} />
              </div>
            );
          })()}

          {s.status !== "delivered" && (
            <button onClick={advance} disabled={advancing} className="m-press mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[15px] font-bold text-white disabled:opacity-60" style={{ background: s.status === "in_progress" ? "#2e8b7a" : "#1e73be" }}>
              {advancing && <Loader2 className="h-4 w-4 animate-spin" />}
              {s.status === "in_progress" ? "Teslim et" : "İşleme al"}
            </button>
          )}
          <label className="m-press mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white py-3 text-[14px] font-bold" style={{ color: "var(--m-primary)" }}>
            {photoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Foto ekle
            <input type="file" accept="image/*" multiple className="hidden" disabled={photoBusy} onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
          </label>
          {(s.photos || []).length > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[12px] font-bold uppercase tracking-wide text-slate-400">
                <ImageIcon className="h-3.5 w-3.5" /> Fotoğraflar ({s.photos.length})
              </div>
              <div className="grid grid-cols-3 gap-2">
                {s.photos.map((src, i) => (
                  <div key={i} className="m-press relative aspect-square overflow-hidden rounded-xl bg-slate-100" onClick={() => setLb(src)}>
                    <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    <button onClick={(e) => { e.stopPropagation(); removePhoto(i); }} aria-label="Fotoğrafı sil" className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(s.warranty_months != null || s.warranty_note) && (
            <div className="mt-3 rounded-2xl bg-white p-4">
              <div className="mb-1 text-[12px] font-bold uppercase tracking-wide text-slate-400">Garanti</div>
              <div className="text-[14px]">{s.warranty_months != null ? s.warranty_months + ' ay' : ''}{s.warranty_months != null && s.warranty_note ? ' · ' : ''}{s.warranty_note || ''}</div>
            </div>
          )}
          {s.notes && (
            <div className="mt-3 rounded-2xl bg-white p-4">
              <div className="mb-1 text-[12px] font-bold uppercase tracking-wide text-slate-400">Notlar</div>
              <div className="whitespace-pre-wrap text-[14px] leading-relaxed">{s.notes}</div>
            </div>
          )}
          {(() => {
            const m = /\[Teklif: ([^\]]*)\]/.exec(s.notes || "");
            return m && m[1] ? (
              <button onClick={() => onOpenQuote?.(m[1])} className="m-press mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3 text-[14px] font-bold" style={{ color: "#d9820a" }}>
                <FileText className="h-4 w-4" /> Kaynak teklifi aç
              </button>
            ) : null;
          })()}
          <button onClick={() => onRepeat?.(s)} className="m-press mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3 text-[14px] font-bold" style={{ color: "var(--m-primary)" }}>
            <Plus className="h-4 w-4" /> Aynı müşteriyle yeni kayıt
          </button>
          <button onClick={remove} disabled={del} className="m-press mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3 text-[14px] font-bold text-rose-500 disabled:opacity-60">
            {del ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Servis Kaydını Sil
          </button>
          <Lightbox src={lb} onClose={() => setLb(null)} />
        </>
      )}
    </Sheet>
  );
}

export default function Services({ go }) {
  const [items, setItems] = useState(() => cache.get("services") || []);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(() => !cache.get("services"));
  const [err, setErr] = useState(false);
  const [offline, setOffline] = useState(false);
  // Özet'ten yönlendirme: tek seferlik detay aç (mz:svc_open)
  const [selId, setSelId] = useState(() => { const v = cache.get("svc_open"); if (v) cache.set("svc_open", null); return v || null; });
  const [formOpen, setFormOpen] = useState(false);
  const [formInitial, setFormInitial] = useState(null);
  const [busyId, setBusyId] = useState(null);
  // Özet'ten yönlendirme: tek seferlik filtre (mz:svc_filter)
  const [byDue, setByDue] = useState(() => cache.get("svc_by_due") === true);
  useEffect(() => { cache.set("svc_by_due", byDue); }, [byDue]);
  const [statusF, setStatusF] = useState(() => { const f = cache.get("svc_filter"); if (f) cache.set("svc_filter", null); return f || ""; });
  // Ürün adı → geliş (indirimli, yoksa liste) TL haritası — kalem maliyeti boşsa kâr bundan türetilir.
  // Ortak katalog önbelleğinden (ayrı 2000'lik istek yok); Özet ekranı için "prodcost" önbelleği de yazılır.
  const catalog = useCatalog(true);
  const prodCost = useMemo(() => {
    const map = {};
    catalog.forEach((p) => {
      const name = String(p.name || "").trim().toLocaleLowerCase("tr");
      const c = (p.discounted_price > 0 ? p.discounted_price : p.list_price) * catRate(p);
      if (name && c > 0) map[name] = c;
    });
    return Object.keys(map).length ? map : cache.get("prodcost") || {};
  }, [catalog]);
  useEffect(() => { if (catalog.length) cache.set("prodcost", prodCost); }, [catalog, prodCost]);

  const reload = async () => {
    setErr(false);
    if (!cache.get("services")) setLoading(true);
    try {
      const data = await servicesApi.list();
      setItems(data); cache.set("services", data); setOffline(false);
    } catch {
      const c = cache.get("services");
      if (c) { setItems(c); setOffline(true); } else { setItems([]); setErr(true); }
    } finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, []);

  const cycleStatus = async (rec) => {
    const next = nextStatus(rec.status);
    setBusyId(rec.id);
    // Teslim'e geçerken teslim tarihi boşsa bugün yazılır (Özet "bu ay teslim" buna dayanır)
    const patch = { status: next };
    if (next === "delivered" && !rec.delivery_date) patch.delivery_date = todayISO();
    setItems((prev) => prev.map((x) => (x.id === rec.id ? { ...x, ...patch } : x))); // optimistic
    try {
      await servicesApi.update(rec.id, patch);
      toast.success(STATUS[next].label);
    } catch {
      setItems((prev) => prev.map((x) => (x.id === rec.id ? { ...x, status: rec.status, delivery_date: rec.delivery_date } : x))); // geri al
      toast.error("Durum güncellenemedi");
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLocaleLowerCase("tr");
    const key = (x) => x.arrival_date || x.created_at || "";
    return items
      .filter((x) => {
        if (statusF === "today") { if (dueBadge(x)?.label !== "Bugün teslim") return false; }
        else if (statusF === "overdue") { if (dueBadge(x)?.label !== "Gecikmiş") return false; }
        else if (statusF === "unpaid") { if (!(serviceNet(x) > 0 && serviceNet(x) - collectedTRY(x) > 0.5)) return false; }
        else if (statusF && (x.status || "received") !== statusF) return false;
        if (!s) return true;
        return [x.customer_name, x.plate, x.vehicle_brand, x.vehicle_model, x.order_no, x.phone, x.operations, ...(x.items || []).map((it) => it.name)]
          .filter(Boolean).some((v) => String(v).toLocaleLowerCase("tr").includes(s));
      })
      .sort((a, b) => {
        if (byDue) {
          // Teslim tarihi yakın olan üstte; tarihsiz/teslim edilmiş sonda
          const da = a.status !== "delivered" && a.delivery_date ? String(a.delivery_date) : "9999";
          const db = b.status !== "delivered" && b.delivery_date ? String(b.delivery_date) : "9999";
          if (da !== db) return da.localeCompare(db);
        }
        return String(key(b)).localeCompare(String(key(a))); // en yeni üstte
      });
  }, [items, q, statusF, byDue]);

  const counts = useMemo(() => {
    const c = { received: 0, in_progress: 0, delivered: 0 };
    items.forEach((x) => { const k = x.status || "received"; if (c[k] != null) c[k]++; });
    return c;
  }, [items]);

  const todayCnt = useMemo(() => items.filter((x) => dueBadge(x)?.label === "Bugün teslim").length, [items]);
  const overdueCnt = useMemo(() => items.filter((x) => dueBadge(x)?.label === "Gecikmiş").length, [items]);
  const unpaidCnt = useMemo(() => items.filter((x) => serviceNet(x) > 0 && serviceNet(x) - collectedTRY(x) > 0.5).length, [items]);
  const openNew = () => { setFormInitial(null); setFormOpen(true); };
  const openEdit = (rec) => { setSelId(null); setFormInitial(rec); setFormOpen(true); };
  // Tekrar gelen müşteri: müşteri + araç dolu yeni kayıt (taslak kullanılmaz — fromQuote ile aynı davranış)
  const openRepeat = (rec) => {
    setSelId(null);
    setFormInitial({
      fromQuote: true, key: `r-${rec.id}-${Date.now()}`,
      customer_name: rec.customer_name || "", phone: rec.phone || "",
      vehicle_brand: rec.vehicle_brand || "", vehicle_model: rec.vehicle_model || "",
      plate: rec.plate || "", is_trailer: !!rec.is_trailer, status: "received",
    });
    setFormOpen(true);
  };

  return (
    <div className="flex h-full flex-col">
      <Header
        title="Servis"
        subtitle={loading ? "Yükleniyor…" : `${items.length} kayıt`}
        right={
          <button onClick={openNew} className="m-press flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "var(--m-primary)" }}>
            <Plus className="h-5 w-5 text-white" strokeWidth={2.6} />
          </button>
        }
      />
      <SearchBar value={q} onChange={setQ} placeholder="Müşteri, plaka, araç, parça" />
      <div className="flex gap-2 overflow-x-auto px-4 pb-2" style={{ scrollbarWidth: "none" }}>
        {[["", "Tümü", items.length], ["received", "Geldi", counts.received], ["in_progress", "İşlemde", counts.in_progress], ["delivered", "Teslim", counts.delivered], ["unpaid", "Ödenmemiş", unpaidCnt], ["overdue", "Gecikmiş", overdueCnt], ["today", "Bugün", todayCnt]].filter(([id, , n]) => !["unpaid", "overdue", "today"].includes(id) || n > 0 || statusF === id).map(([id, label, n]) => {
          const on = statusF === id;
          return (
            <button key={id || "all"} onClick={() => setStatusF(id)} className={`m-press shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${on ? "" : "m-fill"}`}
              style={on ? { background: "var(--m-primary)", color: "#fff" } : { background: "#e9e9ee", color: "var(--m-ink-2)" }}>
              {label} {n > 0 && <span className="opacity-70">{n}</span>}
            </button>
          );
        })}
        <button onClick={() => setByDue((v) => !v)} className={`m-press shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${byDue ? "" : "m-fill"}`}
          style={byDue ? { background: "#d9820a", color: "#fff" } : { background: "#e9e9ee", color: "var(--m-ink-2)" }}>
          Teslime göre
        </button>
      </div>
      <OfflineBar show={offline} cacheKey="services" />
      <RefreshScroll onRefresh={reload} className="flex-1 pb-[calc(var(--m-tabbar-h)+env(safe-area-inset-bottom)+8px)]">
        {loading ? (
          <SkeletonList />
        ) : err ? (
          <ErrorState onRetry={reload} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Wrench} title="Servis kaydı yok" hint={q ? "Aramayı değiştir" : "Sağ üstteki + ile ekle"} />
        ) : (
          <div className="space-y-2 px-4 pt-1">{filtered.map((x) => <Row key={x.id} s={x} onOpen={(r) => setSelId(r.id)} onCycle={cycleStatus} busy={busyId === x.id} />)}</div>
        )}
      </RefreshScroll>
      <Detail id={selId} onClose={() => setSelId(null)} onEdit={openEdit} onDeleted={() => { setSelId(null); reload(); }} onChanged={reload} onRepeat={openRepeat} onOpenQuote={(name) => { cache.set("quote_search", name); setSelId(null); go?.("quotes"); }} prodCost={prodCost} />
      <ServiceForm key={formInitial?.id || formInitial?.key || "new"} open={formOpen} initial={formInitial} onClose={() => setFormOpen(false)} onSaved={reload} prodCost={prodCost} />
    </div>
  );
}
