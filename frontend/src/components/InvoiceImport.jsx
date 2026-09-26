// Alış faturasından fiyat güncelleme: e-Fatura XML/ZIP (doğrudan), PDF/foto (AI) → kalemler ürünlerle eşlenir,
// kullanıcı onaylar: alış fiyatı güncellenir / yeni ürün eklenir / başka firmadaki ürüne tedarikçi olarak bağlanır.
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Receipt, Loader2, Upload, AlertTriangle, CheckCircle2, Search, Plus, Building2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';

const SYM = { EUR: '€', USD: '$', TRY: '₺' };
const fmt = (n) => (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NEW = '__new';
const SKIP = '__skip';
const SEARCH = '__search';
const selCls = 'h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]/30';

export const convert = (amount, from, to, rates) => {
  if (!amount || from === to) return amount;
  const tl = amount * (from === 'TRY' ? 1 : rates?.[from] || 0);
  const r = to === 'TRY' ? 1 : rates?.[to] || 0;
  return tl && r ? tl / r : null;
};

// Sistemdeki alış fiyatları KDV dahil tutuluyor → faturadaki KDV hariç net fiyata KDV eklenir (seçilebilir)
export const withVat = (amount, vat, incl) => (incl && vat ? amount * (1 + vat / 100) : amount);
const VAT_KEY = 'invoice_vat_incl';
const readVatPref = () => { try { return localStorage.getItem(VAT_KEY) !== '0'; } catch { return true; } };
const r2 = (n) => Math.round(n * 100) / 100;

// Satırın seçimine göre yapılacak işlem
export const lineAction = (ln, companyId) => {
  if (ln.sel === SKIP) return 'skip';
  if (ln.sel === NEW) return 'create';
  if (!ln.product) return 'skip';
  return ln.product.company_id === companyId ? 'update' : 'add_supplier';
};

const ACTION_BADGE = {
  update: ['Alış güncellenir', 'bg-sky-50 text-sky-800 border-sky-200'],
  add_supplier: ['Tedarikçi eklenir', 'bg-violet-50 text-violet-800 border-violet-200'],
  create: ['Yeni ürün', 'bg-emerald-50 text-emerald-800 border-emerald-200'],
  skip: ['Atlanır', 'bg-slate-50 text-slate-500 border-slate-200'],
};

// Sunucu satırı → düzenlenebilir satır
const toRow = (ln) => ({
  ...ln,
  product: ln.match || null,
  sel: ln.match ? ln.match.id : NEW,
  list_base: ln.gross_price && ln.gross_price > ln.unit_price ? ln.gross_price : ln.unit_price,
  list_price: null, // null = otomatik (liste fiyatı, KDV seçimine göre)
  category_id: 'none',
  q: '',
  results: null,
});

function ProductSearch({ api, companies, onPick }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  useEffect(() => {
    if (q.trim().length < 2) { setList([]); return undefined; }
    const t = setTimeout(async () => {
      try {
        const r = await axios.get(`${api}/products`, { params: { search: q.trim(), limit: 8 } });
        setList(r.data || []);
      } catch { setList([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [q, api]);
  const cname = (id) => companies.find((c) => c.id === id)?.name || '';
  return (
    <div className="mt-1.5 rounded-md border border-slate-200 bg-white p-1.5">
      <div className="flex items-center gap-1.5 px-1">
        <Search className="w-3.5 h-3.5 text-slate-400" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ürün adıyla ara"
          className="h-7 flex-1 text-sm outline-none" />
      </div>
      {list.map((p) => (
        <button key={p.id} type="button" onClick={() => onPick({ ...p, company_name: cname(p.company_id) })}
          className="block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-slate-100">
          <span className="font-semibold text-slate-500">{cname(p.company_id)}</span> · {p.name}
        </button>
      ))}
    </div>
  );
}

function InvoiceView({ inv, api, companies, categories, rates, vatIncl, onCompaniesChanged, onApplied }) {
  const [companyId, setCompanyId] = useState(inv.company?.id || '');
  const [rows, setRows] = useState(() => inv.lines.map(toRow));
  const [dup, setDup] = useState(inv.duplicate);
  const [busy, setBusy] = useState(false);
  const [rematching, setRematching] = useState(false);

  const unitOf = (r) => withVat(r.unit_price, r.vat, vatIncl);
  const listOf = (r) => (r.list_price === null ? String(r2(withVat(r.list_base, r.vat, vatIncl))) : r.list_price);
  const setRow = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const changeCompany = async (cid) => {
    setCompanyId(cid);
    if (!cid) return;
    setRematching(true);
    try {
      const r = await axios.post(`${api}/purchase-invoices/match`, { company_id: cid, invoice_no: inv.invoice_no, tax_id: inv.tax_id, lines: inv.lines });
      setRows(r.data.lines.map(toRow));
      setDup(r.data.duplicate);
    } catch (e) { toast.error(e?.response?.data?.detail || 'Eşleştirilemedi'); } finally { setRematching(false); }
  };

  const createCompany = async () => {
    const name = window.prompt('Yeni firma adı', (inv.supplier_name || '').replace(/\s+(SAN\.?|TİC\.?|LTD\.?|ŞTİ\.?|A\.Ş\.?|VE)(\s|$).*/i, '').trim());
    if (!name) return;
    try {
      const r = await axios.post(`${api}/companies`, { name });
      onCompaniesChanged?.();
      toast.success(`${r.data.name} eklendi`);
      await changeCompany(r.data.id);
    } catch (e) { toast.error(e?.response?.data?.detail || 'Firma eklenemedi'); }
  };

  const pick = (i, value) => {
    const r = rows[i];
    if (value === SEARCH) { setRow(i, { searching: true }); return; }
    const product = value === NEW || value === SKIP ? null : r.candidates.find((c) => c.id === value) || [r.product, r.match].find((c) => c?.id === value) || null;
    setRow(i, { sel: value, product, searching: false });
  };

  const summary = useMemo(() => rows.reduce((acc, r) => { const a = lineAction(r, companyId); acc[a] = (acc[a] || 0) + 1; return acc; }, {}), [rows, companyId]);
  const actionable = rows.length - (summary.skip || 0);

  const apply = async () => {
    if (!companyId) { toast.error('Faturanın firmasını seçin'); return; }
    if (dup && !window.confirm('Bu fatura daha önce işlenmiş. Yine de uygulansın mı?')) return;
    setBusy(true);
    try {
      const lines = rows.map((r) => ({
        action: lineAction(r, companyId), product_id: r.product?.id || null, name: r.name, code: r.code || '', brand: r.brand || '',
        qty: r.qty, unit_price: Math.round(unitOf(r) * 10000) / 10000, currency: r.currency,
        list_price: parseFloat(String(listOf(r)).replace(',', '.')) || null,
        category_id: r.category_id !== 'none' ? r.category_id : null,
      }));
      const res = (await axios.post(`${api}/purchase-invoices/apply`, {
        company_id: companyId, supplier_name: inv.supplier_name, tax_id: inv.tax_id, invoice_no: inv.invoice_no, date: inv.date, file: inv.file, lines,
      })).data;
      const parts = [res.updated && `${res.updated} fiyat güncellendi`, res.created && `${res.created} ürün eklendi`, res.added && `${res.added} tedarikçi eklendi`].filter(Boolean);
      toast.success(parts.join(', ') || 'Değişiklik yok');
      if (res.errors?.length) toast.error(`${res.errors.length} satır uygulanamadı: ${res.errors[0]}`);
      onApplied(inv);
    } catch (e) { toast.error(e?.response?.data?.detail || 'Uygulanamadı'); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="bg-slate-50 px-4 py-3 flex flex-wrap items-start gap-x-6 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="font-bold text-slate-800 truncate" title={inv.supplier_name}>{inv.supplier_name || 'Satıcı okunamadı'}</div>
          <div className="text-xs text-slate-500 space-x-2">
            {inv.tax_id && <span>VKN {inv.tax_id}</span>}
            {inv.invoice_no && <span>No {inv.invoice_no}</span>}
            {inv.date && <span>{inv.date}</span>}
            {inv.total ? <span>Toplam {SYM[inv.currency] || ''} {fmt(inv.total)}</span> : null}
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {inv.source === 'xml'
              ? <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">e-Fatura XML · kesin veri</Badge>
              : <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">Yapay zekâ ile okundu · fiyatları kontrol edin</Badge>}
            {inv.type && inv.type !== 'SATIS' && <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">Tür: {inv.type}</Badge>}
          </div>
        </div>
        <div className="w-full sm:w-72">
          <label className="text-xs font-semibold text-slate-600 flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> Firma
            {inv.company && companyId === inv.company.id && <span className="font-normal text-slate-400">(otomatik: {inv.company.by === 'vkn' ? 'VKN' : 'isim'})</span>}
          </label>
          <div className="mt-1 flex gap-1.5">
            <select className={selCls} value={companyId} onChange={(e) => changeCompany(e.target.value)} aria-label="Faturanın firması">
              <option value="">Firma seçin…</option>
              {[...companies].sort((a, b) => a.name.localeCompare(b.name, 'tr')).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <Button type="button" size="sm" variant="outline" onClick={createCompany} title="Yeni firma ekle" aria-label="Yeni firma ekle"><Plus className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>
      {dup && (
        <div className="flex items-center gap-2 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          <AlertTriangle className="w-4 h-4 shrink-0" /> Bu fatura {new Date(dup).toLocaleDateString('tr-TR')} tarihinde işlenmiş.
        </div>
      )}
      <div className={`overflow-x-auto ${rematching ? 'opacity-50 pointer-events-none' : ''}`}>
        <table className="w-full text-sm">
          <thead className="bg-white text-xs text-slate-500">
            <tr className="border-b">
              <th className="px-3 py-2 text-left font-semibold">Faturadaki kalem</th>
              <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">Birim alış ({vatIncl ? 'KDV dahil' : 'KDV hariç'})</th>
              <th className="px-3 py-2 text-left font-semibold w-[34%]">Sistemdeki ürün</th>
              <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">Alış: şimdi → yeni</th>
              <th className="px-3 py-2 text-left font-semibold">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const act = lineAction(r, companyId);
              const p = r.product;
              const pcur = p?.currency || r.currency;
              const now = p ? Number(p.discounted_price || p.list_price) || 0 : null;
              const next = act === 'update' ? convert(unitOf(r), r.currency, pcur, rates) : null;
              const pct = now && next ? ((next - now) / now) * 100 : null;
              const opts = [...r.candidates];
              if (p && !opts.some((c) => c.id === p.id)) opts.unshift(p);
              return (
                <tr key={i} className={`border-b last:border-0 align-top ${act === 'skip' ? 'opacity-50' : ''}`}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{r.name}</div>
                    <div className="text-xs text-slate-400">{r.code && `Kod ${r.code} · `}{r.qty} adet{r.vat != null && ` · KDV %${r.vat}`}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    <div className="font-semibold">{SYM[r.currency] || ''} {fmt(unitOf(r))}</div>
                    {vatIncl && r.vat ? <div className="text-xs text-slate-400">KDV hariç {fmt(r.unit_price)} · %{r.vat}</div> : null}
                    {vatIncl && !r.vat ? <div className="text-xs text-amber-600">KDV oranı yok</div> : null}
                    {r.discount ? <div className="text-xs text-slate-400">liste {fmt(r.gross_price)} · %{r.discount} isk.</div> : null}
                  </td>
                  <td className="px-3 py-2">
                    <select className={selCls} value={r.sel} onChange={(e) => pick(i, e.target.value)} aria-label={`${r.name} için ürün`}>
                      {opts.map((c) => (
                        <option key={c.id} value={c.id}>{c.company_name ? `${c.company_name} · ` : ''}{c.name}</option>
                      ))}
                      <option value={SEARCH}>🔍 Başka ürün ara…</option>
                      <option value={NEW}>＋ Yeni ürün olarak ekle</option>
                      <option value={SKIP}>Atla</option>
                    </select>
                    {r.searching && (
                      <ProductSearch api={api} companies={companies}
                        onPick={(prod) => setRow(i, { product: prod, sel: prod.id, searching: false, candidates: [prod, ...r.candidates.filter((c) => c.id !== prod.id)] })} />
                    )}
                    {p && r.match?.by && r.sel === r.match.id && <div className="mt-0.5 text-[11px] text-slate-400">eşleşme: {r.match.by}{r.match.by !== 'önceki fatura' ? ` · %${Math.round(r.match.score * 100)}` : ''}</div>}
                    {(act === 'create' || act === 'add_supplier') && (
                      <div className="mt-1.5 flex gap-1.5">
                        <label className="flex-1 text-[11px] text-slate-500">Liste fiyatı ({r.currency})
                          <Input inputMode="decimal" value={listOf(r)} onChange={(e) => setRow(i, { list_price: e.target.value })} className="h-8 mt-0.5" />
                        </label>
                        {act === 'create' && (
                          <label className="flex-1 text-[11px] text-slate-500">Kategori
                            <select className={`${selCls} h-8 mt-0.5`} value={r.category_id} onChange={(e) => setRow(i, { category_id: e.target.value })}>
                              <option value="none">Kategorisiz</option>
                              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </label>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {act === 'update' && p ? (
                      <>
                        <div className="text-slate-500">{SYM[pcur] || ''} {fmt(now)} → <span className="font-semibold text-slate-900">{next != null ? fmt(next) : '?'}</span></div>
                        {pct != null && Math.abs(pct) >= 0.05 && (
                          <div className={`text-xs font-semibold ${pct > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{pct > 0 ? '▲' : '▼'} %{Math.abs(pct).toFixed(1)}</div>
                        )}
                        {pct != null && Math.abs(pct) < 0.05 && <div className="text-xs text-slate-400">aynı</div>}
                      </>
                    ) : act === 'add_supplier' ? (
                      <span className="text-xs text-slate-500">{p.company_name} ürününe bağlanır</span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${ACTION_BADGE[act][1]}`}>{ACTION_BADGE[act][0]}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-slate-50 px-4 py-3">
        <div className="text-xs text-slate-500">
          {Object.entries(summary).filter(([k]) => k !== 'skip').map(([k, n]) => `${n} ${ACTION_BADGE[k][0].toLowerCase()}`).join(' · ')}
          {summary.skip ? ` · ${summary.skip} atlanır` : ''}
        </div>
        <Button onClick={apply} disabled={busy || !companyId || !actionable} className="bg-[#1B3A5C] hover:bg-[#1B3A5C]/90">
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />} Onayla ve uygula ({actionable})
        </Button>
      </div>
    </div>
  );
}

export default function InvoiceImport({ api, companies, categories, onCompaniesChanged, onDone }) {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [vatIncl, setVatIncl] = useState(readVatPref);
  const toggleVat = (v) => { setVatIncl(v); try { localStorage.setItem(VAT_KEY, v ? '1' : '0'); } catch { /* yoksay */ } };

  const read = async () => {
    if (!files.length) return;
    setBusy(true);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      const r = await axios.post(`${api}/purchase-invoices/parse`, fd, { timeout: 180000 });
      setResult(r.data);
      if (!r.data.invoices.length) toast.error(r.data.errors?.[0] || 'Faturada kalem bulunamadı');
    } catch (e) { toast.error(e?.response?.data?.detail || 'Fatura okunamadı'); } finally { setBusy(false); }
  };

  const applied = (inv) => {
    setResult((r) => ({ ...r, invoices: r.invoices.filter((x) => x !== inv) }));
    onDone?.();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Receipt className="w-5 h-5" /> Faturadan Fiyat Güncelle</CardTitle>
        <CardDescription>
          Tedarikçiden gelen faturayı yükleyin: kalemler ürünlerinizle eşleşir, alış fiyatları güncellenir, olmayan ürünler eklenir.
          En doğru sonuç için muhasebe programınızdan <strong>e-Fatura XML</strong> (veya ZIP) indirin; PDF ve fotoğraf yapay zekâ ile okunur.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex-1 min-w-[220px] cursor-pointer rounded-lg border-2 border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500 hover:border-[#1B3A5C]/40">
            <input type="file" multiple accept=".xml,.zip,.pdf,image/*" className="hidden"
              onChange={(e) => { setFiles(Array.from(e.target.files || []).slice(0, 10)); setResult(null); e.target.value = ''; }} />
            <Upload className="w-4 h-4 inline mr-2" />
            {files.length ? files.map((f) => f.name).join(', ') : 'Fatura seçin (XML, ZIP, PDF, fotoğraf · birden çok olabilir)'}
          </label>
          <Button onClick={read} disabled={!files.length || busy} className="bg-[#1B3A5C] hover:bg-[#1B3A5C]/90">
            {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Okunuyor…</> : 'Faturayı oku'}
          </Button>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
          <input type="checkbox" checked={vatIncl} onChange={(e) => toggleVat(e.target.checked)} className="h-4 w-4 accent-[#1B3A5C]" />
          Fiyatları <strong>KDV dahil</strong> kaydet
          <span className="text-xs text-slate-400">(faturadaki KDV hariç birim fiyata satırın KDV'si eklenir)</span>
        </label>
        {result?.errors?.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 space-y-0.5">
            {result.errors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}
        {result?.invoices?.map((inv) => (
          <InvoiceView key={`${inv.file}-${inv.invoice_no}`} inv={inv} api={api} companies={companies} categories={categories}
            rates={result.rates} vatIncl={vatIncl} onCompaniesChanged={onCompaniesChanged} onApplied={applied} />
        ))}
      </CardContent>
    </Card>
  );
}
