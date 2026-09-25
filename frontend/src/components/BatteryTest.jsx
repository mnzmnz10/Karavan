// Akü Test (masaüstü): fotoğrafı seç → yapay zekâ değerleri okur → durum KURALLA anında belirlenir.
// Değer düzeltilince durum yeniden hesaplanır (yapay zekâ yok). Fotoğraflar elle döndürülebilir. PDF + geçmiş.
import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Battery, Loader2, X, Plus, Download, History, RotateCw, AlertTriangle, Camera } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { rotateB64, STATUS_STYLE, FIELDS, toNum, lineFor } from '../lib/battery';

const MAX_IMAGES = 5;
const newBattery = (id) => ({ id, label: '', files: [], images: [], values: null, assess: null, loading: false, error: null });

export default function BatteryTest({ api }) {
  const [batteries, setBatteries] = useState([newBattery(1)]);
  const [customerName, setCustomerName] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const timers = useRef({});
  const bRef = useRef(batteries);
  useEffect(() => { bRef.current = batteries; }, [batteries]);
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  const patch = (id, p) => setBatteries((prev) => prev.map((b) => (b.id === id ? { ...b, ...(typeof p === 'function' ? p(b) : p) } : b)));

  const analyze = async (id, files) => {
    patch(id, { loading: true, error: null });
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      const { data } = await axios.post(`${api}/battery-analysis/extract`, fd, { timeout: 120000 });
      patch(id, { values: data.values || {}, assess: data.assessment || null, images: data.images_base64 || [], loading: false });
    } catch (e) {
      const detail = e?.response?.data?.detail || e?.message || 'Bilinmeyen hata';
      patch(id, { loading: false, error: String(detail) });
      toast.error(`Değerler okunamadı: ${detail}`);
    }
  };

  const addFiles = (id, list) => {
    const b = batteries.find((x) => x.id === id);
    if (!b || !list?.length) return;
    const imgs = Array.from(list).filter((f) => f.type.startsWith('image/'));
    const files = [...b.files, ...imgs].slice(0, MAX_IMAGES);
    if (b.files.length + imgs.length > MAX_IMAGES) toast.warning(`En fazla ${MAX_IMAGES} fotoğraf`);
    patch(id, { files });
    analyze(id, files); // tek adım: seçer seçmez oku
  };

  const removeImage = (id, i) => {
    const b = batteries.find((x) => x.id === id);
    const files = b.files.filter((_, j) => j !== i);
    patch(id, { files, images: b.images.filter((_, j) => j !== i) });
    if (!files.length) patch(id, { values: null, assess: null });
  };

  const rotate = async (id, i) => {
    const b = batteries.find((x) => x.id === id);
    const r = await rotateB64(b.images[i]);
    patch(id, (cur) => ({ images: cur.images.map((x, j) => (j === i ? r : x)) }));
  };

  const setValue = (id, key, raw) => {
    patch(id, (b) => ({ values: { ...(b.values || {}), [key]: raw } }));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(async () => {
      const b = bRef.current.find((x) => x.id === id);
      if (!b) return;
      const v = b.values || {};
      try {
        const { data } = await axios.post(`${api}/battery-analysis/assess`, Object.fromEntries(FIELDS.map(({ key: k }) => [k, toNum(v[k])])));
        patch(id, { assess: data });
      } catch { /* durum eski kalır */ }
    }, 350);
  };

  const loadHistory = async () => {
    const plate = vehiclePlate.trim(), cname = customerName.trim();
    if (!plate && !cname) { toast.error('Geçmiş için plaka veya müşteri adı girin'); return; }
    setHistoryLoading(true);
    try {
      const { data } = await axios.get(`${api}/battery-tests`, { params: plate ? { plate } : { customer_name: cname } });
      setHistory(data || []);
      if (!(data || []).length) toast.info('Bu plaka/müşteri için kayıtlı test yok.');
    } catch { toast.error('Geçmiş yüklenemedi'); } finally { setHistoryLoading(false); }
  };

  const ready = batteries.filter((b) => b.values && b.assess && b.assess.status !== 'unknown');
  const downloadPdf = async () => {
    if (!ready.length) { toast.error('Önce en az bir akünün fotoğrafını yükleyin'); return; }
    setPdfLoading(true);
    try {
      const payload = {
        customer_name: customerName.trim() || null,
        vehicle_plate: vehiclePlate.trim() || null,
        report_date: new Date().toLocaleDateString('tr-TR'),
        batteries: ready.map((b, i) => ({
          battery_number: i + 1, label: b.label.trim() || null, images_base64: b.images,
          values: Object.fromEntries(FIELDS.map(({ key: k }) => [k, toNum(b.values[k])])),
        })),
      };
      const res = await axios.post(`${api}/battery-analysis/pdf`, payload, { responseType: 'blob', timeout: 60000 });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `aku_test_${(vehiclePlate || customerName || 'rapor').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success('PDF indirildi');
    } catch (e) {
      toast.error(`PDF hatası: ${e?.response?.data?.detail || e?.message || ''}`);
    } finally { setPdfLoading(false); }
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-[#1B3A5C]"><Battery className="w-5 h-5" /> Akü Testi</CardTitle>
        <CardDescription>UNI-T UT673A ekran fotoğraflarını seçin; değerler okunur ve durum anında belirlenir. Yanlış okunan değeri düzeltebilirsiniz.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end p-4 rounded-xl bg-slate-50 border border-slate-200">
          <div>
            <Label className="text-xs font-semibold text-slate-600">Müşteri adı</Label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Örn. Ahmet Yılmaz" className="mt-1 h-9" />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600">Plaka / Araç</Label>
            <Input value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)} placeholder="Örn. 59 ABC 123" className="mt-1 h-9" />
          </div>
          <Button variant="outline" size="sm" onClick={loadHistory} disabled={historyLoading} className="h-9">
            {historyLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <History className="w-4 h-4 mr-2" />} Geçmiş
          </Button>
        </div>

        {history && history.length > 0 && (
          <div className="p-4 rounded-xl bg-white border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-bold text-slate-700 flex items-center gap-2"><History className="w-4 h-4" /> Geçmiş testler ({history.length})</div>
              <button type="button" onClick={() => setHistory(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <table className="w-full text-xs">
              <thead><tr className="text-left text-slate-500 border-b"><th className="py-1 pr-3">Tarih</th><th className="py-1 pr-3">Akü</th><th className="py-1 pr-3">SOH</th><th className="py-1 pr-3">SOC</th><th className="py-1 pr-3">Voltaj</th><th className="py-1 pr-3">İç direnç</th><th className="py-1">Durum</th></tr></thead>
              <tbody>
                {history.map((t) => {
                  const ss = STATUS_STYLE[t.status] || null;
                  return (
                    <tr key={t.id} className="border-b border-slate-100 text-slate-700">
                      <td className="py-1 pr-3 whitespace-nowrap">{t.created_at ? new Date(t.created_at).toLocaleDateString('tr-TR') : '-'}</td>
                      <td className="py-1 pr-3">{t.label || t.battery_number}</td>
                      <td className="py-1 pr-3 font-semibold tabular-nums">{t.values?.soh != null ? `%${t.values.soh}` : '-'}</td>
                      <td className="py-1 pr-3 tabular-nums">{t.values?.soc != null ? `%${t.values.soc}` : '-'}</td>
                      <td className="py-1 pr-3 tabular-nums">{t.values?.voltage != null ? `${t.values.voltage} V` : '-'}</td>
                      <td className="py-1 pr-3 tabular-nums">{t.values?.internal_resistance != null ? `${t.values.internal_resistance} mΩ` : '-'}</td>
                      <td className="py-1">{ss ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white" style={{ background: ss.accent }}>{t.decision}</span> : (t.decision || '-')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {batteries.map((b, idx) => {
          const ss = b.assess ? STATUS_STYLE[b.assess.status] : null;
          return (
            <div key={b.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
                <span className="text-base font-black text-[#1B3A5C]">{idx + 1}. Akü</span>
                <Input value={b.label} onChange={(e) => patch(b.id, { label: e.target.value })} placeholder="Ad (ör. Servis aküsü) — isteğe bağlı" className="h-8 max-w-[260px] text-sm" />
                {ss && (
                  <span className="ml-auto px-3 py-1 rounded-full text-xs font-black text-white" style={{ background: ss.accent }}>
                    {b.assess.label}{b.assess.charge && b.assess.status !== 'replace' ? ' · ŞARJ EDİLMELİ' : ''}
                  </span>
                )}
                {batteries.length > 1 && (
                  <button type="button" onClick={() => setBatteries((p) => p.filter((x) => x.id !== b.id))} className={`${ss ? '' : 'ml-auto'} text-slate-400 hover:text-red-600`} title="Aküyü kaldır"><X className="w-4 h-4" /></button>
                )}
              </div>
              <div className="p-4 space-y-4">
                <div className="flex flex-wrap gap-2">
                  {(b.images.length ? b.images.map((x) => `data:image/jpeg;base64,${x}`) : b.files.map((f) => URL.createObjectURL(f))).map((src, i) => (
                    <div key={i} className="relative w-28 h-28 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 group">
                      <img src={src} alt="" className="w-full h-full object-contain" />
                      <div className="absolute inset-x-0 bottom-0 flex justify-between p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {b.images.length > 0 && <button type="button" onClick={() => rotate(b.id, i)} className="p-1 rounded-full bg-black/60 text-white" title="Döndür"><RotateCw className="w-3.5 h-3.5" /></button>}
                        <button type="button" onClick={() => removeImage(b.id, i)} className="p-1 rounded-full bg-black/60 text-white ml-auto" title="Kaldır"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  ))}
                  {b.files.length < MAX_IMAGES && (
                    <label className={`w-28 h-28 rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-1 text-xs font-semibold text-slate-500 hover:bg-slate-50 ${b.loading ? 'opacity-50' : 'cursor-pointer'}`}>
                      {b.loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
                      {b.loading ? 'Okunuyor…' : 'Fotoğraf ekle'}
                      <input type="file" accept="image/*" multiple className="hidden" disabled={b.loading} onChange={(e) => { addFiles(b.id, e.target.files); e.target.value = ''; }} />
                    </label>
                  )}
                </div>

                {b.error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm"><AlertTriangle className="w-4 h-4 inline mr-1" /> {b.error}</div>}

                {b.values && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {FIELDS.map(({ key, label, unit }) => {
                      const line = lineFor(b.assess, label);
                      return (
                        <div key={key} className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
                          <div className="flex items-baseline gap-1 mt-1">
                            <input value={b.values[key] ?? ''} onChange={(e) => setValue(b.id, key, e.target.value)} inputMode="decimal" placeholder="—"
                              className="w-20 bg-transparent text-2xl font-black text-[#1B3A5C] tabular-nums focus:outline-none border-b border-transparent focus:border-slate-300" />
                            <span className="text-sm font-semibold text-slate-500">{unit}</span>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">{line ? line[2] : ' '}</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {b.assess && ss && (
                  <div className="rounded-xl px-4 py-3 text-sm font-semibold" style={{ background: ss.bg, color: ss.fg, borderLeft: `4px solid ${ss.accent}` }}>{b.assess.advice}</div>
                )}
              </div>
            </div>
          );
        })}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button type="button" onClick={() => setBatteries((p) => [...p, newBattery((p[p.length - 1]?.id || 0) + 1)])}
            className="h-12 border-2 border-dashed border-slate-300 rounded-xl text-slate-600 hover:bg-slate-50 font-semibold flex items-center justify-center gap-2">
            <Plus className="w-5 h-5" /> Akü ekle
          </button>
          <Button onClick={downloadPdf} disabled={pdfLoading || !ready.length} className="h-12 text-base bg-[#1B3A5C] hover:bg-[#15293f] text-white">
            {pdfLoading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Download className="w-5 h-5 mr-2" />} PDF rapor ({ready.length} akü)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
