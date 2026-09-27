// Masaüstü teklif sepeti: Ürünler sekmesinde altta yatay çubuk. Sepet mobil ile ortak (sunucuda eşitlenir).
import React from 'react';
import { createPortal } from 'react-dom';
import { ShoppingCart, Minus, Plus, Trash2, Package, X, FileText } from 'lucide-react';
import { useCart } from '../cart/CartContext';

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
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(1180px,calc(100vw-2rem))] -translate-x-1/2" aria-label="Teklif sepeti">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 p-2 pl-3 shadow-[0_12px_40px_rgba(15,23,42,0.18)] backdrop-blur">
        <div className="flex shrink-0 items-center gap-2 text-[#1B3A5C]">
          <ShoppingCart className="h-5 w-5" />
          <span className="rounded-full bg-[#1B3A5C] px-2 py-0.5 text-xs font-extrabold text-white">{cart.count}</span>
        </div>
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-0.5">
          {rows.map((x) => {
            const p = x.product;
            return (
              <div key={p.id} className="flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-1 pl-1 pr-1.5">
                {p.image_url
                  ? <img src={imgOf ? imgOf(p) : p.image_url} alt="" loading="lazy" className="h-8 w-8 rounded-lg object-cover" />
                  : <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white"><Package className="h-4 w-4 text-slate-300" /></div>}
                <span className="max-w-[160px] truncate text-xs font-semibold text-slate-700" title={p.name}>{p.name}</span>
                <div className="inline-flex h-6 items-center rounded-md border border-slate-200 bg-white">
                  <button type="button" onClick={() => cart.setQty(p.id, x.qty - 1)} aria-label="Adet azalt" className="flex h-6 w-5 items-center justify-center text-slate-500 hover:bg-slate-50"><Minus className="h-3 w-3" /></button>
                  <span className="w-5 text-center text-xs font-bold tabular-nums">{x.qty}</span>
                  <button type="button" onClick={() => cart.setQty(p.id, x.qty + 1)} aria-label="Adet artır" className="flex h-6 w-5 items-center justify-center text-slate-500 hover:bg-slate-50"><Plus className="h-3 w-3" /></button>
                </div>
                <button type="button" onClick={() => cart.remove(p.id)} aria-label={`${p.name} sepetten çıkar`} className="rounded p-0.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500"><X className="h-3.5 w-3.5" /></button>
              </div>
            );
          })}
        </div>
        <div className="hidden shrink-0 text-right sm:block">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Liste toplamı</div>
          <div className="text-sm font-extrabold tabular-nums text-slate-900">₺{fmt(cart.total)}</div>
        </div>
        <button type="button" onClick={() => { if (window.confirm('Sepet temizlensin mi?')) cart.clear(); }}
          title="Sepeti temizle" aria-label="Sepeti temizle" className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-500">
          <Trash2 className="h-4 w-4" />
        </button>
        <button type="button" onClick={onCreate}
          className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[#1B3A5C] px-4 text-sm font-bold text-white hover:bg-[#1B3A5C]/90">
          <FileText className="h-4 w-4" /> Teklif Oluştur
        </button>
      </div>
    </div>
  );
  return (
    <>
      <div className="h-20" aria-hidden="true" />
      {typeof document !== 'undefined' ? createPortal(bar, document.body) : bar}
    </>
  );
}
