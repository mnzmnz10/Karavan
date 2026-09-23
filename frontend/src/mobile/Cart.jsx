import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "./toast";
import { ShoppingCart, Minus, Plus, Trash2, Loader2, Package, Eye, EyeOff, X } from "lucide-react";
import { quotes as quotesApi } from "./api";
import { cache, customerNames } from "./cache";
import { Sheet, money } from "./ui";

const CartCtx = createContext(null);
export const useCart = () => useContext(CartCtx);

// Satış = LİSTE fiyatı (backend teklifi list_price_try'den hesaplar; indirimli = alış, müşteriye gösterilmez)
function priceTRY(p) {
  return Number(p.list_price_try) || 0;
}
// Ürünün TL kuru (1 birim döviz = ? ₺) — özel fiyatı ürün para birimine çevirmek için
const rateOf = (p) => ((p.currency || "TRY") === "TRY" ? 1 : (Number(p.list_price) > 0 ? Number(p.list_price_try) / Number(p.list_price) : 0));
// Satır birim satış (TL): özel fiyat girildiyse o, yoksa liste
const unitTRY = (x) => (x.price != null && x.price !== "" ? Number(x.price) || 0 : priceTRY(x.product));

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    const saved = cache.get("cart"); // [{product, qty}]
    const m = new Map();
    if (Array.isArray(saved)) saved.forEach((x) => { if (x?.product?.id) m.set(x.product.id, { product: x.product, qty: x.qty || 1, price: x.price ?? null }); });
    return m;
  });
  const [sheet, setSheet] = useState(false);

  // Sepeti kalıcı yap (app kapanınca/yenilenince yarım teklif korunur)
  useEffect(() => { cache.set("cart", Array.from(items.values())); }, [items]);

  const add = (product, qty = 1) => {
    setItems((prev) => {
      const n = new Map(prev);
      const cur = n.get(product.id);
      n.set(product.id, { product, qty: (cur?.qty || 0) + qty, price: cur?.price ?? null });
      return n;
    });
    toast.success("Teklife eklendi", { duration: 1200, haptic: "light" });
  };
  const setQty = (id, qty) => setItems((prev) => {
    const n = new Map(prev);
    if (qty <= 0) n.delete(id);
    else if (n.has(id)) n.set(id, { ...n.get(id), qty });
    return n;
  });
  const remove = (id) => setQty(id, 0);
  // Özel satış fiyatı (TL); boş → listeye döner
  const setPrice = (id, price) => setItems((prev) => {
    const n = new Map(prev);
    if (n.has(id)) n.set(id, { ...n.get(id), price: price === "" || price == null ? null : price });
    return n;
  });
  const clear = () => setItems(new Map());

  const count = useMemo(() => Array.from(items.values()).reduce((a, x) => a + x.qty, 0), [items]);
  const total = useMemo(() => Array.from(items.values()).reduce((a, x) => a + unitTRY(x) * x.qty, 0), [items]);

  const value = { items, add, setQty, setPrice, remove, clear, count, total, openSheet: () => setSheet(true) };
  return (
    <CartCtx.Provider value={value}>
      {children}
      <CartSheet open={sheet} onClose={() => setSheet(false)} />
    </CartCtx.Provider>
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
      style={{ bottom: "calc(var(--m-tabbar-h) + env(safe-area-inset-bottom) + 8px)", background: "var(--m-primary)" }}
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
  // Form taslağı kalıcı (sepet gibi): uygulama kapanınca ad/müşteri/indirim/işçilik/not/manuel kalemler kaybolmaz
  const draft0 = (() => { const d = cache.get("cart_form"); return d && typeof d === "object" ? d : {}; })();
  const [name, setName] = useState(draft0.name || "");
  const [customer, setCustomer] = useState(draft0.customer || "");
  const [discount, setDiscount] = useState(draft0.discount || ""); // %
  const [discTL, setDiscTL] = useState(draft0.discTL || "");     // ₺ (yüzde ile senkron)
  const [targetNet, setTargetNet] = useState(draft0.targetNet || ""); // hedef net toplam
  const [discMode, setDiscMode] = useState(draft0.discMode || "pct"); // son düzenlenen: pct | tl | net
  const [labor, setLabor] = useState(draft0.labor || "");
  const [notes, setNotes] = useState(draft0.notes || "");
  const [manualItems, setManualItems] = useState(Array.isArray(draft0.manualItems) ? draft0.manualItems : []); // elle girilen kalemler
  useEffect(() => {
    cache.set("cart_form", { name, customer, discount, discTL, targetNet, discMode, labor, notes, manualItems });
  }, [name, customer, discount, discTL, targetNet, discMode, labor, notes, manualItems]);
  const [showCost, setShowCost] = useState(false);    // göz: manuel kalem geliş fiyatı
  const [busy, setBusy] = useState(false);
  if (!cart) return null;
  const rows = Array.from(cart.items.values());

  const manualTotal = manualItems.reduce((a, m) => a + (parseFloat(m.price) || 0) * (parseFloat(m.qty) || 1), 0);
  const subtotal = cart.total + manualTotal;

  // İndirim çift yön: % girilince ₺ hesaplanır, ₺ girilince % hesaplanır. Net hedefi indirimi tam ayarlar.
  const onPct = (v) => {
    setDiscMode("pct");
    setDiscount(v); setTargetNet("");
    const pct = Math.min(100, Math.max(0, parseFloat(v) || 0));
    setDiscTL(pct > 0 && subtotal > 0 ? String(Math.round(subtotal * pct / 100)) : "");
  };
  const onTL = (v) => {
    setDiscMode("tl");
    setDiscTL(v); setTargetNet("");
    const tl = Math.max(0, parseFloat(v) || 0);
    setDiscount(tl > 0 && subtotal > 0 ? String(Math.min(100, tl / subtotal * 100)) : ""); // tam, yuvarlama yok
  };
  const onTargetNet = (v) => {
    setDiscMode("net");
    setTargetNet(v);
    const target = parseFloat(v);
    if (isNaN(target)) { setDiscount(""); setDiscTL(""); return; }
    const discAmt = Math.max(0, Math.min(subtotal, subtotal + laborTL - target));
    setDiscount(subtotal > 0 ? String(discAmt / subtotal * 100) : "");
    setDiscTL(String(Math.round(discAmt)));
  };

  const discPct = Math.min(100, Math.max(0, parseFloat(discount) || 0));
  const laborTL = Math.max(0, parseFloat(labor) || 0);
  const discAmt = subtotal * (discPct / 100);
  const grand = subtotal - discAmt + laborTL;

  const addManual = () => setManualItems((p) => [...p, { key: Math.random().toString(36).slice(2, 9), name: "", price: "", qty: 1, cost: "" }]);
  const updManual = (key, k, v) => setManualItems((p) => p.map((m) => (m.key === key ? { ...m, [k]: v } : m)));
  const delManual = (key) => setManualItems((p) => p.filter((m) => m.key !== key));

  const create = async () => {
    const validManual = manualItems.filter((m) => (m.name || "").trim() && parseFloat(m.price) > 0);
    if (rows.length === 0 && validManual.length === 0) { toast.error("En az bir ürün veya kalem ekleyin"); return; }
    if (!name.trim()) { toast.error("Teklif adı girin"); return; }
    setBusy(true);
    try {
      const doc = await quotesApi.create({
        name: name.trim(),
        customer_name: (customer.trim() || name.trim()),
        discount_percentage: discPct,
        labor_cost: laborTL,
        notes: notes.trim() || undefined,
        products: [
          ...rows.map((x) => {
            const o = { id: x.product.id, quantity: x.qty };
            // Özel fiyat ürün para biriminde gönderilir (backend custom_price × güncel kur)
            if (x.price != null && x.price !== "" && rateOf(x.product) > 0) o.custom_price = (Number(x.price) || 0) / rateOf(x.product);
            return o;
          }),
          ...validManual.map((m) => ({
            manual: true,
            name: m.name.trim(),
            price: parseFloat(m.price) || 0,
            quantity: Math.max(1, parseInt(m.qty) || 1),
            cost: m.cost === "" || m.cost == null ? undefined : (parseFloat(m.cost) || 0),
            currency: "TRY",
          })),
        ],
      });
      // Sepetteki TL fiyatlar eklendiği anın kuruyla; sunucu güncel kurla fiyatlar. Kullanıcı ₺ indirim ya da
      // hedef net girdiyse yüzdeyi sunucunun gerçek tabanıyla yeniden hesapla → net/indirim TAM tutar.
      const base = Number(doc?.total_discounted_price) || 0;
      let wantPct = null;
      if (discMode === "net" && Number.isFinite(parseFloat(targetNet)) && base > 0) {
        wantPct = Math.min(100, Math.max(0, (base + laborTL - parseFloat(targetNet)) / base * 100));
      } else if (discMode === "tl" && parseFloat(discTL) > 0 && base > 0) {
        wantPct = Math.min(100, parseFloat(discTL) / base * 100);
      }
      if (wantPct != null && doc?.id && Math.abs(wantPct - discPct) > 1e-9) {
        try { await quotesApi.update(doc.id, { discount_percentage: wantPct }); } catch {}
      }
      toast.success("Teklif oluşturuldu");
      cart.clear();
      setName(""); setCustomer(""); setDiscount(""); setDiscTL(""); setTargetNet(""); setDiscMode("pct"); setLabor(""); setNotes(""); setManualItems([]);
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Teklif oluşturulamadı");
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
                <img src={p.image_url} alt="" loading="lazy" decoding="async" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
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
                <button onClick={() => cart.remove(p.id)} aria-label="Sepetten çıkar" className="m-press ml-1 flex h-7 w-7 items-center justify-center text-rose-400"><X className="h-4 w-4" /></button>
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={() => {
        if (!window.confirm("Sepet ve teklif formu temizlensin mi?")) return;
        cart.clear();
        setName(""); setCustomer(""); setDiscount(""); setDiscTL(""); setTargetNet(""); setDiscMode("pct"); setLabor(""); setNotes(""); setManualItems([]);
      }} className="m-press mt-3 flex w-full items-center justify-center gap-1.5 py-2 text-[13px] font-semibold text-rose-500">
        <Trash2 className="h-4 w-4" /> Sepeti Temizle
      </button>

      <div className="sticky bottom-0 mt-2 pb-2 pt-2">
        <button onClick={create} disabled={busy} className="m-press flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[16px] font-bold text-white disabled:opacity-60" style={{ background: "var(--m-primary)" }}>
          {busy && <Loader2 className="h-5 w-5 animate-spin" />}
          Teklif Oluştur · ₺{money(grand)}
        </button>
      </div>
    </Sheet>
  );
}
