import React, { createContext, useContext, useMemo, useState } from "react";
import { toast } from "sonner";
import { ShoppingCart, Minus, Plus, Trash2, Loader2, Package } from "lucide-react";
import { quotes as quotesApi } from "./api";
import { Sheet, money } from "./ui";

const CartCtx = createContext(null);
export const useCart = () => useContext(CartCtx);

function priceTRY(p) {
  const disc = Number(p.discounted_price_try);
  const list = Number(p.list_price_try);
  return disc > 0 && disc < list ? disc : list || 0;
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(new Map()); // id -> { product, qty }
  const [sheet, setSheet] = useState(false);

  const add = (product, qty = 1) => {
    setItems((prev) => {
      const n = new Map(prev);
      const cur = n.get(product.id);
      n.set(product.id, { product, qty: (cur?.qty || 0) + qty });
      return n;
    });
    toast.success("Teklife eklendi", { duration: 1200 });
  };
  const setQty = (id, qty) => setItems((prev) => {
    const n = new Map(prev);
    if (qty <= 0) n.delete(id);
    else if (n.has(id)) n.set(id, { ...n.get(id), qty });
    return n;
  });
  const remove = (id) => setQty(id, 0);
  const clear = () => setItems(new Map());

  const count = useMemo(() => Array.from(items.values()).reduce((a, x) => a + x.qty, 0), [items]);
  const total = useMemo(() => Array.from(items.values()).reduce((a, x) => a + priceTRY(x.product) * x.qty, 0), [items]);

  const value = { items, add, setQty, remove, clear, count, total, openSheet: () => setSheet(true) };
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
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  if (!cart) return null;
  const rows = Array.from(cart.items.values());

  const create = async () => {
    if (rows.length === 0) return;
    if (!name.trim()) { toast.error("Teklif/müşteri adı girin"); return; }
    setBusy(true);
    try {
      await quotesApi.create({
        name: name.trim(),
        customer_name: name.trim(),
        products: rows.map((x) => ({ id: x.product.id, quantity: x.qty })),
      });
      toast.success("Teklif oluşturuldu");
      cart.clear();
      setName("");
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Teklif oluşturulamadı");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={`Teklif (${cart.count} ürün)`} full>
      <div className="rounded-2xl bg-white p-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Teklif / müşteri adı" className="w-full rounded-xl bg-slate-100 px-3 py-2.5 text-[15px] placeholder:text-slate-400" />
      </div>

      <div className="mt-3 space-y-2">
        {rows.map((x) => {
          const p = x.product;
          return (
            <div key={p.id} className="flex items-center gap-3 rounded-2xl bg-white p-3">
              {p.image_url ? (
                <img src={p.image_url} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100"><Package className="h-5 w-5 text-slate-300" /></div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold">{p.name}</div>
                <div className="m-tnum text-[13px] font-bold" style={{ color: "var(--m-primary-2)" }}>₺{money(priceTRY(p))}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button onClick={() => cart.setQty(p.id, x.qty - 1)} className="m-press flex h-7 w-7 items-center justify-center rounded-full bg-slate-100"><Minus className="h-4 w-4" /></button>
                <span className="m-tnum w-5 text-center text-[15px] font-bold">{x.qty}</span>
                <button onClick={() => cart.setQty(p.id, x.qty + 1)} className="m-press flex h-7 w-7 items-center justify-center rounded-full bg-slate-100"><Plus className="h-4 w-4" /></button>
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={cart.clear} className="m-press mt-3 flex w-full items-center justify-center gap-1.5 py-2 text-[13px] font-semibold text-rose-500">
        <Trash2 className="h-4 w-4" /> Sepeti Temizle
      </button>

      <div className="sticky bottom-0 mt-2 pb-2 pt-2">
        <button onClick={create} disabled={busy} className="m-press flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[16px] font-bold text-white disabled:opacity-60" style={{ background: "var(--m-primary)" }}>
          {busy && <Loader2 className="h-5 w-5 animate-spin" />}
          Teklif Oluştur · ₺{money(cart.total)}
        </button>
      </div>
    </Sheet>
  );
}
