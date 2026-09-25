// Aynı ürün birden çok tedarikçide: kayıtlar ayrı kalır, "tedarikçi grubu" ile bağlanır.
// Listede tek satır + "N firma" rozeti; açılınca tedarikçi fiyatları. Maliyet grubun en ucuzu (backend).
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Link2, Unlink, Loader2, Search, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Input } from './ui/input';
import { Badge } from './ui/badge';

const SYM = { EUR: '€', USD: '$', TRY: '₺' };
const fmt = (n) => (Number(n) || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 });

// Firma hücresi: grupluysa "N firma" (tıkla → tedarikçi satırları), değilse firma adı
export function SupplierBadge({ product, companyName, open, onToggle }) {
  const n = product.suppliers?.length || 0;
  if (n < 2) return <Badge variant="outline" className="truncate" title={companyName}>{companyName}</Badge>;
  return (
    <button type="button" onClick={onToggle} title="Tedarikçileri göster"
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 transition-colors ${open ? 'bg-[#1B3A5C] text-white ring-[#1B3A5C]' : 'bg-white text-[#1B3A5C] ring-[#1B3A5C]/30 hover:bg-slate-50'}`}>
      <Link2 className="w-3 h-3" /> {n} firma
    </button>
  );
}

// İndirimli (alış) hücresi: grupluysa en ucuz tedarikçi
export function BestCost({ product }) {
  if (!(product.suppliers?.length > 1) || product.best_discounted_price == null) {
    return product.discounted_price ? `${SYM[product.currency] || ''} ${fmt(product.discounted_price)}` : '-';
  }
  return (
    <span title={`En ucuz: ${product.best_company_name}`}>
      {SYM[product.currency] || ''} {fmt(product.best_discounted_price)}
      <span className="block text-[10px] font-semibold text-emerald-700">{product.best_company_name} · en ucuz</span>
    </span>
  );
}

// Açılır tedarikçi satırları (tablo altı)
export function SupplierRows({ product, api, colSpan, showCost, onChanged }) {
  const [busy, setBusy] = useState(null);
  const unlink = async (s) => {
    if (!window.confirm(`"${s.name}" (${s.company_name}) bu gruptan çıkarılsın mı? Ürün silinmez, ayrı satır olarak görünür.`)) return;
    setBusy(s.id);
    try { await axios.delete(`${api}/products/${s.id}/link`); toast.success('Bağlantı kaldırıldı'); onChanged?.(); }
    catch (e) { toast.error(e?.response?.data?.detail || 'Kaldırılamadı'); } finally { setBusy(null); }
  };
  return (
    <tr className="bg-slate-50/70">
      <td colSpan={colSpan} className="px-4 py-2">
        <div className="space-y-1">
          {product.suppliers.map((s) => (
            <div key={s.id} className="flex items-center gap-3 text-sm">
              <span className="w-24 shrink-0 font-bold text-slate-700 truncate">{s.company_name}</span>
              <span className="flex-1 min-w-0 truncate text-slate-500" title={s.name}>{s.name}</span>
              <span className="w-28 text-right tabular-nums text-slate-600">liste {SYM[s.currency] || ''} {fmt(s.list_price)}</span>
              {showCost && (
                <span className={`w-36 text-right tabular-nums font-semibold ${s.is_best ? 'text-emerald-700' : 'text-slate-700'}`}>
                  alış {SYM[s.currency] || ''} {fmt(s.discounted_price || s.list_price)}{s.is_best ? ' ✓' : ''}
                </span>
              )}
              <button type="button" onClick={() => unlink(s)} disabled={busy === s.id} className="p-1 text-slate-400 hover:text-rose-600" title="Gruptan çıkar">
                {busy === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>
      </td>
    </tr>
  );
}

// Bağlama penceresi: benzer isimli adaylar + arama
export function LinkDialog({ product, api, onClose, onLinked }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(null);
  useEffect(() => {
    if (!product) return;
    setList(null);
    const t = setTimeout(async () => {
      try { setList((await axios.get(`${api}/products/${product.id}/link-candidates`, { params: q.trim() ? { q: q.trim() } : {} })).data || []); }
      catch { setList([]); }
    }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [product, q, api]);
  const link = async (c) => {
    setBusy(c.id);
    try {
      await axios.post(`${api}/products/${product.id}/link`, { other_id: c.id });
      toast.success(`${c.company_name} kaydı bağlandı`);
      onLinked?.();
      onClose();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Bağlanamadı'); } finally { setBusy(null); }
  };
  return (
    <Dialog open={!!product} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Link2 className="w-5 h-5" /> Başka firmadaki aynı ürünü bağla</DialogTitle>
          <DialogDescription className="truncate">{product?.name}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md border border-slate-200 px-3">
          <Search className="w-4 h-4 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Farklı isimle arayın (ör. uyku kliması)" className="border-0 shadow-none focus-visible:ring-0 px-0" />
        </div>
        <div className="max-h-80 overflow-y-auto space-y-1.5">
          {list === null ? (
            <div className="py-6 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
          ) : list.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-400">Benzer ürün bulunamadı — farklı bir isimle arayın.</div>
          ) : list.map((c) => (
            <button key={c.id} type="button" onClick={() => link(c)} disabled={!!busy}
              className="w-full flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-emerald-300 hover:bg-emerald-50/40 disabled:opacity-60">
              <span className="w-20 shrink-0 text-xs font-bold text-slate-600 truncate">{c.company_name}</span>
              <span className="flex-1 min-w-0 truncate text-sm font-medium">{c.name}{c.linked && <span className="ml-1 text-[10px] text-slate-400">(başka grupta)</span>}</span>
              <span className="text-xs tabular-nums text-slate-500">{SYM[c.currency] || ''} {fmt(c.discounted_price || c.list_price)}</span>
              {busy === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-slate-300" />}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400">Bağlanan ürünler listede tek satır görünür; teklif ve servis maliyetinde en ucuz tedarikçinin alış fiyatı kullanılır. Her firmanın kendi fiyat güncellemesi (Excel/Termosa) etkilenmez.</p>
      </DialogContent>
    </Dialog>
  );
}
