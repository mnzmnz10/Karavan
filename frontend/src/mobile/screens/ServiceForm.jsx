import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Plus, Trash2, Loader2, X } from "lucide-react";
import { services as servicesApi } from "../api";
import { cache } from "../cache";
import { Sheet, money } from "../ui";

const DRAFT_KEY = "service_draft";

const STATUSES = [
  { key: "received", label: "Geldi" },
  { key: "in_progress", label: "İşlemde" },
  { key: "delivered", label: "Teslim" },
];
const today = () => new Date().toISOString().slice(0, 10);

// Görsel sıkıştırma (base64 şişmesin): max kenar 1280, JPEG 0.7
function compressImage(file, max = 1280, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

function Group({ title, children }) {
  return (
    <div className="mt-4">
      {title && <div className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-wide text-slate-400">{title}</div>}
      <div className="overflow-hidden rounded-2xl bg-white">{children}</div>
    </div>
  );
}
function Field({ label, children, last }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 ${last ? "" : "border-b border-slate-100"}`}>
      <span className="w-24 shrink-0 text-[14px] font-medium" style={{ color: "var(--m-ink-2)" }}>{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
const inp = "w-full bg-transparent text-[15px] text-right placeholder:text-slate-300";

export default function ServiceForm({ open, initial, onClose, onSaved, prodCost }) {
  const editing = !!initial?.id;
  const defaults = () => ({
    customer_name: initial?.customer_name || "",
    phone: initial?.phone || "",
    vehicle_brand: initial?.vehicle_brand || "",
    vehicle_model: initial?.vehicle_model || "",
    plate: initial?.plate || "",
    is_trailer: !!initial?.is_trailer,
    arrival_date: initial?.arrival_date || today(),
    delivery_date: initial?.delivery_date || "",
    status: initial?.status || "received",
    operations: initial?.operations || "",
    items: (initial?.items || []).map((it) => ({ ...it })),
    photos: [...(initial?.photos || [])],
    notes: initial?.notes || "",
  });
  const [f, setF] = useState(() => {
    // Yeni kayıt için taslak varsa geri yükle (foto hariç — kota).
    if (!editing) {
      const d = cache.get(DRAFT_KEY);
      if (d && typeof d === "object") return { ...defaults(), ...d, photos: [] };
    }
    return defaults();
  });
  const [busy, setBusy] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const fileRef = useRef();
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  // Yeni kayıt taslağını kalıcı yap (foto hariç). Düzenlemede taslak tutulmaz.
  useEffect(() => {
    if (!editing && open) {
      const { photos, ...rest } = f;
      cache.set(DRAFT_KEY, rest);
    }
  }, [f, editing, open]);

  const clearDraft = () => { cache.set(DRAFT_KEY, null); setF(defaults()); toast.success("Taslak temizlendi"); };

  const total = useMemo(
    () => f.items.reduce((a, it) => {
      const q = parseFloat(it.qty) || 1;
      const up = parseFloat(it.unit_price) || 0;
      const rate = it.currency && it.currency !== "TRY" ? (parseFloat(it.rate) || 1) : 1;
      return a + up * q * rate;
    }, 0),
    [f.items]
  );

  const addItem = () => set("items", [...f.items, { name: "", qty: 1, unit_price: "", unit_cost: "", currency: "TRY" }]);
  // Kâr = satış − maliyet. Maliyet boşsa ürünün indirimli fiyatından (prodCost) türet, o da yoksa kâr 0.
  const lineTRY = (it, field) => {
    const q = parseFloat(it.qty) || 1;
    const v = parseFloat(it[field]) || 0;
    const rate = it.currency && it.currency !== "TRY" ? (parseFloat(it.rate) || 1) : 1;
    return v * q * rate;
  };
  const prodCostUnit = (name) => {
    const c = prodCost && prodCost[String(name || "").trim().toLocaleLowerCase("tr")];
    return c != null ? c : null;
  };
  const costLineTRY = (it) => {
    if (it.unit_cost !== "" && it.unit_cost != null) return lineTRY(it, "unit_cost");
    const pc = prodCostUnit(it.name);
    if (pc != null) return pc * (parseFloat(it.qty) || 1);
    return lineTRY(it, "unit_price");
  };
  const costTotal = useMemo(
    () => f.items.reduce((a, it) => a + costLineTRY(it), 0),
    [f.items, prodCost]
  );
  const updItem = (i, k, v) => set("items", f.items.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const delItem = (i) => set("items", f.items.filter((_, j) => j !== i));

  const onFiles = async (files) => {
    if (!files?.length) return;
    setImgBusy(true);
    try {
      const arr = [];
      for (const file of Array.from(files)) {
        try { arr.push(await compressImage(file)); } catch {}
      }
      set("photos", [...f.photos, ...arr]);
    } finally {
      setImgBusy(false);
    }
  };

  const save = async () => {
    if (!f.customer_name.trim()) { toast.error("Müşteri adı gerekli"); return; }
    setBusy(true);
    try {
      const payload = {
        ...f,
        customer_name: f.customer_name.trim(),
        plate: f.is_trailer ? "" : f.plate,
        items: f.items
          .filter((it) => (it.name || "").trim() || parseFloat(it.unit_price) > 0)
          .map((it) => ({
            name: (it.name || "").trim(),
            qty: parseFloat(it.qty) || 1,
            unit_price: parseFloat(it.unit_price) || 0,
            unit_cost: it.unit_cost === "" || it.unit_cost == null ? null : (parseFloat(it.unit_cost) || 0),
            currency: it.currency || "TRY",
            rate: it.currency && it.currency !== "TRY" ? (parseFloat(it.rate) || null) : null,
          })),
      };
      if (editing) await servicesApi.update(initial.id, payload);
      else await servicesApi.create(payload);
      toast.success(editing ? "Kayıt güncellendi" : "Servis kaydı oluşturuldu");
      if (!editing) { cache.set(DRAFT_KEY, null); setF(defaults()); } // taslağı temizle
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Kaydedilemedi");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={editing ? "Servisi Düzenle" : "Yeni Servis"} full>
      <Group title="Müşteri">
        <Field label="Ad Soyad"><input className={inp} value={f.customer_name} onChange={(e) => set("customer_name", e.target.value)} placeholder="Zorunlu" /></Field>
        <Field label="Telefon" last><input className={inp} value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="0…" inputMode="tel" /></Field>
      </Group>

      <Group title="Araç">
        <Field label="Çekme karavan">
          <div className="flex justify-end">
            <button onClick={() => set("is_trailer", !f.is_trailer)}
              className="relative h-7 w-12 rounded-full transition-colors"
              style={{ background: f.is_trailer ? "var(--m-primary-2)" : "#d1d5db" }}>
              <span className="absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all" style={{ left: f.is_trailer ? 22 : 2 }} />
            </button>
          </div>
        </Field>
        {!f.is_trailer && <Field label="Plaka"><input className={inp} value={f.plate} onChange={(e) => set("plate", e.target.value.toLocaleUpperCase("tr"))} placeholder="59 …" /></Field>}
        <Field label="Marka"><input className={inp} value={f.vehicle_brand} onChange={(e) => set("vehicle_brand", e.target.value)} placeholder="—" /></Field>
        <Field label="Model" last><input className={inp} value={f.vehicle_model} onChange={(e) => set("vehicle_model", e.target.value)} placeholder="—" /></Field>
      </Group>

      <Group title="Durum & Tarih">
        <div className="border-b border-slate-100 px-3 py-2.5">
          <div className="m-seg flex">
            {STATUSES.map((s) => (
              <button key={s.key} data-on={f.status === s.key} onClick={() => set("status", s.key)}
                className="m-seg-item flex-1 py-1.5 text-[13px] font-semibold"
                style={{ color: f.status === s.key ? "var(--m-primary)" : "var(--m-ink-2)" }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <Field label="Geliş"><input type="date" className={inp} value={f.arrival_date} onChange={(e) => set("arrival_date", e.target.value)} /></Field>
        <Field label="Teslim" last><input type="date" className={inp} value={f.delivery_date} onChange={(e) => set("delivery_date", e.target.value)} /></Field>
      </Group>

      <Group title="Yapılan İşlemler">
        <textarea rows={3} className="w-full resize-none bg-transparent px-4 py-3 text-[15px] placeholder:text-slate-300"
          value={f.operations} onChange={(e) => set("operations", e.target.value)} placeholder="Solar montaj, akü değişimi…" />
      </Group>

      <Group title="Parça / İşlem Kalemleri">
        {f.items.length === 0 && <div className="px-4 py-3 text-[13px] text-slate-400">Kalem yok</div>}
        {f.items.map((it, i) => (
          <div key={i} className="border-b border-slate-100 px-3 py-2 last:border-0">
            <div className="flex items-center gap-2">
              <input className="min-w-0 flex-1 bg-transparent text-[14px] placeholder:text-slate-300" value={it.name} onChange={(e) => updItem(i, "name", e.target.value)} placeholder="Parça/işlem" />
              <button onClick={() => delItem(i)} className="m-press shrink-0 text-rose-400"><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <input type="number" min="0" className="w-12 rounded-lg bg-slate-100 px-2 py-1 text-center text-[13px] m-tnum" value={it.qty} onChange={(e) => updItem(i, "qty", e.target.value)} placeholder="Adet" />
              <input type="number" min="0" className="min-w-0 flex-1 rounded-lg bg-slate-100 px-2 py-1 text-right text-[13px] m-tnum" value={it.unit_price} onChange={(e) => updItem(i, "unit_price", e.target.value)} placeholder="Satış" />
              <select className="rounded-lg bg-slate-100 px-1.5 py-1 text-[13px]" value={it.currency} onChange={(e) => updItem(i, "currency", e.target.value)}>
                <option value="TRY">₺</option><option value="EUR">€</option><option value="USD">$</option>
              </select>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[12px] text-slate-400">Maliyet</span>
              <input type="number" min="0" inputMode="decimal" className="w-24 rounded-lg bg-slate-100 px-2 py-1 text-right text-[13px] m-tnum" value={it.unit_cost ?? ""} onChange={(e) => updItem(i, "unit_cost", e.target.value)} placeholder="geliş" />
              {(() => {
                const prof = lineTRY(it, "unit_price") - costLineTRY(it);
                return prof > 0 ? <span className="m-tnum ml-auto text-[12px] font-semibold" style={{ color: "var(--m-primary-2)" }}>kâr ₺{money(prof)}</span> : null;
              })()}
            </div>
            {it.currency && it.currency !== "TRY" && (
              <div className="mt-1 flex items-center gap-2">
                <span className="text-[12px] text-slate-400">Kur (1 {it.currency === "USD" ? "$" : "€"} = ₺)</span>
                <input type="number" min="0" inputMode="decimal" className="w-20 rounded-lg bg-slate-100 px-2 py-1 text-right text-[13px] m-tnum" value={it.rate ?? ""} onChange={(e) => updItem(i, "rate", e.target.value)} placeholder="kur" />
                <span className="m-tnum ml-auto text-[12px] font-semibold text-slate-500">₺{money((parseFloat(it.unit_price) || 0) * (parseFloat(it.qty) || 1) * (parseFloat(it.rate) || 0))}</span>
              </div>
            )}
          </div>
        ))}
        <button onClick={addItem} className="m-press flex w-full items-center justify-center gap-1.5 px-4 py-3 text-[14px] font-semibold" style={{ color: "var(--m-primary-2)" }}>
          <Plus className="h-4 w-4" /> Kalem Ekle
        </button>
        {total > 0 && (
          <>
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
              <span className="text-[13px] font-semibold text-slate-500">Toplam (satış)</span>
              <span className="m-tnum text-[16px] font-extrabold" style={{ color: "var(--m-primary)" }}>₺{money(total)}</span>
            </div>
            {total - costTotal > 0 && (
              <div className="flex items-center justify-between px-4 pb-2.5">
                <span className="text-[12px] font-semibold text-slate-400">Kâr (maliyet ₺{money(costTotal)})</span>
                <span className="m-tnum text-[13px] font-bold" style={{ color: "var(--m-primary-2)" }}>
                  ₺{money(total - costTotal)}{total > 0 ? ` · %${Math.round((total - costTotal) / total * 100)}` : ""}
                </span>
              </div>
            )}
          </>
        )}
      </Group>

      <Group title="Fotoğraflar">
        <div className="p-3">
          <div className="grid grid-cols-3 gap-2">
            {f.photos.map((src, i) => (
              <div key={i} className="relative aspect-square overflow-hidden rounded-xl bg-slate-100">
                <img src={src} alt="" className="h-full w-full object-cover" />
                <button onClick={() => set("photos", f.photos.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button onClick={() => fileRef.current?.click()} disabled={imgBusy}
              className="m-press flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-200 text-slate-400">
              {imgBusy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
              <span className="text-[11px] font-semibold">Ekle</span>
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
        </div>
      </Group>

      <Group title="Notlar">
        <textarea rows={2} className="w-full resize-none bg-transparent px-4 py-3 text-[15px] placeholder:text-slate-300"
          value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Ek not…" />
      </Group>

      <div className="sticky bottom-0 mt-4 pb-2 pt-2">
        <button onClick={save} disabled={busy}
          className="m-press flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[16px] font-bold text-white disabled:opacity-60"
          style={{ background: "var(--m-primary)" }}>
          {busy && <Loader2 className="h-5 w-5 animate-spin" />}
          {editing ? "Kaydet" : "Servis Kaydı Oluştur"}
        </button>
        {!editing && (
          <button onClick={clearDraft} className="m-press mt-2 w-full py-2 text-[13px] font-semibold text-slate-400">
            Taslağı Temizle
          </button>
        )}
      </div>
    </Sheet>
  );
}
