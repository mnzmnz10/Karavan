// Masaüstü teklif sepeti: Ürünler sekmesinde altta yatay çubuk. Sepet mobil ile ortak (sunucuda eşitlenir).
import React from 'react';
import { createPortal } from 'react-dom';
import { ShoppingCart, Minus, Plus, Trash2, Package, X, FileText } from 'lucide-react';
import { useCart } from '../cart/CartContext';
import { unitTRY } from '../cart/cartLogic';

const fmt = (n) => (Number(n) || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

// Ürün satırındaki ekle / adet düğmesi
export function CartAddButton({ product }) {
  const cart = useCart();
  if (!cart) return null;
  const inCart = cart.items.get(product.id);
  if (!inCart) {
    return (
      <button type="button" onClick={() => cart.add(product)} title="Teklif sepetine ekle"
        className="inline-flex h-8 items-center gap-1 rounded-full border border-[#1B3A5C]/25 bg-white px-3 text-xs font-bold text-[#1B3A5C] transition-colors hover:bg-[#1B3A5C] hover:text-white">
        <Plus className="h-3.5 w-3.5" /> Ekle
      </button>
    );
  }
  return (
    <div className="inline-flex h-8 items-center rounded-full bg-[#1B3A5C] text-white">
      <button type="button" onClick={() => cart.setQty(product.id, inCart.qty - 1)} aria-label="Adet azalt" className="flex h-8 w-7 items-center justify-center rounded-l-full hover:bg-white/15"><Minus className="h-3.5 w-3.5" /></button>
      <span className="w-6 text-center text-xs font-extrabold tabular-nums">{inCart.qty}</span>
      <button type="button" onClick={() => cart.setQty(product.id, inCart.qty + 1)} aria-label="Adet artır" className="flex h-8 w-7 items-center justify-center rounded-r-full hover:bg-white/15"><Plus className="h-3.5 w-3.5" /></button>
    </div>
  );
}

// Ürünler sekmesinin altında yatay sepet çubuğu: yalnız ürünler + Teklif Oluştur.
// Teklif Oluştur sepeti Teklifler bölümündeki A4 editöre aktarır (iskonto, işçilik, not orada).
export default function CartPanel({ imgOf, onCreate }) {
  const cart = useCart();
  if (!cart || cart.rows.length === 0) return null;
  const { rows } = cart;
  // Ekrana sabit (body'ye portal): liste uzunluğundan ve taşma ayarlı kapsayıcılardan bağımsız hep görünür.
  // Akıştaki boşluk, listenin son satırlarının çubuğun altında kalmasını önler.
  const bar = (
    <div className="fixed bottom-4 left-4 right-4 z-50" aria-label="Teklif sepeti">
      <div className="flex h-[116px] items-stretch gap-3 rounded-2xl border border-slate-200 bg-white/95 p-2.5 shadow-[0_16px_48px_rgba(15,23,42,0.22)] backdrop-blur">
        <div className="flex w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-xl bg-[#1B3A5C] text-white">
          <ShoppingCart className="h-5 w-5" />
          <span className="text-xl font-extrabold tabular-nums leading-none">{cart.count}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-white/70">ürün</span>
        </div>
        <div className="flex min-w-0 flex-1 gap-3 overflow-x-auto pb-1">
          {rows.map((x) => {
            const p = x.product;
            return (
              <div key={p.id} className="relative flex w-[210px] shrink-0 flex-col rounded-xl border border-slate-200 bg-slate-50 p-2">
                <button type="button" onClick={() => cart.remove(p.id)} aria-label={`${p.name} sepetten çıkar`}
                  className="absolute right-1.5 top-1.5 rounded-full bg-white p-1 text-slate-400 shadow-sm hover:bg-rose-50 hover:text-rose-500"><X className="h-3.5 w-3.5" /></button>
                <div className="flex gap-2">
                  {p.image_url
                    ? <img src={imgOf ? imgOf(p) : p.image_url} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-lg border border-slate-100 bg-white object-cover" />
                    : <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white"><Package className="h-5 w-5 text-slate-300" /></div>}
                  <span className="line-clamp-2 pr-4 text-xs font-semibold leading-snug text-slate-700" title={p.name}>{p.name}</span>
                </div>
                <div className="mt-auto flex items-center justify-between pt-1">
                  <div className="inline-flex h-7 items-center rounded-md border border-slate-200 bg-white">
                    <button type="button" onClick={() => cart.setQty(p.id, x.qty - 1)} aria-label="Adet azalt" className="flex h-7 w-7 items-center justify-center text-slate-500 hover:bg-slate-50"><Minus className="h-3.5 w-3.5" /></button>
                    <span className="w-7 text-center text-sm font-bold tabular-nums">{x.qty}</span>
                    <button type="button" onClick={() => cart.setQty(p.id, x.qty + 1)} aria-label="Adet artır" className="flex h-7 w-7 items-center justify-center text-slate-500 hover:bg-slate-50"><Plus className="h-3.5 w-3.5" /></button>
                  </div>
                  <span className="text-sm font-bold tabular-nums text-slate-800">₺{fmt(unitTRY(x) * x.qty)}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex w-56 shrink-0 flex-col justify-between rounded-xl bg-slate-50 p-2">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Liste toplamı</div>
              <div className="text-xl font-extrabold tabular-nums leading-tight text-slate-900">₺{fmt(cart.total)}</div>
            </div>
            <button type="button" onClick={() => { if (window.confirm('Sepet temizlensin mi?')) cart.clear(); }}
              title="Sepeti temizle" aria-label="Sepeti temizle" className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <button type="button" onClick={onCreate}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#1B3A5C] text-sm font-bold text-white hover:bg-[#1B3A5C]/90">
            <FileText className="h-5 w-5" /> Teklif Oluştur
          </button>
        </div>
      </div>
    </div>
  );
  return (
    <>
      <div className="h-36" aria-hidden="true" />
      {typeof document !== 'undefined' ? createPortal(bar, document.body) : bar}
    </>
  );
}
