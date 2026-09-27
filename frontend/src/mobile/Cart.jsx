import React, { useState } from "react";
import { toast } from "./toast";
import { ShoppingCart, Minus, Plus, Trash2, Loader2, Package, Eye, EyeOff, X } from "lucide-react";
import { quotes as quotesApi, cart as cartApi } from "./api";
import { imgOf, imgFallback } from "./img";
import { cache, customerNames } from "./cache";
import { Sheet, money } from "./ui";
import { CartProvider as SharedCartProvider, useCart } from "../cart/CartContext";
import { priceTRY, cartTotals, discountPatch, submitCartQuote } from "../cart/cartLogic";

export { useCart };

// Sepet mobil ve masaüstünde ortak (sunucuda eşitlenir); mobil sepet sayfası sağlayıcının içinde
export function CartProvider({ children }) {
  const [sheet, setSheet] = useState(false);
  return (
    <SharedCartProvider
      api={cartApi}
      storage={cache}
      onAdd={() => toast.success("Teklife eklendi", { duration: 1200, haptic: "light" })}
      extra={{ openSheet: () => setSheet(true) }}
    >
      {children}
      <CartSheet open={sheet} onClose={() => setSheet(false)} />
    </SharedCartProvider>
  );
}

// Tab bar üstünde yüzen sepet çubuğu
export function CartBar() {
  const cart = useCart();
  if (!cart || cart.count === 0) return null;
  return (
    <button
      onClick={cart.openSheet}
      className="m-press fixed inset-x-3 z-40 flex items-center gap-3 rounded-2xl px-4 py-3 text-white shadow-xl"
      style={{ bottom: "calc(var(--m-tabbar-h) + env(safe-area-inset-bottom) + 8px)", background: "var(--m-grad)" }}
    >
      <div className="relative">
        <ShoppingCart className="h-6 w-6" />
        <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-extrabold" style={{ color: "var(--m-primary)" }}>{cart.count}</span>
      </div>
      <span className="text-[15px] font-bold">Teklif Oluştur</span>
      <span className="m-tnum ml-auto text-[15px] font-extrabold">₺{money(cart.total)}</span>
    </button>
  );
}

function CartSheet({ open, onClose }) {
  const cart = useCart();
  const [showCost, setShowCost] = useState(false);    // göz: manuel kalem geliş fiyatı
  const [busy, setBusy] = useState(false);
  if (!cart) return null;
  const rows = cart.rows;
  const { name, customer, discount, discTL, targetNet, labor, notes, manualItems } = cart.form;
  const set = (k) => (v) => cart.setForm({ [k]: v });
  const setName = set("name"), setCustomer = set("customer"), setLabor = set("labor"), setNotes = set("notes");

  const { subtotal, discPct, discAmt, laborTL, grand } = cartTotals(rows, cart.form);
  const onPct = (v) => cart.setForm(discountPatch("pct", v, subtotal, laborTL));
  const onTL = (v) => cart.setForm(discountPatch("tl", v, subtotal, laborTL));
  const onTargetNet = (v) => cart.setForm(discountPatch("net", v, subtotal, laborTL));

  const setManualItems = (fn) => cart.setForm((f) => ({ manualItems: fn(f.manualItems || []) }));
  const addManual = () => setManualItems((p) => [...p, { key: Math.random().toString(36).slice(2, 9), name: "", price: "", qty: 1, cost: "" }]);
  const updManual = (key, k, v) => setManualItems((p) => p.map((m) => (m.key === key ? { ...m, [k]: v } : m)));
  const delManual = (key) => setManualItems((p) => p.filter((m) => m.key !== key));

  const create = async () => {
    setBusy(true);
    try {
      await submitCartQuote(rows, cart.form, { create: quotesApi.create, update: quotesApi.update });
      toast.success("Teklif oluşturuldu");
      cart.clear();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.message || "Teklif oluşturulamadı");
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full rounded-xl bg-slate-100 px-3 py-2.5 text-[15px] placeholder:text-slate-400";
  return (
    <Sheet open={open} onClose={onClose} title={`Teklif (${cart.count} ürün)`} full>
      <div className="space-y-2 rounded-2xl bg-white p-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Teklif adı *" className={field} />
        <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Müşteri adı (boşsa teklif adı)" className={field} list="mz-customers" />
        <datalist id="mz-customers">{customerNames().map((n) => <option key={n} value={n} />)}</datalist>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input value={discount} onChange={(e) => onPct(e.target.value)} inputMode="decimal" placeholder="İskonto" className={`${field} pr-7`} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[14px] text-slate-400">%</span>
          </div>
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-slate-400">₺</span>
            <input value={discTL} onChange={(e) => onTL(e.target.value)} inputMode="decimal" placeholder="İskonto ₺" className={`${field} pl-7`} />
          </div>
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-slate-400">₺</span>
          <input value={labor} onChange={(e) => setLabor(e.target.value)} inputMode="decimal" placeholder="İşçilik" className={`${field} pl-7`} />
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-emerald-700">Net ₺</span>
          <input value={targetNet} onChange={(e) => onTargetNet(e.target.value)} inputMode="decimal" placeholder="Net toplamı ayarla (indirim otomatik)" className={`${field.replace("bg-slate-100", "bg-emerald-50")} pl-16`} />
        </div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Teklif notları (opsiyonel, PDF'e basılır)" rows={4} className={`${field} resize-none`} />
      </div>

      {/* Elle kalem */}
      <div className="mt-3 rounded-2xl bg-white p-2">
        <div className="flex items-center px-2 pb-1 pt-1">
          <div className="text-[12px] font-bold uppercase tracking-wide text-slate-400">Elle Kalem</div>
          <button onClick={() => setShowCost((v) => !v)} aria-label="Göster/Gizle" className="m-press ml-auto flex h-5 w-5 items-center justify-center" style={{ opacity: showCost ? 0.9 : 0.28 }}>
            {showCost ? <EyeOff className="h-3.5 w-3.5" style={{ color: "var(--m-primary-2)" }} /> : <Eye className="h-3.5 w-3.5" style={{ color: "var(--m-ink-2)" }} />}
          </button>
        </div>
        {manualItems.map((m) => {
          const prof = (parseFloat(m.price) || 0) - (parseFloat(m.cost) || 0);
          return (
            <div key={m.key} className="border-b border-slate-50 px-2 py-2 last:border-0">
              <div className="flex items-center gap-2">
                <input value={m.name} onChange={(e) => updManual(m.key, "name", e.target.value)} placeholder="Kalem adı" className="min-w-0 flex-1 bg-transparent text-[14px] placeholder:text-slate-300" />
                <button onClick={() => delManual(m.key)} className="m-press shrink-0 text-rose-400"><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <input type="number" min="0" inputMode="decimal" value={m.price} onChange={(e) => updManual(m.key, "price", e.target.value)} placeholder="Satış ₺" className="min-w-0 flex-1 rounded-lg bg-slate-100 px-2 py-1 text-right text-[13px] m-tnum" />
                <input type="number" min="1" value={m.qty} onChange={(e) => updManual(m.key, "qty", e.target.value)} placeholder="Adet" className="w-14 rounded-lg bg-slate-100 px-2 py-1 text-center text-[13px] m-tnum" />
              </div>
              {showCost && (
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[12px] text-slate-400">Geliş</span>
                  <input type="number" min="0" inputMode="decimal" value={m.cost} onChange={(e) => updManual(m.key, "cost", e.target.value)} placeholder="maliyet ₺" className="w-28 rounded-lg bg-slate-100 px-2 py-1 text-right text-[13px] m-tnum" />
                  {m.cost !== "" && m.cost != null && prof !== 0 && (
                    <span className="m-tnum ml-auto text-[12px] font-semibold" style={{ color: prof >= 0 ? "var(--m-primary-2)" : "#e11d48" }}>kâr ₺{money(prof * (parseFloat(m.qty) || 1))}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <button onClick={addManual} className="m-press flex w-full items-center justify-center gap-1.5 px-2 py-2.5 text-[13px] font-semibold" style={{ color: "var(--m-primary-2)" }}>
          <Plus className="h-4 w-4" /> Elle Kalem Ekle
        </button>
      </div>

      {(discPct > 0 || laborTL > 0) && (
        <div className="mt-3 divide-y divide-slate-50 rounded-2xl bg-white py-1">
          <div className="flex items-center justify-between px-4 py-2 text-[13px]"><span style={{ color: "var(--m-ink-2)" }}>Ara toplam</span><span className="m-tnum font-semibold">₺{money(subtotal)}</span></div>
          {discPct > 0 && <div className="flex items-center justify-between px-4 py-2 text-[13px]"><span style={{ color: "var(--m-ink-2)" }}>İskonto (%{money(discPct)})</span><span className="m-tnum font-semibold" style={{ color: "#e11d48" }}>−₺{money(discAmt)}</span></div>}
          {laborTL > 0 && <div className="flex items-center justify-between px-4 py-2 text-[13px]"><span style={{ color: "var(--m-ink-2)" }}>İşçilik</span><span className="m-tnum font-semibold">+₺{money(laborTL)}</span></div>}
        </div>
      )}

      <div className="mt-3 space-y-2">
        {rows.map((x) => {
          const p = x.product;
          return (
            <div key={p.id} className="flex items-center gap-3 rounded-2xl bg-white p-3">
              {p.image_url ? (
                <img src={imgOf(p)} alt="" loading="lazy" decoding="async" className="m-img h-12 w-12 shrink-0 rounded-xl object-cover" onError={imgFallback(p)} />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100"><Package className="h-5 w-5 text-slate-300" /></div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold">{p.name}</div>
                <div className="mt-0.5 flex items-center gap-1">
                  <span className="text-[13px] text-slate-400">₺</span>
                  <input
                    value={x.price != null ? x.price : ""}
                    onChange={(e) => cart.setPrice(p.id, e.target.value)}
                    inputMode="decimal"
                    placeholder={String(Math.round(priceTRY(p)))}
                    aria-label="Birim fiyat"
                    className="m-tnum w-24 rounded-lg bg-slate-100 px-2 py-0.5 text-[13px] font-bold placeholder:text-[var(--m-primary-2)]"
                    style={{ color: x.price != null ? "#d9820a" : "var(--m-primary-2)" }}
                  />
                  {x.price != null && <span className="text-[11px] text-slate-400 line-through m-tnum">₺{money(priceTRY(p))}</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button onClick={() => cart.setQty(p.id, x.qty - 1)} className="m-press flex h-7 w-7 items-center justify-center rounded-full bg-slate-100"><Minus className="h-4 w-4" /></button>
                <span className="m-tnum w-5 text-center text-[15px] font-bold">{x.qty}</span>
                <button onClick={() => cart.setQty(p.id, x.qty + 1)} className="m-press flex h-7 w-7 items-center justify-center rounded-full bg-slate-100"><Plus className="h-4 w-4" /></button>
                <button onClick={() => cart.remove(p.id)} aria-label="Sepetten çıkar" className="m-press ml-3 flex h-7 w-7 items-center justify-center text-rose-400"><X className="h-4 w-4" /></button>
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={() => {
        if (!window.confirm("Sepet ve teklif formu temizlensin mi?")) return;
        cart.clear();
      }} className="m-press mt-3 flex w-full items-center justify-center gap-1.5 py-2 text-[13px] font-semibold text-rose-500">
        <Trash2 className="h-4 w-4" /> Sepeti Temizle
      </button>

      <div className="sticky bottom-0 mt-2 pb-2 pt-2">
        <button onClick={create} disabled={busy} className="m-press flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[16px] font-bold text-white disabled:opacity-60" style={{ background: "var(--m-grad)" }}>
          {busy && <Loader2 className="h-5 w-5 animate-spin" />}
          Teklif Oluştur · ₺{money(grand)}
        </button>
      </div>
    </Sheet>
  );
}
