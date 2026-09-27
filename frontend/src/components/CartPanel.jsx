// Masaüstü teklif sepeti: Ürünler sekmesinde sağda sabit panel. Sepet mobil ile ortak (sunucuda eşitlenir).
import React, { useState } from 'react';
import { toast } from 'sonner';
import {
  ShoppingCart, Minus, Plus, Trash2, Loader2, Package, X, Cloud, CloudOff, FileText, PenLine, ChevronDown,
} from 'lucide-react';
import { useCart } from '../cart/CartContext';
import { priceTRY, costTRY, cartTotals, discountPatch, submitCartQuote } from '../cart/cartLogic';
import { quotes as quotesApi } from '../mobile/api';

const fmt = (n) => (Number(n) || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
const inp = 'h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]/25';

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

function Money({ label, value, strong, tone }) {
  return (
    <div className={`flex items-center justify-between ${strong ? 'text-base font-extrabold text-slate-900' : 'text-sm text-slate-600'}`}>
      <span>{label}</span>
      <span className={`tabular-nums ${tone || ''}`}>{value}</span>
    </div>
  );
}

export default function CartPanel({ imgOf, customerNames = [], showCost, onCreated, onOpenEditor }) {
  const cart = useCart();
  const [busy, setBusy] = useState(false);
  if (!cart) return null;
  const { rows, form, setForm } = cart;
  const t = cartTotals(rows, form);
  const manualItems = form.manualItems || [];
  const setManual = (fn) => setForm((f) => ({ manualItems: fn(f.manualItems || []) }));
  const empty = rows.length === 0 && manualItems.length === 0;

  const create = async () => {
    setBusy(true);
    try {
      const doc = await submitCartQuote(rows, form, { create: quotesApi.create, update: quotesApi.update });
      cart.clear();
      onCreated?.(doc);
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.message || 'Teklif oluşturulamadı');
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Teklif sepeti">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-[#1B3A5C] px-4 py-3 text-white">
        <ShoppingCart className="h-5 w-5" />
        <span className="font-bold">Teklif Sepeti</span>
        {cart.count > 0 && <span className="rounded-full bg-white px-2 py-0.5 text-xs font-extrabold text-[#1B3A5C]">{cart.count}</span>}
        <span className="ml-auto flex items-center gap-1 text-[11px] text-white/70" title="Sepet telefonla ortak">
          {cart.syncState === 'offline' ? <><CloudOff className="h-3.5 w-3.5" /> çevrimdışı</>
            : cart.syncState === 'saving' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> kaydediliyor</>
              : <><Cloud className="h-3.5 w-3.5" /> telefonla ortak</>}
        </span>
        {!empty && (
          <button type="button" onClick={() => { if (window.confirm('Sepet ve teklif formu temizlensin mi?')) cart.clear(); }}
            title="Sepeti temizle" aria-label="Sepeti temizle" className="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <div className="space-y-2">
          <input value={form.name} onChange={(e) => setForm({ name: e.target.value })} placeholder="Teklif adı *" className={inp} aria-label="Teklif adı" />
          <input value={form.customer} onChange={(e) => setForm({ customer: e.target.value })} placeholder="Müşteri adı (boşsa teklif adı)" className={inp} list="cart-customers" aria-label="Müşteri adı" />
          <datalist id="cart-customers">{customerNames.map((n) => <option key={n} value={n} />)}</datalist>
        </div>

        {empty ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
            <Package className="mx-auto mb-2 h-6 w-6 text-slate-300" />
            Soldaki listeden <strong className="text-slate-500">Ekle</strong> ile ürün ekleyin.
            <div className="mt-1 text-xs">Telefonda eklediklerin de burada görünür.</div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {rows.map((x) => {
              const p = x.product;
              const custom = x.price != null && x.price !== '';
              const unit = custom ? Number(x.price) || 0 : priceTRY(p);
              return (
                <div key={p.id} className="flex gap-2.5 p-2.5">
                  {p.image_url
                    ? <img src={imgOf ? imgOf(p) : p.image_url} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-lg border border-slate-100 object-cover" />
                    : <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100"><Package className="h-4 w-4 text-slate-300" /></div>}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-1">
                      <div className="line-clamp-2 flex-1 text-[13px] font-semibold leading-snug text-slate-800" title={p.name}>{p.name}</div>
                      <button type="button" onClick={() => cart.remove(p.id)} aria-label={`${p.name} sepetten çıkar`} className="shrink-0 rounded p-0.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500"><X className="h-4 w-4" /></button>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">₺</span>
                        <input value={custom ? x.price : ''} onChange={(e) => cart.setPrice(p.id, e.target.value)} inputMode="decimal"
                          placeholder={fmt(priceTRY(p))} aria-label="Birim satış fiyatı"
                          className={`h-7 w-24 rounded-md border pl-5 pr-1.5 text-right text-xs font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]/25 ${custom ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 text-[#1B3A5C] placeholder:text-[#1B3A5C]'}`} />
                      </div>
                      <div className="inline-flex h-7 items-center rounded-md border border-slate-200">
                        <button type="button" onClick={() => cart.setQty(p.id, x.qty - 1)} aria-label="Adet azalt" className="flex h-7 w-6 items-center justify-center text-slate-500 hover:bg-slate-50"><Minus className="h-3 w-3" /></button>
                        <input value={x.qty} onChange={(e) => { const q = parseInt(e.target.value, 10); if (q > 0) cart.setQty(p.id, q); }} aria-label="Adet"
                          className="h-7 w-8 border-x border-slate-200 text-center text-xs font-bold tabular-nums focus:outline-none" />
                        <button type="button" onClick={() => cart.setQty(p.id, x.qty + 1)} aria-label="Adet artır" className="flex h-7 w-6 items-center justify-center text-slate-500 hover:bg-slate-50"><Plus className="h-3 w-3" /></button>
                      </div>
                      <span className="ml-auto text-sm font-bold tabular-nums text-slate-800">₺{fmt(unit * x.qty)}</span>
                    </div>
                    {custom && <div className="mt-0.5 text-[11px] text-slate-400">liste <span className="line-through">₺{fmt(priceTRY(p))}</span></div>}
                    {showCost && (
                      <div className="mt-0.5 text-[11px] text-slate-400">
                        alış ₺{fmt(costTRY(p))}{p.best_company_name ? ` · ${p.best_company_name}` : ''} · kâr{' '}
                        <span className={unit - costTRY(p) >= 0 ? 'font-semibold text-emerald-700' : 'font-semibold text-rose-600'}>₺{fmt((unit - costTRY(p)) * x.qty)}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {manualItems.map((m) => (
              <div key={m.key} className="space-y-1.5 bg-slate-50/60 p-2.5">
                <div className="flex items-center gap-1.5">
                  <PenLine className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <input value={m.name} onChange={(e) => setManual((l) => l.map((y) => (y.key === m.key ? { ...y, name: e.target.value } : y)))} placeholder="Kalem adı" className={`${inp} h-8`} aria-label="Elle kalem adı" />
                  <button type="button" onClick={() => setManual((l) => l.filter((y) => y.key !== m.key))} aria-label="Elle kalemi sil" className="rounded p-1 text-slate-300 hover:text-rose-500"><X className="h-4 w-4" /></button>
                </div>
                <div className="flex gap-1.5 pl-5">
                  <input value={m.price} onChange={(e) => setManual((l) => l.map((y) => (y.key === m.key ? { ...y, price: e.target.value } : y)))} inputMode="decimal" placeholder="Satış ₺" className={`${inp} h-8 text-right`} aria-label="Elle kalem satış" />
                  <input value={m.qty} onChange={(e) => setManual((l) => l.map((y) => (y.key === m.key ? { ...y, qty: e.target.value } : y)))} inputMode="numeric" placeholder="Adet" className={`${inp} h-8 w-16 text-center`} aria-label="Elle kalem adet" />
                  {showCost && <input value={m.cost} onChange={(e) => setManual((l) => l.map((y) => (y.key === m.key ? { ...y, cost: e.target.value } : y)))} inputMode="decimal" placeholder="Geliş ₺" className={`${inp} h-8 text-right`} aria-label="Elle kalem geliş" />}
                </div>
              </div>
            ))}
          </div>
        )}
        <button type="button" onClick={() => setManual((l) => [...l, { key: Math.random().toString(36).slice(2, 9), name: '', price: '', qty: 1, cost: '' }])}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold text-[#1B3A5C] hover:bg-slate-50">
          <Plus className="h-3.5 w-3.5" /> Elle kalem ekle
        </button>

        <div className="space-y-2 rounded-xl bg-slate-50 p-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <input value={form.discount} onChange={(e) => setForm(discountPatch('pct', e.target.value, t.subtotal, t.laborTL))} inputMode="decimal" placeholder="İskonto" className={`${inp} pr-7`} aria-label="İskonto yüzde" />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
            </div>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">₺</span>
              <input value={form.discTL} onChange={(e) => setForm(discountPatch('tl', e.target.value, t.subtotal, t.laborTL))} inputMode="decimal" placeholder="İskonto" className={`${inp} pl-6`} aria-label="İskonto TL" />
            </div>
          </div>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">₺</span>
            <input value={form.labor} onChange={(e) => setForm({ labor: e.target.value })} inputMode="decimal" placeholder="İşçilik" className={`${inp} pl-6`} aria-label="İşçilik" />
          </div>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-emerald-700">Net ₺</span>
            <input value={form.targetNet} onChange={(e) => setForm(discountPatch('net', e.target.value, t.subtotal, t.laborTL))} inputMode="decimal"
              placeholder="Net toplamı ayarla (indirim otomatik)" className={`${inp} border-emerald-200 bg-emerald-50/60 pl-12`} aria-label="Hedef net toplam" />
          </div>
          <details open={!!form.notes} className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-slate-500">
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" /> Teklif notu (PDF'e basılır)
            </summary>
            <textarea value={form.notes} onChange={(e) => setForm({ notes: e.target.value })} rows={3} placeholder="Not"
              className="mt-1.5 w-full resize-none rounded-lg border border-slate-200 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]/25" aria-label="Teklif notu" />
          </details>
        </div>
      </div>

      <div className="space-y-1.5 border-t border-slate-100 bg-white p-3">
        {(t.discPct > 0 || t.laborTL > 0) && <Money label="Ara toplam" value={`₺${fmt(t.subtotal)}`} />}
        {t.discPct > 0 && <Money label={`İskonto (%${t.discPct.toLocaleString('tr-TR', { maximumFractionDigits: 2 })})`} value={`−₺${fmt(t.discAmt)}`} tone="text-rose-600" />}
        {t.laborTL > 0 && <Money label="İşçilik" value={`+₺${fmt(t.laborTL)}`} />}
        <Money label="Net toplam" value={`₺${fmt(t.grand)}`} strong />
        {showCost && !empty && (
          <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs">
            <span className="text-slate-500">Maliyet ₺{fmt(t.cost)}</span>
            <span className={`font-bold ${t.profit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
              Kâr ₺{fmt(t.profit)}{t.grand > 0 ? ` · %${Math.round((t.profit / t.grand) * 100)}` : ''}
            </span>
          </div>
        )}
        <button type="button" onClick={create} disabled={busy || empty}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1B3A5C] text-sm font-bold text-white transition-colors hover:bg-[#1B3A5C]/90 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Teklif Oluştur · ₺{fmt(t.grand)}
        </button>
        <button type="button" onClick={onOpenEditor} disabled={empty}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
          A4 önizlemede detaylı düzenle
        </button>
      </div>
    </aside>
  );
}
