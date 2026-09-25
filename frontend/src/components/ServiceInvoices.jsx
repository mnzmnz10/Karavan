// Servis faturaları (PDF): yükle, listede göster, sistem içi pencerede önizle / yeni sekmede aç, sil.
// Dosyalar backend'de ayrı koleksiyonda; servis kaydında yalnız liste (invoices) tutulur.
import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { FileText, Plus, Trash2, ExternalLink, Loader2, Receipt } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';

const MAX = 10 * 1024 * 1024;
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString('tr-TR'); } catch { return ''; } };

export default function ServiceInvoices({ api, service, onChange }) {
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState(null); // önizlenen fatura
  const invoices = service?.invoices || [];
  const url = (inv) => `${api}/services/${service.id}/invoices/${inv.id}`;

  const upload = async (files) => {
    if (!files?.length) return;
    setBusy(true);
    let added = 0;
    try {
      for (const f of Array.from(files)) {
        if (!/pdf$/i.test(f.type || '') && !/\.pdf$/i.test(f.name || '')) { toast.error(`${f.name}: yalnız PDF yüklenebilir`); continue; }
        if (f.size > MAX) { toast.error(`${f.name}: en fazla 10 MB`); continue; }
        const fd = new FormData();
        fd.append('file', f, f.name);
        const r = await axios.post(`${api}/services/${service.id}/invoices`, fd, { timeout: 120000 });
        onChange?.(r.data.invoices || []);
        added++;
      }
      if (added) toast.success(added === 1 ? 'Fatura eklendi' : `${added} fatura eklendi`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Fatura yüklenemedi');
    } finally { setBusy(false); }
  };

  const remove = async (inv) => {
    if (!window.confirm(`"${inv.name}" silinsin mi?`)) return;
    try {
      const r = await axios.delete(url(inv));
      onChange?.(r.data.invoices || []);
      toast.success('Fatura silindi');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Silinemedi');
    }
  };

  return (
    <div className="px-4 sm:px-8 pb-6 bg-white">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-[#1B3A5C]">
        <Receipt className="w-3.5 h-3.5" /> Faturalar{invoices.length ? ` (${invoices.length})` : ''}
      </div>
      <div className="flex flex-wrap gap-2">
        {invoices.map((inv) => (
          <div key={inv.id} className="group flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 pl-2 pr-1 py-1.5 hover:border-emerald-300">
            <button type="button" onClick={() => setView(inv)} className="flex items-center gap-2 text-left" title="Faturayı göster">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50"><FileText className="w-4 h-4 text-rose-600" /></span>
              <span className="max-w-[220px]">
                <span className="block truncate text-sm font-semibold text-slate-800">{inv.name}</span>
                <span className="block text-[11px] text-slate-500">{fmtDate(inv.uploaded_at)} · {Math.max(1, Math.round((inv.size || 0) / 1024))} KB</span>
              </span>
            </button>
            <button type="button" onClick={() => remove(inv)} className="p-1.5 text-slate-400 hover:text-rose-600" title="Faturayı sil"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        <label className={`flex items-center gap-2 rounded-xl border border-dashed border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 ${busy ? 'opacity-60' : 'cursor-pointer'}`}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Fatura ekle (PDF)
          <input type="file" accept="application/pdf,.pdf" multiple className="hidden" disabled={busy} onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
        </label>
      </div>

      <Dialog open={!!view} onOpenChange={(o) => { if (!o) setView(null); }}>
        <DialogContent className="max-w-5xl w-[95vw] p-0 overflow-hidden">
          <DialogHeader className="flex flex-row items-center justify-between gap-3 px-5 py-3 border-b border-slate-200">
            <DialogTitle className="truncate text-base">{view?.name}</DialogTitle>
            {view && (
              <Button variant="outline" size="sm" className="mr-8 shrink-0" onClick={() => window.open(url(view), '_blank')}>
                <ExternalLink className="w-4 h-4 mr-2" /> Yeni sekmede aç
              </Button>
            )}
          </DialogHeader>
          {view && <iframe title={view.name} src={url(view)} className="w-full h-[80vh] bg-slate-100" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
