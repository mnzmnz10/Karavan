import React, { useEffect, useMemo, useState } from "react";
import { Wrench, Car, Phone, MessageCircle, Image as ImageIcon, Loader2, Plus, Pencil, Share2, Trash2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { services as servicesApi, products as productsApi, docUrl, openDoc } from "../api";
import { Header, SearchBar, Card, EmptyState, ErrorState, SkeletonList, Sheet, money, Pill, Lightbox, RefreshScroll, OfflineBar } from "../ui";
import { cache } from "../cache";
import ServiceForm from "./ServiceForm";

const STATUS = {
  received: { label: "Geldi", color: "amber" },
  in_progress: { label: "İşlemde", color: "blue" },
  delivered: { label: "Teslim", color: "green" },
};
const STATUS_CYCLE = ["received", "in_progress", "delivered"];
const nextStatus = (s) => STATUS_CYCLE[(STATUS_CYCLE.indexOf(s) + 1) % STATUS_CYCLE.length];
const fmtDate = (s) => {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleDateString("tr-TR");
};
const vehicleLine = (s) => [s.vehicle_brand, s.vehicle_model].filter(Boolean).join(" ") || (s.is_trailer ? "Çekme karavan" : "");
// Teslim uyarısı: teslim edilmemiş + teslim tarihi bugün/geçmiş
const dueBadge = (s) => {
  if (!s.delivery_date || s.status === "delivered") return null;
  const today = new Date().toISOString().slice(0, 10);
  const dd = String(s.delivery_date).slice(0, 10);
  if (dd < today) return { label: "Gecikmiş", color: "red" };
  if (dd === today) return { label: "Bugün teslim", color: "amber" };
  return null;
};
// TR telefon → wa.me formatı (10 haneyi 90 ile önekle)
const waNumber = (phone) => {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = "90" + d;
  return d;
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
            {(() => { const b = dueBadge(s); return b ? <span className="ml-auto shrink-0"><Pill color={b.color}>{b.label}</Pill></span> : null; })()}
          </div>
        </div>
      </div>
    </Card>
  );
}

function Detail({ id, onClose, onEdit, onDeleted, prodCost }) {
  const [s, setS] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lb, setLb] = useState(null);
  const [del, setDel] = useState(false);
  const [showProfit, setShowProfit] = useState(() => cache.get("svc_profit") === true);
  useEffect(() => { cache.set("svc_profit", showProfit); }, [showProfit]);
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
  const total = useMemo(() => {
    if (!s) return 0;
    if ((s.items || []).length === 0 && s.cost != null) return Number(s.cost) || 0;
    return (s.items || []).reduce((a, it) => a + lineTRY(it, "unit_price"), 0);
  }, [s]);
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
              {s.order_no ? `${s.order_no} · ` : ""}Geliş: {fmtDate(s.arrival_date)}{s.delivery_date ? ` · Teslim: ${fmtDate(s.delivery_date)}` : ""}
            </div>
            {s.phone && (
              <div className="mt-3 flex gap-2">
                <a href={`tel:${s.phone}`} className="m-press flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[14px] font-bold text-white" style={{ background: "var(--m-primary)" }}>
                  <Phone className="h-4 w-4" /> Ara
                </a>
                <a href={`https://wa.me/${waNumber(s.phone)}`} target="_blank" rel="noreferrer" className="m-press flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[14px] font-bold text-white" style={{ background: "#25d366" }}>
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
                    <div className="min-w-0"><div className="truncate text-[14px] font-medium">{it.name}</div>{q > 1 && <div className="text-[12px] text-slate-400">× {q}</div>}</div>
                    <div className="shrink-0 text-right">
                      <div className="m-tnum text-[14px] font-semibold">₺{money(up * q * rate)}</div>
                      {showProfit && itemHasCost(it) && (
                        <div className="m-tnum text-[11px] text-slate-400">mlyt ₺{money(costLineTRY(it))}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-3 rounded-2xl bg-white px-4 py-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold" style={{ color: "var(--m-ink-2)" }}>Toplam</span>
                <button
                  onClick={() => setShowProfit((v) => !v)}
                  title={showProfit ? "Kârı gizle" : "Kârı göster"}
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

          {(s.photos || []).length > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[12px] font-bold uppercase tracking-wide text-slate-400">
                <ImageIcon className="h-3.5 w-3.5" /> Fotoğraflar ({s.photos.length})
              </div>
              <div className="grid grid-cols-3 gap-2">
                {s.photos.map((src, i) => (
                  <div key={i} className="m-press aspect-square overflow-hidden rounded-xl bg-slate-100" onClick={() => setLb(src)}>
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {s.notes && (
            <div className="mt-3 rounded-2xl bg-white p-4">
              <div className="mb-1 text-[12px] font-bold uppercase tracking-wide text-slate-400">Notlar</div>
              <div className="whitespace-pre-wrap text-[14px] leading-relaxed">{s.notes}</div>
            </div>
          )}
          <button onClick={remove} disabled={del} className="m-press mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3 text-[14px] font-bold text-rose-500 disabled:opacity-60">
            {del ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Servis Kaydını Sil
          </button>
          <Lightbox src={lb} onClose={() => setLb(null)} />
        </>
      )}
    </Sheet>
  );
}

export default function Services() {
  const [items, setItems] = useState(() => cache.get("services") || []);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(() => !cache.get("services"));
  const [err, setErr] = useState(false);
  const [offline, setOffline] = useState(false);
  const [selId, setSelId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formInitial, setFormInitial] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [statusF, setStatusF] = useState("");
  const [prodCost, setProdCost] = useState(() => cache.get("prodcost") || {});

  // Ürün adı → indirimli fiyat (TL) haritası — servis kaleminde maliyet boşsa kâr bundan türetilir.
  useEffect(() => {
    productsApi.list({ limit: 2000 }).then((data) => {
      const arr = Array.isArray(data) ? data : data?.products || [];
      const map = {};
      arr.forEach((p) => {
        const name = String(p.name || "").trim().toLocaleLowerCase("tr");
        if (!name) return;
        const c = Number(p.discounted_price_try) > 0 ? Number(p.discounted_price_try) : Number(p.list_price_try);
        if (c > 0) map[name] = c;
      });
      if (Object.keys(map).length) { setProdCost(map); cache.set("prodcost", map); }
    }).catch(() => {});
  }, []);

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
    setItems((prev) => prev.map((x) => (x.id === rec.id ? { ...x, status: next } : x))); // optimistic
    try {
      await servicesApi.update(rec.id, { status: next });
      toast.success(STATUS[next].label);
    } catch {
      setItems((prev) => prev.map((x) => (x.id === rec.id ? { ...x, status: rec.status } : x))); // geri al
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
        if (statusF && (x.status || "received") !== statusF) return false;
        if (!s) return true;
        return [x.customer_name, x.plate, x.vehicle_brand, x.vehicle_model, x.order_no, x.phone]
          .filter(Boolean).some((v) => v.toLocaleLowerCase("tr").includes(s));
      })
      .sort((a, b) => String(key(b)).localeCompare(String(key(a)))); // en yeni üstte
  }, [items, q, statusF]);

  const counts = useMemo(() => {
    const c = { received: 0, in_progress: 0, delivered: 0 };
    items.forEach((x) => { const k = x.status || "received"; if (c[k] != null) c[k]++; });
    return c;
  }, [items]);

  const openNew = () => { setFormInitial(null); setFormOpen(true); };
  const openEdit = (rec) => { setSelId(null); setFormInitial(rec); setFormOpen(true); };

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
      <SearchBar value={q} onChange={setQ} placeholder="Müşteri, plaka, araç" />
      <div className="flex gap-2 overflow-x-auto px-4 pb-2" style={{ scrollbarWidth: "none" }}>
        {[["", "Tümü", items.length], ["received", "Geldi", counts.received], ["in_progress", "İşlemde", counts.in_progress], ["delivered", "Teslim", counts.delivered]].map(([id, label, n]) => {
          const on = statusF === id;
          return (
            <button key={id || "all"} onClick={() => setStatusF(id)} className={`m-press shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${on ? "" : "m-fill"}`}
              style={on ? { background: "var(--m-primary)", color: "#fff" } : { background: "#e9e9ee", color: "var(--m-ink-2)" }}>
              {label} {n > 0 && <span className="opacity-70">{n}</span>}
            </button>
          );
        })}
      </div>
      <OfflineBar show={offline} />
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
      <Detail id={selId} onClose={() => setSelId(null)} onEdit={openEdit} onDeleted={() => { setSelId(null); reload(); }} prodCost={prodCost} />
      <ServiceForm key={formInitial?.id || "new"} open={formOpen} initial={formInitial} onClose={() => setFormOpen(false)} onSaved={reload} prodCost={prodCost} />
    </div>
  );
}
