import React, { useEffect, useMemo, useState } from "react";
import { ScrollText, User, Share2, Loader2, CheckCircle2, Trash2, Plus, Pencil, X, Copy, Phone, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import http, { docUrl, openDoc } from "../api";
import { Header, SearchBar, Card, EmptyState, ErrorState, SkeletonList, Sheet, money, Pill, RefreshScroll, OfflineBar, todayISO, waNumber, fmtDate } from "../ui";
import { cache, customerNames, phoneForCustomer } from "../cache";
import { formatPhoneTR } from "./ServiceForm";

const contractsApi = {
  list: () => http.get("/contracts").then((r) => r.data),
  update: (id, payload) => http.put(`/contracts/${id}`, payload).then((r) => r.data),
  remove: (id) => http.delete(`/contracts/${id}`).then((r) => r.data),
  create: (payload) => http.post("/contracts/new", payload).then((r) => r.data),
  copy: (id) => http.post(`/contracts/${id}/copy`).then((r) => r.data),
};
const STAGE = {
  proposal: { label: "Teklif", color: "amber" },
  agreed: { label: "Anlaşıldı", color: "green" },
};
const grand = (c) => Number(c?.data?.grandTotal || c?.grandTotal || 0);
const custName = (c) => c?.customer_name || c?.data?.customer_name || "";
const custPhone = (c) => c?.customer_phone || c?.data?.customer_phone || "";
const custTc = (c) => c?.customer_tc || c?.data?.customer_tc || "";

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
            {c.stage === "agreed" && (c.data?.collections || []).length > 0 && <span className="ml-auto shrink-0"><Pill color="green">{c.data.collections.length} tahsilat</Pill></span>}
          </div>
        </div>
      </div>
    </Card>
  );
}

function Detail({ c, onClose, onStage, staging, onDeleted, onEditItems, onCopy, onAddCollection, onDeleteCollection }) {
  const [del, setDel] = useState(false);
  const [copying, setCopying] = useState(false);
  const copy = async () => {
    if (copying) return;
    setCopying(true);
    try { await onCopy?.(c); } finally { setCopying(false); }
  };
  if (!c) return null;
  const st = STAGE[c.stage] || STAGE.proposal;
  const remove = async () => {
    if (del) return;
    if (!window.confirm(`"${custName(c) || c.title || "Bu sözleşme"}" silinsin mi?`)) return;
    setDel(true);
    try { await contractsApi.remove(c.id); toast.success("Sözleşme silindi"); onDeleted?.(); }
    catch { toast.error("Silinemedi"); setDel(false); }
  };
  const agreed = c.stage === "agreed";
  const d = c.data || {};
  const sections = Array.isArray(d.sections) ? d.sections : [];
  const addons = Array.isArray(d.addons) ? d.addons : [];
  const addonTL = (a) => (parseFloat(a.amount) || 0) * (parseFloat(a.qty) || 1) * (a.currency === "TRY" ? 1 : (parseFloat(a.rate) || 0));
  const ilaveToplam = addons.filter((a) => !a.is_gift).reduce((s, a) => s + addonTL(a), 0);
  const hediyeToplam = addons.filter((a) => a.is_gift).reduce((s, a) => s + addonTL(a), 0);
  const collections = Array.isArray(d.collections) ? d.collections : [];
  const collTL = (x) => (parseFloat(x.amount) || 0) * (x.currency === "TRY" ? 1 : (parseFloat(x.rate) || 1));
  const tahsilToplam = collections.reduce((s, x) => s + collTL(x), 0);
  const curSym = (c) => (c === "TRY" ? "₺" : c === "USD" ? "$" : "€");
  return (
    <Sheet open={!!c} onClose={onClose} title="Sözleşme" full>
      <div className="mb-3 flex gap-2">
        <button onClick={() => !staging && onStage(c)} disabled={staging} className="m-press flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-3 text-[15px] font-bold text-white disabled:opacity-60" style={{ background: agreed ? "#d97706" : "var(--m-primary-2)" }}>
          {staging ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {agreed ? "Teklife Al" : "Anlaşıldı"}
        </button>
        <button onClick={() => openDoc(docUrl.contract(c.id))} className="m-press flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-[15px] font-bold text-white" style={{ background: "var(--m-primary)" }}>
          <Share2 className="h-4 w-4" /> PDF / Excel
        </button>
      </div>
      <div className="mb-3 flex gap-2">
        {Array.isArray(c.data?.sections) && c.data.sections.length > 0 && (
          <button onClick={() => onEditItems?.(c)} className="m-press flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white py-2.5 text-[14px] font-bold" style={{ color: "var(--m-primary)" }}>
            <Pencil className="h-4 w-4" /> Kalemleri Düzenle
          </button>
        )}
        <button onClick={copy} disabled={copying} className="m-press flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white py-2.5 text-[14px] font-bold disabled:opacity-60" style={{ color: "var(--m-ink-2)" }}>
          {copying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />} Kopyala
        </button>
      </div>

      <div className="rounded-2xl bg-white p-4">
        <div className="flex items-center gap-2">
          <div className="text-[19px] font-bold leading-snug">{custName(c) || "Sözleşme"}</div>
          <span className="ml-auto"><Pill color={st.color}>{st.label}</Pill></span>
        </div>
        {c.title && <div className="mt-1 text-[13px]" style={{ color: "var(--m-ink-2)" }}>{c.title}</div>}
        <div className="mt-1 text-[12px] text-slate-400">{fmtDate(c.created_at)}{custTc(c) ? ` · TC: ${custTc(c)}` : ""}</div>
        {custPhone(c) && (
          <div className="mt-3 flex gap-2">
            <a href={`tel:${custPhone(c)}`} className="m-press flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[14px] font-bold text-white" style={{ background: "var(--m-primary)" }}>
              <Phone className="h-4 w-4" /> Ara
            </a>
            <a href={`https://wa.me/${waNumber(custPhone(c))}?text=${encodeURIComponent(`Merhaba ${custName(c) || ""}, ${c.title ? c.title + " " : ""}sözleşmeniz hakkında yazıyorum. — Çorlu Karavan`.replace("Merhaba , ", "Merhaba, "))}`} target="_blank" rel="noreferrer" className="m-press flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[14px] font-bold text-white" style={{ background: "#25d366" }}>
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
          </div>
        )}
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
          {ilaveToplam > 0 && (
            <div className="flex items-center justify-between px-2 pt-2 text-[13px]">
              <span className="font-semibold" style={{ color: "var(--m-ink-2)" }}>İlaveler Toplamı</span>
              <span className="m-tnum font-bold">₺{money(ilaveToplam)}</span>
            </div>
          )}
          {hediyeToplam > 0 && (
            <div className="flex items-center justify-between px-2 pt-1 text-[13px]">
              <span className="font-semibold" style={{ color: "#db2777" }}>Hediyeler Toplamı</span>
              <span className="m-tnum font-bold" style={{ color: "#db2777" }}>₺{money(hediyeToplam)}</span>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 rounded-2xl bg-white p-2">
        <div className="flex items-center px-2 pb-1 pt-1">
          <div className="text-[12px] font-bold uppercase tracking-wide text-slate-400">Tahsilatlar</div>
          <button onClick={() => onAddCollection?.(c)} className="m-press ml-auto flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ background: "#e7f3ee", color: "var(--m-primary-2)" }}>
            <Plus className="h-3.5 w-3.5" /> Ekle
          </button>
        </div>
        {collections.length === 0 ? (
          <div className="px-2 py-3 text-[13px] text-slate-400">Henüz tahsilat yok</div>
        ) : (
          <>
            {collections.map((x, i) => (
              <div key={x.id || i} className="flex items-center justify-between gap-2 border-b border-slate-50 px-2 py-2 last:border-0">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium">{x.description || "Tahsilat"}</div>
                  {x.date && <div className="text-[11px] text-slate-400">{fmtDate(x.date)}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="m-tnum text-[13px] font-semibold" style={{ color: "var(--m-primary-2)" }}>{curSym(x.currency)}{money((parseFloat(x.amount) || 0))}</div>
                  <button onClick={() => { if (window.confirm(`"${x.description || "Tahsilat"}" silinsin mi?`)) onDeleteCollection?.(c, i); }} className="m-press text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between px-2 pt-2">
              <span className="text-[13px] font-semibold" style={{ color: "var(--m-ink-2)" }}>Tahsil Edilen Toplam</span>
              <span className="m-tnum text-[15px] font-extrabold" style={{ color: "var(--m-primary-2)" }}>₺{money(tahsilToplam)}</span>
            </div>
          </>
        )}
      </div>

      {grand(c) > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-white px-4 py-3.5">
          <span className="text-[14px] font-semibold" style={{ color: "var(--m-ink-2)" }}>Sözleşme Toplamı</span>
          <span className="m-tnum text-[20px] font-extrabold" style={{ color: "var(--m-primary)" }}>₺{money(grand(c))}</span>
        </div>
      )}
      {ilaveToplam > 0 && (
        <div className="mt-1 px-4 text-[11px]" style={{ color: "var(--m-ink-2)" }}>
          İlaveler ₺{money(ilaveToplam)} ayrıca eklenir (nihai tutar PDF'te). Hediyeler ödemeye dahil değildir.
        </div>
      )}
      <button onClick={remove} disabled={del} className="m-press mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3 text-[14px] font-bold text-rose-500 disabled:opacity-60">
        {del ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Sözleşmeyi Sil
      </button>
    </Sheet>
  );
}

// Kalem editörü — desktop formülü birebir: item.total = eurUnit*qty*kur, grandTotal = Σ item.total (addon'lar hariç/dokunulmaz)
function ItemsEditor({ c, open, onClose, onSaved }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [snap, setSnap] = useState("");
  useEffect(() => {
    if (open && c?.data) { setData(JSON.parse(JSON.stringify(c.data))); setSnap(JSON.stringify(c.data)); } // deep copy (addon'lar dahil korunur)
  }, [open, c]);
  // Kaydedilmemiş değişiklik varsa kapatmadan önce sor
  const guardedClose = () => {
    if (!busy && data && snap && JSON.stringify(data) !== snap && !window.confirm("Kaydedilmemiş değişiklikler silinsin mi?")) return;
    onClose();
  };

  const kur = Number(data?.kur) || 0;
  const recalc = (d) => {
    let gt = 0;
    (d.sections || []).forEach((sec) => (sec.items || []).forEach((it) => {
      const eur = parseFloat(it.eurUnit) || 0, qty = parseFloat(it.qty) || 0;
      it.tlUnit = eur * kur;
      it.total = eur * qty * kur;
      gt += it.total;
    }));
    d.grandTotal = gt;
    d.eurTotal = kur ? gt / kur : null;
    return d;
  };
  const mutate = (fn) => setData((prev) => { const d = JSON.parse(JSON.stringify(prev)); fn(d); return recalc(d); });
  const updItem = (si, ii, k, v) => mutate((d) => { d.sections[si].items[ii][k] = v; });
  const delItem = (si, ii) => mutate((d) => { d.sections[si].items.splice(ii, 1); });
  const addItem = (si) => mutate((d) => { d.sections[si].items = d.sections[si].items || []; d.sections[si].items.push({ name: "", eurUnit: "", qty: 1, total: 0, tlUnit: 0 }); });
  // İlaveler (grandTotal'a dahil değil — ayrı gösterilir; toplam etkisi yok)
  const rateFor = (cur) => (cur === "TRY" ? 1 : kur); // EUR/USD → kur (addon kendi rate'ini taşır; EUR varsayılan)
  const updAddon = (i, k, v) => mutate((d) => {
    d.addons = d.addons || [];
    d.addons[i][k] = v;
    if (k === "currency") d.addons[i].rate = rateFor(v); // currency değişince rate güncelle
  });
  const delAddon = (i) => mutate((d) => { d.addons.splice(i, 1); });
  const addAddon = () => mutate((d) => { d.addons = d.addons || []; d.addons.push({ name: "", amount: "", currency: "EUR", qty: 1, rate: rateFor("EUR"), is_gift: false }); });
  const curSym = (c) => (c === "TRY" ? "₺" : c === "USD" ? "$" : "€");

  const grand = Number(data?.grandTotal) || 0;
  const save = async () => {
    setBusy(true);
    try {
      const updated = await contractsApi.update(c.id, { data });
      toast.success("Kalemler kaydedildi");
      onSaved?.(updated);
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Kaydedilemedi");
    } finally { setBusy(false); }
  };

  if (!c) return null;
  return (
    <Sheet open={open} onClose={guardedClose} title="Kalemleri Düzenle" full>
      {!data ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : (
        <>
          <div className="mb-2 px-1 text-[12px]" style={{ color: "var(--m-ink-2)" }}>
            1 € = ₺{money(kur)} · Fiyatlar € girilir, ₺ otomatik hesaplanır. İlaveler/hediyeler grandTotal'a dahil değil (ayrı gösterilir).
          </div>
          {(data.sections || []).map((sec, si) => (
            <div key={si} className="mt-3 rounded-2xl bg-white p-2">
              {sec.name && <div className="px-2 pb-1 pt-1 text-[12px] font-bold uppercase tracking-wide text-slate-400">{sec.name}</div>}
              {(sec.items || []).map((it, ii) => (
                <div key={ii} className="border-b border-slate-50 px-2 py-2 last:border-0">
                  <div className="flex items-center gap-2">
                    <input className="min-w-0 flex-1 bg-transparent text-[14px] placeholder:text-slate-300" value={it.name || ""} onChange={(e) => updItem(si, ii, "name", e.target.value)} placeholder="Kalem adı" />
                    <button onClick={() => delItem(si, ii)} className="m-press shrink-0 text-rose-400"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="relative w-24">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-slate-400">€</span>
                      <input type="number" min="0" inputMode="decimal" className="w-full rounded-lg bg-slate-100 py-1 pl-5 pr-2 text-right text-[13px] m-tnum" value={it.eurUnit ?? ""} onChange={(e) => updItem(si, ii, "eurUnit", e.target.value)} placeholder="Birim" />
                    </div>
                    <input type="number" min="0" inputMode="decimal" className="w-14 rounded-lg bg-slate-100 px-2 py-1 text-center text-[13px] m-tnum" value={it.qty ?? ""} onChange={(e) => updItem(si, ii, "qty", e.target.value)} placeholder="Adet" />
                    <span className="m-tnum ml-auto shrink-0 text-[13px] font-semibold">₺{money((parseFloat(it.eurUnit) || 0) * (parseFloat(it.qty) || 0) * kur)}</span>
                  </div>
                </div>
              ))}
              <button onClick={() => addItem(si)} className="m-press flex w-full items-center justify-center gap-1.5 px-2 py-2.5 text-[13px] font-semibold" style={{ color: "var(--m-primary-2)" }}>
                <Plus className="h-4 w-4" /> Kalem Ekle
              </button>
            </div>
          ))}
          {/* İlaveler / Hediyeler */}
          <div className="mt-3 rounded-2xl bg-white p-2">
            <div className="px-2 pb-1 pt-1 text-[12px] font-bold uppercase tracking-wide text-slate-400">İlaveler / Hediyeler</div>
            {(data.addons || []).map((a, i) => (
              <div key={i} className="border-b border-slate-50 px-2 py-2 last:border-0">
                <div className="flex items-center gap-2">
                  <input className="min-w-0 flex-1 bg-transparent text-[14px] placeholder:text-slate-300" value={a.name || ""} onChange={(e) => updAddon(i, "name", e.target.value)} placeholder="İlave adı" />
                  <button onClick={() => updAddon(i, "is_gift", !a.is_gift)} className="m-press shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold" style={a.is_gift ? { background: "#fce7f3", color: "#db2777" } : { background: "#eef0f3", color: "var(--m-ink-2)" }}>
                    🎁 Hediye
                  </button>
                  <button onClick={() => delAddon(i)} className="m-press shrink-0 text-rose-400"><Trash2 className="h-4 w-4" /></button>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <input type="number" min="0" inputMode="decimal" className="min-w-0 flex-1 rounded-lg bg-slate-100 px-2 py-1 text-right text-[13px] m-tnum" value={a.amount ?? ""} onChange={(e) => updAddon(i, "amount", e.target.value)} placeholder="Tutar" />
                  <select className="rounded-lg bg-slate-100 px-1.5 py-1 text-[13px]" value={a.currency || "EUR"} onChange={(e) => updAddon(i, "currency", e.target.value)}>
                    <option value="TRY">₺</option><option value="EUR">€</option><option value="USD">$</option>
                  </select>
                  <input type="number" min="0" inputMode="decimal" className="w-14 rounded-lg bg-slate-100 px-2 py-1 text-center text-[13px] m-tnum" value={a.qty ?? ""} onChange={(e) => updAddon(i, "qty", e.target.value)} placeholder="Adet" />
                  <span className="m-tnum shrink-0 text-[13px] font-semibold" style={a.is_gift ? { color: "#db2777" } : {}}>
                    {curSym(a.currency)}{money((parseFloat(a.amount) || 0) * (parseFloat(a.qty) || 1))}{a.is_gift ? " (hediye)" : ""}
                  </span>
                </div>
              </div>
            ))}
            <button onClick={addAddon} className="m-press flex w-full items-center justify-center gap-1.5 px-2 py-2.5 text-[13px] font-semibold" style={{ color: "var(--m-primary-2)" }}>
              <Plus className="h-4 w-4" /> İlave Ekle
            </button>
          </div>

          <div className="sticky bottom-0 mt-3 pb-2 pt-2" style={{ background: "var(--m-bg)" }}>
            <div className="mb-2 flex items-center justify-between rounded-2xl bg-white px-4 py-3">
              <span className="text-[14px] font-semibold" style={{ color: "var(--m-ink-2)" }}>Genel Toplam</span>
              <span className="m-tnum text-[19px] font-extrabold" style={{ color: "var(--m-primary)" }}>₺{money(grand)}</span>
            </div>
            <button onClick={save} disabled={busy} className="m-press flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-bold text-white disabled:opacity-60" style={{ background: "var(--m-primary)" }}>
              {busy && <Loader2 className="h-5 w-5 animate-spin" />} Kaydet
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

// Tahsilat ekle — d.collections'a bir ödeme ekler (rate=kur, amountEUR hesap), PUT {data}
function CollectionSheet({ c, open, onClose, onSaved }) {
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("TRY");
  const [date, setDate] = useState(() => todayISO());
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setDesc(""); setAmount(""); setCurrency("TRY"); setDate(todayISO()); } }, [open]);
  if (!c) return null;
  const kur = Number(c.data?.kur) || 0;
  const amt = parseFloat(amount) || 0;
  const save = async () => {
    if (amt <= 0) { toast.error("Tutar girin"); return; }
    setBusy(true);
    try {
      const d = JSON.parse(JSON.stringify(c.data || {}));
      d.collections = Array.isArray(d.collections) ? d.collections : [];
      const rate = kur || 1;
      const amountEUR = currency === "EUR" ? amt : (kur ? amt / kur : amt);
      d.collections.push({ id: Math.random().toString(36).slice(2, 10), date, description: desc.trim().toLocaleUpperCase("tr"), amount: String(amt), currency, rate, amountEUR });
      const updated = await contractsApi.update(c.id, { data: d });
      toast.success("Tahsilat eklendi");
      onSaved?.(updated);
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Eklenemedi");
    } finally { setBusy(false); }
  };
  const field = "w-full rounded-xl bg-slate-100 px-3 py-2.5 text-[15px] placeholder:text-slate-400";
  return (
    <Sheet open={open} onClose={onClose} title="Tahsilat Ekle">
      <div className="space-y-2 rounded-2xl bg-white p-3">
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Açıklama (Peşinat, Nakit…)" className={field} />
        <div className="flex gap-2">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Tutar" className={`${field} flex-1`} />
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="rounded-xl bg-slate-100 px-3 text-[15px]">
            <option value="TRY">₺</option><option value="EUR">€</option>
          </select>
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
      </div>
      {currency === "EUR" && kur > 0 && (
        <div className="mt-2 px-1 text-[12px]" style={{ color: "var(--m-ink-2)" }}>≈ ₺{money(amt * kur)} (1 € = ₺{money(kur)})</div>
      )}
      <button onClick={save} disabled={busy} className="m-press mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-bold text-white disabled:opacity-60" style={{ background: "var(--m-primary-2)" }}>
        {busy && <Loader2 className="h-5 w-5 animate-spin" />} Kaydet
      </button>
    </Sheet>
  );
}

function CreateSheet({ open, onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [tc, setTc] = useState("");
  const [notes, setNotes] = useState("");
  const [kur, setKur] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTitle(""); setName(""); setPhone(""); setTc(""); setNotes(""); setKur(""); } }, [open]);

  const create = async () => {
    if (!title.trim()) { toast.error("Başlık gerekli"); return; }
    setBusy(true);
    try {
      const doc = await contractsApi.create({
        title: title.trim(),
        customer_name: name.trim() || undefined,
        customer_phone: phone.trim() || undefined,
        customer_tc: tc.trim() || undefined,
        notes: notes.trim() || undefined,
        kur: kur ? parseFloat(kur) : undefined,
      });
      toast.success("Sözleşme oluşturuldu (katalog yüklendi)");
      onCreated?.(doc);
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Oluşturulamadı");
    } finally {
      setBusy(false);
    }
  };
  const field = "w-full rounded-xl bg-slate-100 px-3 py-2.5 text-[15px] placeholder:text-slate-400";
  return (
    <Sheet open={open} onClose={onClose} title="Yeni Sözleşme">
      <div className="space-y-2 rounded-2xl bg-white p-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Başlık *" className={field} />
        <input
          value={name}
          onChange={(e) => {
            const v = e.target.value;
            setName(v);
            // Bilinen müşteri seçildiyse (eski servis kaydı) telefonu doldur — boşsa
            if (!phone) { const ph = phoneForCustomer(v); if (ph) setPhone(formatPhoneTR(ph)); }
          }}
          placeholder="Müşteri adı"
          list="mz-customers-c"
          className={field}
        />
        <datalist id="mz-customers-c">{customerNames().map((n) => <option key={n} value={n} />)}</datalist>
        <div className="flex gap-2">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={(e) => setPhone(formatPhoneTR(e.target.value))} placeholder="Telefon" inputMode="tel" className={`${field} flex-1`} />
          <input value={tc} onChange={(e) => setTc(e.target.value)} placeholder="TC" inputMode="numeric" className={`${field} flex-1`} />
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-slate-400">€ kuru</span>
          <input value={kur} onChange={(e) => setKur(e.target.value)} inputMode="decimal" placeholder="boşsa varsayılan" className={`${field} pl-20 text-right`} />
        </div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Not" rows={2} className={`${field} resize-none`} />
      </div>
      <div className="mt-2 px-1 text-[12px] leading-relaxed" style={{ color: "var(--m-ink-2)" }}>
        Karavan genel fiyatlandırma kataloğu otomatik yüklenir. Kalemleri sonra düzenleyebilirsin.
      </div>
      <button onClick={create} disabled={busy} className="m-press mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-bold text-white disabled:opacity-60" style={{ background: "var(--m-primary)" }}>
        {busy && <Loader2 className="h-5 w-5 animate-spin" />} Oluştur
      </button>
    </Sheet>
  );
}

export default function Contracts() {
  const [items, setItems] = useState(() => cache.get("contracts") || []);
  const [q, setQ] = useState("");
  const [stageF, setStageF] = useState(""); // "" | proposal | agreed
  const [loading, setLoading] = useState(() => !cache.get("contracts"));
  const [err, setErr] = useState(false);
  const [offline, setOffline] = useState(false);
  const [sel, setSel] = useState(null);
  const [staging, setStaging] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editItems, setEditItems] = useState(null);
  const [collFor, setCollFor] = useState(null);

  const reload = async () => {
    setErr(false);
    if (!cache.get("contracts")) setLoading(true);
    try {
      const data = await contractsApi.list();
      setItems(data); cache.set("contracts", data); setOffline(false);
    } catch {
      const c = cache.get("contracts");
      if (c) { setItems(c); setOffline(true); } else { setItems([]); setErr(true); }
    } finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, []);

  const toggleStage = async (c) => {
    const next = c.stage === "agreed" ? "proposal" : "agreed";
    setStaging(true);
    try {
      await contractsApi.update(c.id, { stage: next });
      setItems((prev) => prev.map((x) => (x.id === c.id ? { ...x, stage: next } : x)));
      setSel((s) => (s && s.id === c.id ? { ...s, stage: next } : s));
      toast.success(next === "agreed" ? "Anlaşıldı" : "Teklif aşamasına alındı");
    } catch {
      toast.error("Güncellenemedi");
    } finally {
      setStaging(false);
    }
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLocaleLowerCase("tr");
    const byStage = stageF ? items.filter((c) => (c.stage === "agreed" ? "agreed" : "proposal") === stageF) : items;
    const digits = /^[\d\s+()-]+$/.test(s) ? s.replace(/\D/g, "").replace(/^0/, "") : "";
    const base = !s ? byStage : byStage.filter((c) =>
      [custName(c), c.title].filter(Boolean).some((v) => v.toLocaleLowerCase("tr").includes(s)) ||
      (digits.length >= 4 && (String(custPhone(c)).replace(/\D/g, "").includes(digits) || String(custTc(c)).includes(digits)))
    );
    return [...base].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))); // en yeni üstte
  }, [items, q, stageF]);
  const agreedCnt = items.filter((c) => c.stage === "agreed").length;

  return (
    <div className="flex h-full flex-col">
      <Header
        title="Sözleşmeler"
        subtitle={loading ? "Yükleniyor…" : `${items.length} sözleşme`}
        right={
          <button onClick={() => setCreateOpen(true)} aria-label="Yeni sözleşme" className="m-press flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "var(--m-primary)" }}>
            <Plus className="h-5 w-5 text-white" strokeWidth={2.6} />
          </button>
        }
      />
      <SearchBar value={q} onChange={setQ} placeholder="Müşteri, başlık, telefon" />
      <div className="flex gap-2 overflow-x-auto px-4 pb-2" style={{ scrollbarWidth: "none" }}>
        {[["", "Tümü", items.length], ["proposal", "Teklif", items.length - agreedCnt], ["agreed", "Anlaşıldı", agreedCnt]].map(([id, label, n]) => {
          const on = stageF === id;
          return (
            <button key={id || "all"} onClick={() => setStageF(id)} className={`m-press shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${on ? "" : "m-fill"}`}
              style={on ? { background: "var(--m-primary)", color: "#fff" } : { background: "#e9e9ee", color: "var(--m-ink-2)" }}>
              {label} {n > 0 && <span className="opacity-70">{n}</span>}
            </button>
          );
        })}
      </div>
      <OfflineBar show={offline} cacheKey="contracts" />
      <RefreshScroll onRefresh={reload} className="flex-1 pb-[calc(var(--m-tabbar-h)+env(safe-area-inset-bottom)+8px)]">
        {loading ? (
          <SkeletonList />
        ) : err ? (
          <ErrorState onRetry={reload} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={ScrollText} title="Sözleşme bulunamadı" hint={q ? "Aramayı değiştir" : "Henüz sözleşme yok"} />
        ) : (
          <div className="space-y-2 px-4 pt-1">{filtered.map((c) => <Row key={c.id} c={c} onOpen={setSel} />)}</div>
        )}
      </RefreshScroll>
      <Detail
        c={sel}
        onClose={() => setSel(null)}
        onStage={toggleStage}
        staging={staging}
        onDeleted={() => { setSel(null); reload(); }}
        onEditItems={(c) => setEditItems(c)}
        onAddCollection={(c) => setCollFor(c)}
        onDeleteCollection={async (c, idx) => {
          try {
            const d = JSON.parse(JSON.stringify(c.data || {}));
            (d.collections || []).splice(idx, 1);
            const u = await contractsApi.update(c.id, { data: d });
            toast.success("Tahsilat silindi");
            setSel((s) => (s && s.id === u.id ? { ...s, ...u } : s));
            setItems((prev) => prev.map((x) => (x.id === u.id ? { ...x, ...u } : x)));
          } catch (e) { toast.error("Silinemedi"); }
        }}
        onCopy={async (c) => {
          try { const doc = await contractsApi.copy(c.id); toast.success("Sözleşme kopyalandı"); await reload(); setSel(doc); }
          catch (e) { toast.error(e?.response?.data?.detail || "Kopyalanamadı"); }
        }}
      />
      <CreateSheet open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(doc) => { reload(); setSel(doc); }} />
      <ItemsEditor c={editItems} open={!!editItems} onClose={() => setEditItems(null)} onSaved={(u) => { setEditItems(null); setSel((s) => (s && u && s.id === u.id ? { ...s, ...u } : s)); setItems((prev) => prev.map((x) => (u && x.id === u.id ? { ...x, ...u } : x))); }} />
      <CollectionSheet c={collFor} open={!!collFor} onClose={() => setCollFor(null)} onSaved={(u) => { setCollFor(null); setSel((s) => (s && u && s.id === u.id ? { ...s, ...u } : s)); setItems((prev) => prev.map((x) => (u && x.id === u.id ? { ...x, ...u } : x))); }} />
    </div>
  );
}
