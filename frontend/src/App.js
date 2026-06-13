import React, { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import './App.css';
import axios from 'axios';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';
import { Badge } from './components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Trash2, Upload, RefreshCw, Plus, TrendingUp, Building2, Package, DollarSign, Edit, Save, X, FileText, Check, Archive, Download, Wrench, Eye, EyeOff, AlertTriangle, Tags, Copy, Pin, StickyNote, Users, Star, Search, Phone, Mail, MapPin, Calculator, Battery, Loader2, ScanSearch, LogOut, PlusCircle, MinusCircle, History, Settings, ChevronUp, ChevronDown, GripVertical, Cable, Folder, FolderOpen, CheckCircle2 } from 'lucide-react';
import KabloSemasiSection from '@/features/wiring/KabloSemasiSection';
import { toast } from 'sonner';
import { Toaster } from './components/ui/sonner';
import LazyImage from './components/LazyImage';
import { CacheManager, debounce } from './utils/cache';
import { DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors, useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Sözleşme kalem satırı — dnd-kit ile sürükle-bırak (telefon uygulaması gibi animasyonlu yeniden sıralama).
// children render-prop'una drag dinleyicileri verilir (sadece tutamaca bağlanır, input'lar serbest kalır).
function SortableItemRow({ id, disabled, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.18)' : undefined,
    background: isDragging ? '#ecfdf5' : undefined,
    position: isDragging ? 'relative' : undefined,
    zIndex: isDragging ? 30 : undefined,
  };
  return (
    <tr ref={setNodeRef} style={style} {...attributes} className="hover:bg-emerald-50/40">
      {children(listeners)}
    </tr>
  );
}

// Bölüm sonu bırakma hedefi (kalemi bölümün en sonuna / boş bölüme taşımak için) — "Kalem Ekle" satırı.
function SectionEndDrop({ id, disabled, children }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return <tr ref={setNodeRef} className={isOver ? 'bg-emerald-100/70' : undefined}>{children}</tr>;
}

// ============================================================================
// AKÜ TEST RAPORU BİLEŞENİ (OpenAI GPT-4o mini ile)
// ============================================================================
function BatteryTestSection() {
  // Her akü: { id, files, previews, values: {soh,soc,voltage,internal_resistance}|null,
  //            report, imagesBase64, loading (değer okuma), interpreting (rapor üretme), error }
  // İKİ ADIM: 1) "Değerleri Oku" -> AI görselden değerleri çıkarır, kullanıcı düzeltir
  //           2) "Raporu Oluştur" -> onaylı değerlerden AI yorum/rapor üretir
  const [batteries, setBatteries] = useState([
    { id: 1, files: [], previews: [], values: null, report: null, imagesBase64: null, loading: false, interpreting: false, error: null }
  ]);
  const [customerName, setCustomerName] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [analyzingAll, setAnalyzingAll] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  // Geçmiş testler (plaka/müşteri ile sorgulanır; PDF üretiminde otomatik kaydedilir)
  const [testHistory, setTestHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadTestHistory = async () => {
    const plate = vehiclePlate.trim();
    const cname = customerName.trim();
    if (!plate && !cname) { toast.error('Geçmiş için plaka veya müşteri adı girin'); return; }
    try {
      setHistoryLoading(true);
      const params = new URLSearchParams();
      if (plate) params.set('plate', plate); else params.set('customer_name', cname);
      const res = await axios.get(`${API}/battery-tests?${params.toString()}`);
      setTestHistory(res.data || []);
      if ((res.data || []).length === 0) toast.info('Bu plaka/müşteri için kayıtlı test yok.');
    } catch (e) {
      toast.error('Geçmiş yüklenemedi');
    } finally {
      setHistoryLoading(false);
    }
  };

  const MAX_IMAGES = 5;

  const updateBattery = (id, patch) => {
    setBatteries(prev => prev.map(b => (b.id === id ? { ...b, ...patch } : b)));
  };

  const addBattery = () => {
    setBatteries(prev => [
      ...prev,
      {
        id: (prev[prev.length - 1]?.id || 0) + 1,
        files: [],
        previews: [],
        values: null,
        report: null,
        imagesBase64: null,
        loading: false,
        interpreting: false,
        error: null
      }
    ]);
  };

  const removeBattery = (id) => {
    setBatteries(prev => {
      if (prev.length <= 1) {
        toast.error('En az bir akü bölümü olmalı');
        return prev;
      }
      const next = prev.filter(b => b.id !== id);
      // Sayıları yeniden numaralandır (id'yi koru ama görüntüsel sıra zaten array order)
      return next;
    });
  };

  const handleFilesSelected = (batteryId, fileList) => {
    if (!fileList || fileList.length === 0) return;
    const battery = batteries.find(b => b.id === batteryId);
    if (!battery) return;

    const arr = Array.from(fileList);
    const allowed = arr.filter(f => f.type.startsWith('image/'));
    if (allowed.length < arr.length) {
      toast.warning('Yalnızca görsel dosyaları kabul edilir.');
    }

    const currentCount = battery.files.length;
    const remaining = MAX_IMAGES - currentCount;
    if (remaining <= 0) {
      toast.error(`Maksimum ${MAX_IMAGES} görsel ekleyebilirsiniz.`);
      return;
    }

    const toAdd = allowed.slice(0, remaining);
    const newFiles = [...battery.files, ...toAdd];
    const newPreviews = [...battery.previews, ...toAdd.map(f => URL.createObjectURL(f))];

    updateBattery(batteryId, {
      files: newFiles,
      previews: newPreviews,
      values: null,
      report: null,
      imagesBase64: null,
      error: null
    });

    if (allowed.length > remaining) {
      toast.warning(`Maksimum ${MAX_IMAGES} görsele kadar yüklenebilir. Fazla görseller atlandı.`);
    }
  };

  const removeImage = (batteryId, imageIndex) => {
    const battery = batteries.find(b => b.id === batteryId);
    if (!battery) return;
    // Preview URL'sini temizle
    try { URL.revokeObjectURL(battery.previews[imageIndex]); } catch (e) {}
    const newFiles = battery.files.filter((_, i) => i !== imageIndex);
    const newPreviews = battery.previews.filter((_, i) => i !== imageIndex);
    updateBattery(batteryId, {
      files: newFiles,
      previews: newPreviews,
      values: null,
      report: null,
      imagesBase64: null
    });
  };

  // ADIM 1: Görsellerden değerleri oku (AI yorum yapmaz, sadece okur)
  const extractBattery = async (batteryId) => {
    const battery = batteries.find(b => b.id === batteryId);
    if (!battery) return;
    if (battery.files.length === 0) {
      toast.error('Önce en az bir test görseli yükleyin.');
      return;
    }
    updateBattery(batteryId, { loading: true, error: null, report: null });
    try {
      const formData = new FormData();
      battery.files.forEach(f => formData.append('files', f));
      const res = await axios.post(`${API}/battery-analysis/extract`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000
      });
      const data = res.data;
      updateBattery(batteryId, {
        values: data.values || { soh: null, soc: null, voltage: null, internal_resistance: null },
        imagesBase64: data.images_base64 || [],
        loading: false
      });
      toast.success('Değerler okundu. Kontrol edip gerekirse düzeltin, sonra "Raporu Oluştur".');
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || 'Bilinmeyen hata';
      updateBattery(batteryId, { loading: false, error: String(detail) });
      toast.error(`Değer okuma hatası: ${detail}`);
    }
  };

  const updateBatteryValue = (batteryId, key, raw) => {
    // Fonksiyonel update: hızlı ardışık yazmada stale state'e düşme
    setBatteries(prev => prev.map(b => (
      b.id === batteryId
        ? { ...b, values: { ...(b.values || {}), [key]: raw }, report: null } // değer değişti -> eski rapor geçersiz
        : b
    )));
  };

  // ADIM 2: Onaylanan değerlerden raporu üret
  const interpretBattery = async (batteryId) => {
    const battery = batteries.find(b => b.id === batteryId);
    if (!battery || !battery.values) return;
    const num = (v) => {
      if (v === '' || v == null) return null;
      const f = parseFloat(String(v).replace(',', '.'));
      return isNaN(f) ? null : f;
    };
    const payload = {
      soh: num(battery.values.soh),
      soc: num(battery.values.soc),
      voltage: num(battery.values.voltage),
      internal_resistance: num(battery.values.internal_resistance)
    };
    if (Object.values(payload).every(v => v === null)) {
      toast.error('En az bir ölçüm değeri girin.');
      return;
    }
    updateBattery(batteryId, { interpreting: true, error: null });
    try {
      const res = await axios.post(`${API}/battery-analysis/interpret`, payload, { timeout: 120000 });
      updateBattery(batteryId, { report: res.data.report || '', interpreting: false });
      toast.success('Rapor oluşturuldu.');
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || 'Bilinmeyen hata';
      updateBattery(batteryId, { interpreting: false, error: String(detail) });
      toast.error(`Rapor hatası: ${detail}`);
    }
  };

  const analyzeAll = async () => {
    setAnalyzingAll(true);
    try {
      for (const b of batteries) {
        if (b.files.length === 0) continue;
        // Sıralı çalıştır (rate-limit dostu)

        await extractBattery(b.id);
      }
    } finally {
      setAnalyzingAll(false);
    }
  };

  const allReportsReady = batteries.length > 0 && batteries.every(b => b.report && b.report.trim().length > 0);
  const anyReportReady = batteries.some(b => b.report && b.report.trim().length > 0);

  const downloadPdf = async () => {
    if (!anyReportReady) {
      toast.error('PDF üretmek için önce analiz yapmalısınız.');
      return;
    }
    setPdfLoading(true);
    try {
      const payload = {
        customer_name: customerName.trim() || null,
        vehicle_plate: vehiclePlate.trim() || null,
        report_date: new Date().toLocaleDateString('tr-TR'),
        batteries: batteries
          .filter(b => b.report && b.report.trim().length > 0)
          .map((b, idx) => ({
            battery_number: idx + 1,
            report: b.report,
            images_base64: b.imagesBase64 || []
          }))
      };
      const res = await axios.post(`${API}/battery-analysis/pdf`, payload, {
        responseType: 'blob',
        timeout: 60000
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aku_test_raporu_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('PDF indirildi.');
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || 'Bilinmeyen hata';
      toast.error(`PDF üretim hatası: ${detail}`);
    } finally {
      setPdfLoading(false);
    }
  };

  // Markdown benzeri rapor metnini güzel görselleştir
  const renderReport = (text) => {
    if (!text) return null;
    const lines = text.split(/\r?\n/);
    return (
      <div className="space-y-2 text-sm leading-relaxed text-slate-700">
        {lines.map((line, idx) => {
          const trimmed = line.trim();
          if (!trimmed) return <div key={idx} className="h-1" />;
          // Başlık: "1. TEKNİK VERİLER:"
          const headMatch = trimmed.match(/^(\d+\.\s*[A-ZÇĞİÖŞÜ][^:]{2,60}:)(.*)$/);
          if (headMatch) {
            return (
              <div key={idx} className="mt-3">
                <span className="font-bold text-slate-900">{headMatch[1]}</span>
                <span className="text-slate-700">{headMatch[2]}</span>
              </div>
            );
          }
          if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('* ')) {
            return (
              <div key={idx} className="ml-4 flex gap-2">
                <span className="text-red-500">•</span>
                <span dangerouslySetInnerHTML={{ __html: trimmed.slice(2).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') }} />
              </div>
            );
          }
          return (
            <p key={idx} dangerouslySetInnerHTML={{ __html: trimmed.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') }} />
          );
        })}
      </div>
    );
  };

  return (
    <Card className="border-red-100 shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <Battery className="w-5 h-5" />
              Akü Test Raporu Oluştur
            </CardTitle>
            <CardDescription className="mt-1 text-slate-600">
              UNI-T UT673A test cihazı görsellerini yükleyin, ChatGPT (OpenAI) değerleri okusun, kontrol edip rapor oluşturun.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Müşteri/Araç Bilgileri (PDF için opsiyonel) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-lg bg-slate-50 border border-slate-200">
          <div>
            <Label htmlFor="customer-name" className="text-xs font-semibold text-slate-600">Müşteri Adı (PDF için, opsiyonel)</Label>
            <Input
              id="customer-name"
              placeholder="Örn. Ahmet Yılmaz"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="mt-1 h-9"
            />
          </div>
          <div>
            <Label htmlFor="vehicle-plate" className="text-xs font-semibold text-slate-600">Plaka / Araç (PDF için, opsiyonel)</Label>
            <Input
              id="vehicle-plate"
              placeholder="Örn. 59 ABC 123"
              value={vehiclePlate}
              onChange={(e) => setVehiclePlate(e.target.value)}
              className="mt-1 h-9"
            />
          </div>
          <div className="sm:col-span-2">
            <Button variant="outline" size="sm" onClick={loadTestHistory} disabled={historyLoading} className="border-slate-300 text-slate-600">
              {historyLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Yükleniyor...</> : <><History className="w-4 h-4 mr-2" /> Geçmiş Testleri Gör</>}
            </Button>
          </div>
        </div>

        {/* Geçmiş testler — SOH trendi (PDF üretilen her test otomatik kaydedilir) */}
        {testHistory && testHistory.length > 0 && (
          <div className="p-4 rounded-lg bg-indigo-50/60 border border-indigo-200">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-bold text-indigo-800 flex items-center gap-2"><History className="w-4 h-4" /> Geçmiş Testler ({testHistory.length})</div>
              <button type="button" onClick={() => setTestHistory(null)} className="text-indigo-400 hover:text-indigo-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-indigo-600 border-b border-indigo-200">
                    <th className="py-1 pr-3">Tarih</th>
                    <th className="py-1 pr-3">Akü</th>
                    <th className="py-1 pr-3">SOH</th>
                    <th className="py-1 pr-3">SOC</th>
                    <th className="py-1 pr-3">Voltaj</th>
                    <th className="py-1 pr-3">İç Direnç</th>
                    <th className="py-1">Karar</th>
                  </tr>
                </thead>
                <tbody>
                  {testHistory.map((t) => (
                    <tr key={t.id} className="border-b border-indigo-100 text-slate-700">
                      <td className="py-1 pr-3 whitespace-nowrap">{t.created_at ? new Date(t.created_at).toLocaleDateString('tr-TR') : '-'}</td>
                      <td className="py-1 pr-3">{t.battery_number ?? '-'}</td>
                      <td className="py-1 pr-3 font-semibold tabular-nums">{t.values?.soh != null ? `%${t.values.soh}` : '-'}</td>
                      <td className="py-1 pr-3 tabular-nums">{t.values?.soc != null ? `%${t.values.soc}` : '-'}</td>
                      <td className="py-1 pr-3 tabular-nums">{t.values?.voltage != null ? `${t.values.voltage} V` : '-'}</td>
                      <td className="py-1 pr-3 tabular-nums">{t.values?.internal_resistance != null ? `${t.values.internal_resistance} mΩ` : '-'}</td>
                      <td className="py-1 truncate max-w-[220px]" title={t.decision || ''}>{t.decision || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Akü Bölümleri */}
        {batteries.map((battery, idx) => (
          <div key={battery.id} className="border border-red-200 rounded-xl p-4 bg-red-50/30">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-red-600 flex items-center gap-2">
                <Battery className="w-5 h-5" />
                {idx + 1}. Akü
              </h3>
              {batteries.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeBattery(battery.id)}
                  className="text-red-600 hover:bg-red-100 h-8 px-2"
                  disabled={battery.loading}
                >
                  <X className="w-4 h-4 mr-1" /> Bölümü Sil
                </Button>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-600 mb-2">
                  Test görsellerini yükleyin (max {MAX_IMAGES} görsel) — <span className="font-semibold">Test Görselleri ({battery.files.length}/{MAX_IMAGES})</span>
                </p>
                <Input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    handleFilesSelected(battery.id, e.target.files);
                    e.target.value = ''; // aynı dosyayı tekrar seçebilmek için reset
                  }}
                  disabled={battery.loading || battery.files.length >= MAX_IMAGES}
                  className="cursor-pointer"
                />
              </div>

              {/* Görsel önizlemeleri */}
              {battery.previews.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                  {battery.previews.map((src, i) => (
                    <div key={i} className="relative group rounded-lg overflow-hidden border border-slate-200 bg-white">
                      <img
                        src={src}
                        alt={`Akü ${idx + 1} - Görsel ${i + 1}`}
                        className="w-full h-24 object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(battery.id, i)}
                        disabled={battery.loading}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 disabled:opacity-50"
                        aria-label="Görseli kaldır"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-1 py-0.5 text-center">
                        {i + 1}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ADIM 1: değerleri oku */}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => extractBattery(battery.id)}
                  disabled={battery.loading || battery.interpreting || battery.files.length === 0 || analyzingAll}
                  className="border-red-300 text-red-700 hover:bg-red-50"
                >
                  {battery.loading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Değerler Okunuyor...</>
                  ) : (
                    <><ScanSearch className="w-4 h-4 mr-2" /> Değerleri Oku</>
                  )}
                </Button>
              </div>

              {/* ADIM 1.5: okunan değerleri göster — kullanıcı düzeltir, sonra rapor */}
              {battery.values && (
                <div className="mt-3 p-4 rounded-lg bg-amber-50 border border-amber-300">
                  <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-amber-800">
                    <ScanSearch className="w-4 h-4" />
                    Okunan Değerler — kontrol edin, yanlışsa düzeltin
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { key: 'soh', label: 'SOH (%)' },
                      { key: 'soc', label: 'SOC (%)' },
                      { key: 'voltage', label: 'Voltaj (V)' },
                      { key: 'internal_resistance', label: 'İç Direnç (mΩ)' }
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <label className="block text-xs font-medium text-amber-700 mb-1">{label}</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={battery.values[key] ?? ''}
                          onChange={(e) => updateBatteryValue(battery.id, key, e.target.value)}
                          placeholder="—"
                          className="w-full px-2 py-1.5 border border-amber-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                      </div>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => interpretBattery(battery.id)}
                    disabled={battery.interpreting || battery.loading}
                    className="mt-3 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {battery.interpreting ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Rapor Oluşturuluyor...</>
                    ) : (
                      <><Check className="w-4 h-4 mr-2" /> Değerler Doğru — Raporu Oluştur</>
                    )}
                  </Button>
                </div>
              )}

              {battery.error && (
                <div className="p-3 rounded-lg bg-red-100 border border-red-300 text-red-800 text-sm">
                  <AlertTriangle className="w-4 h-4 inline mr-1" /> {battery.error}
                </div>
              )}

              {battery.report && (
                <div className="mt-3 p-4 rounded-lg bg-white border border-emerald-200 shadow-sm">
                  <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-200">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span className="font-semibold text-emerald-700 text-sm">Analiz Sonucu</span>
                  </div>
                  {renderReport(battery.report)}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Yeni Akü Ekle */}
        <button
          type="button"
          onClick={addBattery}
          className="w-full py-3 border-2 border-dashed border-red-300 rounded-xl text-red-600 hover:bg-red-50 transition-colors font-medium flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" /> Yeni Akü Ekle
        </button>

        {/* Toplu Aksiyonlar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <Button
            onClick={analyzeAll}
            disabled={analyzingAll || batteries.every(b => b.files.length === 0)}
            className="bg-indigo-500 hover:bg-indigo-600 text-white h-12 text-base"
          >
            {analyzingAll ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Değerler Okunuyor...</>
            ) : (
              <><ScanSearch className="w-5 h-5 mr-2" /> Tüm Görsellerden Değerleri Oku</>
            )}
          </Button>

          <Button
            onClick={downloadPdf}
            disabled={pdfLoading || !anyReportReady}
            className="bg-emerald-600 hover:bg-emerald-700 text-white h-12 text-base"
          >
            {pdfLoading ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> PDF Hazırlanıyor...</>
            ) : (
              <><Download className="w-5 h-5 mr-2" /> PDF Rapor İndir</>
            )}
          </Button>
        </div>

        {/* Kullanım Bilgisi */}
        <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
          <h4 className="font-semibold text-blue-800 mb-2 flex items-center gap-2 text-sm">
            <FileText className="w-4 h-4" /> Kullanım Bilgisi:
          </h4>
          <ul className="space-y-1.5 text-sm text-blue-900">
            <li className="flex gap-2"><span className="text-blue-500">•</span> Her akü için UNI-T UT673A cihazından alınan test görsellerini yükleyin.</li>
            <li className="flex gap-2"><span className="text-blue-500">•</span> Birden fazla akü test ediyorsanız "Yeni Akü Ekle" ile bölüm oluşturun.</li>
            <li className="flex gap-2"><span className="text-blue-500">•</span> "Değerleri Oku" ile ChatGPT görseldeki değerleri okur; kontrol edip "Raporu Oluştur"a basın.</li>
            <li className="flex gap-2"><span className="text-blue-500">•</span> Analiz sonrası "PDF Rapor İndir" ile profesyonel rapor oluşturun.</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function App() {
  // Authentication states
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginForm, setLoginForm] = useState({
    username: '',
    password: '',
    remember_me: true // varsayilan acik: surekli elle giris istenmiyor
  });
  const [loginError, setLoginError] = useState('');
  
  const [companies, setCompanies] = useState([]);
  const [products, setProducts] = useState([]);

  const [exchangeRates, setExchangeRates] = useState({});
  const [loading, setLoading] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [uploadCompanyName, setUploadCompanyName] = useState(''); // Excel yükleme için manuel firma adı
  const [useExistingCompany, setUseExistingCompany] = useState(true); // Mevcut firma mı yoksa yeni mi
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadCurrency, setUploadCurrency] = useState('USD'); // Yükleme için para birimi
  const [uploadDiscount, setUploadDiscount] = useState(''); // Yükleme için iskonto yüzdesi
  // AI ürün çıkarma (PDF/Excel/görsel -> önizleme -> onay)
  const [aiExtracting, setAiExtracting] = useState(false); // çıkarma sürüyor mu
  const [aiPreviewProducts, setAiPreviewProducts] = useState(null); // çıkarılan ürünler (önizleme); null = önizleme yok
  const [aiImportSession, setAiImportSession] = useState(null); // CRM'e yazmadan once saklanan onizleme oturumu
  const [aiPreviewCompanyId, setAiPreviewCompanyId] = useState(''); // önizlemenin ait olduğu firma
  const [termosaCats, setTermosaCats] = useState(''); // Termosa kategori URL'leri (satır satır)
  const [termosaScraping, setTermosaScraping] = useState(false);
  const [agusCats, setAgusCats] = useState(''); // Agus kategori yolları (satır satır)
  const [agusScraping, setAgusScraping] = useState(false);
  // MPPT hesaplayıcı
  const [mpptForm, setMpptForm] = useState({ productId: '', name: '', watt: '', voc: '', vmp: '', isc: '', imp: '', adet: '1', notes: '' });
  const [mpptSpecsSaving, setMpptSpecsSaving] = useState(false);
  const [mpptResult, setMpptResult] = useState(null);
  // Teklif: manuel (elle girilen) kalem formu
  const [manualItem, setManualItem] = useState({ name: '', price: '', currency: 'TRY', qty: '1' });
  const [mpptLoading, setMpptLoading] = useState(false);
  const [termosaSyncSetting, setTermosaSyncSetting] = useState(null);
  const [termosaSyncEnabled, setTermosaSyncEnabled] = useState(false);
  const [termosaSyncInterval, setTermosaSyncInterval] = useState(24);
  const [termosaSyncSaving, setTermosaSyncSaving] = useState(false);
  const [termosaSyncRunning, setTermosaSyncRunning] = useState(false);
  const [importDefaultCategoryId, setImportDefaultCategoryId] = useState('');
  const [aiSaving, setAiSaving] = useState(false); // kaydetme sürüyor mu
  // Servis (tadilat/bakim) sekmesi
  const emptyServiceForm = { customer_name: '', phone: '', vehicle_brand: '', vehicle_model: '', plate: '', is_trailer: false, arrival_date: '', delivery_date: '', operations: '', items: [], photos: [], notes: '', cost: '', advance_amount: '', discount_amount: '', discount_percent: '', collections: [], payment_account: '', warranty_months: '', warranty_note: '', status: 'received' };
  const [services, setServices] = useState([]);
  const [serviceForm, setServiceForm] = useState(emptyServiceForm);
  const [serviceEditingId, setServiceEditingId] = useState(null); // düzenlenen kayıt id (null = yeni)
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [viewingService, setViewingService] = useState(null); // detay önizleme (sözleşmeler gibi)
  const [serviceStatusFilter, setServiceStatusFilter] = useState('all');
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceSaving, setServiceSaving] = useState(false);
  const [serviceHistory, setServiceHistory] = useState([]);
  // Sözleşmeler (Excel yükle + tarayıcıda önizle)
  const emptyContractForm = { title: '', customer_name: '', notes: '' };
  const [contracts, setContracts] = useState([]);
  const [contractFile, setContractFile] = useState(null);
  const [contractDragOver, setContractDragOver] = useState(false);
  const [addonSearch, setAddonSearch] = useState({ idx: -1, query: '' }); // ilave ürün arama dropdown'u
  const [contractForm, setContractForm] = useState(emptyContractForm);
  const [contractUploadOpen, setContractUploadOpen] = useState(false);
  const [contractUploading, setContractUploading] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, fail: 0 });
  const [viewingContract, setViewingContract] = useState(null); // önizlenen sözleşme (sheets dahil)
  const [contractPayFilter, setContractPayFilter] = useState('all'); // sözleşme ödeme filtresi: all | open | done
  const [contractStageFilter, setContractStageFilter] = useState('agreed'); // sözleşme aşama filtresi (varsayılan: anlaşılanlar): agreed | proposal | all
  const [contractSearch, setContractSearch] = useState(''); // sözleşme arama (müşteri/başlık/dosya)
  const [contractLoadingView, setContractLoadingView] = useState(false);
  const [contractRawView, setContractRawView] = useState(false); // tasarım / ham tablo
  const [contractSimRate, setContractSimRate] = useState(''); // kur simülasyonu (boş = orijinal kur)
  const [contractEditMode, setContractEditMode] = useState(false); // kalem düzenleme modu
  const [contractDraft, setContractDraft] = useState(null); // düzenlenen taslak yapı
  const [contractDirty, setContractDirty] = useState(false); // değişiklik yapıldı mı
  const [contractDataSaving, setContractDataSaving] = useState(false);
  const [contractHistory, setContractHistory] = useState([]); // undo geçmişi
  const [activeSearchCell, setActiveSearchCell] = useState({ si: -1, ii: -1, query: '' }); // autocomplete arama hücresi
  // dnd-kit sensörleri: masaüstü fare (5px sonra), mobil uzun-bas (200ms) — böylece dikey kaydırma bozulmaz
  const dndSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } })
  );
  const [newContractDialogOpen, setNewContractDialogOpen] = useState(false); // sıfırdan sözleşme oluşturma dialogu
  const [newContractForm, setNewContractForm] = useState({ title: '', customer_name: '', notes: '', kur: '35.00' });
  const [newContractCreating, setNewContractCreating] = useState(false);
  const [contractEditOpen, setContractEditOpen] = useState(false);
  const [contractEditId, setContractEditId] = useState(null);
  const [contractEditForm, setContractEditForm] = useState({ title: '', customer_name: '', notes: '' });
  const [contractEditSaving, setContractEditSaving] = useState(false);
  const [copyPackageDialog, setCopyPackageDialog] = useState(false); // Paket kopyalama dialog'u
  const [packageToCopy, setPackageToCopy] = useState(null); // Kopyalanacak paket
  const [copyPackageName, setCopyPackageName] = useState(''); // Yeni paket adı
  const [stats, setStats] = useState({
    totalCompanies: 0,
    totalProducts: 0
  });
  const [editingProduct, setEditingProduct] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    brand: '', // Marka alanı eklendi
    company_id: '', // Firma alanı eklendi
    image_url: '',
    list_price: '',
    discounted_price: '',
    currency: '',
    category_id: ''
  });
  const [categories, setCategories] = useState([]);
  
  // Customers state
  const [customers, setCustomers] = useState([]);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [customerForm, setCustomerForm] = useState({
    name: '',
    surname: '',
    company: '',
    phone: '',
    email: '',
    address: '',
    notes: ''
  });
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  
  // Category Groups state
  const [categoryGroups, setCategoryGroups] = useState([]);
  const [showCategoryGroupDialog, setShowCategoryGroupDialog] = useState(false);
  const [editingCategoryGroup, setEditingCategoryGroup] = useState(null);
  const [categoryGroupForm, setCategoryGroupForm] = useState({
    name: '',
    description: '',
    color: '#6B7280',
    category_ids: []
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState(''); // ürünlerde firma filtresi
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#3B82F6');
  const [newCategoryImageUrl, setNewCategoryImageUrl] = useState('');
  
  // Inline category creation states
  const [showInlineCategoryForm, setShowInlineCategoryForm] = useState(false);
  const [inlineCategoryName, setInlineCategoryName] = useState('');
  const [inlineCategoryColor, setInlineCategoryColor] = useState('#10B981');
  const [isSavingInlineCategory, setIsSavingInlineCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editCategoryForm, setEditCategoryForm] = useState({
    name: '',
    description: '',
    color: '',
    image_url: ''
  });
  const [showAddProductDialog, setShowAddProductDialog] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState(new Map()); // Map<productId, quantity>
  const [selectedProductsData, setSelectedProductsData] = useState(new Map()); // Map<productId, productData>
  const [quoteName, setQuoteName] = useState('');
  const [quoteDiscount, setQuoteDiscount] = useState(0);
  const [quoteLaborCost, setQuoteLaborCost] = useState(0); // İşçilik maliyeti state'i
  const [quoteNotes, setQuoteNotes] = useState(''); // Teklif notları state'i
  const [selectedQuoteCustomer, setSelectedQuoteCustomer] = useState(''); // Seçili müşteri ID
  const [showQuickCustomerModal, setShowQuickCustomerModal] = useState(false); // Hızlı müşteri ekleme modal'ı
  const [loadedQuote, setLoadedQuote] = useState(null); // Yüklenen teklif bilgisi
  const [showDiscountedPrices, setShowDiscountedPrices] = useState(false); // İndirimli fiyat görünürlüğü - Varsayılan KAPALI
  const [showQuoteDiscountedPrices, setShowQuoteDiscountedPrices] = useState(false); // Teklif indirimli fiyat görünürlüğü - Varsayılan KAPALI
  const [selectedProductsCustomPrices, setSelectedProductsCustomPrices] = useState(new Map()); // Map<productId, customPrice>
  const [quoteSubTab, setQuoteSubTab] = useState('create'); // Teklif alt sekmesi: 'create' veya 'list'
  
  // Hızlı ürün ekleme için state'ler
  const [quickAddSearch, setQuickAddSearch] = useState('');
  const [quickAddCategory, setQuickAddCategory] = useState('all');
  const [quickAddQuantity, setQuickAddQuantity] = useState(1);
  const [showQuickAddDropdown, setShowQuickAddDropdown] = useState(false);
  
  // Web scraping için state'ler
  const [showScrapeDialog, setShowScrapeDialog] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scrapedProducts, setScrapedProducts] = useState([]);
  const [selectedScrapedProducts, setSelectedScrapedProducts] = useState(new Set());
  const [scrapeCompanyId, setScrapeCompanyId] = useState('');
  const [productDiscounts, setProductDiscounts] = useState({}); // Her ürün için iskonto oranı
  const [, forceUpdate] = useState({}); // Force re-render için
  const [isScraping, setIsScraping] = useState(false);
  
  // Kategori ürün atama için state'ler
  const [showCategoryProductDialog, setShowCategoryProductDialog] = useState(false);
  const [selectedCategoryForProducts, setSelectedCategoryForProducts] = useState(null);
  const [uncategorizedProducts, setUncategorizedProducts] = useState([]);
  const [selectedProductsForCategory, setSelectedProductsForCategory] = useState(new Set());
  
  // Kategori dialog için ayrı arama ve ürün listesi
  const [categoryDialogSearchQuery, setCategoryDialogSearchQuery] = useState('');
  
  // Scroll to Top / Bottom state and effect
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 300) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }
      
      const remainingScroll = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      if (remainingScroll > 300) {
        setShowScrollBottom(true);
      } else {
        setShowScrollBottom(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    // Initial call to set correct state on load
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  const scrollToBottom = () => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: 'smooth'
    });
  };
  
  // Ref to track if quote draft is initialized/restored from localStorage
  const quoteDraftLoadedRef = useRef(false);

  // 1. Auto-Restore Quote Draft on Mount
  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem('karavan_quote_draft');
      if (savedDraft) {
        const draft = JSON.parse(savedDraft);
        console.log('📦 Bulunan teklif taslağı geri yükleniyor...', draft);
        
        if (draft.quoteName) setQuoteName(draft.quoteName);
        if (draft.quoteDiscount !== undefined) setQuoteDiscount(draft.quoteDiscount);
        if (draft.quoteLaborCost !== undefined) setQuoteLaborCost(draft.quoteLaborCost);
        if (draft.quoteNotes) setQuoteNotes(draft.quoteNotes);
        if (draft.selectedQuoteCustomer) setSelectedQuoteCustomer(draft.selectedQuoteCustomer);
        
        if (draft.selectedProducts) {
          setSelectedProducts(new Map(draft.selectedProducts));
        }
        if (draft.selectedProductsData) {
          setSelectedProductsData(new Map(draft.selectedProductsData));
        }
        if (draft.selectedProductsCustomPrices) {
          setSelectedProductsCustomPrices(new Map(draft.selectedProductsCustomPrices));
        }
        
        // Wait a small timeout to show after other mounts
        setTimeout(() => {
          toast.success('Yarım kalan teklif taslağınız otomatik olarak geri yüklendi.');
        }, 100);
      }
    } catch (err) {
      console.error('Teklif taslağı geri yükleme hatası:', err);
    } finally {
      quoteDraftLoadedRef.current = true;
    }
  }, []);

  // 2. Auto-Save Quote Draft on state changes
  useEffect(() => {
    // Only save if the initial loading phase is done to avoid blank state overwriting saved draft
    if (!quoteDraftLoadedRef.current) return;
    
    try {
      if (selectedProducts.size === 0) {
        // If empty, clean local draft
        localStorage.removeItem('karavan_quote_draft');
        return;
      }
      
      const draft = {
        quoteName,
        quoteDiscount,
        quoteLaborCost,
        quoteNotes,
        selectedQuoteCustomer,
        selectedProducts: Array.from(selectedProducts.entries()),
        selectedProductsData: Array.from(selectedProductsData.entries()),
        selectedProductsCustomPrices: Array.from(selectedProductsCustomPrices.entries())
      };
      
      localStorage.setItem('karavan_quote_draft', JSON.stringify(draft));
      console.log('💾 Teklif taslağı otomatik kaydedildi.');
    } catch (err) {
      console.error('Teklif taslağı otomatik kaydetme hatası:', err);
    }
  }, [
    quoteName,
    quoteDiscount,
    quoteLaborCost,
    quoteNotes,
    selectedQuoteCustomer,
    selectedProducts,
    selectedProductsData,
    selectedProductsCustomPrices
  ]);
  
  // Product drag and drop reordering states and handlers
  const [draggedProductId, setDraggedProductId] = useState(null);

  const handleProductDragStart = (e, productId) => {
    setDraggedProductId(productId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleProductDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleProductDragEnd = (e) => {
    setDraggedProductId(null);
  };

  const handleProductDrop = (e, targetProductId) => {
    e.preventDefault();
    if (!draggedProductId || draggedProductId === targetProductId) return;

    const keys = Array.from(selectedProducts.keys());
    const draggedIndex = keys.indexOf(draggedProductId);
    const targetIndex = keys.indexOf(targetProductId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;

    // Reorder keys array
    const [draggedItem] = keys.splice(draggedIndex, 1);
    keys.splice(targetIndex, 0, draggedItem);

    // Update Map
    const newSelected = new Map();
    keys.forEach(key => {
      newSelected.set(key, selectedProducts.get(key));
    });
    setSelectedProducts(newSelected);
    toast.success('Ürün sırası güncellendi');
  };
  const [allProductsForCategory, setAllProductsForCategory] = useState([]);
  const [loadingCategoryProducts, setLoadingCategoryProducts] = useState(false);
  
  // Ürünler sekmesinden teklif oluşturma için state'ler
  const [showQuickQuoteDialog, setShowQuickQuoteDialog] = useState(false);
  const [quickQuoteCustomerName, setQuickQuoteCustomerName] = useState('');
  const [quickQuoteNotes, setQuickQuoteNotes] = useState(''); // Hızlı teklif notları
  const [activeTab, setActiveTab] = useState('products');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Tarayıcı tam ekran durumunu izle: ESC ile çıkınca sidebar/döviz barı geri gelsin
  // (yoksa kullanıcı tuzakta kalır, sekmelere dönemez).
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Sekme değişimi: wiring sekmesinden çıkınca tam ekrandaysa otomatik çık (otomatik tam ekrana ALMA yok).
  const handleTabChange = (val) => {
    setActiveTab(val);
    try {
      if (val !== 'wiring-diagram' && document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    } catch (e) { /* yoksay */ }
  };

  // Kablo şeması tam ekran aç/kapat (buton ile)
  const toggleWiringFullscreen = () => {
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      } else {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
    } catch (e) { /* yoksay */ }
  };

  // Servis sekmesi aktif olunca (veya filtre değişince) kayıtları yükle.
  useEffect(() => {
    if (activeTab === 'service') {
      loadServices();
    }
    if (activeTab === 'contracts') {
      loadContracts();
      setViewingContract(null);
    }
  }, [activeTab]);

  // Sidebar/döviz barı yalnızca wiring sekmesi AKTİF + tam ekrandayken gizlenir.
  const hideChromeForWiring = activeTab === 'wiring-diagram' && isFullscreen;
  const [quotes, setQuotes] = useState([]);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [quoteSearchTerm, setQuoteSearchTerm] = useState('');
  const [quoteProductSearch, setQuoteProductSearch] = useState('');
  const [quoteSearchDropdownPos, setQuoteSearchDropdownPos] = useState(null);
  const quoteSearchInputRef = useRef(null);
  const [filteredQuotes, setFilteredQuotes] = useState([]);
  
  // Toplu işlemler için state'ler
  const [selectedProductsForBulk, setSelectedProductsForBulk] = useState(new Set());
  const [showBulkPriceModal, setShowBulkPriceModal] = useState(false);
  const [showBulkCategoryModal, setShowBulkCategoryModal] = useState(false);
  const [bulkPriceChangeType, setBulkPriceChangeType] = useState('percentage'); // percentage or fixed
  const [bulkPriceChangeValue, setBulkPriceChangeValue] = useState(0);
  const [bulkPriceApplyTo, setBulkPriceApplyTo] = useState('list_price'); // list_price or discounted_price
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  
  // Kategori ürün gösterimi için state
  const [expandedCategories, setExpandedCategories] = useState(new Set()); // Tüm ürünleri gösteren kategoriler
  
  // Upload History için state'ler
  const [showUploadHistoryDialog, setShowUploadHistoryDialog] = useState(false);
  const [selectedCompanyForHistory, setSelectedCompanyForHistory] = useState(null);
  const [uploadHistory, setUploadHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Para birimi değiştirme için state'ler
  const [showCurrencyChangeDialog, setShowCurrencyChangeDialog] = useState(false);
  const [selectedUploadForCurrency, setSelectedUploadForCurrency] = useState(null);

  // Görsel önizleme için state'ler
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState('');
  const [previewImageTitle, setPreviewImageTitle] = useState('');
  
  // Product Detail states and handler
  const [detailProduct, setDetailProduct] = useState(null);
  const [showProductDetail, setShowProductDetail] = useState(false);

  const openProductDetails = (product) => {
    if (product) {
      setDetailProduct(product);
      setShowProductDetail(true);
    }
  };
  const [newCurrency, setNewCurrency] = useState('USD');
  const [changingCurrency, setChangingCurrency] = useState(false);


  const [newProductForm, setNewProductForm] = useState({
    name: '',
    company_id: '',
    category_id: '',
    description: '',
    image_url: '',
    list_price: '',
    discounted_price: '',
    currency: 'USD'
  });

  // Pagination ve performance için state'ler - OPTIMIZE EDİLDİ
  const [currentPage, setCurrentPage] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const [productsPerPage] = useState(50); // OPTİMİZE: 50 ürün/sayfa daha hızlı yükleme
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [hasMoreProducts, setHasMoreProducts] = useState(true); // Infinite scroll için

  // Kategori renk paleti sistemi
  const categoryColorPalette = [
    '#3B82F6', // Mavi
    '#10B981', // Yeşil
    '#F59E0B', // Turuncu
    '#EF4444', // Kırmızı
    '#8B5CF6', // Mor
    '#06B6D4', // Cyan
    '#84CC16', // Lime
    '#F97316', // Orange
    '#EC4899', // Pink
    '#6366F1', // Indigo
    '#14B8A6', // Teal
    '#F43F5E', // Rose
    '#A855F7', // Violet
    '#22D3EE', // Sky
    '#65A30D'  // Green-600
  ];

  // Bir sonraki rengi otomatik seç
  const getNextCategoryColor = () => {
    const usedColors = categories.map(cat => cat.color).filter(Boolean);
    const availableColors = categoryColorPalette.filter(color => !usedColors.includes(color));
    
    // Eğer tüm renkler kullanıldıysa, en baştan başla
    if (availableColors.length === 0) {
      return categoryColorPalette[0];
    }
    
    return availableColors[0];
  };

  // Category Groups functions


  const loadCategoryGroups = async () => {
    try {
      const response = await axios.get(`${API}/category-groups`);
      setCategoryGroups(response.data);
    } catch (error) {
      console.error('Error loading category groups:', error);
      toast.error('Kategori grupları yüklenemedi');
    }
  };

  const createCategoryGroup = async () => {
    try {
      const response = await axios.post(`${API}/category-groups`, categoryGroupForm);
      if (response.data.success) {
        toast.success(response.data.message);
        setShowCategoryGroupDialog(false);
        setCategoryGroupForm({ name: '', description: '', color: '#6B7280', category_ids: [] });
        await loadCategoryGroups();
      }
    } catch (error) {
      console.error('Error creating category group:', error);
      toast.error('Kategori grubu oluşturulamadı');
    }
  };

  const updateCategoryGroup = async () => {
    try {
      const response = await axios.put(`${API}/category-groups/${editingCategoryGroup.id}`, categoryGroupForm);
      if (response.data.success) {
        toast.success(response.data.message);
        setShowCategoryGroupDialog(false);
        setEditingCategoryGroup(null);
        setCategoryGroupForm({ name: '', description: '', color: '#6B7280', category_ids: [] });
        await loadCategoryGroups();
      }
    } catch (error) {
      console.error('Error updating category group:', error);
      toast.error('Kategori grubu güncellenemedi');
    }
  };

  const deleteCategoryGroup = async (groupId) => {
    if (!window.confirm('Bu kategori grubunu silmek istediğinizden emin misiniz?')) {
      return;
    }
    
    try {
      const response = await axios.delete(`${API}/category-groups/${groupId}`);
      if (response.data.success) {
        toast.success(response.data.message);
        await loadCategoryGroups();
      }
    } catch (error) {
      console.error('Error deleting category group:', error);
      toast.error('Kategori grubu silinemedi');
    }
  };

  const startEditCategoryGroup = (group) => {
    setEditingCategoryGroup(group);
    setCategoryGroupForm({
      name: group.name,
      description: group.description || '',
      color: group.color || '#6B7280',
      category_ids: group.category_ids || []
    });
    setShowCategoryGroupDialog(true);
  };

  // Authentication functions
  const checkAuthStatus = async () => {
    try {
      const response = await fetch(`${API}/auth/check`, {
        credentials: 'include'
      });
      const data = await response.json();
      setIsAuthenticated(data.authenticated);
    } catch (error) {
      console.error('Auth check error:', error);
      setIsAuthenticated(false);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    
    console.log('Login attempt started with:', loginForm.username);
    
    try {
      console.log('Making request to:', `${API}/auth/login`);
      
      const response = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(loginForm)
      });
      
      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Response data:', data);
      
      if (data.success) {
        console.log('Login successful, setting authenticated state');
        setIsAuthenticated(true);
        setLoginForm({ username: '', password: '', remember_me: true });
        toast.success(data.message);
      } else {
        console.log('Login failed:', data.message);
        setLoginError(data.message || 'Giriş başarısız');
      }
    } catch (error) {
      console.error('Login error details:', error);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      setLoginError(`Giriş sırasında bir hata oluştu: ${error.message}`);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API}/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
      setIsAuthenticated(false);
      toast.success('Başarıyla çıkış yapıldı');
    } catch (error) {
      console.error('Logout error:', error);
      setIsAuthenticated(false);
    }
  };

  // Check authentication on component mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Load initial data
  useEffect(() => {
    if (isAuthenticated) {
      loadInitialData();
      autoCheckTermosaOnLogin(); // her girişte açık Termosa fiyat kontrollerini çalıştır
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && useExistingCompany && selectedCompany) {
      loadTermosaSyncSetting(selectedCompany);
    }
  }, [isAuthenticated, useExistingCompany, selectedCompany]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadCompanies(),
        loadProducts(1, true),
        loadCategories(),
        loadCategoryGroups(),
        loadCustomers(),
        loadExchangeRates(),
        fetchQuotes(),
        loadFavoriteProducts(),
        loadPackages(),
        loadSupplyProducts()
      ]);
    } catch (error) {
      console.error('Error loading initial data:', error);
      toast.error('Veri yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const loadCompanies = async () => {
    try {
      // PERFORMANCE: Check cache first
      const cached = CacheManager.get('companies');
      if (cached) {
        setCompanies(cached);
        setStats(prev => ({ ...prev, totalCompanies: cached.length }));
        return;
      }

      const response = await axios.get(`${API}/companies`);
      setCompanies(response.data);
      setStats(prev => ({ ...prev, totalCompanies: response.data.length }));
      
      // PERFORMANCE: Cache the result
      CacheManager.set('companies', response.data);
    } catch (error) {
      console.error('Error loading companies:', error);
      toast.error('Firmalar yüklenemedi');
    }
  };

  // Quotes değiştiğinde filtreleme yap
  useEffect(() => {
    filterQuotes(quoteSearchTerm);
  }, [quotes]);

  // Müşteri seçildiğinde teklif adını otomatik oluştur
  useEffect(() => {
    if (selectedQuoteCustomer && !loadedQuote) {
      const selectedCustomer = customers.find(c => c.id === selectedQuoteCustomer);
      if (selectedCustomer) {
        const customerName = `${selectedCustomer.name} ${selectedCustomer.surname}`;
        setQuoteName(customerName);
      }
    } else if (!selectedQuoteCustomer && !loadedQuote) {
      setQuoteName('');
    }
  }, [selectedQuoteCustomer, customers, loadedQuote]);

  const fetchQuotes = async () => {
    try {
      const response = await fetch(`${API}/quotes`);
      const data = await response.json();
      setQuotes(data);
      setFilteredQuotes(data); // Başlangıçta tüm teklifler görünsün
    } catch (error) {
      console.error('Teklifler yüklenirken hata:', error);
      toast.error('Teklifler yüklenemedi');
    }
  };

  // Teklif arama fonksiyonu
  const filterQuotes = (searchTerm) => {
    if (!searchTerm.trim()) {
      setFilteredQuotes(quotes);
      return;
    }

    const filtered = quotes.filter(quote => {
      const searchLower = searchTerm.toLowerCase();
      
      // Teklif adında ara
      const nameMatch = quote.name.toLowerCase().includes(searchLower);
      
      // Müşteri adında ara (varsa)
      const customerMatch = quote.customer_name && 
        quote.customer_name.toLowerCase().includes(searchLower);
      
      // Teklifteki ürün adlarında ara
      const productMatch = quote.products.some(product => 
        product.name.toLowerCase().includes(searchLower) ||
        product.company_name.toLowerCase().includes(searchLower)
      );
      
      return nameMatch || customerMatch || productMatch;
    });

    setFilteredQuotes(filtered);
  };

  // Arama terimi değiştiğinde filtreleme yap
  const handleQuoteSearch = (searchTerm) => {
    setQuoteSearchTerm(searchTerm);
    filterQuotes(searchTerm);
  };

  const loadProducts = async (page = 1, resetPage = false) => {
    try {
      setLoadingProducts(true);
      
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (selectedCategory) params.append('category_id', selectedCategory);
      if (selectedCompanyFilter) params.append('company_id', selectedCompanyFilter);
      // Load all products at once without pagination
      params.append('skip_pagination', 'true');
      
      // Get products and count simultaneously
      const [productsResponse, countResponse] = await Promise.all([
        axios.get(`${API}/products?${params.toString()}`),
        axios.get(`${API}/products/count?${params.toString().replace(/skip_pagination=true&?/, '')}`)
      ]);
      
      const newProducts = productsResponse.data;
      const totalCount = countResponse.data.count;
      
      // Always replace products since we're loading all at once
      setProducts(newProducts);
      setTotalProducts(totalCount);
      setCurrentPage(1);
      setStats(prev => ({ ...prev, totalProducts: totalCount }));
      
    } catch (error) {
      console.error('Error loading products:', error);
      toast.error('Ürünler yüklenemedi');
    } finally {
      setLoadingProducts(false);
    }
  };

  const loadCategories = async () => {
    try {
      // PERFORMANCE: Check cache first
      const cached = CacheManager.get('categories');
      if (cached) {
        setCategories(cached);
        // Kategoriler yüklendikten sonra, bir sonraki rengi otomatik seç
        setTimeout(() => {
          const nextColor = getNextCategoryColor();
          setNewCategoryColor(nextColor);
        }, 100);
        return;
      }

      const response = await axios.get(`${API}/categories`);
      setCategories(response.data);
      
      // PERFORMANCE: Cache the result
      CacheManager.set('categories', response.data);
      
      // Kategoriler yüklendikten sonra, bir sonraki rengi otomatik seç
      setTimeout(() => {
        const nextColor = getNextCategoryColor();
        setNewCategoryColor(nextColor);
      }, 100); // Küçük delay ile state güncellenene kadar bekle
      
    } catch (error) {
      console.error('Error loading categories:', error);
      toast.error('Kategoriler yüklenemedi');
    }
  };

  // ===========================
  // CUSTOMER FUNCTIONS
  // ===========================

  const loadCustomers = async () => {
    try {
      const response = await axios.get(`${API}/customers`);
      setCustomers(response.data);
    } catch (error) {
      console.error('Error loading customers:', error);
      toast.error('Müşteriler yüklenemedi');
    }
  };

  const createCustomer = async () => {
    if (!customerForm.name.trim() || !customerForm.surname.trim()) {
      toast.error('İsim ve soyisim zorunludur');
      return;
    }

    try {
      await axios.post(`${API}/customers`, customerForm);
      toast.success('Müşteri eklendi');
      setShowCustomerModal(false);
      resetCustomerForm();
      await loadCustomers();
    } catch (error) {
      console.error('Error creating customer:', error);
      toast.error('Müşteri eklenemedi');
    }
  };

  const updateCustomer = async () => {
    if (!customerForm.name.trim() || !customerForm.surname.trim()) {
      toast.error('İsim ve soyisim zorunludur');
      return;
    }

    try {
      await axios.put(`${API}/customers/${editingCustomer.id}`, customerForm);
      toast.success('Müşteri güncellendi');
      setShowCustomerModal(false);
      setEditingCustomer(null);
      resetCustomerForm();
      await loadCustomers();
    } catch (error) {
      console.error('Error updating customer:', error);
      toast.error('Müşteri güncellenemedi');
    }
  };

  const deleteCustomer = async (customerId) => {
    if (!window.confirm('Bu müşteriyi silmek istediğinizden emin misiniz?')) {
      return;
    }

    try {
      await axios.delete(`${API}/customers/${customerId}`);
      toast.success('Müşteri silindi');
      await loadCustomers();
    } catch (error) {
      console.error('Error deleting customer:', error);
      toast.error('Müşteri silinemedi');
    }
  };

  const toggleCustomerFavorite = async (customerId) => {
    try {
      const response = await axios.patch(`${API}/customers/${customerId}/favorite`);
      toast.success(response.data.message);
      await loadCustomers();
    } catch (error) {
      console.error('Error toggling customer favorite:', error);
      toast.error('Favori durumu değiştirilemedi');
    }
  };

  const startEditCustomer = (customer) => {
    setEditingCustomer(customer);
    setCustomerForm({
      name: customer.name,
      surname: customer.surname,
      company: customer.company || '',
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
      notes: customer.notes || ''
    });
    setShowCustomerModal(true);
  };

  const resetCustomerForm = () => {
    setCustomerForm({
      name: '',
      surname: '',
      company: '',
      phone: '',
      email: '',
      address: '',
      notes: ''
    });
  };

  const filteredCustomers = customers.filter(customer => {
    if (!customerSearchQuery) return true;
    const searchLower = customerSearchQuery.toLowerCase();
    return (
      customer.name?.toLowerCase().includes(searchLower) ||
      customer.surname?.toLowerCase().includes(searchLower) ||
      customer.company?.toLowerCase().includes(searchLower) ||
      customer.email?.toLowerCase().includes(searchLower) ||
      customer.phone?.toLowerCase().includes(searchLower)
    );
  });

  // ===========================
  // BULK OPERATIONS FUNCTIONS
  // ===========================

  const downloadTemplate = async () => {
    try {
      const response = await fetch(`${API}/products/export/template`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'urun_sablonu.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Şablon indirildi');
    } catch (error) {
      console.error('Error downloading template:', error);
      toast.error('Şablon indirilemedi');
    }
  };

  const exportProducts = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedCategory) params.append('category_id', selectedCategory);
      
      const response = await fetch(`${API}/products/export?${params.toString()}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `urunler_${new Date().toISOString().slice(0,10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Ürünler dışa aktarıldı');
    } catch (error) {
      console.error('Error exporting products:', error);
      toast.error('Ürünler dışa aktarılamadı');
    }
  };

  const bulkUpdatePrice = async () => {
    if (selectedProductsForBulk.size === 0) {
      toast.error('Lütfen en az bir ürün seçin');
      return;
    }

    if (!bulkPriceChangeValue) {
      toast.error('Lütfen fiyat değişikliği değeri girin');
      return;
    }

    try {
      const response = await axios.post(`${API}/products/bulk-update-price`, {
        product_ids: Array.from(selectedProductsForBulk),
        price_change_type: bulkPriceChangeType,
        price_change_value: parseFloat(bulkPriceChangeValue),
        apply_to: bulkPriceApplyTo
      });

      toast.success(response.data.message);
      setShowBulkPriceModal(false);
      setBulkPriceChangeValue(0);
      setSelectedProductsForBulk(new Set());
      await loadProducts(1, true);
    } catch (error) {
      console.error('Error bulk updating prices:', error);
      toast.error('Fiyatlar güncellenemedi');
    }
  };

  const bulkUpdateCategory = async () => {
    if (selectedProductsForBulk.size === 0) {
      toast.error('Lütfen en az bir ürün seçin');
      return;
    }

    if (!bulkCategoryId) {
      toast.error('Lütfen bir kategori seçin');
      return;
    }

    try {
      const response = await axios.post(`${API}/products/bulk-update-category`, {
        product_ids: Array.from(selectedProductsForBulk),
        category_id: bulkCategoryId
      });

      toast.success(response.data.message);
      setShowBulkCategoryModal(false);
      setBulkCategoryId('');
      setSelectedProductsForBulk(new Set());
      await loadProducts(1, true);
    } catch (error) {
      console.error('Error bulk updating category:', error);
      toast.error('Kategoriler güncellenemedi');
    }
  };

  const toggleProductSelectionForBulk = (productId) => {
    const newSelection = new Set(selectedProductsForBulk);
    if (newSelection.has(productId)) {
      newSelection.delete(productId);
    } else {
      newSelection.add(productId);
    }
    setSelectedProductsForBulk(newSelection);
  };

  const selectAllProducts = () => {
    const allIds = new Set(products.map(p => p.id));
    setSelectedProductsForBulk(allIds);
    toast.success(`${allIds.size} ürün seçildi`);
  };

  const deselectAllProducts = () => {
    setSelectedProductsForBulk(new Set());
    toast.success('Seçim temizlendi');
  };



  const loadExchangeRates = async (forceUpdate = false, showToast = true) => {
    try {
      let response;
      
      if (forceUpdate) {
        // Force update from API
        response = await axios.post(`${API}/exchange-rates/update`);
        if (response.data.success) {
          setExchangeRates(response.data.rates);
          if (showToast) {
            toast.success(response.data.message);
          }
          return true;
        }
      } else {
        // Regular load
        response = await axios.get(`${API}/exchange-rates`);
        if (response.data.success) {
          setExchangeRates(response.data.rates);
          return true;
        }
      }
    } catch (error) {
      console.error('Error loading exchange rates:', error);
      if (showToast) {
        if (forceUpdate) {
          toast.error('Döviz kurları güncellenemedi');
        } else {
          toast.error('Döviz kurları yüklenemedi');
        }
      }
      return false;
    }
  };

  const createCompany = async () => {
    if (!newCompanyName.trim()) {
      toast.error('Firma adı gerekli');
      return;
    }

    try {
      await axios.post(`${API}/companies`, { name: newCompanyName });
      setNewCompanyName('');
      
      // PERFORMANCE: Invalidate cache before reload
      CacheManager.remove('companies');
      await loadCompanies();
      toast.success('Firma başarıyla oluşturuldu');
    } catch (error) {
      console.error('Error creating company:', error);
      toast.error(error.response?.data?.detail || 'Firma oluşturulamadı');
    }
  };

  // Firma adını düzenle (büyük/küçük harf değişikliği dahil)
  const renameCompany = async (company) => {
    const yeni = window.prompt('Yeni firma adı:', company.name);
    if (yeni === null) return; // vazgeçildi
    const name = yeni.trim();
    if (!name) { toast.error('Firma adı boş olamaz'); return; }
    if (name === company.name) return; // değişiklik yok
    try {
      await axios.put(`${API}/companies/${company.id}`, { name });
      CacheManager.remove('companies');
      await loadCompanies();
      toast.success(`Firma adı "${name}" olarak güncellendi`);
    } catch (error) {
      console.error('Error renaming company:', error);
      toast.error(error.response?.data?.detail || 'Firma adı güncellenemedi');
    }
  };

  const deleteCompany = async (companyId) => {
    try {
      await axios.delete(`${API}/companies/${companyId}`);
      
      // PERFORMANCE: Invalidate cache before reload
      CacheManager.remove('companies');
      await loadCompanies();
      await loadProducts(1, true);
      toast.success('Firma silindi');
    } catch (error) {
      console.error('Error deleting company:', error);
      toast.error('Firma silinemedi');
    }
  };

  // 1. ADIM: Dosyayı (PDF/Excel/görsel) yapay zekâya gönder, ürünleri çıkar ve ÖNİZLEME göster (kaydetmez)
  const createProductImportSession = async ({ companyId, products, source, filename, currency = null }) => {
    const sessionResponse = await axios.post(`${API}/companies/${companyId}/import-sessions/from-products`, {
      products,
      source,
      filename,
      currency,
      discount: uploadDiscount || '0'
    });
    const session = sessionResponse.data;
    setAiImportSession(session);
    setAiPreviewProducts(session.rows || []);
    setAiPreviewCompanyId(companyId);
    return session;
  };

  const aiExtractProducts = async () => {
    let companyId = null;
    let companyName = '';

    if (useExistingCompany) {
      if (!selectedCompany) {
        toast.error('Lütfen bir firma seçin');
        return;
      }
      companyId = selectedCompany;
    } else {
      if (!uploadCompanyName.trim()) {
        toast.error('Lütfen firma adını girin');
        return;
      }
      companyName = uploadCompanyName.trim();
    }

    if (!uploadFile) {
      toast.error('Lütfen bir dosya seçin (PDF, Excel veya görsel)');
      return;
    }

    try {
      setAiExtracting(true);

      // Yeni firma ise önce oluştur
      if (!useExistingCompany) {
        const companyResponse = await axios.post(`${API}/companies`, { name: companyName });
        companyId = companyResponse.data.id;
        toast.success(`"${companyName}" firması oluşturuldu`);
        await loadCompanies();
        setSelectedCompany(companyId);
        setUseExistingCompany(true);
      }

      const formData = new FormData();
      formData.append('file', uploadFile);

      const response = await axios.post(`${API}/companies/${companyId}/ai-extract-products`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const products = (response.data.products || []).map((p) => ({
        name: p.name || '',
        brand: p.brand || '',
        list_price: p.list_price ?? '',
        discounted_price: p.discounted_price ?? '',
        currency: p.currency || uploadCurrency,
        description: p.description || ''
      }));

      if (products.length === 0) {
        toast.error('Dosyadan ürün çıkarılamadı. Daha net bir fiyat listesi deneyin.');
        return;
      }

      const session = await createProductImportSession({
        companyId,
        products,
        source: 'ai-file',
        filename: response.data.filename || uploadFile.name || 'AI-import',
        currency: null
      });
      setAiPreviewProducts(session.rows || []);
      setAiPreviewCompanyId(companyId);
      toast.success(`${products.length} ürün bulundu. Lütfen kontrol edip onaylayın.`);
    } catch (error) {
      console.error('AI çıkarma hatası:', error);
      toast.error(error.response?.data?.detail || 'Ürünler çıkarılamadı');
    } finally {
      setAiExtracting(false);
    }
  };

  // Termosa B2B'den seçili kategorileri çek -> AI önizleme tablosunu doldur (aynı onay akışı)
  const scrapeTermosaProducts = async () => {
    let companyId = null, companyName = '';
    if (useExistingCompany) {
      if (!selectedCompany) { toast.error('Lütfen bir firma seçin'); return; }
      companyId = selectedCompany;
    } else {
      if (!uploadCompanyName.trim()) { toast.error('Lütfen firma adını girin'); return; }
      companyName = uploadCompanyName.trim();
    }
    const urls = (termosaCats || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const scrapeUrls = urls.length > 0 ? urls : ['urunler'];
    try {
      setTermosaScraping(true);
      if (!useExistingCompany) {
        const cr = await axios.post(`${API}/companies`, { name: companyName });
        companyId = cr.data.id;
        toast.success(`"${companyName}" firması oluşturuldu`);
        await loadCompanies();
        setSelectedCompany(companyId);
        setUseExistingCompany(true);
      }
      const r = await axios.post(`${API}/companies/${companyId}/scrape-termosa`, { category_urls: scrapeUrls });
      const products = (r.data.products || []).map((p) => ({
        name: p.name || '', brand: p.brand || '',
        list_price: p.list_price ?? '', discounted_price: p.discounted_price ?? '',
        currency: p.currency || 'EUR', description: '', image_url: p.image_url || '',
        // code+source_url ürünle kaydedilir -> fiyat kontrolünde güvenilir eşleşme
        code: p.code || '', source_url: p.source_url || ''
      }));
      if (products.length === 0) { toast.error('Ürün çekilemedi.'); return; }
      setUploadCurrency('EUR');
      const session = await createProductImportSession({
        companyId,
        products,
        source: 'termosa-b2b',
        filename: 'Termosa B2B',
        currency: null
      });
      setAiPreviewProducts(session.rows || []);
      setAiPreviewCompanyId(companyId);
      toast.success(`${products.length} ürün çekildi. Kontrol edip onaylayın.`);
    } catch (error) {
      console.error('Termosa çekme hatası:', error);
      toast.error(error.response?.data?.detail || 'Termosa çekme başarısız');
    } finally {
      setTermosaScraping(false);
    }
  };

  // Agus.com.tr'den seçili kategorileri çek -> AI önizleme tablosunu doldur (aynı onay akışı)
  const scrapeAgusProducts = async () => {
    let companyId = null, companyName = '';
    if (useExistingCompany) {
      if (!selectedCompany) { toast.error('Lütfen bir firma seçin'); return; }
      companyId = selectedCompany;
    } else {
      if (!uploadCompanyName.trim()) { toast.error('Lütfen firma adını girin'); return; }
      companyName = uploadCompanyName.trim();
    }
    const urls = (agusCats || '').split('\n').map((s) => s.trim()).filter(Boolean);
    if (urls.length === 0) { toast.error('En az bir kategori yolu yazın (ör. inverterler)'); return; }
    try {
      setAgusScraping(true);
      if (!useExistingCompany) {
        const cr = await axios.post(`${API}/companies`, { name: companyName });
        companyId = cr.data.id;
        toast.success(`"${companyName}" firması oluşturuldu`);
        await loadCompanies();
        setSelectedCompany(companyId);
        setUseExistingCompany(true);
      }
      const r = await axios.post(`${API}/companies/${companyId}/scrape-agus`, { category_urls: urls });
      const products = (r.data.products || []).map((p) => ({
        name: p.name || '', brand: p.brand || '',
        list_price: p.list_price ?? '', discounted_price: p.discounted_price ?? '',
        currency: p.currency || 'TRY', description: '', image_url: p.image_url || '',
        code: p.code || '', source_url: p.source_url || ''
      }));
      if (products.length === 0) { toast.error('Ürün çekilemedi.'); return; }
      setUploadCurrency('TRY');
      const session = await createProductImportSession({
        companyId,
        products,
        source: 'agus-web',
        filename: 'Agus.com.tr',
        currency: null
      });
      setAiPreviewProducts(session.rows || []);
      setAiPreviewCompanyId(companyId);
      toast.success(`${products.length} ürün çekildi. Kontrol edip onaylayın.`);
    } catch (error) {
      console.error('Agus çekme hatası:', error);
      toast.error(error.response?.data?.detail || 'Agus çekme başarısız');
    } finally {
      setAgusScraping(false);
    }
  };

  const loadTermosaSyncSetting = async (companyId) => {
    if (!companyId) return;
    try {
      const response = await axios.get(`${API}/companies/${companyId}/supplier-sync/termosa`);
      const setting = response.data;
      setTermosaSyncSetting(setting);
      setTermosaSyncEnabled(Boolean(setting?.enabled));
      setTermosaSyncInterval(setting?.interval_hours || 24);
      if (setting?.category_urls?.length) {
        setTermosaCats(setting.category_urls.join('\n'));
      }
    } catch (error) {
      if (error.response?.status !== 404) {
        console.error('Termosa sync setting load error:', error);
      }
      setTermosaSyncSetting(null);
      setTermosaSyncEnabled(false);
      setTermosaSyncInterval(24);
    }
  };

  const saveTermosaSyncSetting = async ({ silent = false } = {}) => {
    const companyId = useExistingCompany ? selectedCompany : aiPreviewCompanyId;
    if (!companyId) { toast.error('Lütfen önce firma seçin'); return null; }
    const urls = (termosaCats || '').split('\n').map((item) => item.trim()).filter(Boolean);
    try {
      setTermosaSyncSaving(true);
      const response = await axios.put(`${API}/companies/${companyId}/supplier-sync/termosa`, {
        enabled: termosaSyncEnabled,
        category_urls: urls,
        interval_hours: parseInt(termosaSyncInterval, 10) || 24
      });
      setTermosaSyncSetting(response.data);
      if (!silent) {
        toast.success(termosaSyncEnabled ? 'Otomatik fiyat kontrolü kaydedildi' : 'Otomatik fiyat kontrolü kapatıldı');
      }
      return response.data;
    } catch (error) {
      console.error('Termosa sync save error:', error);
      toast.error(error.response?.data?.detail || 'Otomatik kontrol kaydedilemedi');
      return null;
    } finally {
      setTermosaSyncSaving(false);
    }
  };

  const runTermosaSyncNow = async () => {
    const companyId = useExistingCompany ? selectedCompany : aiPreviewCompanyId;
    if (!companyId) { toast.error('Lütfen önce firma seçin'); return; }
    const urls = (termosaCats || '').split('\n').map((item) => item.trim()).filter(Boolean);

    let setting = termosaSyncSetting;
    if (!setting?.id) {
      setting = await saveTermosaSyncSetting({ silent: true });
    }
    if (!setting?.id) {
      return;
    }
    try {
      setTermosaSyncRunning(true);
      const response = await axios.post(`${API}/companies/${companyId}/supplier-sync/termosa/run`);
      const session = response.data.import_session;
      if (session) {
        setAiImportSession(session);
        setAiPreviewProducts(session.rows || []);
        setAiPreviewCompanyId(companyId);
        setTermosaSyncSetting((prev) => prev ? {
          ...prev,
          last_session_id: session.id,
          last_error: null,
          last_run_at: new Date().toISOString()
        } : prev);
      }
      toast.success(response.data.message || 'Fiyat kontrolü tamamlandı');
    } catch (error) {
      console.error('Termosa sync run error:', error);
      toast.error(error.response?.data?.detail || 'Fiyat kontrolü başarısız');
    } finally {
      setTermosaSyncRunning(false);
    }
  };

  // "Termosa Ürünlerini Kontrol Et": adı 'Termosa' olan firmayı otomatik bulur, firma seçmeye gerek yok
  const checkTermosaPrices = async () => {
    const urls = (termosaCats || '').split('\n').map((s) => s.trim()).filter(Boolean);
    try {
      setTermosaSyncRunning(true);
      const r = await axios.post(`${API}/supplier-sync/termosa/check-auto`, { category_urls: urls });
      const session = r.data.import_session;
      if (session) {
        setAiImportSession(session);
        setAiPreviewProducts(session.rows || []);
        setAiPreviewCompanyId(session.company_id);
      }
      const pc = r.data.summary?.price_changes ?? 0;
      toast.success(pc > 0 ? `${r.data.company_name || 'Termosa'}: ${pc} üründe fiyat değişti — önizlemeyi kontrol edin` : 'Fiyat kontrolü tamam, değişiklik yok');
    } catch (error) {
      console.error('Termosa kontrol hatası:', error);
      toast.error(error.response?.data?.detail || 'Fiyat kontrolü başarısız');
    } finally {
      setTermosaSyncRunning(false);
    }
  };

  // Sisteme her girişte: açık Termosa kontrollerini sessizce çalıştır
  const autoCheckTermosaOnLogin = async () => {
    try {
      const r = await axios.post(`${API}/supplier-sync/termosa/run-all`);
      if ((r.data?.checked || 0) > 0) {
        const tc = r.data.total_changed || 0;
        if (tc > 0) toast.info(`Termosa otomatik kontrol: ${tc} üründe fiyat değişti`);
      }
    } catch (error) {
      console.warn('Termosa otomatik kontrol atlandı:', error?.response?.status);
    }
  };

  // Önizlemedeki bir ürünün alanını düzenle
  const updateAiPreviewProduct = (index, field, value) => {
    setAiPreviewProducts((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  // Önizlemeden bir ürünü çıkar
  const applyImportDefaultCategory = (categoryId) => {
    const normalized = categoryId === 'none' ? '' : categoryId;
    setImportDefaultCategoryId(normalized);
    setAiPreviewProducts((prev) => prev ? prev.map((row) => ({ ...row, category_id: normalized || '' })) : prev);
  };
  const removeAiPreviewProduct = (index) => {
    setAiPreviewProducts((prev) => prev.filter((_, i) => i !== index));
  };

  // Önizlemeyi iptal et
  const cancelAiPreview = () => {
    setAiPreviewProducts(null);
    setAiImportSession(null);
    setAiPreviewCompanyId('');
  };

  // 2. ADIM: Önizlemede onaylanan (ve düzenlenen) ürünleri kaydet
  const aiConfirmProducts = async () => {
    if (!aiPreviewProducts || aiPreviewProducts.length === 0) {
      toast.error('Kaydedilecek ürün yok');
      return;
    }
    const valid = aiPreviewProducts.filter(
      (p) => (p.action === 'skip') || ((p.name || '').trim() && parseFloat(p.list_price) > 0)
    );
    if (valid.length === 0) {
      toast.error('En az bir ürün için isim ve geçerli fiyat girin');
      return;
    }

    try {
      setAiSaving(true);
      const normalizedRows = valid.map((p) => ({
        ...p,
        list_price: parseFloat(p.list_price) || 0,
        discounted_price: p.discounted_price !== '' && p.discounted_price != null ? parseFloat(p.discounted_price) : null,
        currency: p.currency || 'USD',
        action: p.action || (p.matched_product_id ? 'update' : 'create')
      }));
      const response = aiImportSession?.id
        ? await axios.post(`${API}/import-sessions/${aiImportSession.id}/apply`, { rows: normalizedRows })
        : await axios.post(`${API}/companies/${aiPreviewCompanyId}/ai-confirm-products`, {
            products: normalizedRows.filter((p) => p.action !== 'skip'),
            currency: null,
            discount: uploadDiscount || '0',
            filename: uploadFile?.name || 'AI-import'
          });

      setAiPreviewProducts(null);
      setAiImportSession(null);
      setAiPreviewCompanyId('');
      setUploadFile(null);
      setUploadCompanyName('');
      setUploadDiscount('');
      await loadProducts(1, true);
      toast.success(response.data.message || 'Ürünler kaydedildi');
    } catch (error) {
      console.error('AI kaydetme hatasi:', error);
      toast.error(error.response?.data?.detail || 'Ürünler kaydedilemedi');
    } finally {
      setAiSaving(false);
    }
  };
  // MPPT öner — panel özelliklerini AI'a gönder, uygun şarj kontrol cihazını al
  const numOrNull = (v) => (v !== '' && v != null && !isNaN(parseFloat(v)) ? parseFloat(v) : null);

  const callMppt = async () => {
    const watt = parseFloat(mpptForm.watt);
    if (!watt || watt <= 0) { toast.error('Önce sistemden bir panel seçin (W bilgisi gerekli)'); return; }
    const adet = parseInt(mpptForm.adet, 10) || 1;
    try {
      setMpptLoading(true);
      setMpptResult(null);
      const r = await axios.post(`${API}/mppt/recommend`, {
        panel: { name: mpptForm.name || null, watt, voc: numOrNull(mpptForm.voc), vmp: numOrNull(mpptForm.vmp), isc: numOrNull(mpptForm.isc), imp: numOrNull(mpptForm.imp) },
        series: 1,
        parallel: adet,
        battery_voltage: 12,
        notes: mpptForm.notes || null,
      });
      setMpptResult(r.data);
    } catch (error) {
      console.error('MPPT öneri hatası:', error);
      toast.error(error.response?.data?.detail || 'MPPT önerisi alınamadı');
    } finally {
      setMpptLoading(false);
    }
  };

  // Üründen panel seç -> isim + watt (isimden), kayıtlı Voc/Vmp/Isc/Imp varsa otomatik doldur
  const pickMpptPanelFromProduct = async (productId) => {
    const prod = (products || []).find((p) => p.id === productId);
    if (!prod) return;
    const wm = String(prod.name || '').match(/(\d{2,4})\s?w/i);
    setMpptForm((f) => ({ ...f, productId, name: prod.name || '', watt: wm ? wm[1] : '', voc: '', vmp: '', isc: '', imp: '' }));
    setMpptResult(null);
    try {
      const r = await axios.get(`${API}/mppt/panel-specs/${productId}`);
      if (r.data?.exists) {
        const s = r.data;
        setMpptForm((f) => ({
          ...f,
          watt: s.watt != null ? String(s.watt) : f.watt,
          voc: s.voc != null ? String(s.voc) : '',
          vmp: s.vmp != null ? String(s.vmp) : '',
          isc: s.isc != null ? String(s.isc) : '',
          imp: s.imp != null ? String(s.imp) : '',
        }));
      }
    } catch (e) { /* kayıt yoksa sorun değil */ }
  };

  // Panel elektriksel değerlerini bu ürüne kaydet
  const savePanelSpecs = async () => {
    if (!mpptForm.productId) { toast.error('Önce panel seçin'); return; }
    try {
      setMpptSpecsSaving(true);
      await axios.put(`${API}/mppt/panel-specs/${mpptForm.productId}`, {
        watt: numOrNull(mpptForm.watt), voc: numOrNull(mpptForm.voc), vmp: numOrNull(mpptForm.vmp), isc: numOrNull(mpptForm.isc), imp: numOrNull(mpptForm.imp),
      });
      toast.success('Panel değerleri kaydedildi — sonraki seçimlerde otomatik gelecek');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Kaydedilemedi');
    } finally {
      setMpptSpecsSaving(false);
    }
  };

  // ===================== SERVİS (Tadilat/Bakım) =====================
  const SERVICE_STATUS_META = {
    received: { label: 'Bekliyor', badge: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
    in_progress: { label: 'Devam Ediyor', badge: 'bg-blue-100 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
    delivered: { label: 'Teslim Edildi', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  };
  const serviceCounts = {
    all: services.length,
    received: services.filter((s) => s.status === 'received').length,
    in_progress: services.filter((s) => s.status === 'in_progress').length,
    delivered: services.filter((s) => s.status === 'delivered').length,
  };

  // İki servisin tam listedeki yerini değiştir + sırayı kalıcı kaydet (sözleşme kalıbı)
  const swapServices = async (idA, idB) => {
    if (!idA || !idB) return;
    const arr = [...services];
    const ia = arr.findIndex((s) => s.id === idA);
    const ib = arr.findIndex((s) => s.id === idB);
    if (ia < 0 || ib < 0) return;
    [arr[ia], arr[ib]] = [arr[ib], arr[ia]];
    setServices(arr); // optimistic
    try {
      await axios.post(`${API}/services/reorder`, { ordered_ids: arr.map((s) => s.id) });
    } catch (e) {
      console.error('Servis sıralama kaydedilemedi:', e);
      toast.error('Sıralama kaydedilemedi');
      loadServices();
    }
  };

  const loadServices = async () => {
    try {
      const res = await axios.get(`${API}/services`);
      setServices(res.data || []);
    } catch (error) {
      console.error('Servis kayıtları yüklenemedi:', error);
      toast.error('Servis kayıtları yüklenemedi');
    }
  };

  const openNewServiceDialog = () => {
    setServiceEditingId(null);
    setServiceForm({ ...emptyServiceForm, arrival_date: new Date().toISOString().slice(0, 10) });
    setServiceHistory([]);
    setServiceDialogOpen(true);
  };

  const openServiceView = (svc) => { setViewingService(svc); };
  const backFromServiceView = () => { setViewingService(null); };

  // Aynı araç/müşterinin geçmiş servis kayıtları
  const loadServiceHistory = async (svc) => {
    try {
      const params = new URLSearchParams();
      if (svc.plate && svc.plate.trim()) params.set('plate', svc.plate.trim());
      else if (svc.customer_name && svc.customer_name.trim()) params.set('customer_name', svc.customer_name.trim());
      else { setServiceHistory([]); return; }
      if (svc.id) params.set('exclude_id', svc.id);
      const res = await axios.get(`${API}/services/history?${params.toString()}`);
      setServiceHistory(res.data || []);
    } catch (e) {
      setServiceHistory([]);
    }
  };

  // ---- Servis kalem (parça/işlem) yardımcıları — ₺/€/$ destekli, toplam ₺ ----
  const serviceItemLineTRY = (it) => {
    const line = (parseFloat(it.qty) || 0) * (parseFloat(it.unit_price) || 0);
    const cur = it.currency || 'TRY';
    if (cur === 'TRY') return line;
    const r = parseFloat(it.rate) || parseFloat(exchangeRates?.[cur]) || 0;
    return line * r;
  };
  const serviceItemsTotal = (items) => (items || []).reduce((sum, it) => sum + serviceItemLineTRY(it), 0);
  const addServiceItem = () => setServiceForm((f) => ({ ...f, items: [...(f.items || []), { name: '', qty: 1, unit_price: 0, currency: 'TRY', rate: '' }] }));
  const updateServiceItem = (idx, field, value) => setServiceForm((f) => {
    const items = [...(f.items || [])];
    items[idx] = { ...items[idx], [field]: value };
    // Döviz seçilince kuru o anki kurdan sabitle (tahsilatlardaki kural)
    if (field === 'currency' && value !== 'TRY' && !(parseFloat(items[idx].rate) > 0)) {
      const live = parseFloat(exchangeRates?.[value]);
      if (live > 0) items[idx].rate = live.toFixed(2);
    }
    if (field === 'currency' && value === 'TRY') items[idx].rate = '';
    return { ...f, items };
  });
  const removeServiceItem = (idx) => setServiceForm((f) => ({ ...f, items: (f.items || []).filter((_, i) => i !== idx) }));

  // ---- Servis indirimi — iki yönlü: % girilince ₺ hesaplanır, ₺ girilince % hesaplanır ----
  const serviceFormGrossTotal = (f) => ((f.items || []).length > 0 ? serviceItemsTotal(f.items) : (parseFloat(f.cost) || 0));
  const setServiceDiscountPercent = (v) => setServiceForm((f) => {
    if (v === '' || v == null) return { ...f, discount_percent: '', discount_amount: '' };
    const total = serviceFormGrossTotal(f);
    const pct = Math.max(0, Math.min(100, parseFloat(String(v).replace(',', '.')) || 0));
    const amt = total > 0 ? (total * pct / 100) : 0;
    return { ...f, discount_percent: String(v), discount_amount: total > 0 ? String(Math.round(amt * 100) / 100) : '' };
  });
  const setServiceDiscountAmount = (v) => setServiceForm((f) => {
    if (v === '' || v == null) return { ...f, discount_amount: '', discount_percent: '' };
    const total = serviceFormGrossTotal(f);
    let amt = Math.max(0, parseFloat(String(v).replace(',', '.')) || 0);
    if (total > 0 && amt > total) amt = total; // indirim toplamı aşamaz
    const pct = total > 0 ? (amt / total * 100) : 0;
    return { ...f, discount_amount: String(v), discount_percent: total > 0 ? String(Math.round(pct * 10) / 10) : '' };
  });
  // DB kaydından indirim tutarı (₺)
  const serviceDiscountTRY = (svc) => parseFloat(svc.discount_amount) || 0;

  // ---- Servis tahsilat (ödeme) yardımcıları — çoklu para birimi, ₺'ye çevrilip kalandan düşülür ----
  // exchangeRates.EUR / .USD = 1 birim dövizin ₺ karşılığı
  const collectionToTRY = (amount, currency, rate) => {
    const a = parseFloat(amount); if (isNaN(a)) return 0;
    if (!currency || currency === 'TRY') return a;
    const r = parseFloat(rate) || parseFloat(exchangeRates?.[currency]) || 0;
    return a * r;
  };
  const serviceCollectedTRY = (collections) => (collections || []).reduce(
    (s, c) => s + ((c.amount == null || c.amount === '') ? 0 : collectionToTRY(c.amount, c.currency, c.rate)), 0);
  // DB kaydından toplam tahsilat: collections doluysa SADECE collections sayılır.
  // (Eski advance_amount, edit'te collections'a migrate ediliyor; ikisi de doluysa
  //  advance'ı ayrıca eklemek çift sayım yapar — rapor 07 bulgusu.)
  const serviceCollectedTotalTRY = (svc) => {
    const colls = Array.isArray(svc.collections) ? svc.collections : [];
    if (colls.length > 0) return serviceCollectedTRY(colls);
    return parseFloat(svc.advance_amount) || 0;
  };
  const addServiceCollection = () => setServiceForm((f) => ({ ...f, collections: [...(f.collections || []), { id: newId(), date: new Date().toISOString().slice(0, 10), description: '', amount: '', currency: 'TRY', rate: '' }] }));
  const updateServiceCollection = (idx, field, value) => setServiceForm((f) => {
    const collections = [...(f.collections || [])];
    let v = value;
    if (field === 'amount' && v !== '' && v != null) { const n = parseFloat(v); if (!isNaN(n) && n < 0) v = Math.abs(n).toString(); }
    collections[idx] = { ...collections[idx], [field]: v };
    // Döviz seçilince kuru O ANKİ kurdan sabitle (boş bırakılırsa kalan tutar
    // gelecekte kur değiştikçe oynar — rapor 07 bulgusu). Kullanıcı isterse ezer.
    if (field === 'currency' && v !== 'TRY' && !(parseFloat(collections[idx].rate) > 0)) {
      const live = parseFloat(exchangeRates?.[v]);
      if (live > 0) collections[idx].rate = live.toFixed(2);
    }
    return { ...f, collections };
  });
  const removeServiceCollection = (idx) => setServiceForm((f) => ({ ...f, collections: (f.collections || []).filter((_, i) => i !== idx) }));

  // ---- Fotoğraf ekleme (yeniden boyutlandırıp base64) ----
  const addServicePhotos = async (fileList) => {
    const files = Array.from(fileList || []);
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
              const maxDim = 1280;
              let { width, height } = img;
              if (width > maxDim || height > maxDim) {
                if (width >= height) { height = Math.round(height * maxDim / width); width = maxDim; }
                else { width = Math.round(width * maxDim / height); height = maxDim; }
              }
              const canvas = document.createElement('canvas');
              canvas.width = width; canvas.height = height;
              canvas.getContext('2d').drawImage(img, 0, 0, width, height);
              resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.onerror = reject;
            img.src = e.target.result;
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        setServiceForm((f) => ({ ...f, photos: [...(f.photos || []), dataUrl] }));
      } catch (e) {
        toast.error('Fotoğraf eklenemedi');
      }
    }
  };
  const removeServicePhoto = (idx) => setServiceForm((f) => ({ ...f, photos: (f.photos || []).filter((_, i) => i !== idx) }));

  const openEditServiceDialog = (svc) => {
    setServiceEditingId(svc.id);
    // Tahsilatlar: yeni alan. Eski kayıtta yoksa ve avans varsa, avansı ilk tahsilat satırına taşı.
    let collections = Array.isArray(svc.collections)
      ? svc.collections.map((c) => ({ id: c.id || newId(), date: c.date || '', description: c.description || '', amount: c.amount != null ? String(c.amount) : '', currency: c.currency || 'TRY', rate: c.rate != null ? String(c.rate) : '' }))
      : [];
    let advanceVal = svc.advance_amount != null ? String(svc.advance_amount) : '';
    if (collections.length === 0 && parseFloat(svc.advance_amount) > 0) {
      collections = [{ id: newId(), date: svc.arrival_date || '', description: 'Avans', amount: String(svc.advance_amount), currency: 'TRY', rate: '' }];
      advanceVal = ''; // tek kaynak tahsilatlar; çift sayımı önle
    }
    setServiceForm({
      customer_name: svc.customer_name || '', phone: svc.phone || '',
      vehicle_brand: svc.vehicle_brand || '', vehicle_model: svc.vehicle_model || '',
      plate: svc.plate || '', is_trailer: !!svc.is_trailer,
      arrival_date: svc.arrival_date || '', delivery_date: svc.delivery_date || '',
      operations: svc.operations || '',
      items: Array.isArray(svc.items) ? svc.items.map((it) => ({ name: it.name || '', qty: it.qty != null ? it.qty : 1, unit_price: it.unit_price != null ? it.unit_price : 0, currency: it.currency || 'TRY', rate: it.rate != null ? String(it.rate) : '' })) : [],
      photos: Array.isArray(svc.photos) ? svc.photos : [],
      notes: svc.notes || '',
      cost: svc.cost != null ? String(svc.cost) : '',
      advance_amount: advanceVal,
      discount_amount: svc.discount_amount != null && svc.discount_amount !== 0 ? String(svc.discount_amount) : '',
      discount_percent: svc.discount_percent != null && svc.discount_percent !== 0 ? String(svc.discount_percent) : '',
      collections,
      payment_account: svc.payment_account || '',
      warranty_months: svc.warranty_months != null ? String(svc.warranty_months) : '',
      warranty_note: svc.warranty_note || '',
      status: svc.status || 'received'
    });
    loadServiceHistory(svc);
    setServiceDialogOpen(true);
  };

  const saveService = async () => {
    if (!serviceForm.vehicle_brand?.trim() && !serviceForm.plate?.trim() && !serviceForm.customer_name?.trim()) {
      toast.error('En az müşteri, araç veya plaka bilgisi girin');
      return;
    }
    const cleanItems = (serviceForm.items || [])
      .filter((it) => (it.name || '').trim() || parseFloat(it.unit_price) > 0)
      .map((it) => {
        const cur = it.currency || 'TRY';
        let rate = cur !== 'TRY' && it.rate !== '' && it.rate != null ? parseFloat(it.rate) : null;
        if (cur !== 'TRY' && !(rate > 0)) {
          const live = parseFloat(exchangeRates?.[cur]);
          rate = live > 0 ? parseFloat(live.toFixed(4)) : null; // kur kayıt anında sabitlenir
        }
        return { name: (it.name || '').trim(), qty: parseFloat(it.qty) || 0, unit_price: parseFloat(it.unit_price) || 0, currency: cur, rate };
      });
    const itemsCost = serviceItemsTotal(cleanItems);
    const cleanCollections = (serviceForm.collections || [])
      .filter((c) => c.amount !== '' && c.amount != null && !isNaN(parseFloat(c.amount)))
      .map((c) => {
        // Döviz tahsilatında kur kayıt anında SABİTLENİR: boş bırakıldıysa
        // güncel kuru yaz. Yoksa kalan tutar her kur güncellemesinde değişir.
        let rate = (c.currency && c.currency !== 'TRY' && c.rate !== '' && c.rate != null) ? parseFloat(c.rate) : null;
        if (c.currency && c.currency !== 'TRY' && !(rate > 0)) {
          const live = parseFloat(exchangeRates?.[c.currency]);
          rate = live > 0 ? parseFloat(live.toFixed(4)) : null;
        }
        return {
          id: c.id || newId(),
          date: c.date || null,
          description: (c.description || '').trim() || null,
          amount: Math.abs(parseFloat(c.amount)) || 0,
          currency: c.currency || 'TRY',
          rate,
        };
      });
    const payload = {
      ...serviceForm,
      is_trailer: !!serviceForm.is_trailer,
      items: cleanItems,
      photos: serviceForm.photos || [],
      collections: cleanCollections,
      cost: cleanItems.length > 0
        ? itemsCost
        : (serviceForm.cost !== '' && serviceForm.cost != null ? parseFloat(serviceForm.cost) : null),
      // Tahsilat listesi doluysa avans 0'a zorlanır (tek kaynak collections; çift sayım önlenir)
      advance_amount: cleanCollections.length > 0
        ? 0
        : (serviceForm.advance_amount !== '' && serviceForm.advance_amount != null ? parseFloat(serviceForm.advance_amount) : 0),
      discount_amount: serviceForm.discount_amount !== '' && serviceForm.discount_amount != null ? (parseFloat(serviceForm.discount_amount) || 0) : 0,
      discount_percent: serviceForm.discount_percent !== '' && serviceForm.discount_percent != null ? (parseFloat(serviceForm.discount_percent) || 0) : 0,
      payment_account: serviceForm.payment_account || null,
      warranty_months: serviceForm.warranty_months !== '' && serviceForm.warranty_months != null ? parseInt(serviceForm.warranty_months, 10) : null,
      warranty_note: serviceForm.warranty_note || null,
      arrival_date: serviceForm.arrival_date || null,
      delivery_date: serviceForm.delivery_date || null,
    };
    try {
      setServiceSaving(true);
      if (serviceEditingId) {
        await axios.put(`${API}/services/${serviceEditingId}`, payload);
        toast.success('Servis kaydı güncellendi');
      } else {
        await axios.post(`${API}/services`, payload);
        toast.success('Servis kaydı eklendi');
      }
      setServiceDialogOpen(false);
      setViewingService(null);
      await loadServices();
    } catch (error) {
      console.error('Servis kaydedilemedi:', error);
      toast.error(error.response?.data?.detail || 'Servis kaydedilemedi');
    } finally {
      setServiceSaving(false);
    }
  };

  const deleteService = async (id) => {
    if (!window.confirm('Bu servis kaydını silmek istediğinize emin misiniz?')) return;
    try {
      await axios.delete(`${API}/services/${id}`);
      toast.success('Servis kaydı silindi');
      await loadServices();
    } catch (error) {
      console.error('Servis silinemedi:', error);
      toast.error('Servis kaydı silinemedi');
    }
  };

  const setServiceStatus = async (id, status) => {
    try {
      const patch = { status };
      if (status === 'delivered') patch.delivery_date = new Date().toISOString().slice(0, 10);
      await axios.put(`${API}/services/${id}`, patch);
      await loadServices();
      toast.success(status === 'delivered' ? 'Teslim edildi olarak işaretlendi' : 'Durum güncellendi');
    } catch (error) {
      console.error('Durum güncellenemedi:', error);
      toast.error('Durum güncellenemedi');
    }
  };

  // Müşteri teklifi onayladığında teklifi servise aktar (servis dialogunu önceden doldurup açar)
  const sendQuoteToService = (quote) => {
    let customerName = '';
    if (quote?.customer_id) {
      const c = customers.find((c) => c.id === quote.customer_id);
      if (c) customerName = c.name || '';
    }
    // Teklif net toplamı = ürünler − indirim + işçilik. Servis kalemlerine birebir yansıt:
    const disc = parseFloat(quote?.discount_percentage) || 0;
    const labor = parseFloat(quote?.labor_cost) || 0;
    const quoteItems = (quote?.products || []).map((p) => {
      // İsim/fiyat TEKLİF ANI snapshot'ından (canlı ürün değil — fiyat değişmiş olabilir)
      const nm = p.name || products.find((prod) => prod.id === p.id)?.name || 'Ürün';
      const qty = parseFloat(p.quantity) || 1;
      // Birim fiyat zaten teklif anında TL'ye çevrilmiş: list_price_try (özel fiyat
      // varsa create_quote bunu custom_price*kur ile yazıyor). custom_price'ı DOĞRUDAN
      // kullanma — o ürünün kendi para biriminde (€/$) olabilir, TL değil.
      let unit = parseFloat(p.list_price_try);
      if (!unit || isNaN(unit)) unit = parseFloat(p.discounted_price_try);
      if (!unit || isNaN(unit)) unit = parseFloat(p.list_price) || 0; // manuel kalem (TL)
      unit = unit * (1 - disc / 100);
      return { name: nm, qty, unit_price: Math.round(unit) };
    });
    // İşçilik ayrı kalem olarak (teklif toplamına dahildi)
    if (labor > 0) quoteItems.push({ name: 'İşçilik', qty: 1, unit_price: Math.round(labor) });
    const baseNote = quote?.notes ? `${quote.notes}\n\n` : '';
    setServiceEditingId(null);
    setServiceForm({
      ...emptyServiceForm,
      customer_name: customerName || quote?.name || '',
      items: quoteItems,
      notes: `${baseNote}[Teklif: ${quote?.name || ''}]`,
      cost: quote?.total_net_price != null ? String(quote.total_net_price) : '',
      arrival_date: new Date().toISOString().slice(0, 10),
      status: 'received',
    });
    setServiceHistory([]);
    setServiceDialogOpen(true);
    toast.success('Teklif servise aktarıldı — kalemleri/fiyatları kontrol edip kaydedin');
  };

  const getContractPaymentStatus = (c) => {
    const parsed = c.data;
    if (!parsed) return null;
    const liveRate = parseFloat(exchangeRates?.EUR) || (parsed && parsed.kur) || 0;
    const cr = parseFloat(parsed?.kur) || 0;
    const toEUR = (amount, currency, rate) => {
      const a = parseFloat(amount); if (isNaN(a)) return 0;
      if (currency === 'TRY') { const r = parseFloat(rate) || cr || liveRate || 1; return r ? a / r : 0; }
      if (currency === 'USD') { const u = parseFloat(exchangeRates?.USD) || 0; const e = parseFloat(exchangeRates?.EUR) || cr || 0; return (u && e) ? a * u / e : 0; }
      return a;
    };
    const productsEUR = parsed?.eurTotal != null ? (parseFloat(parsed.eurTotal) || 0) : (parsed?.grandTotal && cr ? parsed.grandTotal / cr : 0);
    const addons = parsed?.addons || [];
    const addonsEUR = addons.reduce((s, a) => s + ((a.amount == null || a.amount === '') ? 0 : toEUR(a.amount, a.currency, a.rate)), 0);
    const inv = parsed?.invoiceDiff;
    const invEUR = (inv && inv.amount != null && inv.amount !== '') ? toEUR(Math.abs(parseFloat(inv.amount) || 0), inv.currency, inv.rate) : 0;
    const grandEUR = productsEUR + addonsEUR + invEUR;
    const collections = parsed?.collections || [];
    const collectedEUR = collections.reduce((s, c) => s + toEUR(c.amount, c.currency, c.rate), 0);
    const remainingEUR = grandEUR - collectedEUR;
    const pct = grandEUR > 0 ? Math.max(0, Math.min(100, Math.round(collectedEUR / grandEUR * 100))) : 0;

    const st = grandEUR <= 0 ? null : (remainingEUR <= 0.01 ? { t: 'TAMAMLANDI', c: 'bg-emerald-500 text-white' } : (collectedEUR > 0.01 ? { t: `ÖDEME %${pct}`, c: 'bg-amber-500 text-white' } : { t: 'ÖDENMEDİ', c: 'bg-rose-500 text-white' }));
    const over = remainingEUR < -0.01;
    return over ? { t: 'FAZLA ÖDEME', c: 'bg-violet-500 text-white' } : st;
  };

  // Sözleşme ödeme durumu sınıfı: 'open' (tamamlanmamış) | 'done' (tamamlandı/fazla) | 'none' (finansal veri yok)
  const contractPayClass = (c) => {
    const st = getContractPaymentStatus(c);
    if (!st) return 'none';
    return (st.t === 'TAMAMLANDI' || st.t === 'FAZLA ÖDEME') ? 'done' : 'open';
  };

  // ===================== SÖZLEŞMELER =====================
  // İki sözleşmenin tam listedeki yerini değiştir + sırayı kalıcı kaydet
  const swapContracts = async (idA, idB) => {
    if (!idA || !idB) return;
    const arr = [...contracts];
    const ia = arr.findIndex((c) => c.id === idA);
    const ib = arr.findIndex((c) => c.id === idB);
    if (ia < 0 || ib < 0) return;
    [arr[ia], arr[ib]] = [arr[ib], arr[ia]];
    setContracts(arr); // optimistic
    try {
      await axios.post(`${API}/contracts/reorder`, { ordered_ids: arr.map((c) => c.id) });
    } catch (e) {
      console.error('Sıralama kaydedilemedi:', e);
      toast.error('Sıralama kaydedilemedi');
      loadContracts();
    }
  };

  const loadContracts = async () => {
    try {
      const r = await axios.get(`${API}/contracts`);
      setContracts(r.data || []);
    } catch (error) {
      console.error('Sözleşmeler yüklenemedi:', error);
      toast.error('Sözleşmeler yüklenemedi');
    }
  };

  const uploadContract = async () => {
    if (!contractForm.title.trim()) { toast.error('En az bir araç türü seçin'); return; }
    if (!contractFile) { toast.error('Excel dosyası seçin'); return; }
    try {
      setContractUploading(true);
      const fd = new FormData();
      fd.append('file', contractFile);
      fd.append('title', contractForm.title.trim());
      if (contractForm.customer_name) fd.append('customer_name', contractForm.customer_name);
      if (contractForm.notes) fd.append('notes', contractForm.notes);
      await axios.post(`${API}/contracts`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Sözleşme yüklendi');
      setContractUploadOpen(false);
      setContractFile(null);
      setContractForm(emptyContractForm);
      await loadContracts();
    } catch (error) {
      console.error('Sözleşme yüklenemedi:', error);
      toast.error(error.response?.data?.detail || 'Sözleşme yüklenemedi');
    } finally {
      setContractUploading(false);
    }
  };

  const setContractStage = async (id, stage) => {
    try {
      await axios.put(`${API}/contracts/${id}`, { stage });
      setContracts((prev) => prev.map((c) => (c.id === id ? { ...c, stage } : c)));
    } catch (e) {
      toast.error('Aşama güncellenemedi');
    }
  };

  const bulkUploadContracts = async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => /\.(xlsx|xls|xlsm)$/i.test(f.name));
    if (files.length === 0) { toast.error('Excel dosyası (.xlsx/.xls) seçilmedi'); return; }
    setBulkUploading(true);
    setBulkProgress({ done: 0, total: files.length, fail: 0 });
    let ok = 0, fail = 0;
    for (const f of files) {
      try {
        const fd = new FormData();
        fd.append('file', f);
        // başlık/müşteri gönderilmiyor → backend Excel içeriğinden otomatik türetir
        await axios.post(`${API}/contracts`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        ok++;
      } catch (e) {
        fail++;
      }
      setBulkProgress({ done: ok + fail, total: files.length, fail });
    }
    setBulkUploading(false);
    if (fail === 0) toast.success(`${ok} sözleşme yüklendi`);
    else toast.error(`${ok} yüklendi, ${fail} başarısız`);
    await loadContracts();
  };

  const openContract = async (id, startInEditMode = false) => {
    try {
      setContractLoadingView(true);
      setContractSimRate(''); // simülasyonu sıfırla
      setContractEditMode(false); setContractDraft(null); setContractDirty(false); setContractHistory([]);
      const r = await axios.get(`${API}/contracts/${id}`);
      setViewingContract(r.data);
      if (startInEditMode) {
        const baseData = r.data.data || parseContract(r.data.sheets);
        enterContractEdit(baseData);
      }
    } catch (error) {
      console.error('Sözleşme açılamadı:', error);
      toast.error('Sözleşme açılamadı');
    } finally {
      setContractLoadingView(false);
    }
  };

  const deleteContract = async (id) => {
    if (!window.confirm('Bu sözleşmeyi silmek istediğinize emin misiniz?')) return;
    try {
      await axios.delete(`${API}/contracts/${id}`);
      toast.success('Sözleşme silindi');
      if (viewingContract?.id === id) setViewingContract(null);
      await loadContracts();
    } catch (error) {
      console.error('Sözleşme silinemedi:', error);
      toast.error('Sözleşme silinemedi');
    }
  };

  const openEditContract = (c) => {
    setContractEditId(c.id);
    setContractEditForm({ title: c.title || '', customer_name: c.customer_name || '', notes: c.notes || '' });
    setContractEditOpen(true);
  };

  const saveEditContract = async () => {
    if (!contractEditForm.title.trim()) { toast.error('Başlık boş olamaz'); return; }
    try {
      setContractEditSaving(true);
      const titleUp = contractEditForm.title.trim().toLocaleUpperCase('tr-TR');
      const customerUp = contractEditForm.customer_name ? contractEditForm.customer_name.trim().toLocaleUpperCase('tr-TR') : null;
      const notesUp = contractEditForm.notes ? contractEditForm.notes.trim().toLocaleUpperCase('tr-TR') : null;
      
      await axios.put(`${API}/contracts/${contractEditId}`, {
        title: titleUp,
        customer_name: customerUp,
        notes: notesUp,
      });
      toast.success('Sözleşme güncellendi');
      setContractEditOpen(false);
      // Açık önizleme varsa onu da tazele
      if (viewingContract?.id === contractEditId) {
        setViewingContract({ ...viewingContract, title: titleUp, customer_name: customerUp, notes: notesUp });
      }
      await loadContracts();
    } catch (error) {
      console.error('Sözleşme güncellenemedi:', error);
      toast.error(error.response?.data?.detail || 'Güncellenemedi');
    } finally {
      setContractEditSaving(false);
    }
  };

  const copyContract = async (id) => {
    try {
      await axios.post(`${API}/contracts/${id}/copy`);
      toast.success('Sözleşme kopyalandı');
      await loadContracts();
    } catch (error) {
      console.error('Sözleşme kopyalanamadı:', error);
      toast.error('Kopyalanamadı');
    }
  };

  // --- Sözleşme kalem düzenleme ---
  const recalcDraftTotals = (d) => {
    let gt = 0, et = 0;
    (d.sections || []).forEach((sec) => (sec.items || []).forEach((it) => {
      gt += Number(it.total) || 0;
      et += (parseFloat(it.eurUnit) || 0) * (parseFloat(it.qty) || 0);
    }));
    d.grandTotal = gt;
    d.eurTotal = d.kur ? gt / d.kur : null;
    return d;
  };

  // Her sözleşmede standart bulunması gereken alt maddeler (silinebilir)
  const STANDARD_CONTRACT_NOTES = [
    ['KDV', 'FİYATLARA KDV DAHİL DEĞİLDİR.'],
    ['GARANTİ', 'GARANTİ SÜRESİ CİHAZLARDA 2 YIL MOBİLYADA 5 YILDIR.'],
    ['GÜNCELLENİR', 'FİYATLAR KUR DURUMUNA GÖRE GÜNCELLENİR.'],
  ];
  const injectStandardContractNotes = (notes) => {
    const arr = (notes || []).map((n) => (n == null ? '' : String(n)));
    const used = new Array(arr.length).fill(false);
    const result = [];
    STANDARD_CONTRACT_NOTES.forEach(([kw, text]) => {
      const idx = arr.findIndex((n, i) => !used[i] && n.toLocaleUpperCase('tr-TR').includes(kw));
      if (idx >= 0) { result.push(arr[idx]); used[idx] = true; }
      else { result.push(text); }
    });
    arr.forEach((n, i) => { if (!used[i]) result.push(n); });
    return result;
  };

  // Müşterinin seçtiği renk/malzeme etiketleri — notlardan ayrıştırılır, en üstte kutu olarak gösterilir
  const SPEC_LABELS = ['KUMAŞ', 'MOBİLYA ANA RENK', 'DOLAP KAPAKLARI', 'KÖŞE DÖNÜŞLER', 'MİNDER', 'PARKE'];
  const parseContractSpecs = (notesArray) => {
    const specs = {}; SPEC_LABELS.forEach((l) => { specs[l] = ''; });
    const remaining = [];
    (notesArray || []).forEach((line) => {
      if (line == null || line === '') { return; }
      const U = String(line).toLocaleUpperCase('tr-TR');
      const found = [];
      SPEC_LABELS.forEach((l) => { const idx = U.indexOf(l); if (idx >= 0) found.push({ l, idx }); });
      if (found.length === 0) { remaining.push(line); return; }
      found.sort((a, b) => a.idx - b.idx);
      for (let i = 0; i < found.length; i++) {
        const start = found[i].idx + found[i].l.length;
        const end = i + 1 < found.length ? found[i + 1].idx : String(line).length;
        let val = String(line).substring(start, end);
        val = val.replace(/^[\s:\-/]+/, '').replace(/[\s:\-/]+$/, '').trim();
        if (val) specs[found[i].l] = val.toLocaleUpperCase('tr-TR');
      }
    });
    return { specs, remaining };
  };

  const enterContractEdit = (baseData) => {
    if (!baseData) return;
    const d = JSON.parse(JSON.stringify(baseData));
    if (!d.specs) {
      const { specs, remaining } = parseContractSpecs(d.notes || []);
      d.specs = specs;
      d.notes = remaining;
    }
    // Sürükle-bırak için her kaleme stabil _uid ata (animasyon sürekliliği)
    (d.sections || []).forEach((sec) => (sec.items || []).forEach((it) => { if (!it._uid) it._uid = newId(); }));
    setContractDraft(d);
    setContractDirty(false);
    setContractSimRate(''); // düzenlemede simülasyon kapalı
    setContractHistory([]);
    setContractEditMode(true);
  };

  // Ctrl+Z ile sözleşme düzenlemede son değişikliği geri al
  useEffect(() => {
    if (!contractEditMode) return;
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        undoContractChange();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [contractEditMode, contractHistory]);

  // Sözleşme taslağını geçmişe atıp güvenle değiştir (finansal bölümler için)
  const mutateContractDraft = (fn) => {
    setContractHistory((prev) => [...prev, JSON.parse(JSON.stringify(contractDraft))]);
    setContractDraft((prev) => { const d = JSON.parse(JSON.stringify(prev)); fn(d); return d; });
    setContractDirty(true);
  };
  const newId = () => Math.random().toString(36).slice(2, 10);

  const updateDraftItem = (si, ii, field, value) => {
    const finalVal = field === 'name' ? value.toLocaleUpperCase('tr-TR') : value;
    setContractHistory(prev => [...prev, JSON.parse(JSON.stringify(contractDraft))]);
    setContractDraft((prev) => {
      const d = JSON.parse(JSON.stringify(prev));
      const it = d.sections[si].items[ii];
      it[field] = finalVal;
      if (field === 'eurUnit' || field === 'qty') {
        const eur = parseFloat(it.eurUnit) || 0;
        const qty = parseFloat(it.qty) || 0;
        if (d.kur != null) { it.tlUnit = eur * d.kur; it.total = eur * qty * d.kur; }
      }
      return recalcDraftTotals(d);
    });
    setContractDirty(true);
  };

  const deleteDraftItem = (si, ii) => {
    setContractHistory(prev => [...prev, JSON.parse(JSON.stringify(contractDraft))]);
    setContractDraft((prev) => {
      const d = JSON.parse(JSON.stringify(prev));
      d.sections[si].items.splice(ii, 1);
      
      // Sürekli numaralandırma
      let cnt = 1;
      d.sections.forEach(sec => sec.items.forEach(it => { it.sno = String(cnt++); }));
      
      return recalcDraftTotals(d);
    });
    setContractDirty(true);
  };

  // dnd-kit bırakınca kalemi taşı. over.id bir kalem _uid'i veya `sec-end-<si>` (bölüm sonu/boş bölüm). Bölüm içi + bölümler arası.
  const handleContractItemDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setContractHistory((prev) => [...prev, JSON.parse(JSON.stringify(contractDraft))]);
    setContractDraft((prev) => {
      const d = JSON.parse(JSON.stringify(prev));
      let from = null;
      d.sections.forEach((sec, si) => (sec.items || []).forEach((it, ii) => { if (it._uid === active.id) from = { si, ii }; }));
      if (!from) return prev;
      const overId = String(over.id);
      const isEnd = overId.startsWith('sec-end-');
      let toSi, toIi;
      if (isEnd) {
        toSi = parseInt(overId.slice(8), 10);
        toIi = d.sections[toSi] ? d.sections[toSi].items.length : 0;
      } else {
        let t = null;
        d.sections.forEach((sec, si) => (sec.items || []).forEach((it, ii) => { if (it._uid === over.id) t = { si, ii }; }));
        if (!t) return prev;
        toSi = t.si; toIi = t.ii;
      }
      if (from.si === toSi) {
        const target = isEnd ? d.sections[toSi].items.length - 1 : toIi;
        d.sections[from.si].items = arrayMove(d.sections[from.si].items, from.ii, target);
      } else {
        const [moved] = d.sections[from.si].items.splice(from.ii, 1);
        const insertAt = isEnd ? d.sections[toSi].items.length : toIi;
        d.sections[toSi].items.splice(insertAt, 0, moved);
      }
      let cnt = 1;
      d.sections.forEach((sec) => (sec.items || []).forEach((it) => { it.sno = String(cnt++); }));
      return recalcDraftTotals(d);
    });
    setContractDirty(true);
  };

  const saveContractDraft = async () => {
    if (!contractDraft) return;
    try {
      setContractDataSaving(true);
      // İlave/tahsilat/fatura farkı için EUR karşılığı snapshot'ı (TL=söz kuru, USD=güncel kur) — PDF/total tutarlılığı
      const draftToSave = JSON.parse(JSON.stringify(contractDraft));
      (draftToSave.sections || []).forEach((sec) => (sec.items || []).forEach((it) => { delete it._uid; })); // dahili sürükle id'sini kaydetme
      const crv = parseFloat(draftToSave.kur) || 0;
      const eurOf = (amount, currency, rate) => {
        const a = parseFloat(amount); if (isNaN(a)) return null;
        if (currency === 'TRY') { const r = parseFloat(rate) || crv || 1; return r ? a / r : 0; }
        if (currency === 'USD') { const u = parseFloat(exchangeRates?.USD) || 0; const e = parseFloat(exchangeRates?.EUR) || crv || 0; return (u && e) ? a * u / e : 0; }
        return a;
      };
      (draftToSave.addons || []).forEach((a) => { a.amountEUR = (a.amount == null || a.amount === '') ? null : eurOf(a.amount, a.currency, a.rate); });
      (draftToSave.collections || []).forEach((c) => { c.amountEUR = eurOf(c.amount, c.currency, c.rate); });
      if (draftToSave.invoiceDiff && draftToSave.invoiceDiff.amount != null && draftToSave.invoiceDiff.amount !== '') {
        const amt = parseFloat(draftToSave.invoiceDiff.amount);
        if (!isNaN(amt) && amt < 0) {
          draftToSave.invoiceDiff.amount = Math.abs(amt).toString();
        }
        draftToSave.invoiceDiff.amountEUR = eurOf(draftToSave.invoiceDiff.amount, draftToSave.invoiceDiff.currency, draftToSave.invoiceDiff.rate);
      }
      // Şablon editörü: gerçek sözleşme değil — doğrudan varsayılan şablona yaz
      if (viewingContract?.isTemplate) {
        await axios.put(`${API}/contracts/template`, { data: draftToSave });
        setViewingContract((vc) => ({ ...vc, data: draftToSave }));
        setContractEditMode(false);
        setContractDirty(false);
        setContractDraft(null);
        setContractHistory([]);
        toast.success('Varsayılan şablon kaydedildi — "Sıfırdan Sözleşme" artık bununla açılacak');
        return;
      }
      const payload = { data: draftToSave };
      if (draftToSave.generalNotes !== undefined) {
        payload.notes = draftToSave.generalNotes.toLocaleUpperCase('tr-TR');
      }
      await axios.put(`${API}/contracts/${viewingContract.id}`, payload);
      setViewingContract((vc) => ({
        ...vc,
        data: draftToSave,
        notes: draftToSave.generalNotes !== undefined ? draftToSave.generalNotes.toLocaleUpperCase('tr-TR') : vc.notes
      }));
      setContractEditMode(false);
      setContractDirty(false);
      setContractDraft(null);
      setContractHistory([]);
      toast.success('Sözleşme kaydedildi');
      await loadContracts();
    } catch (error) {
      console.error('Sözleşme kaydedilemedi:', error);
      toast.error(error.response?.data?.detail || 'Kaydedilemedi');
    } finally {
      setContractDataSaving(false);
    }
  };

  // Ayrı "Şablon Sözleşme" editörünü aç — gerçek sözleşme OLUŞTURMAZ, doğrudan varsayılan şablonu düzenler
  const openTemplateEditor = async () => {
    try {
      setContractLoadingView(true);
      setContractSimRate('');
      setContractEditMode(false); setContractDraft(null); setContractDirty(false); setContractHistory([]);
      const liveKur = parseFloat(exchangeRates?.EUR) || 40;
      const r = await axios.get(`${API}/contracts/template-data`, { params: { kur: liveKur } });
      const data = r.data?.data;
      if (!data) { toast.error('Şablon verisi alınamadı'); return; }
      setViewingContract({ id: '__template__', isTemplate: true, title: 'ŞABLON SÖZLEŞME', customer_name: null, notes: null, sheets: [], data });
      setContractRawView(false);
      enterContractEdit(data);
    } catch (error) {
      console.error('Şablon editörü açılamadı:', error);
      toast.error('Şablon editörü açılamadı');
    } finally {
      setContractLoadingView(false);
    }
  };

  const addDraftItem = (si) => {
    setContractHistory(prev => [...prev, JSON.parse(JSON.stringify(contractDraft))]);
    setContractDraft((prev) => {
      const d = JSON.parse(JSON.stringify(prev));
      const nextItem = { _uid: newId(), sno: '', name: '', qty: 1, eurUnit: 0, tlUnit: 0, total: 0 };
      d.sections[si].items.push(nextItem);
      
      // Sürekli numaralandırma
      let cnt = 1;
      d.sections.forEach(sec => sec.items.forEach(it => { it.sno = String(cnt++); }));
      
      return recalcDraftTotals(d);
    });
    setContractDirty(true);
  };

  const addDraftSection = (name) => {
    if (!name.trim()) return;
    const cleanName = name.toLocaleUpperCase('tr-TR').trim();
    setContractHistory(prev => [...prev, JSON.parse(JSON.stringify(contractDraft))]);
    setContractDraft((prev) => {
      const d = JSON.parse(JSON.stringify(prev));
      d.sections.push({ name: cleanName, items: [] });
      return d;
    });
    setContractDirty(true);
  };

  const saveSimulatedRate = async () => {
    const rate = parseFloat(contractSimRate);
    if (isNaN(rate) || rate <= 0) return;
    const baseData = viewingContract.data || parseContract(viewingContract.sheets);
    if (!baseData) return;
    try {
      setContractDataSaving(true);
      const updated = JSON.parse(JSON.stringify(baseData));
      updated.kur = rate;
      updated.sections.forEach((sec) => {
        sec.items.forEach((it) => {
          const eur = parseFloat(it.eurUnit) || 0;
          const qty = parseFloat(it.qty) || 0;
          it.tlUnit = eur * rate;
          it.total = eur * qty * rate;
        });
      });
      
      // Recalc totals
      let gt = 0;
      updated.sections.forEach((sec) => sec.items.forEach((it) => {
        gt += Number(it.total) || 0;
      }));
      updated.grandTotal = gt;
      updated.eurTotal = rate ? gt / rate : null;
      
      await axios.put(`${API}/contracts/${viewingContract.id}`, { data: updated });
      setViewingContract(prev => ({ ...prev, data: updated }));
      setContractSimRate('');
      toast.success('Yeni kur kalıcı olarak sözleşmeye kaydedildi.');
      await loadContracts();
    } catch (e) {
      console.error(e);
      toast.error('Kur kaydedilemedi');
    } finally {
      setContractDataSaving(false);
    }
  };

  const revertToOriginalRate = async () => {
    const baseData = viewingContract.data || parseContract(viewingContract.sheets);
    if (!baseData || baseData.originalKur == null) return;
    const orig = baseData.originalKur;
    if (!window.confirm(`Sözleşme kurunu orijinal kur değerine (1 € = ₺${orig}) geri döndürmek istediğinize emin misiniz?`)) return;
    try {
      setContractDataSaving(true);
      const updated = JSON.parse(JSON.stringify(baseData));
      updated.kur = orig;
      updated.sections.forEach((sec) => {
        sec.items.forEach((it) => {
          const eur = parseFloat(it.eurUnit) || 0;
          const qty = parseFloat(it.qty) || 0;
          it.tlUnit = eur * orig;
          it.total = eur * qty * orig;
        });
      });
      
      let gt = 0;
      updated.sections.forEach((sec) => sec.items.forEach((it) => {
        gt += Number(it.total) || 0;
      }));
      updated.grandTotal = gt;
      updated.eurTotal = orig ? gt / orig : null;
      
      await axios.put(`${API}/contracts/${viewingContract.id}`, { data: updated });
      setViewingContract(prev => ({ ...prev, data: updated }));
      setContractSimRate('');
      toast.success('Orijinal kura geri dönüldü.');
      await loadContracts();
    } catch (e) {
      console.error(e);
      toast.error('Orijinal kura dönülemedi');
    } finally {
      setContractDataSaving(false);
    }
  };

  const createNewContract = async () => {
    if (!newContractForm.title.trim()) { toast.error('Araç türü seçin'); return; }
    const rate = parseFloat(newContractForm.kur);
    if (isNaN(rate) || rate <= 0) { toast.error('Lütfen geçerli bir kur girin'); return; }
    try {
      setNewContractCreating(true);
      const r = await axios.post(`${API}/contracts/new`, {
        title: newContractForm.title.trim().toLocaleUpperCase('tr-TR'),
        customer_name: newContractForm.customer_name ? newContractForm.customer_name.trim().toLocaleUpperCase('tr-TR') : null,
        notes: newContractForm.notes ? newContractForm.notes.trim().toLocaleUpperCase('tr-TR') : null,
        kur: rate
      });
      toast.success('Sözleşme sıfırdan başarıyla oluşturuldu');
      setNewContractDialogOpen(false);
      setNewContractForm({ title: '', customer_name: '', notes: '', kur: '35.00' });
      await loadContracts();
      await openContract(r.data.id, true);
    } catch (e) {
      console.error(e);
      toast.error('Yeni sözleşme oluşturulamadı');
    } finally {
      setNewContractCreating(false);
    }
  };

  const undoContractChange = () => {
    if (contractHistory.length === 0) return;
    const prev = contractHistory[contractHistory.length - 1];
    setContractDraft(prev);
    setContractHistory(h => h.slice(0, -1));
    setContractDirty(true);
    toast.success('Son değişiklik geri alındı');
  };

  // Düzenleme modundan çık; değişiklik varsa kaydet/iptal sor. Returns true = çıkıldı.
  const exitContractEdit = async () => {
    if (contractDirty) {
      const save = window.confirm('Değişiklikler var. Kaydetmek ister misiniz?\n\nTamam = Kaydet, İptal = Değişiklikleri sil');
      if (save) { await saveContractDraft(); return; }
    }
    setContractEditMode(false);
    setContractDraft(null);
    setContractDirty(false);
    setContractHistory([]);
  };

  const backFromContract = async () => {
    if (contractEditMode && contractDirty) {
      const save = window.confirm('Değişiklikler var. Kaydetmek ister misiniz?\n\nTamam = Kaydet, İptal = Değişiklikleri sil');
      if (save) { await saveContractDraft(); }
    }
    setContractEditMode(false);
    setContractDraft(null);
    setContractDirty(false);
    setContractHistory([]);
    setViewingContract(null);
  };

  // Sözleşme Excel'ini akıllıca yapıya çevir (bölüm/kalem/toplam/not). Tanınmazsa null -> ham tablo.
  const parseContract = (sheets) => {
    try {
      if (!sheets || !sheets.length) return null;
      const rows = sheets[0].rows || [];
      const up = (s) => (s == null ? '' : s.toString()).toLocaleUpperCase('tr-TR').trim();
      let headerIdx = -1;
      const col = { sno: 0, qty: null, eur: null, tl: null, total: null };
      let nameCol = 1;
      for (let i = 0; i < Math.min(rows.length, 15); i++) {
        const r = rows[i] || [];
        if (r.some((c) => up(c).includes('TUTAR'))) {
          headerIdx = i;
          let bestLen = -1;
          r.forEach((c, ci) => {
            const u = up(c);
            if (!u) return;
            if (u === 'S.NO' || u === 'NO' || u === 'SNO' || u === 'S NO') col.sno = ci;
            else if (u.includes('ADET')) col.qty = ci;
            else if (u.includes('EUR')) col.eur = ci;
            else if (u.includes('TL F') || (u.includes('TL') && u.includes('YAT'))) col.tl = ci;
            else if (u.includes('TUTAR')) col.total = ci;
            else if (u.includes('KUR')) col.kur = ci;
            else if (u.length > bestLen) { bestLen = u.length; nameCol = ci; }
          });
          break;
        }
      }
      if (headerIdx < 0 || col.total == null) return null;
      const numOf = (v) => {
        if (v == null || v === '') return null;
        let s = v.toString().trim().replace(/[^\d.,-]/g, '');
        if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
        const n = parseFloat(s);
        return isNaN(n) ? null : n;
      };
      const cellAt = (r, idx) => (idx != null && r[idx] != null ? r[idx].toString().trim() : '');
      const subtitle = rows[headerIdx] && rows[headerIdx][nameCol] ? rows[headerIdx][nameCol].toString() : '';
      const rawSections = [];
      let cur = { name: '', items: [] };
      const notes = [];
      let grandTotal = null;
      let kur = null;
      let afterTotal = false;
      for (let i = headerIdx + 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const name = cellAt(r, nameCol);
        const eur = cellAt(r, col.eur);
        const tlUnitStr = cellAt(r, col.tl);
        const totalStr = cellAt(r, col.total);
        const sno = cellAt(r, col.sno);
        const qty = cellAt(r, col.qty);
        const kurStr = cellAt(r, col.kur);
        if (kur == null && kurStr) kur = numOf(kurStr);
        const u = up(name);
        if (!name && !totalStr && !eur) continue;
        if (u.includes('GENEL TOPLAM')) { grandTotal = numOf(totalStr); afterTotal = true; continue; }
        if (afterTotal) {
          if (u.includes('ÇORLU KARAVAN') || u === 'MÜŞTERİ' || u.includes('ZAMKI') || u.includes('İMZA')) continue;
          if (u.includes('EURO KUR') || u.includes('KAÇ EURO') || u.includes('KARŞILIĞI')) continue; // başlıkta gösteriliyor
          if (name) notes.push(up(name));
          continue;
        }
        if (eur !== '') {
          cur.items.push({ sno, name: up(name), qty, eurUnit: numOf(eur), tlUnit: numOf(tlUnitStr), total: numOf(totalStr) });
        } else if (name) {
          if (cur.items.length) rawSections.push(cur);
          cur = { name: up(name), items: [] };
        }
      }
      if (cur.items.length) rawSections.push(cur);
      if (!rawSections.length) return null;

      // --- 1. SİNEKLİKLER - TENTE - BASAMAKLAR Bölümü & DİĞER Taşıma Kuralı ---
      // Küçük harf ASCII kök eşleşmesi (sinek/sinekliği, basamak/basamağı vb. yakalanır)
      const lc = (s) => (s || '').toLocaleLowerCase('tr-TR');
      const shouldMoveToDiger = (itemName) => {
        if (!itemName) return true;
        const n = lc(itemName);
        const hasKw = n.includes('sinek') || n.includes('tente') || n.includes('basama');
        if (!hasKw) return true;
        // Exclude terms like PROJE etc.
        if (n.includes('proje') || n.includes('muayene') || n.includes('emisyon') || n.includes('ruhsat') || n.includes('hizmet bedeli')) {
          return true;
        }
        return false;
      };

      const processedSections = [];
      const movedItems = [];

      rawSections.forEach((sec) => {
        const secNameLc = lc(sec.name);
        const isTargetSec = secNameLc.includes('sinek') || secNameLc.includes('tente') || secNameLc.includes('basama');
        
        if (isTargetSec) {
          const validItems = [];
          sec.items.forEach((item) => {
            if (shouldMoveToDiger(item.name)) {
              movedItems.push(item);
            } else {
              validItems.push(item);
            }
          });
          processedSections.push({ ...sec, items: validItems });
        } else {
          processedSections.push(sec);
        }
      });

      if (movedItems.length > 0) {
        const digerSecIdx = processedSections.findIndex((s) => up(s.name) === 'DİĞER');
        if (digerSecIdx >= 0) {
          processedSections[digerSecIdx].items.push(...movedItems);
        } else {
          processedSections.push({ name: 'DİĞER', items: movedItems });
        }
      }

      // --- 2. Sürekli Sıra Numaralandırma (sno 1, 2, 3...) ---
      let itemCounter = 1;
      processedSections.forEach((sec) => {
        sec.items.forEach((it) => {
          it.sno = String(itemCounter++);
        });
      });

      const itemCount = processedSections.reduce((s, sec) => s + sec.items.length, 0);
      const eurTotal = grandTotal != null && kur ? grandTotal / kur : null;
      return { subtitle: up(subtitle), sections: processedSections, notes: injectStandardContractNotes(notes), grandTotal, eurTotal, kur, originalKur: kur, itemCount };
    } catch (e) {
      console.error('Sözleşme ayrıştırma hatası:', e);
      return null;
    }
  };

  const refreshPrices = async () => {
    try {
      setLoading(true);
      
      // Döviz kurlarını güncelle
      const exchangeSuccess = await loadExchangeRates(true);
      
      if (exchangeSuccess) {
        // Ürünleri de yeniden yükle (güncel kurlarla fiyat hesaplaması için)
        await loadProducts(1, true);
        toast.success('Döviz kurları başarıyla güncellendi!');
      }
    } catch (error) {
      console.error('Error refreshing exchange rates:', error);
      toast.error('Döviz kurları güncellenemedi');
    } finally {
      setLoading(false);
    }
  };

  const startEditProduct = (product) => {
    setEditingProduct(product.id);
    setEditForm({
      name: product.name,
      description: product.description || '',
      brand: product.brand || '', // Marka bilgisini yükle
      company_id: product.company_id || '', // Firma bilgisini yükle
      image_url: product.image_url || '',
      list_price: product.list_price.toString(),
      discounted_price: product.discounted_price ? product.discounted_price.toString() : '',
      currency: product.currency,
      category_id: product.category_id || 'none'
    });
  };

  const cancelEditProduct = () => {
    setEditingProduct(null);
    setEditForm({
      name: '',
      description: '',
      brand: '', // Marka alanını temizle
      company_id: '', // Firma alanını temizle
      image_url: '',
      list_price: '',
      discounted_price: '',
      currency: '',
      category_id: 'none'
    });
  };

  const saveEditProduct = async () => {
    if (!editingProduct) return;

    try {
      setLoading(true);
      const updateData = {
        name: editForm.name,
        description: editForm.description || null,
        brand: editForm.brand || null, // Marka alanını backend'e gönder
        company_id: editForm.company_id, // Firma alanını backend'e gönder
        image_url: editForm.image_url || null,
        list_price: parseFloat(editForm.list_price),
        currency: editForm.currency
      };

      if (editForm.discounted_price) {
        updateData.discounted_price = parseFloat(editForm.discounted_price);
      }

      if (editForm.category_id && editForm.category_id !== 'none') {
        updateData.category_id = editForm.category_id;
      } else if (editForm.category_id === 'none') {
        // 'none' sentinel: backend bunu kategori TEMİZLE olarak işler
        // (null gönderince Pydantic "alan yok" sayıyordu, temizleme çalışmıyordu)
        updateData.category_id = 'none';
      }

      const response = await axios.patch(`${API}/products/${editingProduct}`, updateData);
      
      if (response.data.success) {
        await loadProducts(1, true);
        cancelEditProduct();
        toast.success('Ürün başarıyla güncellendi');
      }
    } catch (error) {
      console.error('Error updating product:', error);
      toast.error('Ürün güncellenemedi');
    } finally {
      setLoading(false);
    }
  };

  const deleteProduct = async (productId) => {
    if (!window.confirm('Bu ürünü silmek istediğinizden emin misiniz?')) {
      return;
    }

    try {
      const response = await axios.delete(`${API}/products/${productId}`);
      if (response.data.success) {
        await loadProducts(1, true);
        toast.success('Ürün silindi');
      }
    } catch (error) {
      console.error('Error deleting product:', error);
      toast.error('Ürün silinemedi');
    }
  };

  const createCategory = async () => {
    if (!newCategoryName.trim()) {
      toast.error('Kategori adı gerekli');
      return;
    }

    try {
      await axios.post(`${API}/categories`, {
        name: newCategoryName,
        description: newCategoryDescription,
        color: newCategoryColor,
        image_url: newCategoryImageUrl || null
      });
      
      setNewCategoryName('');
      setNewCategoryDescription('');
      setNewCategoryImageUrl('');
      
      // PERFORMANCE: Invalidate cache before reload
      CacheManager.remove('categories');
      // Kategorileri yeniden yükle
      await loadCategories();
      
      // Delay ile next color seçimi (kategoriler state'i güncellenene kadar bekle)
      setTimeout(() => {
        const nextColor = getNextCategoryColor();
        setNewCategoryColor(nextColor);
      }, 200); // Biraz daha uzun delay
      
      toast.success('Kategori başarıyla oluşturuldu');
    } catch (error) {
      console.error('Error creating category:', error);
      toast.error('Kategori oluşturulamadı');
    }
  };

  const startEditCategory = (category) => {
    setEditingCategory(category);
    setEditCategoryForm({
      name: category.name || '',
      description: category.description || '',
      color: category.color || '#3B82F6',
      image_url: category.image_url || ''
    });
  };

  const updateCategory = async () => {
    if (!editCategoryForm.name.trim()) {
      toast.error('Kategori adı gerekli');
      return;
    }
    try {
      await axios.patch(`${API}/categories/${editingCategory.id}`, editCategoryForm);
      setEditingCategory(null);
      CacheManager.remove('categories');
      await loadCategories();
      toast.success('Kategori başarıyla güncellendi');
    } catch (error) {
      console.error('Error updating category:', error);
      toast.error('Kategori güncellenemedi');
    }
  };

  const deleteCategory = async (categoryId) => {
    if (!window.confirm('Bu kategoriyi silmek istediğinizden emin misiniz? Kategorideki ürünler kategorisiz kalacak.')) {
      return;
    }

    try {
      await axios.delete(`${API}/categories/${categoryId}`);
      
      // PERFORMANCE: Invalidate cache before reload
      CacheManager.remove('categories');
      await loadCategories();
      await loadProducts(1, true); // Refresh products to show updated category info
      toast.success('Kategori silindi');
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error('Kategori silinemedi');
    }
  };

  // Category drag and drop functions
  const handleCategoryDragStart = (e, categoryId) => {
    setDraggedCategoryId(categoryId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleCategoryDragOver = (e, categoryId) => {
    e.preventDefault();
    setDragOverCategoryId(categoryId);
  };

  const handleCategoryDragLeave = () => {
    setDragOverCategoryId(null);
  };

  const handleCategoryDrop = async (e, targetCategoryId) => {
    e.preventDefault();
    setDragOverCategoryId(null);
    
    if (!draggedCategoryId || draggedCategoryId === targetCategoryId) {
      setDraggedCategoryId(null);
      return;
    }

    try {
      // Kategorilerin yeni sırasını hesapla
      const reorderedCategories = [...categories];
      const draggedIndex = reorderedCategories.findIndex(c => c.id === draggedCategoryId);
      const targetIndex = reorderedCategories.findIndex(c => c.id === targetCategoryId);
      
      if (draggedIndex === -1 || targetIndex === -1) return;
      
      // Kategorileri yeniden sırala
      const [draggedCategory] = reorderedCategories.splice(draggedIndex, 1);
      reorderedCategories.splice(targetIndex, 0, draggedCategory);
      
      // Her kategoriye yeni sort_order ata
      const categoryOrders = reorderedCategories.map((category, index) => ({
        id: category.id,
        sort_order: index + 1
      }));
      
      // Backend'e gönder
      const response = await axios.post(`${API}/categories/reorder`, categoryOrders);
      
      if (response.data.success) {
        toast.success('Kategori sıralaması güncellendi');
        // CRITICAL: Cache'i temizle
        CacheManager.remove('categories');
        await loadCategories(); // Kategorileri yeniden yükle
      }
    } catch (error) {
      console.error('Error reordering categories:', error);
      toast.error('Kategori sıralaması güncellenemedi');
    }
    
    setDraggedCategoryId(null);
  };

  const handleCategoryDragEnd = () => {
    setDraggedCategoryId(null);
    setDragOverCategoryId(null);
  };

  // Category group drag and drop functions
  const handleCategoryGroupDragStart = (e, categoryGroupId) => {
    setDraggedCategoryGroupId(categoryGroupId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleCategoryGroupDragOver = (e, categoryGroupId) => {
    e.preventDefault();
    setDragOverCategoryGroupId(categoryGroupId);
  };

  const handleCategoryGroupDragLeave = () => {
    setDragOverCategoryGroupId(null);
  };

  const handleCategoryGroupDrop = async (e, targetCategoryGroupId) => {
    e.preventDefault();
    setDragOverCategoryGroupId(null);
    
    if (!draggedCategoryGroupId || draggedCategoryGroupId === targetCategoryGroupId) {
      setDraggedCategoryGroupId(null);
      return;
    }

    try {
      // Kategori gruplarının yeni sırasını hesapla
      const reorderedCategoryGroups = [...categoryGroups];
      const draggedIndex = reorderedCategoryGroups.findIndex(g => g.id === draggedCategoryGroupId);
      const targetIndex = reorderedCategoryGroups.findIndex(g => g.id === targetCategoryGroupId);
      
      if (draggedIndex === -1 || targetIndex === -1) return;
      
      // Kategori gruplarını yeniden sırala
      const [draggedGroup] = reorderedCategoryGroups.splice(draggedIndex, 1);
      reorderedCategoryGroups.splice(targetIndex, 0, draggedGroup);
      
      // Her kategori grubuna yeni sort_order ata
      const groupOrders = reorderedCategoryGroups.map((group, index) => ({
        id: group.id,
        sort_order: index + 1
      }));
      
      // Backend'e gönder
      const response = await axios.post(`${API}/category-groups/reorder`, groupOrders);
      
      if (response.data.success) {
        toast.success('Kategori grubu sıralaması güncellendi');
        await loadCategoryGroups(); // Kategori gruplarını yeniden yükle
      }
    } catch (error) {
      console.error('Error reordering category groups:', error);
      toast.error('Kategori grubu sıralaması güncellenemedi');
    }
    
    setDraggedCategoryGroupId(null);
  };

  const handleCategoryGroupDragEnd = () => {
    setDraggedCategoryGroupId(null);
    setDragOverCategoryGroupId(null);
  };

  const handleSearch = (query) => {
    setSearchQuery(query);
  };

  const handleCategoryFilter = (categoryId) => {
    setSelectedCategory(categoryId === 'all' ? '' : categoryId);
  };

  // Search and category filter effects - OPTİMİZE EDİLDİ
  React.useEffect(() => {
    const delayedSearch = setTimeout(() => {
      loadProducts(1, true); // Reset to page 1 when searching/filtering
    }, searchQuery.length >= 2 ? 200 : 400); // HIZLANDIRILDI: Daha hızlı tepki

    return () => clearTimeout(delayedSearch);
  }, [searchQuery, selectedCategory, selectedCompanyFilter]);

  // Category dialog search effect - OPTİMİZE EDİLDİ
  React.useEffect(() => {
    if (showCategoryProductDialog) {
      const delayedSearch = setTimeout(() => {
        loadAllProductsForCategory(categoryDialogSearchQuery);
      }, 200); // HIZLANDIRILDI

      return () => clearTimeout(delayedSearch);
    }
  }, [categoryDialogSearchQuery, showCategoryProductDialog]);

  const saveInlineCategory = async () => {
    if (!inlineCategoryName.trim()) {
      toast.error('Kategori adı boş olamaz');
      return;
    }
    
    setIsSavingInlineCategory(true);
    try {
      const response = await axios.post(`${API}/categories`, {
        name: inlineCategoryName.trim(),
        description: 'Hızlı eklenen kategori',
        color: inlineCategoryColor,
        sort_order: categories.length + 1
      });
      
      const newCategory = response.data;
      
      // Update categories state
      setCategories(prev => [...prev, newCategory]);
      
      // Set the category on the new product form
      setNewProductForm(prev => ({ ...prev, category_id: newCategory.id }));
      
      toast.success(`"${newCategory.name}" kategorisi başarıyla eklendi!`);
      
      // Clear and close
      setInlineCategoryName('');
      setInlineCategoryColor('#10B981');
      setShowInlineCategoryForm(false);
    } catch (error) {
      console.error('Hızlı kategori ekleme hatası:', error);
      toast.error(error.response?.data?.detail || 'Kategori eklenemedi');
    } finally {
      setIsSavingInlineCategory(false);
    }
  };

  const toggleProductSelection = (productId, quantity = 1) => {
    console.log('🔄 toggleProductSelection çağrıldı:', { productId, quantity });
    console.log('📊 Mevcut selectedProducts:', Array.from(selectedProducts.entries()));
    
    const newSelected = new Map(selectedProducts);
    const newSelectedData = new Map(selectedProductsData);
    
    // Ürün bilgisini bul - önce products içinde, yoksa allProductsForCategory içinde ara
    let product = products.find(p => p.id === productId);
    if (!product) {
      product = allProductsForCategory.find(p => p.id === productId);
    }
    
    let isNewProductAdded = false;

    if (newSelected.has(productId)) {
      if (quantity === 0) {
        console.log('❌ Ürün siliniyor:', productId);
        newSelected.delete(productId);
        newSelectedData.delete(productId);
      } else {
        console.log('✏️ Ürün miktarı güncelleniyor:', productId, quantity);
        newSelected.set(productId, quantity);
        if (product) {
          newSelectedData.set(productId, product);
        }
      }
    } else {
      if (quantity > 0 && product) {
        console.log('➕ Yeni ürün ekleniyor:', productId);
        newSelected.set(productId, quantity);
        newSelectedData.set(productId, product);
        isNewProductAdded = true;
      }
    }
    
    let finalSelected = newSelected;
    
    if (isNewProductAdded) {
      // Default sort by price descending when a new product is added
      const entries = Array.from(newSelected.entries());
      entries.sort(([idA], [idB]) => {
        const prodA = newSelectedData.get(idA);
        const prodB = newSelectedData.get(idB);
        if (!prodA) return 1;
        if (!prodB) return -1;
        
        const getPriceInTRY = (p) => {
          const price = p.list_price || 0;
          if (p.currency === 'USD') return price * (exchangeRates.USD || 34.0);
          if (p.currency === 'EUR') return price * (exchangeRates.EUR || 37.0);
          return price;
        };
        
        return getPriceInTRY(prodB) - getPriceInTRY(prodA);
      });
      
      finalSelected = new Map(entries);
    }
    
    console.log('📊 Yeni selectedProducts:', Array.from(finalSelected.entries()));
    console.log('📊 Seçili ürün sayısı:', finalSelected.size);
    
    setSelectedProducts(finalSelected);
    setSelectedProductsData(newSelectedData);
  };

  // Hızlı ekleme için ürünleri filtrele
  const getQuickAddProducts = () => {
    let filteredProducts = products;
    
    // Kategori filtresi
    if (quickAddCategory !== 'all') {
      filteredProducts = filteredProducts.filter(p => p.category_id === quickAddCategory);
    }
    
    // Arama filtresi
    if (quickAddSearch.trim()) {
      const searchLower = quickAddSearch.toLowerCase();
      filteredProducts = filteredProducts.filter(p => 
        p.name?.toLowerCase().includes(searchLower)
      );
    }
    
    // Zaten seçili olanları gösterme
    filteredProducts = filteredProducts.filter(p => !selectedProducts.has(p.id));
    
    return filteredProducts.slice(0, 10); // Maksimum 10 sonuç
  };

  // Web scraping fonksiyonu
  const scrapeWebsite = async () => {
    if (!scrapeUrl.trim()) {
      toast.error('Lütfen bir URL girin');
      return;
    }
    
    setIsScraping(true);
    try {
      const response = await fetch(`${API}/scrape-products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: scrapeUrl })
      });
      
      if (!response.ok) {
        throw new Error('Scraping başarısız');
      }
      
      const data = await response.json();
      // Her ürüne discount property ekle
      const productsWithDiscount = (data.products || []).map(p => ({
        ...p,
        discount: 0
      }));
      setScrapedProducts(productsWithDiscount);
      setSelectedScrapedProducts(new Set(productsWithDiscount.map((_, i) => i))); // Hepsini seç
      setProductDiscounts({}); // İskonto oranlarını sıfırla
      toast.success(`${data.count} ürün bulundu!`);
    } catch (error) {
      console.error('Scraping hatası:', error);
      toast.error('Ürünler yüklenemedi: ' + error.message);
    } finally {
      setIsScraping(false);
    }
  };

  // Scraped ürünleri kaydet
  const saveScratedProducts = async () => {
    if (!scrapeCompanyId) {
      toast.error('Lütfen bir firma seçin');
      return;
    }
    
    if (selectedScrapedProducts.size === 0) {
      toast.error('Lütfen en az bir ürün seçin');
      return;
    }
    
    const selectedItems = scrapedProducts.filter((_, i) => selectedScrapedProducts.has(i));
    
    try {
      let successCount = 0;
      for (let i = 0; i < scrapedProducts.length; i++) {
        if (!selectedScrapedProducts.has(i)) continue;
        
        const product = scrapedProducts[i];
        const discountPercent = product.discount || 0;
        const originalPrice = product.price || 0;
        
        // İskonto hesapla
        const discountedPrice = originalPrice * (1 - discountPercent / 100);
        
        const productData = {
          name: product.name,
          description: product.description || '',
          list_price: originalPrice, // Orijinal fiyat
          discounted_price: discountPercent > 0 ? discountedPrice : null, // İskontolu fiyat (sadece iskonto varsa)
          currency: 'TRY',
          image_url: product.image_url || '',
          brand: product.brand || '',
          company_id: scrapeCompanyId
        };
        
        console.log('Saving product:', product.name, {
          originalPrice,
          discountPercent,
          discountedPrice: discountPercent > 0 ? discountedPrice : null
        });
        
        const response = await fetch(`${API}/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(productData)
        });
        
        if (response.ok) {
          successCount++;
        }
      }
      
      toast.success(`${successCount} ürün başarıyla eklendi!`);
      setShowScrapeDialog(false);
      setScrapeUrl('');
      setScrapedProducts([]);
      setSelectedScrapedProducts(new Set());
      setScrapeCompanyId('');
      setProductDiscounts({});
    } catch (error) {
      console.error('Kaydetme hatası:', error);
      toast.error('Ürünler kaydedilemedi');
    }
  };

  // Teklife elle kalem ekle (sistemde kayıtlı olmayan ürün/hizmet)
  const addManualQuoteItem = () => {
    const name = (manualItem.name || '').trim();
    const price = parseFloat(String(manualItem.price).replace(',', '.'));
    const qty = Math.max(1, parseInt(manualItem.qty, 10) || 1);
    if (!name) { toast.error('Kalem adı girin'); return; }
    if (!price || price <= 0) { toast.error("0'dan büyük bir fiyat girin"); return; }
    const cur = manualItem.currency || 'TRY';
    const rate = cur === 'TRY' ? 1 : (parseFloat(exchangeRates[cur]) || (cur === 'USD' ? 34 : 37));
    const id = `manual-${Date.now()}`;
    const data = {
      id, name, brand: '', company_name: 'Elle Girilen', manual: true,
      list_price: price, discounted_price: null, currency: cur,
      list_price_try: price * rate, discounted_price_try: price * rate
    };
    setSelectedProducts(prev => new Map(prev).set(id, qty));
    setSelectedProductsData(prev => new Map(prev).set(id, data));
    setManualItem({ name: '', price: '', currency: 'TRY', qty: '1' });
    toast.success(`"${name}" teklife eklendi`);
  };

  const clearSelection = () => {
    localStorage.removeItem('karavan_quote_draft');
    setSelectedProducts(new Map());
    setSelectedProductsData(new Map());
    setSelectedProductsCustomPrices(new Map());
    setQuoteDiscount(0);
    setQuoteLaborCost(0); // İşçilik maliyetini de temizle
    setQuoteNotes(''); // Teklif notlarını da temizle
    setLoadedQuote(null); // Yüklenen teklifi de temizle
    setQuoteName(''); // Teklif adını da temizle
    setSelectedQuoteCustomer(''); // Seçili müşteriyi de temizle
  };

  // Teklifi kaydet (PDF indirmeden)
  const saveQuote = async () => {
    try {
      if (selectedProducts.size === 0) {
        toast.error('Lütfen en az bir ürün seçin');
        return;
      }

      const selectedProductData = getSelectedProductsData().map(p => (
        p.manual || String(p.id).startsWith('manual-')
          ? {
              manual: true,
              id: p.id,
              name: p.name,
              price: parseFloat(p.customPrice ?? p.list_price) || 0,
              currency: p.currency || 'TRY',
              quantity: p.quantity || 1
            }
          : {
              id: p.id,
              quantity: p.quantity || 1,
              custom_price: p.customPrice !== null && p.customPrice !== undefined ? parseFloat(p.customPrice) : null
            }
      ));

      console.log('💾 Teklif Kaydediliyor/Güncelleniyor:');
      console.log('📦 Seçili Ürün Sayısı:', selectedProducts.size);
      console.log('📦 Gönderilecek Ürünler:', selectedProductData);
      console.log('📝 Yüklü Teklif:', loadedQuote);

      // Yüklü teklif varsa GÜNCELLE — ad değişikliği de update'tir (ada bakıp
      // yeni teklif oluşturmak pazarlıkta kopya teklif üretiyordu, rapor 02).
      if (loadedQuote && loadedQuote.id) {

        console.log('🔄 Mevcut teklif güncelleniyor:', loadedQuote.id);

        const updateResponse = await fetch(`${API}/quotes/${loadedQuote.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: (quoteName || '').trim() || loadedQuote.name,
            customer_id: selectedQuoteCustomer || null,
            labor_cost: parseFloat(quoteLaborCost) || 0,
            discount_percentage: parseFloat(quoteDiscount) || 0,
            products: selectedProductData,
            notes: quoteNotes.trim() || ''
          })
        });
        
        if (!updateResponse.ok) {
          throw new Error('Teklif güncellenemedi');
        }
        
        const updatedQuote = await updateResponse.json();
        console.log('✅ Güncellenmiş Teklif:', updatedQuote);
        
        // Yüklü teklifi güncelle
        setLoadedQuote(updatedQuote);
        
        await fetchQuotes();
        localStorage.removeItem('karavan_quote_draft');
        toast.success(`"${updatedQuote.name || loadedQuote.name}" teklifi güncellendi!`);
        
      } else {
        // Yeni teklif oluştur
        const newQuoteData = {
          name: quoteName || `Teklif - ${new Date().toLocaleDateString('tr-TR')}`,
          customer_id: selectedQuoteCustomer || null,
          discount_percentage: parseFloat(quoteDiscount) || 0,
          labor_cost: parseFloat(quoteLaborCost) || 0,
          products: selectedProductData,
          notes: quoteNotes.trim() || ''
        };
        
        const createResponse = await fetch(`${API}/quotes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(newQuoteData)
        });
        
        if (!createResponse.ok) {
          throw new Error('Teklif oluşturulamadı');
        }
        
        const savedQuote = await createResponse.json();
        setLoadedQuote(savedQuote); // Kaydedilen teklifi yüklenmiş olarak işaretle
        
        await fetchQuotes();
        localStorage.removeItem('karavan_quote_draft');
        toast.success('Teklif başarıyla kaydedildi!');
      }
      
    } catch (error) {
      console.error('Teklif kaydetme hatası:', error);
      toast.error('Teklif kaydedilemedi: ' + error.message);
    }
  };

  // Kategorisi olmayan ürünleri getir
  const getUncategorizedProducts = () => {
    return products.filter(product => !product.category_id || product.category_id === 'none');
  };

  // Kategori dialog'u için tüm ürünleri yükle (pagination olmadan)
  const loadAllProductsForCategory = async (searchQuery = '') => {
    try {
      setLoadingCategoryProducts(true);
      
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      params.append('skip_pagination', 'true'); // Backend'de pagination'ı atla
      
      const response = await axios.get(`${API}/products?${params.toString()}`);
      const allProducts = response.data;
      
      // Kategorisi olmayan ürünleri filtrele
      const uncategorized = allProducts.filter(product => !product.category_id || product.category_id === 'none');
      
      setAllProductsForCategory(allProducts);
      setUncategorizedProducts(uncategorized);
      
    } catch (error) {
      console.error('Error loading products for category:', error);
      toast.error('Ürünler yüklenemedi');
    } finally {
      setLoadingCategoryProducts(false);
    }
  };

  // Kategori ürün atama dialog'unu aç
  const openCategoryProductDialog = async (category) => {
    setSelectedCategoryForProducts(category);
    setSelectedProductsForCategory(new Set());
    setCategoryDialogSearchQuery('');
    setShowCategoryProductDialog(true);
    
    // Tüm ürünleri yükle (pagination olmadan)
    await loadAllProductsForCategory();
  };

  // Seçili ürünleri kategoriye ata
  const assignProductsToCategory = async () => {
    try {
      const productIds = Array.from(selectedProductsForCategory);
      
      // Her ürün için kategori güncelleme isteği gönder
      const updatePromises = productIds.map(async (productId) => {
        const response = await fetch(`${API}/products/${productId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            category_id: selectedCategoryForProducts.id
          })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Ürün ${productId} güncellenemedi: ${errorText}`);
        }
        
        return await response.json();
      });

      const results = await Promise.all(updatePromises);
      console.log('Güncelleme sonuçları:', results);
      
      // Ürünleri yeniden yükle
      await loadProducts(1, true);
      
      // Dialog'u kapat
      setShowCategoryProductDialog(false);
      setSelectedProductsForCategory(new Set());
      
      toast.success(`${productIds.length} ürün "${selectedCategoryForProducts.name}" kategorisine eklendi!`);
      
    } catch (error) {
      console.error('Ürün kategori atama hatası:', error);
      toast.error('Ürünler kategoriye eklenemedi: ' + error.message);
    }
  };

  // Ürünler sekmesinden hızlı teklif oluştur
  const createQuickQuote = async () => {
    try {
      if (!quickQuoteCustomerName.trim()) {
        toast.error('Lütfen müşteri adını girin');
        return;
      }

      const selectedProductData = getSelectedProductsData().map(p => (
        p.manual || String(p.id).startsWith('manual-')
          ? {
              manual: true,
              id: p.id,
              name: p.name,
              price: parseFloat(p.customPrice ?? p.list_price) || 0,
              currency: p.currency || 'TRY',
              quantity: p.quantity || 1
            }
          : {
              id: p.id,
              quantity: p.quantity || 1,
              custom_price: p.customPrice !== null && p.customPrice !== undefined ? parseFloat(p.customPrice) : null
            }
      ));

      console.log('🔍 Quick quote creation data:');
      console.log('🔍 selectedProducts Map:', selectedProducts);
      console.log('🔍 selectedProductsData Map:', selectedProductsData);
      console.log('🔍 getSelectedProductsData() result:', getSelectedProductsData());
      console.log('🔍 selectedProductData for API:', selectedProductData);

      const quoteData = {
        name: quickQuoteCustomerName.trim(),
        customer_name: quickQuoteCustomerName.trim(),
        discount_percentage: 0,
        labor_cost: 0,
        products: selectedProductData,
        notes: quickQuoteNotes.trim() || ''
      };

      const response = await fetch(`${API}/quotes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(quoteData)
      });

      if (!response.ok) {
        throw new Error('Teklif oluşturulamadı');
      }

      const savedQuote = await response.json();

      // Teklifleri yeniden yükle
      await fetchQuotes();

      // Dialog'u kapat ve formu temizle
      setShowQuickQuoteDialog(false);
      setQuickQuoteCustomerName('');
      setQuickQuoteNotes(''); // Teklif notlarını temizle
      
      // Seçimi temizle
      clearSelection();

      // Teklifler sekmesine geç
      setActiveTab('quotes');

      toast.success(`"${savedQuote.name}" teklifi başarıyla oluşturuldu!`);

    } catch (error) {
      console.error('Hızlı teklif oluşturma hatası:', error);
      toast.error('Teklif oluşturulamadı: ' + error.message);
    }
  };

  // Upload History fonksiyonları
  const fetchUploadHistory = async (companyId) => {
    try {
      setLoadingHistory(true);
      const response = await axios.get(`${API}/companies/${companyId}/upload-history`);
      setUploadHistory(response.data);
    } catch (error) {
      console.error('Upload geçmişi yüklenirken hata:', error);
      toast.error('Upload geçmişi yüklenemedi');
      setUploadHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const openUploadHistoryDialog = async (company) => {
    setSelectedCompanyForHistory(company);
    setShowUploadHistoryDialog(true);
    await fetchUploadHistory(company.id);
  };

  const closeUploadHistoryDialog = () => {
    setShowUploadHistoryDialog(false);
    setSelectedCompanyForHistory(null);
    setUploadHistory([]);
  };

  // Para birimi değiştirme fonksiyonları
  const openCurrencyChangeDialog = (upload) => {
    setSelectedUploadForCurrency(upload);
    setNewCurrency('USD'); // Default selection
    setShowCurrencyChangeDialog(true);
  };

  const closeCurrencyChangeDialog = () => {
    setShowCurrencyChangeDialog(false);
    setSelectedUploadForCurrency(null);
    setNewCurrency('USD');
  };

  const changeCurrency = async () => {
    if (!selectedUploadForCurrency || !newCurrency) {
      toast.error('Lütfen geçerli bir para birimi seçin');
      return;
    }

    try {
      setChangingCurrency(true);
      
      const response = await axios.post(
        `${API}/upload-history/${selectedUploadForCurrency.id}/change-currency?new_currency=${newCurrency}`
      );

      if (response.data.success) {
        toast.success(response.data.message);
        
        // Upload geçmişini yenile
        await fetchUploadHistory(selectedCompanyForHistory.id);
        
        // Ürünleri yenile (para birimi değişikliği nedeniyle)
        await loadProducts(1, true);
        
        // Dialog'u kapat
        closeCurrencyChangeDialog();
      } else {
        toast.error('Para birimi güncellenemedi');
      }

    } catch (error) {
      console.error('Para birimi değiştirme hatası:', error);
      toast.error(error.response?.data?.detail || 'Para birimi güncellenemedi');
    } finally {
      setChangingCurrency(false);
    }
  };

  const selectAllVisible = () => {
    const newSelected = new Map();
    products.forEach(p => newSelected.set(p.id, 1));
    setSelectedProducts(newSelected);
  };

  const getSelectedProductsData = useCallback(() => {
    return Array.from(selectedProducts.entries()).map(([productId, quantity]) => {
      const product = selectedProductsData.get(productId);
      if (!product) return null;
      const customPrice = selectedProductsCustomPrices.get(productId);
      return {
        ...product,
        quantity,
        customPrice: customPrice !== undefined && customPrice !== null ? customPrice : null
      };
    }).filter(Boolean);
  }, [selectedProducts, selectedProductsData, selectedProductsCustomPrices]);

  const moveProductOrder = (productId, direction) => {
    const keys = Array.from(selectedProducts.keys());
    const index = keys.indexOf(productId);
    if (index === -1) return;
    
    if (direction === 'up' && index > 0) {
      const temp = keys[index];
      keys[index] = keys[index - 1];
      keys[index - 1] = temp;
    } else if (direction === 'down' && index < keys.length - 1) {
      const temp = keys[index];
      keys[index] = keys[index + 1];
      keys[index + 1] = temp;
    } else {
      return;
    }
    
    const newSelected = new Map();
    keys.forEach(key => {
      newSelected.set(key, selectedProducts.get(key));
    });
    setSelectedProducts(newSelected);
  };

  // Function to group products by category groups
  const getProductsByGroups = (selectedProducts) => {
    const groupedProducts = {};
    
    selectedProducts.forEach(product => {
      // Find which group this product's category belongs to
      const productCategory = categories.find(cat => cat.id === product.category_id);
      if (!productCategory) return;
      
      const categoryGroup = categoryGroups.find(group => 
        group.category_ids.includes(productCategory.id)
      );
      
      if (categoryGroup) {
        // Product belongs to a group
        if (!groupedProducts[categoryGroup.name]) {
          groupedProducts[categoryGroup.name] = {
            groupName: categoryGroup.name,
            groupColor: categoryGroup.color,
            isGroup: true,
            products: []
          };
        }
        groupedProducts[categoryGroup.name].products.push({
          ...product,
          categoryName: productCategory.name
        });
      } else {
        // Product doesn't belong to any group, use category name
        const categoryName = productCategory.name;
        if (!groupedProducts[categoryName]) {
          groupedProducts[categoryName] = {
            groupName: categoryName,
            groupColor: productCategory.color,
            isGroup: false,
            products: []
          };
        }
        groupedProducts[categoryName].products.push({
          ...product,
          categoryName: productCategory.name
        });
      }
    });
    
    return groupedProducts;
  };

  const toggleProductFavorite = async (productId) => {
    try {
      const response = await axios.post(`${API}/products/${productId}/toggle-favorite`);
      if (response.data.success) {
        toast.success(response.data.message);
        // Ürün listesini yeniden yükle
        await loadProducts(1, true);
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      toast.error('Favori durumu güncellenemedi');
    }
  };
  const [favoriteProducts, setFavoriteProducts] = useState([]);
  
  const loadFavoriteProducts = async () => {
    try {
      const response = await axios.get(`${API}/products/favorites`);
      setFavoriteProducts(response.data);
    } catch (error) {
      console.error('Error loading favorite products:', error);
      toast.error('Favori ürünler yüklenemedi');
    }
  };
  // Package management states
  const [packages, setPackages] = useState([]);
  const [showPackageDialog, setShowPackageDialog] = useState(false);
  const [editingPackage, setEditingPackage] = useState(null);
  const [packageForm, setPackageForm] = useState({
    name: '',
    sale_price: '',
    discount_percentage: 0, // Paket indirim yüzdesi
    notes: '', // Paket notları
    image_url: ''
  });
  const [selectedPackageForEdit, setSelectedPackageForEdit] = useState(null);
  const [packageSelectedProducts, setPackageSelectedProducts] = useState(new Map());
  const [packageSelectedSupplies, setPackageSelectedSupplies] = useState(new Map());
  const [packageWithProducts, setPackageWithProducts] = useState(null);
  const [loadingPackageProducts, setLoadingPackageProducts] = useState(false);
  const [packageProductSearch, setPackageProductSearch] = useState('');
  const [supplySearch, setSupplySearch] = useState('');
  const [supplyProducts, setSupplyProducts] = useState([]);
  const [showSuppliesSection, setShowSuppliesSection] = useState(false); // Sarf malzemesi bölümü açık/kapalı
  
  // Category sorting states
  const [draggedCategoryId, setDraggedCategoryId] = useState(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState(null);
  
  // Category group sorting states
  const [draggedCategoryGroupId, setDraggedCategoryGroupId] = useState(null);
  const [dragOverCategoryGroupId, setDragOverCategoryGroupId] = useState(null);
  
  // Package discount and labor cost states (similar to quotes)
  const [packageDiscount, setPackageDiscount] = useState(0);
  const [packageLaborCost, setPackageLaborCost] = useState(0);
  
  // Package management functions
  const loadPackages = async () => {
    try {
      const response = await axios.get(`${API}/packages`);
      setPackages(response.data);
    } catch (error) {
      console.error('Error loading packages:', error);
      toast.error('Paketler yüklenemedi');
    }
  };

  const createPackage = async () => {
    try {
      const response = await axios.post(`${API}/packages`, {
        name: packageForm.name,
        sale_price: parseFloat(packageForm.sale_price) || 0,
        discount_percentage: parseFloat(packageForm.discount_percentage) || 0,
        notes: packageForm.notes || null,
        image_url: packageForm.image_url || null
      });
      
      if (response.data) {
        toast.success('Paket başarıyla oluşturuldu');
        setShowPackageDialog(false);
        setPackageForm({ name: '', sale_price: '', discount_percentage: 0, notes: '', image_url: '' });
        await loadPackages();
      }
    } catch (error) {
      console.error('Error creating package:', error);
      toast.error('Paket oluşturulamadı');
    }
  };

  const updatePackage = async () => {
    if (!selectedPackageForEdit) return;
    
    try {
      const response = await axios.put(`${API}/packages/${selectedPackageForEdit.id}`, {
        name: packageForm.name,
        sale_price: parseFloat(packageForm.sale_price) || 0,
        discount_percentage: parseFloat(packageDiscount) || 0,  // packageDiscount state'ini kullan
        labor_cost: parseFloat(packageLaborCost) || 0,  // packageLaborCost state'ini kullan
        notes: packageForm.notes || null,
        image_url: packageForm.image_url || null
      });
      
      if (response.data) {
        toast.success('Paket başarıyla güncellendi');
        await loadPackages();
        // Reload package details
        await loadPackageWithProducts(selectedPackageForEdit.id);
      }
    } catch (error) {
      console.error('Error updating package:', error);
      toast.error('Paket güncellenemedi');
    }
  };

  const deletePackage = async (packageId) => {
    if (!window.confirm('Bu paketi silmek istediğinizden emin misiniz?')) return;
    
    try {
      await axios.delete(`${API}/packages/${packageId}`);
      toast.success('Paket başarıyla silindi');
      await loadPackages();
    } catch (error) {
      console.error('Error deleting package:', error);
      toast.error('Paket silinemedi');
    }
  };

  const startCopyPackage = (pkg) => {
    setPackageToCopy(pkg);
    setCopyPackageName(`${pkg.name} - Kopya`);
    setCopyPackageDialog(true);
  };

  const copyPackage = async () => {
    if (!copyPackageName.trim()) {
      toast.error('Yeni paket adı gerekli');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('new_name', copyPackageName);

      const response = await axios.post(`${API}/packages/${packageToCopy.id}/copy`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data.success) {
        await loadPackages();
        toast.success(response.data.message);
        setCopyPackageDialog(false);
        setCopyPackageName('');
        setPackageToCopy(null);
      }
    } catch (error) {
      console.error('Error copying package:', error);
      if (error.response?.data?.detail) {
        toast.error(error.response.data.detail);
      } else {
        toast.error('Paket kopyalanırken hata oluştu');
      }
    }
  };

  const togglePackagePin = async (packageId) => {
    try {
      const response = await axios.post(`${API}/packages/${packageId}/pin`);
      
      if (response.data.success) {
        await loadPackages();
        toast.success(response.data.message);
      }
    } catch (error) {
      console.error('Error toggling package pin:', error);
      if (error.response?.data?.detail) {
        toast.error(error.response.data.detail);
      } else {
        toast.error('Paket sabitleme durumu değiştirilemedi');
      }
    }
  };

  const updateProductStock = async (productId, stockQuantity) => {
    try {
      const formData = new FormData();
      formData.append('stock_quantity', stockQuantity);

      const response = await axios.post(`${API}/products/${productId}/stock`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data.success) {
        // Reload products to show updated stock
        await loadProducts();
        toast.success(response.data.message);
      }
    } catch (error) {
      console.error('Error updating product stock:', error);
      if (error.response?.data?.detail) {
        toast.error(error.response.data.detail);
      } else {
        toast.error('Stok güncellenirken hata oluştu');
      }
    }
  };

  const loadAllProductsForPackageEditing = async () => {
    try {
      console.log('Loading products for package editing...');
      // Load all products without pagination for package editing
      const response = await axios.get(`${API}/products?skip_pagination=true`);
      console.log(`Loaded ${response.data.length} products for package editing`);
      setProducts(response.data);
    } catch (error) {
      console.error('Error loading products for package editing:', error);
      toast.error('Ürünler yüklenemedi');
    }
  };

  const loadPackageWithProducts = async (packageId) => {
    setLoadingPackageProducts(true);
    try {
      const response = await axios.get(`${API}/packages/${packageId}`);
      setPackageWithProducts(response.data);
      
      // Set selected products from package
      const selectedMap = new Map();
      response.data.products.forEach(product => {
        selectedMap.set(product.id, product.quantity);
      });
      setPackageSelectedProducts(selectedMap);
      
      // Set selected supplies from package
      const selectedSuppliesMap = new Map();
      if (response.data.supplies) {
        response.data.supplies.forEach(supply => {
          selectedSuppliesMap.set(supply.id, supply.quantity);
        });
      }
      setPackageSelectedSupplies(selectedSuppliesMap);
      
      // Initialize expanded categories (expand first category by default)
      if (categories.length > 0) {
        setExpandedCategories(new Set([categories[0].id]));
      }
      
      // Load supply products
      await loadSupplyProducts();
      
    } catch (error) {
      console.error('Error loading package with products:', error);
      toast.error('Paket detayları yüklenemedi');
      setPackageWithProducts(null);
    } finally {
      setLoadingPackageProducts(false);
    }
  };

  const startEditPackage = (pkg) => {
    setSelectedPackageForEdit(pkg);
    setPackageForm({
      name: pkg.name,
      description: pkg.description || '',
      sale_price: pkg.sale_price.toString(),
      notes: pkg.notes || '', // Paket notlarını yükle
      image_url: pkg.image_url || ''
    });
    
    // Set package discount and labor cost states
    setPackageDiscount(pkg.discount_percentage || 0);
    setPackageLaborCost(pkg.labor_cost || 0); // Paket labor_cost'ını yükle
    
    loadPackageWithProducts(pkg.id);
    
    // Load all products for package editing (without pagination)
    loadAllProductsForPackageEditing();
  };

  const addProductsToPackage = async () => {
    if (!selectedPackageForEdit) return;
    
    try {
      const products = Array.from(packageSelectedProducts.entries()).map(([productId, quantity]) => ({
        product_id: productId,
        quantity: quantity
      }));
      
      const response = await axios.post(`${API}/packages/${selectedPackageForEdit.id}/products`, products);
      if (response.data.success) {
        toast.success(response.data.message);
        await loadPackages();
        // Reload package details
        await loadPackageWithProducts(selectedPackageForEdit.id);
      }
    } catch (error) {
      console.error('Error adding products to package:', error);
      toast.error('Ürünler pakete eklenemedi');
    }
  };

  // Package product filtering and grouping
  const getFilteredAndGroupedProducts = () => {
    // Filter products by search
    let filteredProducts = products;
    if (packageProductSearch.trim()) {
      const searchTerm = packageProductSearch.toLowerCase();
      filteredProducts = products.filter(product => 
        product.name.toLowerCase().includes(searchTerm) ||
        (product.description && product.description.toLowerCase().includes(searchTerm))
      );
    }

    // Filter out supply products (products in "Sarf Malzemeleri" category)
    const supplyCategory = categories.find(c => c.name === 'Sarf Malzemeleri');
    if (supplyCategory) {
      filteredProducts = filteredProducts.filter(product => 
        product.category_id !== supplyCategory.id
      );
    }

    // Group by categories
    const grouped = {};
    filteredProducts.forEach(product => {
      const category = categories.find(c => c.id === product.category_id);
      const categoryName = category ? category.name : 'Kategorisiz';
      const categoryId = category ? category.id : 'uncategorized';
      
      if (!grouped[categoryId]) {
        grouped[categoryId] = {
          name: categoryName,
          products: [],
          color: category?.color || '#64748b'
        };
      }
      grouped[categoryId].products.push(product);
    });

    return grouped;
  };

  // Package PDF download functions
  const downloadPackagePDF = async (packageId, withPrices) => {
    try {
      const endpoint = withPrices 
        ? `${API}/packages/${packageId}/pdf-with-prices`
        : `${API}/packages/${packageId}/pdf-without-prices`;
      
      const response = await axios.get(endpoint, {
        responseType: 'blob'
      });
      
      // Create download link
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Set filename based on response headers or default
      const contentDisposition = response.headers['content-disposition'];
      let filename = withPrices ? 'paket_fiyatli.pdf' : 'paket_liste.pdf';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename=([^;]+)/);
        if (filenameMatch) {
          filename = filenameMatch[1].replace(/"/g, '');
        }
      }
      
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success(`PDF ${withPrices ? '(Ürün Fiyatlı)' : '(Satış Fiyatlı)'} başarıyla indirildi`);
      
    } catch (error) {
      console.error('Error downloading package PDF:', error);
      toast.error('PDF indirilemedi');
    }
  };

  // Update package form when selectedPackageForEdit changes
  React.useEffect(() => {
    if (selectedPackageForEdit) {
      setPackageForm({
        name: selectedPackageForEdit.name || '',
        sale_price: selectedPackageForEdit.sale_price ? selectedPackageForEdit.sale_price.toString() : '',
        discount_percentage: selectedPackageForEdit.discount_percentage || 0,
        image_url: selectedPackageForEdit.image_url || ''
      });
    }
  }, [selectedPackageForEdit]);

  const toggleCategoryExpansion = (categoryId) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  // Auto-expand categories when searching
  const handleProductSearch = (searchTerm) => {
    setPackageProductSearch(searchTerm);
    if (searchTerm.trim()) {
      // Expand all categories when searching
      const allCategoryIds = new Set(categories.map(c => c.id));
      allCategoryIds.add('uncategorized');
      setExpandedCategories(allCategoryIds);
    }
  };

  const addSuppliesToPackage = async () => {
    if (!selectedPackageForEdit) return;
    
    try {
      const supplies = Array.from(packageSelectedSupplies.entries()).map(([productId, supplyData]) => ({
        product_id: productId,
        quantity: supplyData.quantity,  // supplyData objesinden quantity'yi al
        note: "Sarf malzemesi"
      }));
      
      const response = await axios.post(`${API}/packages/${selectedPackageForEdit.id}/supplies`, supplies);
      if (response.data.success) {
        toast.success(response.data.message);
        await loadPackages();
        // Reload package details
        await loadPackageWithProducts(selectedPackageForEdit.id);
        // Clear selected supplies
        setPackageSelectedSupplies(new Map());
      }
    } catch (error) {
      console.error('Error adding supplies to package:', error);
      toast.error('Sarf malzemeleri pakete eklenemedi');
    }
  };

  const loadSupplyProducts = async () => {
    try {
      const response = await axios.get(`${API}/products/supplies`);
      setSupplyProducts(response.data);
    } catch (error) {
      console.error('Error loading supply products:', error);
      toast.error('Sarf malzemesi ürünleri yüklenemedi');
    }
  };

  const updatePackageProduct = async (packageProductId, updateData) => {
    if (!selectedPackageForEdit) return;
    
    try {
      const response = await axios.put(`${API}/packages/${selectedPackageForEdit.id}/products/${packageProductId}`, updateData);
      if (response.data.success) {
        toast.success(response.data.message);
        await loadPackageWithProducts(selectedPackageForEdit.id);
      }
    } catch (error) {
      console.error('Error updating package product:', error);
      toast.error('Paket ürünü güncellenemedi');
    }
  };

  const updateSupplyQuantity = async (supplyId, newQuantity) => {
    if (!selectedPackageForEdit || newQuantity <= 0) return;
    
    try {
      const response = await axios.put(`${API}/packages/${selectedPackageForEdit.id}/supplies/${supplyId}`, null, {
        params: { quantity: newQuantity }
      });
      
      if (response.data.success) {
        toast.success(response.data.message);
        await loadPackageWithProducts(selectedPackageForEdit.id);
      }
    } catch (error) {
      console.error('Error updating supply quantity:', error);
      toast.error('Sarf malzemesi adeti güncellenemedi');
    }
  };

  const removeSupplyFromPackage = async (supplyId) => {
    if (!selectedPackageForEdit) return;
    
    try {
      const response = await axios.delete(`${API}/packages/${selectedPackageForEdit.id}/supplies/${supplyId}`);
      if (response.data.success) {
        toast.success(response.data.message);
        await loadPackageWithProducts(selectedPackageForEdit.id);
      }
    } catch (error) {
      console.error('Error removing supply from package:', error);
      toast.error('Sarf malzemesi paketten çıkarılamadı');
    }
  };

  const removeProductFromPackage = async (packageProductId, productName) => {
    if (!selectedPackageForEdit) return;
    
    // Kullanıcıdan onay iste
    if (!window.confirm(`"${productName}" ürününü paketten çıkarmak istediğinizden emin misiniz?`)) {
      return;
    }
    
    try {
      const response = await axios.delete(`${API}/packages/${selectedPackageForEdit.id}/products/${packageProductId}`);
      if (response.data.success) {
        toast.success(response.data.message);
        await loadPackageWithProducts(selectedPackageForEdit.id);
      }
    } catch (error) {
      console.error('Error removing product from package:', error);
      toast.error('Ürün paketten çıkarılamadı');
    }
  };

  // Package products organization by category groups
  const getPackageProductsByGroups = () => {
    if (!packageWithProducts?.products || !categories.length) {
      return {};
    }

    const groupedProducts = {};
    
    // Create category to group mapping with sorting
    const categoryToGroup = {};
    const sortedCategoryGroups = [...categoryGroups].sort((a, b) => {
      if (a.sort_order !== b.sort_order) {
        return a.sort_order - b.sort_order;
      }
      return a.name.localeCompare(b.name);
    });
    
    sortedCategoryGroups.forEach(group => {
      group.category_ids?.forEach(categoryId => {
        categoryToGroup[categoryId] = group;
      });
    });

    // Group products
    packageWithProducts.products.forEach(product => {
      const categoryId = product.category_id;
      const category = categories.find(c => c.id === categoryId);
      
      let groupKey, groupData;
      
      if (categoryId && categoryToGroup[categoryId]) {
        // Product belongs to a category group
        const group = categoryToGroup[categoryId];
        groupKey = group.id;
        groupData = {
          name: group.name,
          color: group.color || '#64748b',
          isGroup: true,
          sort_order: group.sort_order || 0
        };
      } else if (category) {
        // Product has category but no group
        groupKey = category.id;
        groupData = {
          name: category.name,
          color: category.color || '#64748b',
          isGroup: false,
          sort_order: category.sort_order || 0
        };
      } else {
        // Product has no category
        groupKey = 'uncategorized';
        groupData = {
          name: 'Kategorisiz',
          color: '#94a3b8',
          isGroup: false,
          sort_order: 9999 // Always last
        };
      }
      
      if (!groupedProducts[groupKey]) {
        groupedProducts[groupKey] = {
          ...groupData,
          products: []
        };
      }
      
      groupedProducts[groupKey].products.push(product);
    });

    return groupedProducts;
  };

  // Sarf malzemesi toggle fonksiyonu
  const togglePackageSupply = (supplyId, supplyData) => {
    setPackageSelectedSupplies(prev => {
      const newMap = new Map(prev);
      if (newMap.has(supplyId)) {
        // Eğer zaten seçiliyse, çıkar
        newMap.delete(supplyId);
      } else {
        // Eğer seçili değilse, ekle
        newMap.set(supplyId, { 
          ...supplyData,
          quantity: 1 
        });
      }
      return newMap;
    });
  };

  const [showPackageDiscountedPrices, setShowPackageDiscountedPrices] = useState(false);

  const calculateQuoteTotals = useMemo(() => {
    const selectedProductsData = getSelectedProductsData();
    
    let totalUSD = 0;
    let totalUSDDiscounted = 0;
    let totalEUR = 0;
    let totalEURDiscounted = 0;
    let totalTRY = 0;
    let totalTRYDiscounted = 0;
    
    selectedProductsData.forEach(p => {
      const currency = p.currency || 'TRY';
      const quantity = p.quantity || 1;
      const customPrice = selectedProductsCustomPrices.get(p.id);
      
      // Liste/Özel Fiyat belirlenmesi
      const unitPrice = customPrice !== undefined && customPrice !== null ? parseFloat(customPrice) : (parseFloat(p.list_price) || 0);
      
      // Maliyet (Geliş) Fiyatı belirlenmesi
      const discountedUnitPrice = parseFloat(p.discounted_price) || parseFloat(p.list_price) || 0;
      
      if (currency === 'USD') {
        totalUSD += unitPrice * quantity;
        totalUSDDiscounted += discountedUnitPrice * quantity;
      } else if (currency === 'EUR') {
        totalEUR += unitPrice * quantity;
        totalEURDiscounted += discountedUnitPrice * quantity;
      } else {
        totalTRY += unitPrice * quantity;
        totalTRYDiscounted += discountedUnitPrice * quantity;
      }
    });
    
    const usdRate = parseFloat(exchangeRates.USD) || 34.0;
    const eurRate = parseFloat(exchangeRates.EUR) || 37.0;
    
    const usdInTry = totalUSD * usdRate;
    const usdDiscountedInTry = totalUSDDiscounted * usdRate;
    const eurInTry = totalEUR * eurRate;
    const eurDiscountedInTry = totalEURDiscounted * eurRate;
    
    const eurInUsd = totalEUR * (eurRate / usdRate);
    const eurDiscountedInUsd = totalEURDiscounted * (eurRate / usdRate);
    
    const totalListPrice = totalTRY + usdInTry + eurInTry;
    const totalListPriceDiscounted = totalTRYDiscounted + usdDiscountedInTry + eurDiscountedInTry;
    
    const discountAmount = totalListPrice * (parseFloat(quoteDiscount) || 0) / 100;
    const discountAmountDiscounted = totalListPriceDiscounted * (parseFloat(quoteDiscount) || 0) / 100;
    const laborCost = parseFloat(quoteLaborCost) || 0;
    const totalNetPrice = totalListPrice - discountAmount + laborCost;
    // İşçiliğin "gelişi" (maliyeti) yoktur -> geliş/maliyet toplamına EKLENMEZ.
    // Böylece işçilik tamamen kâra yazılır (BRÜT KAZANÇ = satış net - geliş net).
    const totalNetPriceDiscounted = totalListPriceDiscounted - discountAmountDiscounted;
    
    // Toplam ürün adedi hesapla
    const totalQuantity = selectedProductsData.reduce((sum, p) => sum + (p.quantity || 1), 0);
    
    return {
      totalUSD: isNaN(totalUSD) ? 0 : totalUSD,
      totalUSDDiscounted: isNaN(totalUSDDiscounted) ? 0 : totalUSDDiscounted,
      usdInTry: isNaN(usdInTry) ? 0 : usdInTry,
      usdDiscountedInTry: isNaN(usdDiscountedInTry) ? 0 : usdDiscountedInTry,
      
      totalEUR: isNaN(totalEUR) ? 0 : totalEUR,
      totalEURDiscounted: isNaN(totalEURDiscounted) ? 0 : totalEURDiscounted,
      eurInTry: isNaN(eurInTry) ? 0 : eurInTry,
      eurDiscountedInTry: isNaN(eurDiscountedInTry) ? 0 : eurDiscountedInTry,
      eurInUsd: isNaN(eurInUsd) ? 0 : eurInUsd,
      eurDiscountedInUsd: isNaN(eurDiscountedInUsd) ? 0 : eurDiscountedInUsd,
      
      totalTRY: isNaN(totalTRY) ? 0 : totalTRY,
      totalTRYDiscounted: isNaN(totalTRYDiscounted) ? 0 : totalTRYDiscounted,
      
      totalListPrice: isNaN(totalListPrice) ? 0 : totalListPrice,
      totalListPriceDiscounted: isNaN(totalListPriceDiscounted) ? 0 : totalListPriceDiscounted,
      discountAmount: isNaN(discountAmount) ? 0 : discountAmount,
      discountAmountDiscounted: isNaN(discountAmountDiscounted) ? 0 : discountAmountDiscounted,
      laborCost: isNaN(laborCost) ? 0 : laborCost,
      totalNetPrice: isNaN(totalNetPrice) ? 0 : totalNetPrice,
      totalNetPriceDiscounted: isNaN(totalNetPriceDiscounted) ? 0 : totalNetPriceDiscounted,
      totalWithLaborAndDiscount: isNaN(totalNetPrice) ? 0 : totalNetPrice,
      productCount: selectedProductsData.length,
      totalQuantity: totalQuantity
    };
  }, [selectedProducts, selectedProductsData, showQuoteDiscountedPrices, quoteDiscount, quoteLaborCost, selectedProductsCustomPrices, exchangeRates]);

  // Package totals calculation (similar to quote totals)
  const calculatePackageTotals = useMemo(() => {
    if (!packageWithProducts || !packageWithProducts.products) {
      return {
        totalListPrice: 0,
        totalDiscountedPrice: 0,
        discountAmount: 0,
        laborCost: 0,
        totalNetPrice: 0,
        productCount: 0,
        totalQuantity: 0
      };
    }
    
    // Toplam liste fiyatı hesapla
    const totalListPrice = packageWithProducts.products.reduce((sum, p) => {
      const price = parseFloat(p.list_price_try) || 0;
      const quantity = p.quantity || 1;
      return sum + (price * quantity);
    }, 0);
    
    // Toplam indirimli fiyat hesapla
    const totalDiscountedPrice = packageWithProducts.products.reduce((sum, p) => {
      let price = 0;
      if (p.has_custom_price) {
        // Özel fiyat varsa onu kullan
        price = parseFloat(p.custom_price) || 0;
      } else if (p.discounted_price_try) {
        // Özel fiyat yoksa ürünün kendi indirimli fiyatını kullan
        price = parseFloat(p.discounted_price_try) || 0;
      } else {
        // İkisi de yoksa liste fiyatını kullan
        price = parseFloat(p.list_price_try) || 0;
      }
      const quantity = p.quantity || 1;
      return sum + (price * quantity);
    }, 0);
    
    // Paket indirimi hesapla (göz ikonu toggle'ına göre hangi fiyat üzerinden)
    const basePrice = showPackageDiscountedPrices ? totalDiscountedPrice : totalListPrice;
    const discountAmount = basePrice * (parseFloat(packageDiscount) || 0) / 100;
    const laborCost = parseFloat(packageLaborCost) || 0;
    const totalNetPrice = basePrice - discountAmount + laborCost;
    
    // Toplam ürün adedi hesapla
    const totalQuantity = packageWithProducts.products.reduce((sum, p) => sum + (p.quantity || 1), 0);
    
    return {
      totalListPrice: isNaN(totalListPrice) ? 0 : totalListPrice,
      totalDiscountedPrice: isNaN(totalDiscountedPrice) ? 0 : totalDiscountedPrice,
      discountAmount: isNaN(discountAmount) ? 0 : discountAmount,
      laborCost: isNaN(laborCost) ? 0 : laborCost,
      totalNetPrice: isNaN(totalNetPrice) ? 0 : totalNetPrice,
      productCount: packageWithProducts.products.length,
      totalQuantity: totalQuantity
    };
  }, [packageWithProducts?.products, packageDiscount, packageLaborCost, showPackageDiscountedPrices]);

  const resetNewProductForm = () => {
    setNewProductForm({
      name: '',
      company_id: '',
      category_id: '',
      description: '',
      image_url: '',
      list_price: '',
      discounted_price: '',
      currency: 'USD'
    });
  };

  const createProduct = async () => {
    if (!newProductForm.name.trim() || !newProductForm.company_id || !newProductForm.list_price) {
      toast.error('Ürün adı, firma ve liste fiyatı gerekli');
      return;
    }

    try {
      setLoading(true);
      const productData = {
        name: newProductForm.name,
        company_id: newProductForm.company_id,
        description: newProductForm.description || null,
        image_url: newProductForm.image_url || null,
        list_price: parseFloat(newProductForm.list_price),
        currency: newProductForm.currency
      };

      if (newProductForm.discounted_price) {
        productData.discounted_price = parseFloat(newProductForm.discounted_price);
      }

      if (newProductForm.category_id && newProductForm.category_id !== 'none') {
        productData.category_id = newProductForm.category_id;
      }

      const response = await axios.post(`${API}/products`, productData);
      
      if (response.data) {
        await loadProducts(1, true);
        setShowAddProductDialog(false);
        resetNewProductForm();
        toast.success('Ürün başarıyla eklendi');
      }
    } catch (error) {
      console.error('Error creating product:', error);
      toast.error(error.response?.data?.detail || 'Ürün eklenemedi');
    } finally {
      setLoading(false);
    }
  };

  // Görsel önizleme fonksiyonu
  const openImagePreview = (imageUrl, title) => {
    if (imageUrl && imageUrl.trim()) {
      setPreviewImageUrl(imageUrl);
      setPreviewImageTitle(title || 'Ürün Görseli');
      setShowImagePreview(true);
    }
  };

  const closeImagePreview = () => {
    setShowImagePreview(false);
    setPreviewImageUrl('');
    setPreviewImageTitle('');
  };

  const formatPrice = (price) => {
    // Handle NaN, null, undefined cases
    if (isNaN(price) || price === null || price === undefined) {
      return '0';
    }
    return new Intl.NumberFormat('tr-TR', { 
      style: 'decimal', 
      minimumFractionDigits: 0,  // Ondalık kısım gösterme
      maximumFractionDigits: 0   // Maksimum ondalık da 0
    }).format(Math.round(price));  // Yuvarlayarak tam sayı yap
  };

  const formatExchangeRate = (rate) => {
    // Handle NaN, null, undefined cases
    if (isNaN(rate) || rate === null || rate === undefined) {
      return '0.00';
    }
    return new Intl.NumberFormat('tr-TR', { 
      style: 'decimal', 
      minimumFractionDigits: 2,  // En az 2 ondalık göster
      maximumFractionDigits: 2   // En fazla 2 ondalık göster
    }).format(Number(rate));
  };

  // Mobile device detection - improved for Android
  const isMobileDevice = () => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isAndroid = userAgent.includes('android');
    const isIOS = /iphone|ipad|ipod/.test(userAgent);
    const isMobileWidth = window.innerWidth <= 768;
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    return isAndroid || isIOS || isMobileWidth || isTouchDevice;
  };



  const getCurrencySymbol = (currency) => {
    const symbols = {
      'TRY': '₺',
      'USD': '$',
      'EUR': '€',
      'GBP': '£'
    };
    return symbols[currency] || currency;
  };

  const StatsCard = ({ title, value, icon: Icon, description }) => (
    <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-emerald-800">{title}</CardTitle>
        <Icon className="h-4 w-4 text-emerald-600" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-emerald-900">{value}</div>
        <p className="text-xs text-emerald-600 mt-1">{description}</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-25 to-teal-50">
      {/* Authentication Loading */}
      {authLoading ? (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
          <div className="text-center">
            <div className="relative">
              <div className="w-20 h-20 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-6"></div>
              <img 
                src="/logo.png" 
                alt="Logo" 
                className="w-12 h-12 object-contain absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
              />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Çorlu Karavan</h2>
            <p className="text-slate-600">Sistem yükleniyor...</p>
          </div>
        </div>
      ) : !isAuthenticated ? (
        /* Login Page */
        <div className="flex items-center justify-center min-h-screen">
          <Card className="w-full max-w-md mx-4">
            <CardHeader className="text-center">
              <div className="flex items-center justify-center gap-3 mb-4">
                <img 
                  src="/logo.png" 
                  alt="Çorlu Karavan Logo" 
                  className="w-12 h-12 object-contain"
                />
                <div>
                  <CardTitle className="text-xl font-bold text-slate-800">
                    Çorlu Karavan
                  </CardTitle>
                  <p className="text-sm text-slate-600">Fiyat Takip Sistemi</p>
                </div>
              </div>
              <CardDescription>
                Devam etmek için giriş yapın
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <Label htmlFor="username">Kullanıcı Adı</Label>
                  <Input
                    id="username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    value={loginForm.username}
                    onChange={(e) => setLoginForm({...loginForm, username: e.target.value})}
                    placeholder="Kullanıcı adınızı girin"
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="password">Şifre</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({...loginForm, password: e.target.value})}
                    placeholder="Şifrenizi girin"
                    required
                    className="mt-1"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!loginForm.remember_me}
                    onChange={(e) => setLoginForm({ ...loginForm, remember_me: e.target.checked })}
                    className="accent-emerald-600 w-4 h-4"
                  />
                  Beni hatırla (30 gün oturum açık kalır)
                </label>
                {loginError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-600">{loginError}</p>
                  </div>
                )}
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700">
                  Giriş Yap
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : (
        /* Main Application (Sidebar Layout) */
        <div className="w-full min-h-screen">
          <Tabs value={activeTab} onValueChange={handleTabChange} className="flex min-h-screen bg-transparent">
            {/* 1. Left Sidebar Navigation */}
            <div className={`w-72 bg-white/80 backdrop-blur-md border-r border-slate-200/80 p-6 flex flex-col justify-between shrink-0 shadow-lg h-screen sticky top-0 z-20 ${hideChromeForWiring ? 'hidden' : ''}`}>
              <div className="space-y-6 flex flex-col overflow-y-auto no-scrollbar">
                {/* Logo & Brand Info */}
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0">
                    <img 
                      src="/logo.png" 
                      alt="Çorlu Karavan Logo" 
                      className="w-14 h-14 object-contain"
                    />
                  </div>
                  <div>
                    <h1 className="font-extrabold text-xl leading-none text-slate-800 tracking-tight">
                      Çorlu Karavan
                    </h1>
                    <p className="text-[10px] text-slate-500 font-semibold mt-1">Fiyat Takip Sistemi</p>
                  </div>
                </div>

                {/* Navigation Tab List (Vertical) */}
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2">Menü</p>
                  <TabsList className="flex flex-col gap-1.5 w-full h-auto p-0 bg-transparent border-0 shadow-none">
                    <TabsTrigger
                      value="products"
                      className="group flex items-center justify-start gap-3 w-full h-11 px-4 text-sm font-semibold text-slate-700 transition-all duration-200 hover:bg-emerald-50 rounded-xl data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
                    >
                      <Package className="w-4 h-4 text-emerald-500 group-data-[state=active]:text-white" />
                      <span>Ürünler</span>
                    </TabsTrigger>

                    <TabsTrigger
                      value="quotes"
                      className="group flex items-center justify-start gap-3 w-full h-11 px-4 text-sm font-semibold text-slate-700 transition-all duration-200 hover:bg-amber-50 rounded-xl data-[state=active]:bg-amber-500 data-[state=active]:text-white data-[state=active]:shadow-sm"
                    >
                      <FileText className="w-4 h-4 text-amber-500 group-data-[state=active]:text-white" />
                      <span className="flex-1 text-left">Teklifler</span>
                      {selectedProducts.size > 0 && (
                        <Badge className="ml-auto bg-amber-500 hover:bg-amber-600 text-white text-[10px] px-1.5 py-0.5 font-bold group-data-[state=active]:bg-white group-data-[state=active]:text-amber-600">
                          {selectedProducts.size}
                        </Badge>
                      )}
                    </TabsTrigger>

                    <TabsTrigger
                      value="contracts"
                      onClick={async (e) => {
                        if (viewingContract) {
                          e.preventDefault();
                          await backFromContract();
                          setActiveTab('contracts');
                        } else {
                          setActiveTab('contracts');
                        }
                      }}
                      className="group flex items-center justify-start gap-3 w-full h-11 px-4 text-sm font-semibold text-slate-700 transition-all duration-200 hover:bg-blue-50 rounded-xl data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
                    >
                      <FileText className="w-4 h-4 text-blue-500 group-data-[state=active]:text-white" />
                      <span>Sözleşmeler</span>
                    </TabsTrigger>

                    <TabsTrigger
                      value="upload"
                      className="group flex items-center justify-start gap-3 w-full h-11 px-4 text-sm font-semibold text-slate-700 transition-all duration-200 hover:bg-violet-50 rounded-xl data-[state=active]:bg-violet-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
                    >
                      <Upload className="w-4 h-4 text-violet-500 group-data-[state=active]:text-white" />
                      <span>Ürün Ekle (AI)</span>
                    </TabsTrigger>

                    <TabsTrigger
                      value="battery-test"
                      className="group flex items-center justify-start gap-3 w-full h-11 px-4 text-sm font-semibold text-slate-700 transition-all duration-200 hover:bg-teal-50 rounded-xl data-[state=active]:bg-teal-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
                    >
                      <Battery className="w-4 h-4 text-teal-500 group-data-[state=active]:text-white" />
                      <span>Akü Test</span>
                    </TabsTrigger>

                    <TabsTrigger
                      value="mppt"
                      className="group flex items-center justify-start gap-3 w-full h-11 px-4 text-sm font-semibold text-slate-700 transition-all duration-200 hover:bg-lime-50 rounded-xl data-[state=active]:bg-lime-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
                    >
                      <Calculator className="w-4 h-4 text-lime-600 group-data-[state=active]:text-white" />
                      <span>MPPT Hesapla</span>
                    </TabsTrigger>

                    <TabsTrigger
                      value="wiring-diagram"
                      className="group flex items-center justify-start gap-3 w-full h-11 px-4 text-sm font-semibold text-slate-700 transition-all duration-200 hover:bg-cyan-50 rounded-xl data-[state=active]:bg-cyan-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
                    >
                      <Cable className="w-4 h-4 text-cyan-500 group-data-[state=active]:text-white" />
                      <span>Kablo Şeması</span>
                    </TabsTrigger>

                    <TabsTrigger
                      value="service"
                      className="group flex items-center justify-start gap-3 w-full h-11 px-4 text-sm font-semibold text-slate-700 transition-all duration-200 hover:bg-orange-50 rounded-xl data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow-sm"
                    >
                      <Wrench className="w-4 h-4 text-orange-500 group-data-[state=active]:text-white" />
                      <span>Servis</span>
                    </TabsTrigger>

                    {/* Tanımlar — en altta */}
                    <div className="mt-2 pt-2 border-t border-slate-200">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1.5">Tanımlar</p>
                    </div>

                    <TabsTrigger
                      value="companies"
                      className="group flex items-center justify-start gap-3 w-full h-11 px-4 text-sm font-semibold text-slate-700 transition-all duration-200 hover:bg-indigo-50 rounded-xl data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
                    >
                      <Building2 className="w-4 h-4 text-indigo-500 group-data-[state=active]:text-white" />
                      <span>Firmalar</span>
                    </TabsTrigger>

                    <TabsTrigger
                      value="categories"
                      className="group flex items-center justify-start gap-3 w-full h-11 px-4 text-sm font-semibold text-slate-700 transition-all duration-200 hover:bg-rose-50 rounded-xl data-[state=active]:bg-rose-500 data-[state=active]:text-white data-[state=active]:shadow-sm"
                    >
                      <Tags className="w-4 h-4 text-rose-500 group-data-[state=active]:text-white" />
                      <span>Kategoriler</span>
                    </TabsTrigger>
                  </TabsList>
                </div>
              </div>

              {/* Bottom section: Logout */}
              <div className="pt-4 border-t border-slate-100">
                <Button 
                  variant="outline"
                  onClick={handleLogout}
                  className="w-full text-slate-600 hover:text-slate-800 hover:bg-slate-100 border-slate-200 h-10 px-4 text-sm font-semibold rounded-xl flex items-center justify-center gap-2 shadow-2xs"
                >
                  <LogOut className="w-4 h-4" />
                  Çıkış Yap
                </Button>
              </div>
            </div>

            {/* 2. Right Main Work Area */}
            <div className="flex-1 overflow-y-auto p-8 bg-slate-50/30">
              <div className="w-full space-y-6">
                {/* Currency Rates Bar */}
                <div className={`flex justify-end ${hideChromeForWiring ? 'hidden' : ''}`}>
                  <div className="flex flex-wrap items-center justify-end gap-2.5 bg-white/85 border border-slate-200/80 px-4 py-3 rounded-2xl shadow-sm backdrop-blur-md">
                    <div className="flex items-center gap-2 px-1">
                      <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider whitespace-nowrap">Döviz Kurları</span>
                      {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />}
                    </div>

                    <div className="flex items-center gap-3 bg-amber-50/80 border border-amber-200/60 px-4 py-2 rounded-xl text-amber-900 shadow-2xs">
                      <span className="text-xs uppercase font-bold text-amber-600 tracking-wider">USD/TRY</span>
                      <span className="font-extrabold text-lg tracking-tight">
                        {exchangeRates.USD ? formatExchangeRate(exchangeRates.USD) : '---'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 bg-emerald-50/80 border border-emerald-200/60 px-4 py-2 rounded-xl text-emerald-900 shadow-2xs">
                      <span className="text-xs uppercase font-bold text-emerald-600 tracking-wider">EUR/TRY</span>
                      <span className="font-extrabold text-lg tracking-tight">
                        {exchangeRates.EUR ? formatExchangeRate(exchangeRates.EUR) : '---'}
                      </span>
                    </div>

                    <Button
                      onClick={refreshPrices}
                      disabled={loading}
                      className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white h-8 px-3 text-xs font-extrabold shadow-2xs rounded-xl flex items-center justify-center gap-1.5 border border-emerald-500/10 active:scale-95 transition-all duration-200"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                      Kurları Güncelle
                    </Button>


                  </div>
                </div>

          {/* Companies Tab */}
          <TabsContent value="companies" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Firma Yönetimi</CardTitle>
                <CardDescription>Tedarikçi firmalarınızı ekleyin ve yönetin</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4 mb-6">
                  <Input
                    placeholder="Firma adı"
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={createCompany}>
                    <Plus className="w-4 h-4 mr-2" />
                    Firma Ekle
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowScrapeDialog(true)}
                    className="bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                    Web'den Ürün Yükle
                  </Button>
                  <Button
                    variant="outline"
                    onClick={downloadTemplate}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Şablon İndir
                  </Button>
                  <Button
                    variant="outline"
                    onClick={exportProducts}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Ürün Export
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {companies.length === 0 ? (
                    <div className="col-span-full text-center py-16">
                      <Building2 className="w-20 h-20 mx-auto mb-4 text-slate-300" />
                      <h3 className="text-xl font-semibold text-slate-700 mb-2">Henüz firma eklenmedi</h3>
                      <p className="text-slate-500 mb-6">Tedarikçi firmalarınızı ekleyerek ürünlerinizi yönetmeye başlayın</p>
                      <Button onClick={() => document.querySelector('input[placeholder="Firma adı"]').focus()}>
                        <Plus className="w-4 h-4 mr-2" />
                        İlk Firmayı Ekle
                      </Button>
                    </div>
                  ) : (
                    companies.map((company) => (
                    <Card key={company.id} className="border-slate-200">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg">{company.name}</CardTitle>
                        <CardDescription>
                          {new Date(company.created_at).toLocaleDateString('tr-TR')}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => renameCompany(company)}
                            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700"
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            Düzenle
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openUploadHistoryDialog(company)}
                            className="bg-blue-50 hover:bg-blue-100 text-blue-700"
                          >
                            <Archive className="w-4 h-4 mr-2" />
                            Geçmiş
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteCompany(company.id)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Sil
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Categories Tab */}
          <TabsContent value="categories" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Kategori Yönetimi</CardTitle>
                <CardDescription>
                  Ürünlerinizi kategorilere ayırın ve düzenleyin. 
                  <span className="text-blue-600 font-medium">💡 Kategorileri sürükleyerek sıralarını değiştirebilirsiniz</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 mb-6">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Input
                      placeholder="Kategori adı"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                    />
                    <Input
                      placeholder="Açıklama (opsiyonel)"
                      value={newCategoryDescription}
                      onChange={(e) => setNewCategoryDescription(e.target.value)}
                    />
                    <Input
                      placeholder="Küçük Resim URL (opsiyonel)"
                      value={newCategoryImageUrl}
                      onChange={(e) => setNewCategoryImageUrl(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={newCategoryColor}
                        onChange={(e) => setNewCategoryColor(e.target.value)}
                        className="w-16"
                      />
                      <Button onClick={createCategory} className="flex-1">
                        <Plus className="w-4 h-4 mr-2" />
                        Kategori Ekle
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Favori Ürünler Kartı */}
                  <Card className="border-amber-200 bg-amber-50">
                    <CardHeader className="pb-3" style={{borderLeft: '4px solid #f59e0b'}}>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
                          <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        </div>
                        Favori Ürünler
                      </CardTitle>
                      <CardDescription>
                        {favoriteProducts.length} favori ürün
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {/* Removed favorites list - only showing count now */}
                    </CardContent>
                  </Card>
                  
                  {categories.map((category) => (
                    <Card 
                      key={category.id} 
                      className={`border-slate-200 cursor-move transition-all duration-200 ${
                        draggedCategoryId === category.id ? 'opacity-50 scale-95' : ''
                      } ${
                        dragOverCategoryId === category.id ? 'ring-2 ring-blue-400 ring-opacity-50 scale-105' : ''
                      }`}
                      draggable={true}
                      onDragStart={(e) => handleCategoryDragStart(e, category.id)}
                      onDragOver={(e) => handleCategoryDragOver(e, category.id)}
                      onDragLeave={handleCategoryDragLeave}
                      onDrop={(e) => handleCategoryDrop(e, category.id)}
                      onDragEnd={handleCategoryDragEnd}
                    >
                      <CardHeader className="pb-3" style={{borderLeft: `4px solid ${category.color}`}}>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <div className="flex items-center gap-2 cursor-move">
                            <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
                            </svg>
                            {category.image_url ? (
                              <img 
                                src={category.image_url} 
                                alt={category.name}
                                className="w-5 h-5 rounded-md object-cover border border-slate-100 flex-shrink-0"
                              />
                            ) : (
                              <div 
                                className="w-4 h-4 rounded-full" 
                                style={{backgroundColor: category.color}}
                              ></div>
                            )}
                          </div>
                          {category.name}
                        </CardTitle>
                        {category.description && (
                          <CardDescription>{category.description}</CardDescription>
                        )}
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openCategoryProductDialog(category)}
                            className="bg-blue-50 hover:bg-blue-100 text-blue-700"
                          >
                            <Plus className="w-4 h-4 mr-1" />
                            Ürün Ekle
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => startEditCategory(category)}
                            className="bg-amber-50 hover:bg-amber-100 text-amber-700"
                          >
                            <Edit className="w-4 h-4 mr-1" />
                            Düzenle
                          </Button>
                          {/* Only show delete button if category is deletable */}
                          {category.is_deletable !== false && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => deleteCategory(category.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Category Filter Info */}
                {selectedCategory && (
                  <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-emerald-800">
                        Kategori filtresi aktif: <strong>{categories.find(c => c.id === selectedCategory)?.name}</strong>
                      </span>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleCategoryFilter('')}
                      >
                        Filtreyi Kaldır
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Category Groups Management */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div>
                  <CardTitle>Kategori Grupları</CardTitle>
                  <CardDescription>
                    Kategorileri mantıksal gruplar halinde düzenleyin.
                    <span className="text-purple-600 font-medium">💡 Grupları sürükleyerek sıralarını değiştirebilirsiniz</span>
                  </CardDescription>
                </div>
                <Button onClick={() => setShowCategoryGroupDialog(true)} className="bg-purple-600 hover:bg-purple-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Grup Ekle
                </Button>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {categoryGroups.map((group) => (
                    <Card 
                      key={group.id} 
                      className={`border-2 cursor-move transition-all duration-200 ${
                        draggedCategoryGroupId === group.id ? 'opacity-50 scale-95' : ''
                      } ${
                        dragOverCategoryGroupId === group.id ? 'ring-2 ring-purple-400 ring-opacity-50 scale-105' : ''
                      }`}
                      style={{ borderColor: group.color }}
                      draggable={true}
                      onDragStart={(e) => handleCategoryGroupDragStart(e, group.id)}
                      onDragOver={(e) => handleCategoryGroupDragOver(e, group.id)}
                      onDragLeave={handleCategoryGroupDragLeave}
                      onDrop={(e) => handleCategoryGroupDrop(e, group.id)}
                      onDragEnd={handleCategoryGroupDragEnd}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="cursor-move">
                              <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
                              </svg>
                            </div>
                            <div 
                              className="w-4 h-4 rounded-full"
                              style={{ backgroundColor: group.color }}
                            />
                            <CardTitle className="text-lg">{group.name}</CardTitle>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startEditCategoryGroup(group)}
                              className="h-8 w-8 p-0"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteCategoryGroup(group.id)}
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                        {group.description && (
                          <p className="text-sm text-muted-foreground">{group.description}</p>
                        )}
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-slate-700">İçindeki Kategoriler:</p>
                          <div className="flex flex-wrap gap-1">
                            {group.category_ids?.map(categoryId => {
                              const category = categories.find(c => c.id === categoryId);
                              return category ? (
                                <Badge 
                                  key={categoryId} 
                                  variant="secondary" 
                                  className="text-xs"
                                  style={{ backgroundColor: category.color + '20', color: category.color }}
                                >
                                  {category.name}
                                </Badge>
                              ) : null;
                            })}
                            {(!group.category_ids || group.category_ids.length === 0) && (
                              <span className="text-xs text-slate-400">Kategori seçilmemiş</span>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                
                {categoryGroups.length === 0 && (
                  <div className="text-center py-8">
                    <Tags className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-slate-800 mb-2">Henüz kategori grubu yok</h3>
                    <p className="text-slate-600 mb-4">Kategorilerinizi gruplandırmak için "Grup Ekle" butonuna tıklayın</p>
                    <Button onClick={() => setShowCategoryGroupDialog(true)} className="bg-purple-600 hover:bg-purple-700">
                      <Plus className="w-4 h-4 mr-2" />
                      İlk Grubumu Oluştur
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===================== SÖZLEŞMELER ===================== */}
          <TabsContent value="contracts" className="space-y-6">
            {!viewingContract ? (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                      <FileText className="w-6 h-6 text-emerald-600" /> Sözleşmeler
                    </h2>
                    <p className="text-sm text-slate-500">Excel sözleşmelerini yükleyin, uzaktan görüntüleyin</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => { setContractForm(emptyContractForm); setContractFile(null); setContractUploadOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl">
                      <Upload className="w-4 h-4 mr-2" /> Sözleşme Yükle
                    </Button>
                    <input id="contract-bulk-input" type="file" accept=".xlsx,.xls,.xlsm" multiple className="sr-only" onChange={(e) => { bulkUploadContracts(e.target.files); e.target.value = ''; }} />
                    <label htmlFor="contract-bulk-input" className={`inline-flex items-center justify-center px-4 h-10 rounded-xl font-bold text-sm cursor-pointer transition-colors ${bulkUploading ? 'bg-slate-200 text-slate-500 pointer-events-none' : 'bg-slate-800 hover:bg-slate-900 text-white'}`}>
                      <Upload className="w-4 h-4 mr-2" /> {bulkUploading ? `Yükleniyor ${bulkProgress.done}/${bulkProgress.total}` : 'Toplu Yükle'}
                    </label>
                    <Button onClick={openTemplateEditor} variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50 font-bold rounded-xl" title='"Sıfırdan Sözleşme"de açılacak varsayılan şablonu düzenle'>
                      <Star className="w-4 h-4 mr-2" /> Şablon Sözleşme
                    </Button>
                  </div>
                </div>

                {contracts.length > 0 && (
                  <div className="space-y-3">
                    {/* Ön filtre: aşama (segmented) */}
                    <div className="inline-flex flex-wrap rounded-xl bg-slate-100 p-1 gap-1">
                      {[
                        { k: 'agreed', label: 'Anlaşılan Sözleşmeler', Icon: CheckCircle2 },
                        { k: 'proposal', label: 'Teklif Aşaması', Icon: Folder },
                        { k: 'all', label: 'Tümü', Icon: FileText },
                      ].map(({ k, label, Icon }) => {
                        const count = k === 'all' ? contracts.length : contracts.filter((c) => (c.stage || 'proposal') === k).length;
                        const active = contractStageFilter === k;
                        return (
                          <button key={k} type="button" onClick={() => { setContractStageFilter(k); if (k !== 'agreed') setContractPayFilter('all'); }} className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                            <Icon className="w-4 h-4" /> {label} <span className="text-slate-400 font-semibold">{count}</span>
                          </button>
                        );
                      })}
                    </div>
                    {/* Ödeme alt-filtresi: yalnızca Anlaşıldı görünümünde (teklif aşamasında ödeme yok) */}
                    {contractStageFilter === 'agreed' && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider w-16 shrink-0">Ödeme</span>
                        {[{ k: 'all', label: 'Tümü' }, { k: 'open', label: 'Ödemesi Tamamlanmayan' }, { k: 'done', label: 'Tamamlandı' }].map(({ k, label }) => {
                          const agreedList = contracts.filter((c) => (c.stage || 'proposal') === 'agreed');
                          const count = k === 'all' ? agreedList.length : agreedList.filter((c) => contractPayClass(c) === k).length;
                          const active = contractPayFilter === k;
                          return (
                            <button key={k} type="button" onClick={() => setContractPayFilter(k)} className={`px-3.5 py-1.5 rounded-full text-sm font-semibold border transition-colors ${active ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                              {label} <span className={active ? 'text-white/80' : 'text-slate-400'}>{count}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {/* Arama — her aşamada (teklif + anlaşılan) */}
                    <div className="relative max-w-md">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <input
                        value={contractSearch}
                        onChange={(e) => setContractSearch(e.target.value)}
                        placeholder="Müşteri, araç türü veya dosya adı ara..."
                        className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      />
                    </div>
                  </div>
                )}

                {(() => {
                  const sq = contractSearch.trim().toLocaleLowerCase('tr-TR');
                  const filtered = contracts.filter((c) => (contractStageFilter === 'all' || (c.stage || 'proposal') === contractStageFilter) && (contractStageFilter !== 'agreed' || contractPayFilter === 'all' || contractPayClass(c) === contractPayFilter) && (!sq || [c.customer_name, c.title, c.file_name].filter(Boolean).some((v) => String(v).toLocaleLowerCase('tr-TR').includes(sq))));
                  const proposalCount = contracts.filter((c) => (c.stage || 'proposal') === 'proposal').length;
                  return (
                  <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Sıfırdan Sözleşme — her zaman sabit en başta */}
                    <button type="button" onClick={() => { const liveKur = exchangeRates?.EUR ? parseFloat(exchangeRates.EUR).toFixed(2) : '35.00'; setNewContractForm({ title: '', customer_name: '', notes: '', kur: liveKur }); setNewContractDialogOpen(true); }} className="group bg-blue-50/40 hover:bg-blue-50 rounded-2xl border-2 border-dashed border-blue-300 hover:border-blue-400 transition-colors p-5 flex flex-col items-center justify-center text-center gap-2 min-h-[170px]">
                      <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform"><Plus className="w-6 h-6" /></div>
                      <div className="font-bold text-blue-700">Sıfırdan Sözleşme Yap</div>
                      <div className="text-xs text-blue-500/80">Katalogdan yeni sözleşme oluştur</div>
                    </button>
                    {filtered.map((c, ci) => (
                      <div key={c.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                              <FileText className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-slate-800 truncate" title={c.customer_name || c.title}>{c.customer_name || c.title}</div>
                              {c.customer_name && <div className="text-sm text-slate-500 truncate" title={c.title}>{c.title}</div>}
                            </div>
                          </div>
                          {/* Sıra düzenleme okları (görünen listede komşusuyla yer değiştirir) */}
                          <div className="flex flex-col shrink-0 -my-1">
                            <button type="button" disabled={ci === 0} onClick={() => swapContracts(c.id, filtered[ci - 1]?.id)} title="Yukarı taşı" className="text-slate-300 hover:text-emerald-600 disabled:opacity-30 disabled:hover:text-slate-300">
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button type="button" disabled={ci === filtered.length - 1} onClick={() => swapContracts(c.id, filtered[ci + 1]?.id)} title="Aşağı taşı" className="text-slate-300 hover:text-emerald-600 disabled:opacity-30 disabled:hover:text-slate-300">
                              <ChevronDown className="w-4 h-4" />
                            </button>
                          </div>
                          {(() => {
                            if ((c.stage || 'proposal') !== 'agreed') return null;
                            const status = getContractPaymentStatus(c);
                            return status ? (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${status.c}`}>
                                {status.t}
                              </span>
                            ) : null;
                          })()}
                        </div>
                        <div className="text-xs text-slate-400 truncate">{c.file_name}</div>
                        <div className="text-xs text-slate-400">{(c.doc_date || c.created_at) ? new Date(c.doc_date || c.created_at).toLocaleDateString('tr-TR') : ''}</div>
                        {(() => {
                          const stage = c.stage || 'proposal';
                          const agreed = stage === 'agreed';
                          return (
                            <select value={stage} onChange={(e) => setContractStage(c.id, e.target.value)} title="Aşama seç" className={`self-start text-[11px] font-bold px-2.5 py-1 rounded-full border cursor-pointer outline-none focus:ring-2 focus:ring-emerald-300 ${agreed ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                              <option value="proposal">Teklif Aşaması</option>
                              <option value="agreed">Anlaşıldı</option>
                            </select>
                          );
                        })()}
                        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 mt-auto">
                          <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs" onClick={() => openContract(c.id)}>
                            <Eye className="w-4 h-4 mr-1" /> Görüntüle
                          </Button>
                          <Button size="sm" variant="ghost" className="text-slate-500" onClick={() => openContract(c.id, true)} title="Kalemleri Düzenle">
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-slate-500" onClick={() => copyContract(c.id)} title="Kopyala">
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-slate-500" onClick={() => window.open(`${API}/contracts/${c.id}/download`, '_blank')} title="Excel'i indir">
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => deleteContract(c.id)} title="Sil">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {filtered.length === 0 && (
                    <div className="text-center py-8 text-sm text-slate-400">
                      {contracts.length === 0
                        ? 'Henüz sözleşme yok — yukarıdaki kartla oluştur ya da Excel yükle.'
                        : (contractStageFilter === 'agreed'
                            ? (<span>Henüz anlaşılan sözleşme yok.{proposalCount > 0 && (<> <button type="button" onClick={() => setContractStageFilter('proposal')} className="font-bold text-emerald-700 hover:underline">Teklif Aşaması ({proposalCount})</button> klasörüne bak.</>)}</span>)
                            : 'Bu filtreye uygun sözleşme yok.')}
                    </div>
                  )}
                  </>
                  ); })()}
              </>
            ) : (
              /* Sözleşme önizleme */
              (() => {
                const baseData = viewingContract.data || parseContract(viewingContract.sheets);
                const parsed = contractEditMode && contractDraft ? contractDraft : baseData;
                // Müşteri seçim/renk kutuları + kalan notlar (specs notlardan ayrıştırılır)
                const specParse = parsed.specs ? { specs: parsed.specs, remaining: parsed.notes || [] } : parseContractSpecs(parsed.notes || []);
                const contractSpecs = specParse.specs;
                const contractDisplayNotes = specParse.remaining;
                // --- Finansal hesaplama (ilaveler, fatura farkı, tahsilat, kalan) ---
                const liveRate = parseFloat(exchangeRates?.EUR) || (parsed && parsed.kur) || 0;
                const fin = (() => {
                  const cr = parseFloat(parsed?.kur) || 0;
                  const toEUR = (amount, currency, rate) => {
                    const a = parseFloat(amount); if (isNaN(a)) return 0;
                    if (currency === 'TRY') { const r = parseFloat(rate) || cr || liveRate || 1; return r ? a / r : 0; }
                    if (currency === 'USD') { const u = parseFloat(exchangeRates?.USD) || 0; const e = parseFloat(exchangeRates?.EUR) || cr || 0; return (u && e) ? a * u / e : 0; }
                    return a;
                  };
                  const productsEUR = parsed?.eurTotal != null ? (parseFloat(parsed.eurTotal) || 0) : (parsed?.grandTotal && cr ? parsed.grandTotal / cr : 0);
                  const addons = parsed?.addons || [];
                  const addonsEUR = addons.reduce((s, a) => s + ((a.amount == null || a.amount === '') ? 0 : toEUR(a.amount, a.currency, a.rate)), 0);
                  const inv = parsed?.invoiceDiff;
                  const invEUR = (inv && inv.amount != null && inv.amount !== '') ? toEUR(Math.abs(parseFloat(inv.amount) || 0), inv.currency, inv.rate) : 0;
                  const grandEUR = productsEUR + addonsEUR + invEUR;
                  const collections = parsed?.collections || [];
                  const collectedEUR = collections.reduce((s, c) => s + toEUR(c.amount, c.currency, c.rate), 0);
                  const remainingEUR = grandEUR - collectedEUR;
                  const pct = grandEUR > 0 ? Math.max(0, Math.min(100, Math.round(collectedEUR / grandEUR * 100))) : 0;
                  return { cr, toEUR, productsEUR, addonsEUR, invEUR, grandEUR, collectedEUR, remainingEUR, pct };
                })();
                const origKur = parsed && parsed.kur != null ? parsed.originalKur != null ? parsed.originalKur : parsed.kur : null;
                const currentKur = parsed && parsed.kur != null ? parsed.kur : null;
                const simRateNum = parseFloat(contractSimRate);
                const simActive = !contractEditMode && !!currentKur && !isNaN(simRateNum) && simRateNum > 0 && Math.abs(simRateNum - currentKur) > 1e-9;
                const kurFactor = simActive ? simRateNum / currentKur : 1;
                const adj = (v) => (v == null ? null : v * kurFactor);
                // Teklif aşamasındaki sözleşmelerde ödeme yok → Tahsilat/Kalan paneli gizlenir (liste kart rozeti ile tutarlı)
                const isAgreed = (viewingContract.stage || 'proposal') === 'agreed';
                const isTpl = !!viewingContract.isTemplate; // şablon düzenleyici: sadece kalemler + notlar; ilave/tahsilat/teslim/spec gizli
                return (
                  <div className="space-y-4">
                    {/* Sabit alt-orta aksiyon çubuğu — yukarı çıkmadan düzenle/kaydet */}
                    {(contractEditMode || (parsed && !contractRawView)) && (
                      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full bg-white/95 backdrop-blur shadow-[0_8px_30px_rgba(0,0,0,0.18)] ring-1 ring-slate-200 px-3 py-2">
                        {contractEditMode ? (
                          <>
                            {contractDirty && <span className="text-xs text-emerald-700 font-semibold px-1 hidden sm:inline">● Kaydedilmemiş</span>}
                            {contractHistory.length > 0 && (
                              <Button size="sm" variant="outline" onClick={undoContractChange} className="border-slate-300 text-slate-700 hover:bg-slate-50 rounded-full"><X className="w-4 h-4 mr-1" /> Geri Al</Button>
                            )}
                            <Button size="sm" onClick={saveContractDraft} disabled={contractDataSaving || !contractDirty} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full"><Save className="w-4 h-4 mr-1.5" /> {contractDataSaving ? 'Kaydediliyor...' : (isTpl ? 'Şablonu Kaydet' : 'Kaydet')}</Button>
                            <Button size="sm" variant="outline" onClick={isTpl ? backFromContract : exitContractEdit} disabled={contractDataSaving} className="rounded-full">Bitir</Button>
                          </>
                        ) : (
                          <Button size="sm" onClick={() => enterContractEdit(baseData)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full"><Edit className="w-4 h-4 mr-1.5" /> Kalemleri Düzenle</Button>
                        )}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <Button variant="ghost" size="sm" onClick={backFromContract} className="text-slate-500">← Listeye dön</Button>
                      <div className="flex items-center gap-2 flex-wrap">
                        {contractEditMode ? (
                          <>
                            <span className="text-xs text-emerald-700 font-semibold mr-1">{contractDirty ? '● Kaydedilmemiş değişiklik' : 'Düzenleme modu'}</span>
                            {contractHistory.length > 0 && (
                              <Button size="sm" variant="outline" onClick={undoContractChange} className="border-slate-300 text-slate-700 hover:bg-slate-50 mr-1">
                                <X className="w-4 h-4 mr-1" /> Geri Al
                              </Button>
                            )}
                            <Button size="sm" onClick={saveContractDraft} disabled={contractDataSaving || !contractDirty} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                              <Save className="w-4 h-4 mr-2" /> {contractDataSaving ? 'Kaydediliyor...' : (isTpl ? 'Şablonu Kaydet' : 'Kaydet')}
                            </Button>
                            <Button variant="outline" size="sm" onClick={isTpl ? backFromContract : exitContractEdit} disabled={contractDataSaving}>Bitir</Button>
                          </>
                        ) : (
                          <>
                            {parsed && (
                              <Button variant="outline" size="sm" onClick={() => setContractRawView((v) => !v)}>
                                {contractRawView ? 'Tasarım görünümü' : 'Tablo görünümü'}
                              </Button>
                            )}
                            {parsed && !contractRawView && (
                              <Button variant="outline" size="sm" onClick={() => enterContractEdit(baseData)} className="border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                                <Edit className="w-4 h-4 mr-2" /> Kalemleri Düzenle
                              </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={() => openEditContract(viewingContract)}>
                              <Edit className="w-4 h-4 mr-2" /> Başlık/Not
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => copyContract(viewingContract.id)}>
                              <Copy className="w-4 h-4 mr-2" /> Kopyala
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => window.open(`${API}/contracts/${viewingContract.id}/download`, '_blank')} title="Excel olarak indir">
                              <Download className="w-4 h-4 mr-2" /> Excel
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => window.open(`${API}/contracts/${viewingContract.id}/pdf`, '_blank')} className="border-blue-300 text-blue-700 hover:bg-blue-50" title="Tasarımlı A4 PDF olarak indir">
                              <Download className="w-4 h-4 mr-2" /> PDF İndir
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {parsed && !contractRawView ? (
                      /* ===== TASARIMLI SÖZLEŞME GÖRÜNÜMÜ ===== */
                      <div className="max-w-5xl mx-auto bg-white rounded-2xl ring-1 ring-slate-200/70 overflow-hidden shadow-[0_18px_50px_-20px_rgba(27,58,92,0.45)]">
                        {/* Başlık bandı */}
                        <div className="relative bg-[#1B3A5C] text-white px-6 sm:px-10 pt-8 pb-7 overflow-hidden">
                          <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '22px 22px' }} />
                          <div className="absolute left-0 right-0 bottom-0 h-1 bg-gradient-to-r from-emerald-400 via-emerald-500 to-transparent" />
                          <div className="relative flex items-start justify-between gap-6 flex-wrap">
                            <div className="min-w-0">
                              <div className="flex items-center gap-3 mb-3">
                                <img src="/logo.png" alt="Logo" className="h-8 w-auto object-contain bg-white/10 rounded px-1.5 py-0.5" />
                                <div className="flex items-center gap-2 text-emerald-300/90 text-[11px] font-semibold uppercase tracking-[0.25em]">
                                  <span className="inline-block w-6 h-px bg-emerald-400/60" /> Çorlu Karavan
                                </div>
                              </div>
                              <h2 style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="text-3xl sm:text-4xl font-semibold leading-tight tracking-tight">{viewingContract.customer_name || viewingContract.title}</h2>
                              <p className="text-white/50 text-[11px] uppercase tracking-[0.2em] mt-2">Müşteri Teklif Formu ve Sözleşme</p>
                            </div>
                            <div className="text-right text-sm shrink-0 space-y-3">
                              <div>
                                <div className="text-white/45 text-[10px] uppercase tracking-widest">Tarih</div>
                                <div className="font-semibold tabular-nums">{(viewingContract.doc_date || viewingContract.created_at) ? new Date(viewingContract.doc_date || viewingContract.created_at).toLocaleDateString('tr-TR') : '—'}</div>
                              </div>
                              {currentKur != null && (
                                <div className="inline-flex items-center gap-2 bg-white/10 ring-1 ring-white/15 rounded-full px-3 py-1.5">
                                  <span className="text-white/55 text-[10px] uppercase tracking-widest">Kur</span>
                                  <span className="font-bold tabular-nums">1 € = ₺{formatExchangeRate(currentKur)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          {viewingContract.title && (
                            <div className="relative mt-5 inline-flex items-center gap-2">
                              <span className="text-white/45 text-[10px] uppercase tracking-widest">Araç</span>
                              <span className="font-semibold text-base">{viewingContract.title}</span>
                            </div>
                          )}
                        </div>

                        {/* Bölümler + kalemler (Excel benzeri tek liste tablosu) */}
                        <div className="px-4 sm:px-8 py-6 bg-white">
                          <div className="ring-1 ring-slate-300 rounded-lg overflow-x-auto">
                            <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleContractItemDragEnd}>
                            <table className="w-full border-collapse text-[13px] min-w-[620px]">
                              <thead>
                                <tr className="bg-[#1B3A5C] text-white text-[11px] uppercase tracking-wider">
                                  <th className="px-2 py-1.5 text-left font-semibold border border-[#2E5A86] w-8">#</th>
                                  <th className="px-2 py-1.5 text-left font-semibold border border-[#2E5A86]">İşlem</th>
                                  <th className="px-2 py-1.5 text-center font-semibold border border-[#2E5A86] w-12">Adet</th>
                                  <th className="px-2 py-1.5 text-right font-semibold border border-[#2E5A86] w-24">Birim €</th>
                                  <th className="px-2 py-1.5 text-right font-semibold border border-[#2E5A86] w-24">Birim ₺</th>
                                  <th className="px-2 py-1.5 text-right font-semibold border border-[#2E5A86] w-28">Tutar ₺</th>
                                </tr>
                              </thead>
                              <tbody>
                                {parsed.sections.map((sec, si) => {
                                  return (
                                    <React.Fragment key={si}>
                                      <tr className="bg-slate-100">
                                        <td colSpan={6} className="px-2 py-1 font-bold text-[#1B3A5C] uppercase text-[12px] tracking-wide border border-slate-300">
                                          {String(si + 1).padStart(2, '0')} · {sec.name}
                                        </td>
                                      </tr>
                                      <SortableContext items={(sec.items || []).map((it, ii) => it._uid || `pos-${si}-${ii}`)} strategy={verticalListSortingStrategy} disabled={!contractEditMode}>
                                      {sec.items.map((it, ii) => (
                                        <SortableItemRow key={it._uid || `pos-${si}-${ii}`} id={it._uid || `pos-${si}-${ii}`} disabled={!contractEditMode}>
                                          {(dragListeners) => (<>
                                          <td className="px-2 py-1 text-slate-400 tabular-nums border border-slate-200 align-top">
                                            {contractEditMode ? (
                                              <div className="flex items-center gap-1">
                                                <span
                                                  {...dragListeners}
                                                  className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 shrink-0 touch-none"
                                                  title="Sürükleyip taşı"
                                                ><GripVertical className="w-3.5 h-3.5" /></span>
                                                <span className="tabular-nums">{it.sno}</span>
                                              </div>
                                            ) : it.sno}
                                          </td>
                                          <td className="px-2 py-1 text-slate-700 border border-slate-200">
                                            {contractEditMode ? (
                                              <div className="flex items-center gap-1.5">
                                                <div className="relative flex-1 min-w-[140px]">
                                                  <input
                                                    value={it.name || ''}
                                                    onChange={(e) => {
                                                      updateDraftItem(si, ii, 'name', e.target.value);
                                                      setActiveSearchCell({ si, ii, query: e.target.value });
                                                    }}
                                                    onFocus={() => {
                                                      setActiveSearchCell({ si, ii, query: it.name || '' });
                                                    }}
                                                    onBlur={() => {
                                                      setTimeout(() => setActiveSearchCell({ si: -1, ii: -1, query: '' }), 250);
                                                    }}
                                                    placeholder="Ürün adı yazın (katalogdan aranır)..."
                                                    className="w-full h-7 px-1.5 border border-slate-200 rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                                  />
                                                  {activeSearchCell.si === si && activeSearchCell.ii === ii && (
                                                    (() => {
                                                      const queryLower = (activeSearchCell.query || '').toLocaleLowerCase('tr-TR').trim();
                                                      if (!queryLower) return null;
                                                      const suggestions = (products || []).filter(p => {
                                                        const pName = (p.name || '').toLocaleLowerCase('tr-TR');
                                                        const pBrand = (p.brand || '').toLocaleLowerCase('tr-TR');
                                                        return pName.includes(queryLower) || pBrand.includes(queryLower);
                                                      }).slice(0, 100);
                                                      if (suggestions.length === 0) return null;
                                                      return (
                                                        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-72 overflow-y-auto text-left">
                                                          {suggestions.map((p) => {
                                                            const listPrice = parseFloat(p.list_price) || 0;
                                                            let priceEur = 0;
                                                            if (p.currency === 'EUR') {
                                                              priceEur = listPrice;
                                                            } else if (p.currency === 'TRY') {
                                                              priceEur = listPrice / (parsed.kur || 35.0);
                                                            } else if (p.currency === 'USD') {
                                                              priceEur = listPrice * 0.92;
                                                            }
                                                            const finalPriceEur = parseFloat(priceEur.toFixed(2)) || 0;
                                                            return (
                                                              <button
                                                                key={p.id}
                                                                type="button"
                                                                onMouseDown={() => {
                                                                  setContractHistory(prev => [...prev, JSON.parse(JSON.stringify(contractDraft))]);
                                                                  setContractDraft(prev => {
                                                                    const d = JSON.parse(JSON.stringify(prev));
                                                                    const item = d.sections[si].items[ii];
                                                                    item.name = (p.name || '').toLocaleUpperCase('tr-TR');
                                                                    item.eurUnit = finalPriceEur;
                                                                    if (d.kur != null) {
                                                                      item.tlUnit = finalPriceEur * d.kur;
                                                                      item.total = (parseFloat(item.qty) || 1) * finalPriceEur * d.kur;
                                                                    }
                                                                    return recalcDraftTotals(d);
                                                                  });
                                                                  setContractDirty(true);
                                                                  toast.success(`${p.name} katalogdan eklendi.`);
                                                                }}
                                                                className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 border-b border-slate-100 last:border-none flex items-center justify-between gap-1"
                                                              >
                                                                <div className="font-medium truncate">{p.brand ? `[${p.brand}] ` : ''}{p.name}</div>
                                                                <div className="text-emerald-600 font-bold shrink-0">€{formatPrice(finalPriceEur)}</div>
                                                              </button>
                                                            );
                                                          })}
                                                        </div>
                                                      );
                                                    })()
                                                  )}
                                                </div>
                                                <button type="button" onClick={() => deleteDraftItem(si, ii)} className="text-red-400 hover:text-red-600 shrink-0" title="Kalemi sil"><Trash2 className="w-3.5 h-3.5" /></button>
                                              </div>
                                            ) : it.name}
                                          </td>
                                          <td className="px-2 py-1 text-center text-slate-500 tabular-nums border border-slate-200">
                                            {contractEditMode ? (
                                              <input type="number" step="1" min="0" value={it.qty ?? ''} onChange={(e) => updateDraftItem(si, ii, 'qty', e.target.value)} className="w-12 h-7 px-1 border border-slate-200 rounded text-[13px] text-center tabular-nums focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                                            ) : (it.qty && it.qty !== '0' ? it.qty : '')}
                                          </td>
                                          <td className="px-2 py-1 text-right text-slate-500 tabular-nums border border-slate-200">
                                            {contractEditMode ? (
                                              <input type="number" step="0.01" min="0" value={it.eurUnit ?? ''} onChange={(e) => updateDraftItem(si, ii, 'eurUnit', e.target.value === '' ? '' : parseFloat(e.target.value))} className="w-20 h-7 px-1 border border-slate-200 rounded text-[13px] text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                                            ) : (it.eurUnit != null ? `€ ${formatPrice(it.eurUnit)}` : '')}
                                          </td>
                                          <td className={`px-2 py-1 text-right tabular-nums border border-slate-200 ${simActive ? 'text-emerald-700' : 'text-slate-500'}`}>{it.tlUnit != null ? `₺ ${formatPrice(adj(it.tlUnit))}` : ''}</td>
                                          <td className={`px-2 py-1 text-right font-semibold tabular-nums border border-slate-200 ${simActive ? 'text-emerald-700' : 'text-[#1B3A5C]'}`}>{it.total != null ? `₺ ${formatPrice(adj(it.total))}` : ''}</td>
                                          </>)}
                                        </SortableItemRow>
                                      ))}
                                      </SortableContext>
                                      {/* Kalem Ekle Row (Düzenlemede) — sürüklenen kalem buraya bırakılırsa bölüm sonuna / boş bölüme eklenir */}
                                      {contractEditMode && (
                                        <SectionEndDrop id={`sec-end-${si}`}>
                                          <td colSpan={6} className="px-2 py-1 text-left border border-slate-200 bg-slate-50/20">
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="ghost"
                                              onClick={() => addDraftItem(si)}
                                              className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 h-7 text-xs px-2 font-bold"
                                            >
                                              <Plus className="w-3.5 h-3.5 mr-1" /> Kalem Ekle
                                            </Button>
                                          </td>
                                        </SectionEndDrop>
                                      )}
                                    </React.Fragment>
                                  );
                                })}
                              </tbody>
                            </table>
                            </DndContext>
                          </div>
                          {/* Yeni Bölüm Ekleme Seçeneği (Düzenlemede) */}
                          {contractEditMode && (
                            <div className="mt-3 flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const name = window.prompt("Yeni bölüm adı:");
                                  if (name) addDraftSection(name);
                                }}
                                className="border-slate-300 text-slate-700 hover:bg-slate-50 text-xs rounded-xl"
                              >
                                <Plus className="w-3.5 h-3.5 mr-1" /> Yeni Bölüm Ekle
                              </Button>
                            </div>
                          )}
                        </div>

                        {!isTpl && (<>
                        {/* Müşteri Seçimleri (Renk / Malzeme) — kalemlerden sonra, kur simülasyonundan önce */}
                        <div className="px-4 sm:px-8 pb-4 bg-[#FBFCFD]">
                          <div className="rounded-xl border border-slate-200 bg-white p-4">
                            <div className="font-bold text-slate-700 text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
                              <Tags className="w-3.5 h-3.5 text-emerald-600" /> Müşteri Seçimleri (Renk / Malzeme)
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {SPEC_LABELS.map((label) => (
                                <div key={label} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                                  <span className="text-[11px] font-bold text-slate-600 uppercase shrink-0 w-32">{label}</span>
                                  {contractEditMode ? (
                                    <input
                                      value={(contractDraft.specs && contractDraft.specs[label]) || ''}
                                      onChange={(e) => {
                                        setContractHistory(prev => [...prev, JSON.parse(JSON.stringify(contractDraft))]);
                                        setContractDraft(prev => { const d = JSON.parse(JSON.stringify(prev)); if (!d.specs) d.specs = {}; d.specs[label] = e.target.value.toLocaleUpperCase('tr-TR'); return d; });
                                        setContractDirty(true);
                                      }}
                                      placeholder="Elle yazın..."
                                      className="flex-1 h-8 px-2 border border-slate-200 rounded text-sm bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                    />
                                  ) : (
                                    <span className="flex-1 text-sm font-semibold text-slate-800 border-b border-dashed border-slate-300 min-h-[20px]">{(contractSpecs && contractSpecs[label]) || ' '}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Teslim Tarihi — müşteri seçimlerinden sonra */}
                        <div className="px-4 sm:px-8 pb-4 bg-[#FBFCFD]">
                          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2"><History className="w-4 h-4 text-emerald-600" /> Teslim Tarihi</span>
                            {contractEditMode ? (
                              <input type="date" value={parsed.deliveryDate || ''} onChange={(e) => mutateContractDraft((d) => { d.deliveryDate = e.target.value; })} className="h-8 px-2 border border-slate-200 rounded-lg text-sm bg-white" />
                            ) : (
                              <span className="font-bold text-slate-800 text-sm tabular-nums">{parsed.deliveryDate ? new Date(parsed.deliveryDate).toLocaleDateString('tr-TR') : '—'}</span>
                            )}
                          </div>
                        </div>
                        {/* Kur simülasyonu (fiyatların hemen üstünde) */}
                        {origKur != null && (
                          <div className="px-4 sm:px-8 pb-4 bg-[#FBFCFD]">
                            <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${simActive ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                              <div className="text-sm font-bold text-[#1B3A5C] flex items-center gap-2"><Calculator className="w-4 h-4" /> Kur Simülasyonu</div>
                              <div className="text-xs text-slate-500">Sözleşme orijinal kuru: <strong className="tabular-nums">1 € = ₺{formatExchangeRate(origKur)}</strong></div>
                              {currentKur != null && currentKur !== origKur && (
                                <div className="text-xs text-slate-500 border-l pl-3">Sözleşme güncel kuru: <strong className="tabular-nums">1 € = ₺{formatExchangeRate(currentKur)}</strong></div>
                              )}
                              {!contractEditMode && (
                                <div className="flex items-center gap-2 ml-auto flex-wrap">
                                  <span className="text-sm text-slate-500">1 € =</span>
                                  <input
                                    type="number" step="0.01" min="0"
                                    value={contractSimRate}
                                    onChange={(e) => setContractSimRate(e.target.value)}
                                    placeholder={String(currentKur)}
                                    className="w-24 h-9 px-2 border border-slate-300 rounded-md text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                  />
                                  <span className="text-sm text-slate-500">₺</span>
                                  <Button size="sm" variant="outline" onClick={() => setContractSimRate(String(exchangeRates.EUR || ''))}>
                                    Güncel kur{exchangeRates.EUR ? ` (₺${formatPrice(exchangeRates.EUR)})` : ''}
                                  </Button>
                                  {simActive && (
                                    <Button size="sm" onClick={saveSimulatedRate} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                                      Kuru Kaydet
                                    </Button>
                                  )}
                                  {currentKur !== origKur && (
                                    <Button size="sm" variant="outline" onClick={revertToOriginalRate} className="border-amber-300 text-amber-700 hover:bg-amber-50">
                                      Orijinal Kura Dön
                                    </Button>
                                  )}
                                  {simActive && <Button size="sm" variant="ghost" className="text-slate-500" onClick={() => setContractSimRate('')}>Sıfırla</Button>}
                                </div>
                              )}
                            </div>
                            {simActive && (
                              <div className="text-xs text-amber-700 mt-2 flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5" /> Tutarlar <strong>1 € = ₺{formatPrice(simRateNum)}</strong> üzerinden yeniden hesaplandı — yalnızca önizleme, <strong>kaydedilmez</strong>.
                              </div>
                            )}
                          </div>
                        )}

                        {/* İlaveler — Genel Toplam üstünde */}
                        {(contractEditMode || (parsed.addons || []).length > 0) && (
                          <div className="px-4 sm:px-8 pb-4 bg-[#FBFCFD]">
                            <div className="rounded-xl border border-slate-200 bg-white p-4">
                              <div className="flex items-center justify-between mb-3">
                                <div className="font-bold text-slate-700 text-xs uppercase tracking-wider flex items-center gap-2"><PlusCircle className="w-3.5 h-3.5 text-emerald-600" /> İlaveler</div>
                                {contractEditMode && (
                                  <Button type="button" size="sm" variant="outline" onClick={() => mutateContractDraft((d) => { if (!d.addons) d.addons = []; d.addons.push({ id: newId(), name: '', amount: '', currency: 'EUR', rate: d.kur, status: 'priced' }); })} className="h-8 text-xs font-bold border-emerald-200 text-emerald-700 hover:bg-emerald-50"><Plus className="w-3.5 h-3.5 mr-1" /> İlave Ekle</Button>
                                )}
                              </div>
                              {(parsed.addons || []).length === 0 ? (
                                <p className="text-xs text-slate-400 italic">İlave yok. Tutarsız (fiyat belirlenecek) ilaveler de eklenebilir.</p>
                              ) : (
                                <div className="space-y-1.5">
                                  {(parsed.addons || []).map((a, ai) => {
                                    const curSym = a.currency === 'TRY' ? '₺' : a.currency === 'USD' ? '$' : '€';
                                    const hasAmt = !(a.amount == null || a.amount === '');
                                    if (!contractEditMode) {
                                      return (
                                        <div key={a.id || ai} className="flex items-center justify-between gap-2 text-sm border-b border-slate-100 last:border-0 py-1">
                                          <span className="text-slate-700">{a.name || '—'}{!hasAmt ? <span className="text-amber-600 text-xs italic ml-1">(fiyat belirlenecek)</span> : ''}</span>
                                          <span className="font-semibold text-slate-800 tabular-nums shrink-0">{hasAmt ? `${curSym} ${formatPrice(a.amount)}` : '—'}</span>
                                        </div>
                                      );
                                    }
                                    return (
                                      <div key={a.id || ai} className="flex items-center gap-1.5 flex-wrap">
                                        <div className="relative flex-1 min-w-[150px]">
                                          <input
                                            value={a.name || ''}
                                            onChange={(e) => { mutateContractDraft((d) => { d.addons[ai].name = e.target.value.toLocaleUpperCase('tr-TR'); }); setAddonSearch({ idx: ai, query: e.target.value }); }}
                                            onFocus={() => setAddonSearch({ idx: ai, query: a.name || '' })}
                                            onBlur={() => setTimeout(() => setAddonSearch({ idx: -1, query: '' }), 200)}
                                            placeholder="İlave adı (katalogdan ara veya yaz)"
                                            className="w-full h-8 px-2 border border-slate-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                          />
                                          {addonSearch.idx === ai && (() => {
                                            const q = (addonSearch.query || '').toLocaleLowerCase('tr-TR').trim();
                                            if (!q) return null;
                                            const sug = (products || []).filter((p) => ((p.name || '').toLocaleLowerCase('tr-TR').includes(q) || (p.brand || '').toLocaleLowerCase('tr-TR').includes(q))).slice(0, 50);
                                            if (sug.length === 0) return null;
                                            return (
                                              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto text-left">
                                                {sug.map((p) => {
                                                  const tl = parseFloat(p.list_price_try) || 0;
                                                  return (
                                                    <button key={p.id} type="button" onMouseDown={() => { mutateContractDraft((d) => { d.addons[ai].name = (p.name || '').toLocaleUpperCase('tr-TR'); d.addons[ai].amount = Math.round(tl); d.addons[ai].currency = 'TRY'; d.addons[ai].rate = d.kur; d.addons[ai].status = 'priced'; }); setAddonSearch({ idx: -1, query: '' }); }} className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 border-b border-slate-100 last:border-none flex items-center justify-between gap-1">
                                                      <span className="font-medium truncate">{p.brand ? `[${p.brand}] ` : ''}{p.name}</span>
                                                      <span className="text-emerald-600 font-bold shrink-0">₺{formatPrice(tl)}</span>
                                                    </button>
                                                  );
                                                })}
                                              </div>
                                            );
                                          })()}
                                        </div>
                                        <input type="number" step="0.01" min="0" value={a.amount ?? ''} onChange={(e) => mutateContractDraft((d) => { d.addons[ai].amount = e.target.value; })} placeholder="boş=fiyatsız" className="w-24 h-8 px-1 border border-slate-200 rounded text-sm text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                                        <select value={a.currency || 'EUR'} onChange={(e) => mutateContractDraft((d) => { d.addons[ai].currency = e.target.value; })} className="h-8 px-1 border border-slate-200 rounded text-sm bg-white">
                                          <option value="EUR">€</option>
                                          <option value="TRY">₺</option>
                                          <option value="USD">$</option>
                                        </select>
                                        <button type="button" onClick={() => mutateContractDraft((d) => { d.addons.splice(ai, 1); })} className="text-rose-400 hover:text-rose-600 shrink-0"><Trash2 className="w-4 h-4" /></button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Genel toplam — sözleşme + ilave ayrıntılı */}
                        {parsed.grandTotal != null && (
                          <div className="px-4 sm:px-8 pb-7 bg-[#FBFCFD]">
                            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1B3A5C] to-[#15293f] text-white px-6 py-5 shadow-lg">
                              <div className="relative">
                                {/* Alt toplamlar — sessiz, hizalı satırlar */}
                                <div className="space-y-2.5">
                                  <div className="flex items-baseline justify-between gap-4">
                                    <span className="text-white/65 text-sm flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-sky-400/80" />Sözleşme Toplamı</span>
                                    <span className="text-right whitespace-nowrap">
                                      <span className="text-white font-semibold tabular-nums">₺ {formatPrice(adj(parsed.grandTotal))}</span>
                                      {parsed.eurTotal != null && <span className="text-white/45 text-xs ml-2 tabular-nums">≈ € {formatPrice(parsed.eurTotal)}</span>}
                                    </span>
                                  </div>
                                  {fin.addonsEUR !== 0 && (
                                    <div className="flex items-baseline justify-between gap-4">
                                      <span className="text-white/65 text-sm flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-amber-400/80" />İlaveler Toplamı</span>
                                      <span className="text-right whitespace-nowrap">
                                        <span className="text-white font-semibold tabular-nums">₺ {formatPrice(adj(fin.addonsEUR * (currentKur || 1)))}</span>
                                        <span className="text-white/45 text-xs ml-2 tabular-nums">≈ € {formatPrice(fin.addonsEUR)}</span>
                                      </span>
                                    </div>
                                  )}
                                </div>
                                {/* Ayırıcı */}
                                <div className="h-px bg-white/15 my-4" />
                                {/* Genel Toplam — kahraman satır */}
                                <div className="flex items-end justify-between gap-4 flex-wrap">
                                  <div>
                                    <div className="text-emerald-300 text-[11px] uppercase tracking-[0.18em] font-bold">Genel Toplam</div>
                                    <div className="text-white/40 text-[11px] mt-1">KDV Hariç{simActive ? ` · 1 € = ₺${formatPrice(simRateNum)}` : ''}</div>
                                  </div>
                                  <div className="text-right">
                                    <div className={`text-3xl sm:text-4xl font-bold tabular-nums ${simActive ? 'text-emerald-300' : 'text-white'}`}>₺ {formatPrice(adj(parsed.grandTotal + (fin.addonsEUR * (currentKur || 1))))}</div>
                                    {parsed.eurTotal != null && <div className="text-emerald-300/85 text-sm font-semibold tabular-nums mt-0.5">≈ € {formatPrice(parsed.eurTotal + fin.addonsEUR)}</div>}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* ===== Finansal: Teslim / İlaveler / Ödeme Planı / Tahsilatlar / Kalan ===== */}
                        <div className="px-4 sm:px-8 pb-6 bg-[#FBFCFD] space-y-5">
                          {/* Özet / Kalan */}
                          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1B3A5C] to-[#15293f] text-white px-5 py-5 shadow-lg space-y-4">
                            {isAgreed && (contractEditMode || (parsed.collections || []).length > 0) && (
                              <div>
                                <div className="flex items-center justify-between mb-3 pb-3 border-b border-white/15">
                                  <div className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-2"><DollarSign className="w-3.5 h-3.5 text-emerald-300" /> Tahsilatlar <span className="text-white/45 font-semibold normal-case">· {(parsed.collections || []).length} ödeme</span></div>
                                  {contractEditMode && (
                                    <Button type="button" size="sm" variant="outline" onClick={() => mutateContractDraft((d) => { if (!d.collections) d.collections = []; d.collections.push({ id: newId(), date: '', description: '', amount: '', currency: 'EUR', rate: d.kur }); })} className="h-8 text-xs font-bold border-emerald-400/40 text-emerald-200 bg-white/5 hover:bg-white/10"><Plus className="w-3.5 h-3.5 mr-1" /> Satır</Button>
                                  )}
                                </div>
                                {(parsed.collections || []).length === 0 ? (
                                  <p className="text-xs text-white/40 italic">Tahsilat yok.</p>
                                ) : (
                                  <div className="space-y-0.5">
                                    {!contractEditMode && (
                                      <div className="flex items-center gap-3 pb-1.5 mb-0.5 border-b border-white/10 text-[10px] uppercase tracking-wider text-white/35">
                                        <span className="w-20 shrink-0">Tarih</span>
                                        <span className="flex-1">Açıklama</span>
                                        <span className="shrink-0">Miktar</span>
                                      </div>
                                    )}
                                    {(parsed.collections || []).map((c, ci) => {
                                      if (!contractEditMode) {
                                        return (
                                          <div key={c.id || ci} className="flex items-center gap-3 py-1">
                                            <span className="w-20 shrink-0 text-white/45 text-xs tabular-nums">{c.date ? new Date(c.date).toLocaleDateString('tr-TR') : '—'}</span>
                                            <span className="flex-1 min-w-0 truncate text-white/70 text-sm">{c.description || 'Ödeme'}{c.currency === 'TRY' && (c.rate || fin.cr) ? <span className="text-white/35"> · kur {c.rate || fin.cr}</span> : ''}</span>
                                            <span className="shrink-0 tabular-nums font-semibold text-sm text-white">{c.currency === 'TRY' ? `₺ ${formatPrice(c.amount)}` : `€ ${formatPrice(c.amount)}`}</span>
                                          </div>
                                        );
                                      }
                                      return (
                                        <div key={c.id || ci} className="grid items-center gap-1.5" style={{ gridTemplateColumns: 'auto minmax(110px, 1fr) 88px 44px 70px 28px' }}>
                                          <input type="date" value={c.date || ''} onChange={(e) => mutateContractDraft((d) => { d.collections[ci].date = e.target.value; })} className="h-8 px-1 rounded bg-white/10 border border-white/20 text-white text-xs [color-scheme:dark]" />
                                          <input value={c.description || ''} onChange={(e) => mutateContractDraft((d) => { d.collections[ci].description = e.target.value.toLocaleUpperCase('tr-TR'); })} placeholder="açıklama" className="h-8 px-2 rounded bg-white/10 border border-white/20 text-white placeholder:text-white/40 text-sm min-w-0" />
                                          <input type="number" value={c.amount ?? ''} onChange={(e) => mutateContractDraft((d) => { d.collections[ci].amount = e.target.value; })} placeholder="tutar" className="h-8 px-1 rounded bg-white/10 border border-white/20 text-white placeholder:text-white/40 text-sm text-right tabular-nums" />
                                          <select value={c.currency || 'EUR'} onChange={(e) => mutateContractDraft((d) => { d.collections[ci].currency = e.target.value; })} className="h-8 px-1 rounded bg-white/10 border border-white/20 text-white text-sm"><option value="EUR" className="bg-[#1B3A5C]">€</option><option value="TRY" className="bg-[#1B3A5C]">₺</option></select>
                                          <input type="number" step="0.01" value={c.currency === 'TRY' ? (c.rate ?? '') : ''} onChange={(e) => mutateContractDraft((d) => { d.collections[ci].rate = e.target.value; })} placeholder="kur" title="Ödeme günü kuru" disabled={c.currency !== 'TRY'} className={`h-8 px-1 rounded bg-white/10 border border-white/20 text-white placeholder:text-white/40 text-sm text-right tabular-nums ${c.currency !== 'TRY' ? 'invisible' : ''}`} />
                                          <button type="button" onClick={() => mutateContractDraft((d) => { d.collections.splice(ci, 1); })} className="text-rose-300 hover:text-rose-100 shrink-0"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                                <div className="h-px bg-white/15 mt-4" />
                              </div>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between items-center text-white/65 py-0.5">
                                  <span>Sözleşme</span>
                                  <span className="tabular-nums font-semibold text-white">€ {formatPrice(fin.productsEUR)}</span>
                                </div>
                                {fin.addonsEUR !== 0 && (
                                  <div className="flex justify-between items-center text-white/65 py-0.5">
                                    <span>İlaveler</span>
                                    <span className="tabular-nums font-semibold text-white">€ {formatPrice(fin.addonsEUR)}</span>
                                  </div>
                                )}
                                {contractEditMode ? (
                                  <div className="flex justify-between items-center text-white/65 py-0.5">
                                    <span>Fatura Farkı</span>
                                    <span className="flex items-center gap-1.5">
                                      <input
                                        type="number"
                                        min="0"
                                        value={(parsed.invoiceDiff && parsed.invoiceDiff.amount) ?? ''}
                                        onChange={(e) => mutateContractDraft((d) => {
                                          if (!d.invoiceDiff) d.invoiceDiff = { currency: 'EUR', rate: d.kur };
                                          let val = e.target.value;
                                          if (val !== '') {
                                            const num = parseFloat(val);
                                            if (!isNaN(num) && num < 0) {
                                              val = Math.abs(num).toString();
                                            }
                                            val = val.replace(/-/g, '');
                                          }
                                          d.invoiceDiff.amount = val;
                                        })}
                                        onKeyDown={(e) => {
                                          if (e.key === '-' || e.key === 'e' || e.key === 'E') {
                                            e.preventDefault();
                                          }
                                        }}
                                        placeholder="0"
                                        className="w-20 h-7 px-1.5 rounded-lg bg-white/10 border border-white/20 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400 text-white text-right tabular-nums text-xs transition-colors"
                                      />
                                      <select
                                        value={(parsed.invoiceDiff && parsed.invoiceDiff.currency) || 'EUR'}
                                        onChange={(e) => mutateContractDraft((d) => {
                                          if (!d.invoiceDiff) d.invoiceDiff = { amount: '', rate: d.kur };
                                          d.invoiceDiff.currency = e.target.value;
                                        })}
                                        className="h-7 px-1 rounded-lg bg-white/10 border border-white/20 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400 text-white text-xs cursor-pointer transition-colors"
                                      >
                                        <option value="EUR" className="bg-[#1B3A5C] text-white">€</option>
                                        <option value="TRY" className="bg-[#1B3A5C] text-white">₺</option>
                                      </select>
                                    </span>
                                  </div>
                                ) : (
                                  fin.invEUR !== 0 && (
                                    <div className="flex justify-between items-center text-white/65 py-0.5">
                                      <span>Fatura Farkı</span>
                                      <span className="tabular-nums font-semibold text-white">€ {formatPrice(fin.invEUR)}</span>
                                    </div>
                                  )
                                )}
                                <div className="border-t border-white/15 my-1"></div>
                                <div className="flex justify-between items-center font-bold text-base text-white py-0.5">
                                  <span>Genel Toplam</span>
                                  <span className="tabular-nums text-emerald-300 font-extrabold">€ {formatPrice(fin.grandEUR)}</span>
                                </div>
                              </div>
                              {isAgreed && (
                              <div className="flex flex-col justify-center sm:items-end">
                                <div className="text-sm font-medium mb-2"><span className="text-white/55">Tahsil Edilen </span><span className="tabular-nums font-bold text-emerald-300">€ {formatPrice(fin.collectedEUR)}</span></div>
                                <div className="text-[11px] uppercase tracking-[0.2em] text-emerald-300 font-bold">Kalan Tutar</div>
                                <div className="text-4xl font-black tabular-nums text-white mt-0.5">€ {formatPrice(fin.remainingEUR)}</div>
                                <div className="text-white/55 text-xs tabular-nums mt-1">≈ ₺ {formatPrice(fin.remainingEUR * (fin.cr || 0))} <span className="text-white/35">(söz. kuru {fin.cr || '—'})</span></div>
                                <div className="text-white/55 text-xs tabular-nums">≈ ₺ {formatPrice(fin.remainingEUR * (liveRate || 0))} <span className="text-white/35">(güncel {liveRate ? formatPrice(liveRate) : '—'})</span></div>
                                {(() => {
                                  const st = fin.grandEUR <= 0 ? null : (fin.remainingEUR <= 0.01 ? { t: 'TAMAMLANDI', c: 'bg-emerald-500' } : (fin.collectedEUR > 0.01 ? { t: `ÖDEME %${fin.pct}`, c: 'bg-amber-500' } : { t: 'ÖDENMEDİ', c: 'bg-rose-500' }));
                                  const over = fin.remainingEUR < -0.01;
                                  return (<div className="mt-3 flex items-center gap-2">{over ? <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-violet-500 text-white">FAZLA ÖDEME</span> : (st && <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full text-white ${st.c}`}>{st.t}</span>)}</div>);
                                })()}
                                {fin.grandEUR > 0 && (<div className="w-full sm:w-44 h-2 bg-white/15 rounded-full mt-2 overflow-hidden"><div className="h-full bg-emerald-400 rounded-full" style={{ width: `${fin.pct}%` }} /></div>)}
                              </div>
                              )}
                            </div>
                          </div>
                        </div>
                        </>)}

                        {/* Notlar + imza */}
                        <div className="px-4 sm:px-8 pb-8 bg-[#FBFCFD] space-y-6">
                          {contractEditMode ? (
                            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 space-y-3">
                              <div className="font-bold text-amber-800 text-xs uppercase tracking-wider flex items-center gap-2">
                                <StickyNote className="w-3.5 h-3.5" /> Notlar & Şartları Düzenle
                              </div>
                              <div className="space-y-2">
                                {(parsed.notes || []).map((n, ni) => (
                                  <div key={ni} className="flex items-center gap-2">
                                    <span className="text-amber-400 font-bold">•</span>
                                    <input
                                      value={n || ''}
                                      onChange={(e) => {
                                        setContractHistory(prev => [...prev, JSON.parse(JSON.stringify(contractDraft))]);
                                        setContractDraft(prev => {
                                          const d = JSON.parse(JSON.stringify(prev));
                                          d.notes[ni] = e.target.value.toLocaleUpperCase('tr-TR');
                                          return d;
                                        });
                                        setContractDirty(true);
                                      }}
                                      className="flex-1 h-8 px-2 border border-amber-200 rounded text-sm bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setContractHistory(prev => [...prev, JSON.parse(JSON.stringify(contractDraft))]);
                                        setContractDraft(prev => {
                                          const d = JSON.parse(JSON.stringify(prev));
                                          d.notes.splice(ni, 1);
                                          return d;
                                        });
                                        setContractDirty(true);
                                      }}
                                      className="text-red-400 hover:text-red-600 shrink-0"
                                      title="Satırı Sil"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                ))}
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setContractHistory(prev => [...prev, JSON.parse(JSON.stringify(contractDraft))]);
                                    setContractDraft(prev => {
                                      const d = JSON.parse(JSON.stringify(prev));
                                      if (!Array.isArray(d.notes)) d.notes = [];
                                      d.notes.push('');
                                      return d;
                                    });
                                    setContractDirty(true);
                                  }}
                                  className="border-amber-300 text-amber-800 hover:bg-amber-100/50 text-xs font-bold"
                                >
                                  + Yeni Not Satırı Ekle
                                </Button>
                              </div>
                              <div className="pt-2 border-t border-amber-200/50">
                                <label className="block text-xs font-semibold text-amber-800 mb-1">Genel Sözleşme Notu (Serbest Metin)</label>
                                <textarea
                                  value={contractDraft.generalNotes !== undefined ? contractDraft.generalNotes : viewingContract.notes || ''}
                                  onChange={(e) => {
                                    setContractHistory(prev => [...prev, JSON.parse(JSON.stringify(contractDraft))]);
                                    setContractDraft(prev => {
                                      const d = JSON.parse(JSON.stringify(prev));
                                      d.generalNotes = e.target.value.toLocaleUpperCase('tr-TR');
                                      return d;
                                    });
                                    setContractDirty(true);
                                  }}
                                  rows={3}
                                  className="w-full p-2 border border-amber-200 rounded text-sm bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                                  placeholder="Sözleşme altına eklenecek genel açıklamalar..."
                                />
                              </div>
                            </div>
                          ) : (
                            (contractDisplayNotes.filter((n) => n && String(n).trim()).length > 0 || viewingContract.notes) && (
                              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                                <div className="font-bold text-amber-800 text-xs uppercase tracking-wider mb-2 flex items-center gap-2"><StickyNote className="w-3.5 h-3.5" /> Notlar & Şartlar</div>
                                <ul className="space-y-1 text-sm text-amber-900/90">
                                  {contractDisplayNotes.filter((n) => n && String(n).trim()).map((n, ni) => (<li key={ni} className="flex gap-2"><span className="text-amber-400 shrink-0">•</span><span>{n}</span></li>))}
                                </ul>
                                {viewingContract.notes && <div className="mt-2 pt-2 border-t border-amber-200/70 text-sm text-amber-900/90 whitespace-pre-wrap">{viewingContract.notes}</div>}
                              </div>
                            )
                          )}
                          <div className="grid grid-cols-2 gap-8 pt-8">
                            <div className="text-center">
                              <div className="border-t-2 border-slate-300 pt-2 text-sm font-semibold text-slate-700">MSZ KARAVAN</div>
                              <div className="text-xs text-slate-400">Yetkili İmza</div>
                            </div>
                            <div className="text-center">
                              <div className="border-t-2 border-slate-300 pt-2 text-sm font-semibold text-slate-700">{viewingContract.customer_name || 'Müşteri'}</div>
                              <div className="text-xs text-slate-400">Müşteri İmza</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* ===== HAM TABLO GÖRÜNÜMÜ ===== */
                      <>
                        <h2 className="text-xl font-black text-slate-800">{viewingContract.title}</h2>
                        {(viewingContract.sheets || []).map((sheet, si) => (
                          <div key={si} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            {viewingContract.sheets.length > 1 && (
                              <div className="px-4 py-2 bg-slate-50 border-b text-sm font-semibold text-slate-600">{sheet.name}</div>
                            )}
                            <div className="overflow-x-auto">
                              <table className="text-sm border-collapse w-full">
                                <tbody>
                                  {(sheet.rows || []).map((row, ri) => (
                                    <tr key={ri} className={ri % 2 ? 'bg-slate-50/40' : ''}>
                                      {row.map((cell, ci) => (
                                        <td key={ci} className="border border-slate-100 px-3 py-1.5 whitespace-pre-wrap align-top text-slate-700">{cell}</td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                        {viewingContract.notes && (
                          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                            <div className="font-semibold text-amber-800 mb-1 flex items-center gap-2"><StickyNote className="w-4 h-4" /> Notlar</div>
                            <div className="text-sm text-amber-900 whitespace-pre-wrap">{viewingContract.notes}</div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })()
            )}
          </TabsContent>

          {/* Sözleşme yükleme dialog */}
          <Dialog open={contractUploadOpen} onOpenChange={setContractUploadOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Sözleşme Yükle</DialogTitle>
                <DialogDescription>Excel sözleşme dosyasını yükleyin; sistemde saklanır ve uzaktan görüntülenir</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label>Müşteri (opsiyonel)</Label>
                  <Input value={contractForm.customer_name} onChange={(e) => setContractForm({ ...contractForm, customer_name: e.target.value })} placeholder="Müşteri adı" />
                </div>
                <div>
                  <Label>Araç Türü</Label>
                  {(() => {
                    const VEHICLE_TYPES = ['15M³ PSA', '17M³ PSA', 'MERCEDES', 'IVECO', 'VOLKSWAGEN', 'MAN', 'FORD', 'SEMİ ENTEGRE', 'OTOBÜS', 'ÇEKME KARAVAN'];
                    const selected = contractForm.title || '';
                    const choose = (v) => setContractForm({ ...contractForm, title: selected === v ? '' : v });
                    return (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {VEHICLE_TYPES.map((v) => {
                          const on = selected === v;
                          return (
                            <button
                              key={v}
                              type="button"
                              onClick={() => choose(v)}
                              className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors cursor-pointer ${on ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                            >
                              {v}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
                <div>
                  <Label>Excel Dosyası (.xlsx / .xls)</Label>
                  <input
                    id="contract-file-input"
                    type="file"
                    accept=".xlsx,.xls,.xlsm"
                    className="sr-only"
                    onChange={(e) => setContractFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
                  />
                  <label
                    htmlFor="contract-file-input"
                    onDragOver={(e) => { e.preventDefault(); setContractDragOver(true); }}
                    onDragEnter={(e) => { e.preventDefault(); setContractDragOver(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setContractDragOver(false); }}
                    onDrop={(e) => {
                      e.preventDefault(); setContractDragOver(false);
                      const f = e.dataTransfer.files && e.dataTransfer.files[0];
                      if (!f) return;
                      if (!/\.(xlsx|xls|xlsm)$/i.test(f.name)) { toast.error('Lütfen .xlsx / .xls dosyası bırakın'); return; }
                      setContractFile(f);
                    }}
                    className={`mt-1 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-7 text-center cursor-pointer transition-colors ${contractDragOver ? 'border-emerald-500 bg-emerald-50' : contractFile ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}
                  >
                    <Upload className={`w-7 h-7 ${contractDragOver || contractFile ? 'text-emerald-600' : 'text-slate-400'}`} />
                    {contractFile ? (
                      <span className="text-sm font-medium text-emerald-700 break-all">{contractFile.name}</span>
                    ) : (
                      <>
                        <span className="text-sm font-medium text-slate-600">Dosyayı buraya sürükleyip bırakın</span>
                        <span className="text-xs text-slate-400">veya tıklayıp seçin (.xlsx / .xls)</span>
                      </>
                    )}
                  </label>
                </div>
                <div>
                  <Label>Not (opsiyonel)</Label>
                  <textarea
                    value={contractForm.notes}
                    onChange={(e) => setContractForm({ ...contractForm, notes: e.target.value })}
                    rows={3}
                    placeholder="Sözleşmeyle ilgili notlar ..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setContractUploadOpen(false)} disabled={contractUploading}>İptal</Button>
                <Button onClick={uploadContract} disabled={contractUploading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {contractUploading ? 'Yükleniyor...' : 'Yükle'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Sözleşme düzenleme dialog (başlık/müşteri/not) */}
          <Dialog open={contractEditOpen} onOpenChange={setContractEditOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Sözleşmeyi Düzenle</DialogTitle>
                <DialogDescription>Başlık, müşteri ve not bilgilerini güncelleyin (Excel içeriği değişmez)</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label>Başlık</Label>
                  <Input value={contractEditForm.title} onChange={(e) => setContractEditForm({ ...contractEditForm, title: e.target.value })} />
                </div>
                <div>
                  <Label>Müşteri</Label>
                  <Input value={contractEditForm.customer_name} onChange={(e) => setContractEditForm({ ...contractEditForm, customer_name: e.target.value })} placeholder="Müşteri adı" />
                </div>
                <div>
                  <Label>Not</Label>
                  <textarea
                    value={contractEditForm.notes}
                    onChange={(e) => setContractEditForm({ ...contractEditForm, notes: e.target.value })}
                    rows={3}
                    placeholder="Sözleşmeyle ilgili notlar ..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setContractEditOpen(false)} disabled={contractEditSaving}>İptal</Button>
                <Button onClick={saveEditContract} disabled={contractEditSaving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {contractEditSaving ? 'Kaydediliyor...' : 'Kaydet'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Sıfırdan Sözleşme Yap Dialog */}
          <Dialog open={newContractDialogOpen} onOpenChange={setNewContractDialogOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Sıfırdan Sözleşme Yap</DialogTitle>
                <DialogDescription>
                  KARAVAN GENEL FİYATLANDIRMA kataloğundaki ürünler otomatik yüklenir; açılan sözleşmede kalemleri ekleyip çıkarabilir, adet ve fiyatları düzenleyebilirsiniz.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label>Müşteri Adı</Label>
                  <Input
                    value={newContractForm.customer_name}
                    onChange={(e) => setNewContractForm({ ...newContractForm, customer_name: e.target.value })}
                    placeholder="Müşteri adı ve soyadı"
                  />
                </div>
                <div>
                  <Label>Araç Türü *</Label>
                  {(() => {
                    const VEHICLE_TYPES = ['15M³ PSA', '17M³ PSA', 'MERCEDES', 'IVECO', 'VOLKSWAGEN', 'MAN', 'FORD', 'SEMİ ENTEGRE', 'OTOBÜS', 'ÇEKME KARAVAN'];
                    const selected = newContractForm.title || '';
                    const choose = (v) => setNewContractForm({ ...newContractForm, title: selected === v ? '' : v });
                    return (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {VEHICLE_TYPES.map((v) => {
                          const on = selected === v;
                          return (
                            <button
                              key={v}
                              type="button"
                              onClick={() => choose(v)}
                              className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors cursor-pointer ${on ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                            >
                              {v}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
                <div>
                  <Label>Sözleşme Euro Kuru (₺) *</Label>
                  <Input 
                    type="number"
                    step="0.01"
                    value={newContractForm.kur}
                    onChange={(e) => setNewContractForm({ ...newContractForm, kur: e.target.value })}
                    placeholder="35.00"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">Güncel kur otomatik geldi — gerekirse manuel düzeltebilirsiniz.</p>
                </div>
                <div>
                  <Label>Not (Opsiyonel)</Label>
                  <textarea
                    value={newContractForm.notes}
                    onChange={(e) => setNewContractForm({ ...newContractForm, notes: e.target.value })}
                    rows={3}
                    placeholder="Sözleşmeyle ilgili genel notlar ..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setNewContractDialogOpen(false)} disabled={newContractCreating}>İptal</Button>
                <Button onClick={createNewContract} disabled={newContractCreating} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                  {newContractCreating ? 'Oluşturuluyor...' : 'Oluştur ve Düzenle'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Upload Tab */}
          {/* Packages Tab (artık menüde yok — Sözleşmeler ile değiştirildi; kod ölü) */}
          <TabsContent value="packages" className="space-y-6">
            {!selectedPackageForEdit ? (
              <>
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-800">Paket Yönetimi</h2>
                    <p className="text-slate-600 mt-1">Hazır paketler oluşturun ve yönetin</p>
                  </div>
                  <Button onClick={() => setShowPackageDialog(true)} className="bg-teal-600 hover:bg-teal-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Yeni Paket
                  </Button>
                </div>

            {/* Package Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {packages.map((pkg) => (
                <Card key={pkg.id} className={`${pkg.is_pinned ? 'border-yellow-300 bg-yellow-50/30' : 'border-teal-200'} hover:shadow-lg transition-shadow relative`}>
                  {pkg.is_pinned && (
                    <div className="absolute top-2 left-2">
                      <div className="flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                        <Pin className="w-3 h-3" />
                        <span>Sabitli</span>
                      </div>
                    </div>
                  )}
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <CardTitle className={`text-lg ${pkg.is_pinned ? 'text-teal-900 mt-6' : 'text-teal-800'}`}>{pkg.name}</CardTitle>
                        {pkg.description && (
                          <CardDescription className="mt-1">{pkg.description}</CardDescription>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => togglePackagePin(pkg.id)}
                          className={`p-2 ${pkg.is_pinned ? 'text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50 bg-yellow-50' : 'text-gray-600 hover:text-gray-700 hover:bg-gray-50'}`}
                          title={pkg.is_pinned ? "Sabitlemeyi Kaldır" : "Başa Sabitle"}
                        >
                          <Pin className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEditPackage(pkg)}
                          className="p-2"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startCopyPackage(pkg)}
                          className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          title="Paketi Kopyala"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deletePackage(pkg.id)}
                          className="p-2 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {pkg.image_url && (
                      <img 
                        src={pkg.image_url} 
                        alt={pkg.name}
                        className="w-full h-32 object-cover rounded-lg mb-3"
                        onError={(e) => {e.target.style.display = 'none'}}
                      />
                    )}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600">Satış Fiyatı:</span>
                        <span className="font-bold text-teal-600">₺ {formatPrice(pkg.sale_price)}</span>
                      </div>
          {/* Package Edit Page - Moved to conditional rendering within packages tab */}
                      <div className="flex gap-2 mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEditPackage(pkg)}
                          className="flex-1"
                        >
                          <Package className="w-4 h-4 mr-1" />
                          Ürün Ekle
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {packages.length === 0 && (
                <div className="col-span-full text-center py-12">
                  <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-800 mb-2">Henüz paket yok</h3>
                  <p className="text-slate-600 mb-4">İlk paketinizi oluşturmak için "Yeni Paket" butonuna tıklayın</p>
                  <Button onClick={() => setShowPackageDialog(true)} className="bg-teal-600 hover:bg-teal-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Yeni Paket Oluştur
                  </Button>
                </div>
              )}
            </div>
              </>
            ) : (
              /* Package Edit Page */
              <>
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-800">Paket Düzenle: {selectedPackageForEdit.name}</h2>
                    <p className="text-slate-600 mt-1">Paket bilgilerini düzenleyin ve ürünleri yönetin</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setSelectedPackageForEdit(null)}
                    >
                      <X className="w-4 h-4 mr-2" />
                      Geri Dön
                    </Button>
                    <Button
                      onClick={updatePackage}
                      className="bg-teal-600 hover:bg-teal-700"
                      disabled={!packageForm.name}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Değişiklikleri Kaydet
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => downloadPackagePDF(selectedPackageForEdit.id, false)}
                      disabled={!packageWithProducts || packageWithProducts.products.length === 0}
                      className="border-blue-200 text-blue-700 hover:bg-blue-50"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      PDF (Satış Fiyatlı)
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => downloadPackagePDF(selectedPackageForEdit.id, true)}
                      disabled={!packageWithProducts || packageWithProducts.products.length === 0}
                      className="border-green-200 text-green-700 hover:bg-green-50"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      PDF (Ürün Fiyatlı)
                    </Button>
                  </div>
                </div>

                {/* Compact Package Information */}
                <Card className="mb-4 bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200">
                  <CardContent className="py-3 px-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                      <div>
                        <Label htmlFor="edit-package-name" className="text-xs">Paket Adı</Label>
                        <Input
                          id="edit-package-name"
                          value={packageForm.name}
                          onChange={(e) => setPackageForm({...packageForm, name: e.target.value})}
                          placeholder="Paket adı"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-package-price" className="text-xs">Satış Fiyatı (₺)</Label>
                        <Input
                          id="edit-package-price"
                          type="number"
                          step="0.01"
                          value={packageForm.sale_price}
                          onChange={(e) => setPackageForm({...packageForm, sale_price: e.target.value})}
                          placeholder="0.00"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-package-image" className="text-xs">Görsel URL</Label>
                        <Input
                          id="edit-package-image"
                          value={packageForm.image_url}
                          onChange={(e) => setPackageForm({...packageForm, image_url: e.target.value})}
                          placeholder="https://example.com/image.jpg"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-package-notes" className="text-xs">Notlar</Label>
                        <Input
                          id="edit-package-notes"
                          value={packageForm.notes || ''}
                          onChange={(e) => setPackageForm({...packageForm, notes: e.target.value})}
                          placeholder="Kısa açıklama..."
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Main Layout: Package Products and Add Products */}
                <div className="grid grid-cols-2 gap-8 mb-6">
                  {/* Sol Taraf - Paket Ürünleri */}
                  <Card className="bg-white border-slate-200 shadow-sm">
                    <CardHeader className="bg-slate-50 border-b border-slate-200 py-3 px-4">
                      <div>
                        <CardTitle className="text-lg text-slate-700 flex items-center gap-2">
                          <div className="w-6 h-6 bg-slate-400 text-white rounded-full flex items-center justify-center text-sm">
                            📦
                          </div>
                          Paket Ürünleri
                        </CardTitle>
                        <CardDescription className="text-slate-500 text-sm">
                          {packageWithProducts ? 
                            `${packageWithProducts.products.length} ürün seçili` : 
                            'Ürünler yükleniyor...'
                          }
                        </CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {loadingPackageProducts ? (
                        <div className="text-center py-8">
                          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-teal-600" />
                          <p className="text-slate-600">Ürünler yükleniyor...</p>
                        </div>
                      ) : packageWithProducts ? (
                        <div className="space-y-3">
                          {packageWithProducts.products.length > 0 && (
                            <div className="mb-4">
                              <h4 className="font-medium text-slate-800 mb-3 flex items-center gap-2">
                                <Package className="w-4 h-4" />
                                Mevcut Ürünler ({packageWithProducts.products.length})
                              </h4>
                              <div className="space-y-4">
                                {Object.entries(getPackageProductsByGroups())
                                  .sort(([keyA, groupA], [keyB, groupB]) => {
                                    // Sort by sort_order first, then by name
                                    if (groupA.sort_order !== groupB.sort_order) {
                                      return groupA.sort_order - groupB.sort_order;
                                    }
                                    return groupA.name.localeCompare(groupB.name);
                                  })
                                  .map(([groupKey, groupData]) => (
                                  <div key={groupKey} className="space-y-2">
                                    {/* Group/Category Header */}
                                    <div 
                                      className="flex items-center gap-2 p-2 rounded-lg font-medium text-sm"
                                      style={{
                                        backgroundColor: `${groupData.color}15`,
                                        borderLeft: `4px solid ${groupData.color}`
                                      }}
                                    >
                                      <div 
                                        className="w-3 h-3 rounded-full"
                                        style={{ backgroundColor: groupData.color }}
                                      ></div>
                                      <span style={{ color: groupData.color }}>
                                        {groupData.isGroup && '📁 '}{groupData.name}
                                      </span>
                                      <span className="text-xs text-slate-500 ml-auto">
                                        {groupData.products.length} ürün
                                      </span>
                                    </div>
                                    
                                    {/* Products in this group */}
                                    <div className="space-y-2 ml-4">
                                      {groupData.products.map((product) => (
                                        <div key={product.id} className="border rounded-lg p-3 bg-white shadow-sm">
                                          <div className="flex items-center justify-between">
                                            <div className="flex-1">
                                              <div className="font-medium text-sm">{product.name}</div>
                                              <div className="text-xs text-slate-500 flex items-center gap-3">
                                                <span>Adet: {product.quantity}</span>
                                                <span>•</span>
                                                <span>
                                                  {product.has_custom_price ? (
                                                    <span className="text-purple-600 font-medium">
                                                      ₺ {formatPrice(product.custom_price)} (özel fiyat)
                                                    </span>
                                                  ) : (
                                                    <>₺ {formatPrice(product.list_price_try || 0)}</>
                                                  )}
                                                </span>
                                              </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              {/* Not Düzenleme Butonu */}
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-7 px-2 text-xs"
                                                onClick={() => {
                                                  const currentNotes = product.notes || '';
                                                  const newNotes = prompt(
                                                    `"${product.name}" için not girin:\n\n` +
                                                    `Örnek: "Ön kapıya takılacak - sol tarafa yakın"\n` +
                                                    `Örnek: "Mutfak dolabının altına monte edilecek"\n\n` +
                                                    `Not: (boş bırakırsanız not kaldırılır)`,
                                                    currentNotes
                                                  );
                                                  
                                                  if (newNotes !== null) {
                                                    updatePackageProduct(product.package_product_id, {
                                                      notes: newNotes.trim() || null
                                                    });
                                                  }
                                                }}
                                                title={product.has_notes ? "Notu düzenle" : "Not ekle"}
                                                style={{
                                                  backgroundColor: product.has_notes ? '#fef3c7' : 'transparent',
                                                  borderColor: product.has_notes ? '#f59e0b' : '#e5e7eb',
                                                  color: product.has_notes ? '#92400e' : '#6b7280'
                                                }}
                                              >
                                                <StickyNote className="w-3 h-3" />
                                              </Button>
                                              
                                              {/* Özel Fiyat Düzenleme Butonu */}
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-7 px-2 text-xs"
                                                onClick={() => {
                                                  const currentPrice = product.has_custom_price ? product.custom_price : (product.list_price_try || 0);
                                                  const newPrice = prompt(
                                                    `"${product.name}" için özel fiyat girin:\n\n` +
                                                    `Mevcut fiyat: ₺${formatPrice(currentPrice)}\n` +
                                                    `Orijinal fiyat: ₺${formatPrice(product.list_price_try || 0)}\n\n` +
                                                    `Özel fiyat (₺): (0 = hediye, boş = orijinal fiyata dön)`,
                                                    product.has_custom_price ? product.custom_price.toString() : ''
                                                  );
                                                  
                                                  if (newPrice !== null) {
                                                    const parsedPrice = newPrice.trim() === '' ? null : parseFloat(newPrice);
                                                    if (newPrice.trim() === '' || (!isNaN(parsedPrice) && parsedPrice >= 0)) {
                                                      updatePackageProduct(product.package_product_id, {
                                                        custom_price: parsedPrice
                                                      });
                                                    } else {
                                                      toast.error('Geçerli bir fiyat girin (0 veya daha büyük)');
                                                    }
                                                  }
                                                }}
                                                title={product.has_custom_price ? "Özel fiyatı düzenle" : "Özel fiyat belirle"}
                                              >
                                                <DollarSign className="w-3 h-3" />
                                              </Button>
                                              
                                              {/* Ürünü Paketten Çıkar Butonu */}
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                                                onClick={() => removeProductFromPackage(product.package_product_id, product.name)}
                                                title="Ürünü paketten çıkar"
                                              >
                                                <X className="w-4 h-4" />
                                              </Button>
                                              
                                              {/* Adet Badge */}
                                              <Badge 
                                                variant="outline" 
                                                className="text-xs"
                                                style={{ 
                                                  borderColor: groupData.color,
                                                  color: groupData.color
                                                }}
                                              >
                                                {product.quantity}x
                                              </Badge>
                                            </div>
                                          </div>
                                          
                                          {/* Özel Fiyat Bilgi Göstergesi */}
                                          {product.has_custom_price && (
                                            <div className="mt-2 text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded">
                                              <span className="font-medium">Özel fiyat uygulandı:</span> ₺{formatPrice(product.custom_price)} 
                                              {product.custom_price === 0 && <span className="ml-1 font-medium">(HEDİYE)</span>}
                                            </div>
                                          )}
                                          
                                          {/* Ürün Notları Göstergesi */}
                                          {product.has_notes && (
                                            <div className="mt-2 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded border-l-2 border-amber-400">
                                              <div className="flex items-start gap-1">
                                                <StickyNote className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                                <span className="font-medium">Not:</span>
                                                <span className="italic">{product.notes}</span>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Mevcut Sarf Malzemeleri */}
                          {packageWithProducts && packageWithProducts.supplies.length > 0 && (
                            <div className="border-t pt-4">
                              <h4 className="font-medium text-teal-800 mb-2">Mevcut Sarf Malzemeleri:</h4>
                              <div className="space-y-2">
                                {packageWithProducts.supplies.map((supply) => (
                                  <div key={supply.id} className="border rounded-lg p-3 bg-orange-50">
                                    <div className="flex items-center justify-between">
                                      <div className="flex-1">
                                        <div className="font-medium text-sm">{supply.name}</div>
                                        <div className="text-xs text-orange-600">
                                          Adet: {supply.quantity} • ₺ {formatPrice(supply.list_price_try || 0)} / birim
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-1">
                                          <Input
                                            type="number"
                                            min="1"
                                            value={supply.quantity}
                                            onChange={(e) => updateSupplyQuantity(supply.id, parseInt(e.target.value) || 1)}
                                            className="w-16 h-8 text-sm"
                                          />
                                          <span className="text-xs text-orange-600">adet</span>
                                        </div>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => removeSupplyFromPackage(supply.id)}
                                          className="text-red-600 hover:text-red-700 h-8 w-8 p-0"
                                        >
                                          <X className="w-4 h-4" />
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                          <p className="text-slate-600">Paket detayları yüklenemedi</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Sağ Taraf - Ürün Ekleme/Çıkarma */}
                  <div className="space-y-6">
                    {/* Kategori Ürünleri Ekleme */}
                    <Card className="bg-white border-slate-200 shadow-sm">
                      <CardHeader className="bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-t-sm py-3 px-4">
                        <div className="flex justify-between items-center">
                          <div>
                            <CardTitle className="text-lg text-white flex items-center gap-2">
                              <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center text-sm">
                                ➕
                              </div>
                              Ürün Ekle
                            </CardTitle>
                            <CardDescription className="text-amber-100 text-sm">
                              Pakete eklemek için ürünleri seçin
                            </CardDescription>
                          </div>
                          <Button
                            onClick={addProductsToPackage}
                            className="bg-teal-600 hover:bg-teal-700"
                            disabled={packageSelectedProducts.size === 0}
                          >
                            <Save className="w-4 h-4 mr-2" />
                            Ürünleri Kaydet ({packageSelectedProducts.size})
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {/* Search Box */}
                          <div className="relative">
                            <Input
                              type="text"
                              placeholder="Ürün ara..."
                              value={packageProductSearch}
                              onChange={(e) => handleProductSearch(e.target.value)}
                              className="pr-8"
                            />
                            <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                              </svg>
                            </div>
                          </div>

                          {/* Products by Categories */}
                          <div className="max-h-96 overflow-y-auto space-y-3">
                            {Object.entries(getFilteredAndGroupedProducts())
                              .sort(([categoryIdA], [categoryIdB]) => {
                                // Uncategorized always last
                                if (categoryIdA === 'uncategorized') return 1;
                                if (categoryIdB === 'uncategorized') return -1;
                                
                                // Sort by category sort_order
                                const categoryA = categories.find(c => c.id === categoryIdA);
                                const categoryB = categories.find(c => c.id === categoryIdB);
                                
                                const sortOrderA = categoryA?.sort_order || 0;
                                const sortOrderB = categoryB?.sort_order || 0;
                                
                                if (sortOrderA !== sortOrderB) {
                                  return sortOrderA - sortOrderB;
                                }
                                
                                // If same sort_order, sort alphabetically
                                const nameA = categoryA?.name || '';
                                const nameB = categoryB?.name || '';
                                return nameA.localeCompare(nameB);
                              })
                              .map(([categoryId, categoryData]) => (
                              <div key={categoryId} className="border rounded-lg">
                                {/* Category Header */}
                                <div 
                                  className="flex items-center justify-between p-3 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors"
                                  onClick={() => toggleCategoryExpansion(categoryId)}
                                >
                                  <div className="flex items-center gap-2">
                                    <div 
                                      className="w-3 h-3 rounded-full"
                                      style={{ backgroundColor: categoryData.color }}
                                    />
                                    <span className="font-medium text-sm">{categoryData.name}</span>
                                    <Badge variant="secondary" className="text-xs">
                                      {categoryData.products.length}
                                    </Badge>
                                  </div>
                                  <div className={`transition-transform ${expandedCategories.has(categoryId) ? 'rotate-180' : ''}`}>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </div>
                                </div>

                                {/* Category Products */}
                                {expandedCategories.has(categoryId) && (
                                  <div className="p-2 space-y-2">
                                    {categoryData.products.map((product) => {
                                      const company = companies.find(c => c.id === product.company_id);
                                      const isSelected = packageSelectedProducts.has(product.id);
                                      const quantity = packageSelectedProducts.get(product.id) || 1;
                                      
                                      return (
                                        <div key={product.id} className={`border rounded-lg p-2 ${isSelected ? 'border-teal-300 bg-teal-50' : 'border-gray-200'}`}>
                                          <div className="flex items-center gap-2">
                                            <input
                                              type="checkbox"
                                              checked={isSelected}
                                              onChange={(e) => {
                                                const newSelected = new Map(packageSelectedProducts);
                                                if (e.target.checked) {
                                                  newSelected.set(product.id, 1);
                                                } else {
                                                  newSelected.delete(product.id);
                                                }
                                                setPackageSelectedProducts(newSelected);
                                              }}
                                              className="rounded border-gray-300"
                                            />
                                            <div className="flex-1 min-w-0">
                                              <div className="font-medium text-sm truncate">{product.name}</div>
                                              <div className="text-xs text-slate-500">
                                                {company?.name || 'Unknown'} • ₺ {formatPrice(product.list_price_try || 0)}
                                                {product.brand && <div className="mt-0.5">📦 {product.brand}</div>}
                                              </div>
                                            </div>
                                            {isSelected && (
                                              <Input
                                                type="number"
                                                min="1"
                                                value={quantity}
                                                onChange={(e) => {
                                                  const newSelected = new Map(packageSelectedProducts);
                                                  newSelected.set(product.id, parseInt(e.target.value) || 1);
                                                  setPackageSelectedProducts(newSelected);
                                                }}
                                                className="w-16 h-8 text-sm"
                                              />
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            ))}
                            
                            {Object.keys(getFilteredAndGroupedProducts()).length === 0 && (
                              <div className="text-center py-8">
                                <div className="text-slate-400 mb-2">
                                  <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                  </svg>
                                </div>
                                <p className="text-slate-500 text-sm">
                                  {packageProductSearch ? 'Arama kriterine uygun ürün bulunamadı' : 'Henüz ürün yok'}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Sarf Malzemeleri Ekleme */}
                    <Card className="bg-gradient-to-br from-purple-50 to-violet-100 border-purple-300 shadow-lg">
                      <CardHeader 
                        className="bg-gradient-to-r from-purple-500 to-violet-600 text-white rounded-t-sm cursor-pointer hover:from-purple-600 hover:to-violet-700 transition-all py-3 px-4"
                        onClick={() => setShowSuppliesSection(!showSuppliesSection)}
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <div className={`transition-transform ${showSuppliesSection ? 'rotate-90' : ''}`}>
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                            <div>
                              <CardTitle className="text-lg text-white flex items-center gap-2">
                                <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center text-sm">
                                  🔧
                                </div>
                                Sarf Malzemesi Ekle
                              </CardTitle>
                              <CardDescription className="text-purple-100 text-sm">
                                {showSuppliesSection ? 'Tik işaretiyle seçin' : 'Genişletmek için tıklayın'}
                              </CardDescription>
                            </div>
                          </div>
                          {showSuppliesSection && (
                            <Button
                              onClick={(e) => {
                                e.stopPropagation(); // Header click'ini engellemek için
                                addSuppliesToPackage();
                              }}
                              className="bg-orange-600 hover:bg-orange-700"
                              disabled={packageSelectedSupplies.size === 0}
                            >
                              <Save className="w-4 h-4 mr-2" />
                              Sarf Malz. Kaydet ({packageSelectedSupplies.size})
                            </Button>
                          )}
                        </div>
                      </CardHeader>
                      {showSuppliesSection && (
                        <CardContent>
                          <div className="space-y-4">
                            {/* Supply Search */}
                            <div className="relative">
                              <Input
                                type="text"
                                placeholder="Sarf malzemesi ara..."
                                value={supplySearch}
                                onChange={(e) => setSupplySearch(e.target.value)}
                                className="pr-8"
                              />
                              <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                              </div>
                            </div>

                            {/* Supply Products */}
                            <div className="max-h-72 overflow-y-auto space-y-2">
                              {supplyProducts
                                .filter(supply => 
                                  supplySearch === '' || 
                                  supply.name.toLowerCase().includes(supplySearch.toLowerCase())
                                )
                                .map((supply) => {
                                  const company = companies.find(c => c.id === supply.company_id);
                                  const isSelected = packageSelectedSupplies.has(supply.id);
                                  const quantity = packageSelectedSupplies.get(supply.id)?.quantity || 1;
                                  
                                  return (
                                    <div key={supply.id} className={`border rounded-lg p-3 ${isSelected ? 'border-orange-300 bg-orange-50' : 'border-orange-200'}`}>
                                      <div className="flex items-center gap-3">
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => togglePackageSupply(supply.id, supply)}
                                          className="rounded border-orange-300"
                                        />
                                        <div className="flex-1 min-w-0">
                                          <div className="font-medium text-sm">{supply.name}</div>
                                          <div className="text-xs text-orange-600">
                                            {company?.name || 'Unknown'} • ₺ {formatPrice(supply.list_price_try || 0)} / birim
                                            {supply.brand && <div className="mt-0.5">📦 {supply.brand}</div>}
                                          </div>
                                        </div>
                                        {isSelected && (
                                          <div className="flex items-center gap-1">
                                            <Input
                                              type="number"
                                              min="1"
                                              value={quantity}
                                              onChange={(e) => {
                                                const newSelected = new Map(packageSelectedSupplies);
                                                newSelected.set(supply.id, {
                                                  ...supply,
                                                  quantity: parseInt(e.target.value) || 1
                                                });
                                                setPackageSelectedSupplies(newSelected);
                                              }}
                                              className="w-16 h-8 text-sm"
                                            />
                                            <span className="text-xs text-orange-600">adet</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        </CardContent>
                      )}
                    </Card>
                </div>


                </div>
                
                {/* Package discount, labor cost and summary - Full width inside TabsContent */}
                {packageWithProducts && (
                  <div className="bg-slate-50 -mx-6 px-6 py-6">
                    <div className="space-y-4">
                      {/* İndirim Bölümü */}
                      <div className="bg-gradient-to-br from-yellow-50 to-amber-100 border-2 border-yellow-300 rounded-lg p-3 shadow-md">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-yellow-500 text-white rounded-full flex items-center justify-center">
                              <TrendingUp className="w-3 h-3" />
                            </div>
                            <span className="font-medium text-yellow-800 text-sm">İndirim</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              placeholder="0"
                              value={packageDiscount}
                              onChange={(e) => setPackageDiscount(parseFloat(e.target.value) || 0)}
                              className="w-16 text-sm"
                            />
                            <span className="text-amber-700 text-sm">%</span>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPackageDiscount(10)}
                              className="text-xs px-2"
                            >
                              10%
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPackageDiscount(15)}
                              className="text-xs px-2"
                            >
                              15%
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* İşçilik Maliyeti Bölümü */}
                      <div className="bg-gradient-to-br from-cyan-50 to-blue-100 border-2 border-cyan-300 rounded-lg p-4 shadow-md">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-cyan-500 text-white rounded-full flex items-center justify-center">
                              <Wrench className="w-3 h-3" />
                            </div>
                            <span className="font-medium text-cyan-800">İşçilik Maliyeti</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-cyan-700">₺</span>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="0.00"
                              value={packageLaborCost}
                              onChange={(e) => setPackageLaborCost(parseFloat(e.target.value) || 0)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && packageLaborCost > 0) {
                                  toast.success(`₺${formatPrice(packageLaborCost)} işçilik maliyeti eklendi!`);
                                }
                              }}
                              className="w-32"
                            />
                            {packageLaborCost > 0 && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  const previousAmount = packageLaborCost;
                                  setPackageLaborCost(0);
                                  toast.success(`₺${formatPrice(previousAmount)} işçilik maliyeti kaldırıldı!`);
                                }}
                                className="bg-green-600 hover:bg-green-700 px-2"
                                title="İşçilik tutarını temizle"
                              >
                                <Check className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setPackageLaborCost(2000)}>₺2000</Button>
                            <Button variant="outline" size="sm" onClick={() => setPackageLaborCost(5000)}>₺5000</Button>
                            <Button variant="outline" size="sm" onClick={() => setPackageLaborCost(10000)}>₺10000</Button>
                            <Button variant="outline" size="sm" onClick={() => setPackageLaborCost(20000)}>₺20000</Button>
                          </div>
                        </div>
                      </div>

                      {/* Paket Özeti */}
                      <div className="bg-gradient-to-br from-green-50 to-emerald-100 border-2 border-green-300 rounded-lg p-4 shadow-lg">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="font-semibold text-green-800 flex items-center gap-2">
                            <div className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center">💰</div>
                            Paket Özeti
                          </h4>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              console.log('Before toggle:', showPackageDiscountedPrices);
                              setShowPackageDiscountedPrices(!showPackageDiscountedPrices);
                              console.log('After toggle:', !showPackageDiscountedPrices);
                            }}
                            className="p-2"
                            title={showPackageDiscountedPrices ? "Liste fiyatlarını göster" : "İndirimli fiyatları göster"}
                          >
                            {showPackageDiscountedPrices ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-emerald-800">{calculatePackageTotals.productCount}</div>
                            <div className="text-sm text-emerald-600">Ürün Sayısı</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-emerald-800">
                              ₺ {formatPrice(showPackageDiscountedPrices ? calculatePackageTotals.totalDiscountedPrice : calculatePackageTotals.totalListPrice)}
                            </div>
                            <div className="text-sm text-emerald-600">{showPackageDiscountedPrices ? "Toplam İndirimli Fiyat" : "Toplam Liste Fiyatı"}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-red-600">- ₺ {formatPrice(calculatePackageTotals.discountAmount)}</div>
                            <div className="text-sm text-red-500">İndirim ({packageDiscount}%)</div>
                          </div>
                          {packageLaborCost > 0 && (
                            <div className="text-center">
                              <div className="text-2xl font-bold text-green-600">+ ₺ {formatPrice(calculatePackageTotals.laborCost)}</div>
                              <div className="text-sm text-green-500">İşçilik</div>
                            </div>
                          )}
                          <div className="text-center">
                            <div className="text-2xl font-bold text-emerald-800">₺ {formatPrice(calculatePackageTotals.totalNetPrice)}</div>
                            <div className="text-sm text-emerald-600">Net Toplam</div>
                            <div className="text-xs text-slate-500 italic mt-1">
                              (€ {formatPrice(calculatePackageTotals.totalNetPrice / (exchangeRates.EUR || 48.5))} EUR)
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>
          <TabsContent value="upload" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Yapay Zekâ ile Ürün Ekle</CardTitle>
                <CardDescription>PDF, Excel veya fotoğraf yükleyin; yapay zekâ ürünleri otomatik çıkarsın, siz onaylayın</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                  <h4 className="font-semibold text-indigo-800 mb-2">✨ Nasıl çalışır?</h4>
                  <p className="text-sm text-indigo-700 space-y-1">
                    <span className="block">1️⃣ <strong>Firma</strong> seçin/oluşturun ve bir dosya yükleyin.</span>
                    <span className="block">2️⃣ <strong>Çıkar</strong> butonuna basın — yapay zekâ ürünleri okur.</span>
                    <span className="block">3️⃣ Çıkan listeyi <strong>kontrol/düzeltin</strong>, sonra <strong>Onayla ve Kaydet</strong> deyin.</span>
                  </p>
                  <p className="text-xs text-indigo-600 mt-2">
                    📎 Desteklenen: <strong>PDF</strong>, <strong>Excel</strong> (.xlsx/.xls), <strong>Fotoğraf</strong> (JPG/PNG)
                  </p>
                </div>
                <div className="space-y-4">
                  {/* Firma Seçim Modu */}
                  <div>
                    <Label>Firma Seçimi</Label>
                    <div className="flex gap-4 mt-2">
                      <label className="flex items-center space-x-2">
                        <input
                          type="radio"
                          name="companyMode"
                          checked={useExistingCompany}
                          onChange={() => setUseExistingCompany(true)}
                          className="text-emerald-600"
                        />
                        <span>Mevcut Firma</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="radio"
                          name="companyMode"
                          checked={!useExistingCompany}
                          onChange={() => setUseExistingCompany(false)}
                          className="text-emerald-600"
                        />
                        <span>Yeni Firma</span>
                      </label>
                    </div>
                  </div>

                  {/* Mevcut Firma Seçimi */}
                  {useExistingCompany && (
                    <div>
                      <Label htmlFor="company-select">Mevcut Firmalardan Seçin</Label>
                      <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                        <SelectTrigger>
                          <SelectValue placeholder="Firma seçin..." />
                        </SelectTrigger>
                        <SelectContent>
                          {companies.map((company) => (
                            <SelectItem key={company.id} value={company.id}>
                              {company.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Yeni Firma Adı Girişi */}
                  {!useExistingCompany && (
                    <div>
                      <Label htmlFor="new-company-name">Yeni Firma Adı</Label>
                      <Input
                        id="new-company-name"
                        placeholder="Firma adını girin..."
                        value={uploadCompanyName}
                        onChange={(e) => setUploadCompanyName(e.target.value)}
                        className="w-full"
                      />
                      <p className="text-sm text-slate-500 mt-1">
                        Bu firma otomatik olarak oluşturulacak ve ürünler bu firmaya atanacak
                      </p>
                    </div>
                  )}

                  {/* Para Birimi Seçimi */}
                  <div>
                    <Label htmlFor="currency-select">Para Birimi</Label>
                    <select
                      id="currency-select"
                      value={uploadCurrency}
                      onChange={(e) => setUploadCurrency(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="USD">🇺🇸 USD - Amerikan Doları</option>
                      <option value="EUR">🇪🇺 EUR - Euro</option>
                      <option value="TRY">🇹🇷 TRY - Türk Lirası</option>
                    </select>
                    <p className="text-sm text-slate-500 mt-1">
                      Excel dosyasındaki fiyatların hangi para biriminde olduğunu seçin
                    </p>
                  </div>

                  {/* İskonto Yüzdesi */}
                  <div>
                    <Label htmlFor="discount-input">İskonto Yüzdesi (%)</Label>
                    <Input
                      id="discount-input"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={uploadDiscount}
                      onChange={(e) => setUploadDiscount(e.target.value)}
                      placeholder="Örn: 20 (20% iskonto için)"
                      className="w-full"
                    />
                    <p className="text-sm text-slate-500 mt-1">
                      İsteğe bağlı. Girdiğiniz yüzde kadar iskonto uygulanır (Liste fiyatı: orijinal, İndirimli fiyat: iskontolu)
                    </p>
                  </div>

                  <div>
                    <Label>Dosya (PDF / Excel / Fotoğraf)</Label>
                    <input
                      id="product-file-input"
                      type="file"
                      accept=".pdf,.xlsx,.xls,image/*"
                      className="sr-only"
                      onChange={(e) => setUploadFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
                    />
                    <div className="flex items-center gap-3 mt-1">
                      <label
                        htmlFor="product-file-input"
                        className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-slate-300 bg-white text-sm font-medium cursor-pointer hover:bg-slate-50 transition-colors"
                      >
                        <Upload className="w-4 h-4 mr-2" /> Dosya Seç
                      </label>
                      <span className={`text-sm truncate ${uploadFile ? 'text-emerald-700 font-medium' : 'text-slate-400'}`}>
                        {uploadFile ? uploadFile.name : 'Henüz dosya seçilmedi'}
                      </span>
                    </div>
                  </div>

                  <Button
                    onClick={aiExtractProducts}
                    disabled={aiExtracting || (!selectedCompany && useExistingCompany) || (!uploadCompanyName.trim() && !useExistingCompany) || !uploadFile}
                    className="w-full"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {aiExtracting ? 'Yapay zekâ okuyor...' : '✨ Ürünleri Çıkar'}
                  </Button>

                  {/* Termosa: çek + fiyat kontrol (yan yana) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* SOL: ürün çek */}
                    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-2 flex flex-col">
                      <div className="flex items-center gap-2 text-sm font-bold text-amber-800"><Download className="w-4 h-4" /> Termosa B2B'den Çek</div>
                      <p className="text-xs text-amber-700">Kategori yollarını satır satır yazın (boşsa tüm Termosa). <code>bayi.termosa.com/urunler</code> sonrası yeter.</p>
                      <textarea
                        value={termosaCats}
                        onChange={(e) => setTermosaCats(e.target.value)}
                        rows={5}
                        placeholder={"elektrik-elektronik-enerji-sistemler/prizler\nbanyo-tuvalet/musluklar"}
                        className="w-full px-3 py-2 border border-amber-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                      <Button
                        onClick={scrapeTermosaProducts}
                        disabled={termosaScraping || (!selectedCompany && useExistingCompany) || (!uploadCompanyName.trim() && !useExistingCompany)}
                        className="w-full bg-amber-600 hover:bg-amber-700 text-white mt-auto"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        {termosaScraping ? 'Çekiliyor...' : "Termosa'dan Çek"}
                      </Button>
                      {/* Agus.com.tr: public site, login gerekmez, fiyatlar ₺ KDV dahil */}
                      <div className="pt-3 mt-2 border-t border-amber-200 space-y-2">
                        <div className="flex items-center gap-2 text-sm font-bold text-sky-800"><Download className="w-4 h-4" /> Agus.com.tr'den Çek</div>
                        <p className="text-xs text-sky-700">Kategori yollarını satır satır yazın. <code>agus.com.tr/</code> sonrası yeter (ör. <code>inverterler</code>, <code>solar-paneller</code>). Fiyatlar ₺ KDV dahil.</p>
                        <textarea
                          value={agusCats}
                          onChange={(e) => setAgusCats(e.target.value)}
                          rows={3}
                          placeholder={"inverterler\nsolar-paneller\nakuler"}
                          className="w-full px-3 py-2 border border-sky-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-400"
                        />
                        <Button
                          onClick={scrapeAgusProducts}
                          disabled={agusScraping || (!selectedCompany && useExistingCompany) || (!uploadCompanyName.trim() && !useExistingCompany)}
                          className="w-full bg-sky-600 hover:bg-sky-700 text-white"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          {agusScraping ? 'Çekiliyor...' : "Agus'tan Çek"}
                        </Button>
                      </div>
                    </div>
                    {/* SAĞ: fiyat kontrol */}
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 space-y-3 flex flex-col">
                      <div className="flex items-center gap-2 text-sm font-bold text-emerald-800"><RefreshCw className="w-4 h-4" /> Termosa Fiyat Kontrol</div>
                      <p className="text-xs text-emerald-700">Adı <strong>Termosa</strong> olan firmayı otomatik bulur — firma seçmeye gerek yok. Güncel fiyatları çeker, değişenleri onay listesi gösterir. <strong>Sisteme her girişte otomatik</strong> çalışır.</p>
                      <Button
                        onClick={checkTermosaPrices}
                        disabled={termosaSyncRunning}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <RefreshCw className={`w-4 h-4 mr-2 ${termosaSyncRunning ? 'animate-spin' : ''}`} />
                        {termosaSyncRunning ? 'Kontrol ediliyor...' : 'Termosa Ürünlerini Kontrol Et'}
                      </Button>
                      {termosaSyncSetting && (
                        <div className="text-xs text-slate-500 mt-auto space-y-0.5">
                          <div><span className="font-semibold text-slate-700">Son kontrol:</span> {termosaSyncSetting.last_run_at ? new Date(termosaSyncSetting.last_run_at).toLocaleString('tr-TR') : 'Yok'}</div>
                          {termosaSyncSetting.last_error && <div className="text-rose-600">Son hata: {termosaSyncSetting.last_error}</div>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ÖNİZLEME: çıkarılan ürünler — kontrol/düzeltme + onay */}
                {aiPreviewProducts && (
                  <div className="mt-6 border-t pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-slate-800">
                        Çıkarılan Ürünler ({aiPreviewProducts.length}) — kontrol edip onaylayın
                      </h4>
                      <Button variant="ghost" size="sm" onClick={cancelAiPreview} disabled={aiSaving}>
                        İptal
                      </Button>
                    </div>
                    {aiImportSession?.summary && (
                      <div className="mb-4 grid gap-3 sm:grid-cols-4">
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                          <div className="text-xs font-semibold text-emerald-700">Yeni ürün</div>
                          <div className="text-xl font-black text-emerald-900">{aiImportSession.summary.new_products || 0}</div>
                        </div>
                        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                          <div className="text-xs font-semibold text-blue-700">Eşleşen ürün</div>
                          <div className="text-xl font-black text-blue-900">{aiImportSession.summary.matched_products || 0}</div>
                        </div>
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                          <div className="text-xs font-semibold text-amber-700">Fiyat değişimi</div>
                          <div className="text-xl font-black text-amber-900">{aiImportSession.summary.price_changes || 0}</div>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="text-xs font-semibold text-slate-600">Durum</div>
                          <div className="text-sm font-bold text-slate-900">CRM henüz değişmedi</div>
                        </div>
                      </div>
                    )}
                    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <Label className="text-xs font-bold text-slate-600">Tüm ürünlere kategori ata</Label>
                      <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(220px,360px)_1fr] sm:items-center">
                        <Select value={importDefaultCategoryId || "none"} onValueChange={applyImportDefaultCategory}>
                          <SelectTrigger className="h-10 bg-white">
                            <SelectValue placeholder="Kategori seç" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Kategorisiz</SelectItem>
                            {categories
                              .slice()
                              .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name))
                              .map((category) => (
                                <SelectItem key={category.id} value={category.id}>
                                  {category.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <div className="text-xs text-slate-500">İstersen aşağıdaki tabloda her ürüne ayrı kategori de seçebilirsin.</div>
                      </div>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-600">
                          <tr>
                            <th className="px-2 py-2 text-left font-medium">Ürün</th>
                            <th className="px-2 py-2 text-left font-medium">Marka</th>
                            <th className="px-2 py-2 text-right font-medium">Liste</th>
                            <th className="px-2 py-2 text-right font-medium">Ind.</th>
                            <th className="px-2 py-2 text-left font-medium">Birim</th>
                            <th className="px-2 py-2 text-left font-medium">Kategori</th>
                            <th className="px-2 py-2 text-left font-medium">Aksiyon</th>
                            <th className="px-2 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {aiPreviewProducts.map((p, i) => (
                            <tr key={p.row_id || i} className="border-t align-top">
                              <td className="px-1 py-1 min-w-[240px]">
                                <Input value={p.name} onChange={(e) => updateAiPreviewProduct(i, 'name', e.target.value)} className="h-8 min-w-[220px]" disabled={p.action === 'skip'} />
                                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                                  {p.matched_product_id ? (
                                    <span className="rounded-full bg-blue-50 px-2 py-0.5 font-semibold text-blue-700 ring-1 ring-blue-100">Eşleşen: {p.matched_product_name || p.name}</span>
                                  ) : (
                                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 ring-1 ring-emerald-100">Yeni ürün</span>
                                  )}
                                  {p.price_change_percent != null && (
                                    <span className={`rounded-full px-2 py-0.5 font-semibold ring-1 ${p.price_change_amount > 0 ? 'bg-rose-50 text-rose-700 ring-rose-100' : 'bg-emerald-50 text-emerald-700 ring-emerald-100'}`}>
                                      {p.price_change_amount > 0 ? '+' : ''}{p.price_change_percent}%
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-1 py-1">
                                <Input value={p.brand || ''} onChange={(e) => updateAiPreviewProduct(i, 'brand', e.target.value)} className="h-8 min-w-[100px]" disabled={p.action === 'skip'} />
                              </td>
                              <td className="px-1 py-1">
                                <Input type="number" step="0.01" value={p.list_price} onChange={(e) => updateAiPreviewProduct(i, 'list_price', e.target.value)} className="h-8 w-28 text-right" disabled={p.action === 'skip'} />
                                {p.old_list_price != null && <div className="mt-1 text-right text-[11px] text-slate-400">Eski: {p.old_currency || p.currency} {formatPrice(p.old_list_price)}</div>}
                              </td>
                              <td className="px-1 py-1">
                                <Input type="number" step="0.01" value={p.discounted_price ?? ''} onChange={(e) => updateAiPreviewProduct(i, 'discounted_price', e.target.value)} className="h-8 w-28 text-right" placeholder="-" disabled={p.action === 'skip'} />
                              </td>
                              <td className="px-1 py-1">
                                <select
                                  value={p.currency}
                                  onChange={(e) => updateAiPreviewProduct(i, 'currency', e.target.value)}
                                  className="h-8 border rounded px-1"
                                  disabled={p.action === 'skip'}
                                >
                                  <option value="USD">USD</option>
                                  <option value="EUR">EUR</option>
                                  <option value="TRY">TRY</option>
                                </select>
                              </td>
                              <td className="px-1 py-1">
                                <select
                                  value={p.category_id || "none"}
                                  onChange={(e) => updateAiPreviewProduct(i, 'category_id', e.target.value === 'none' ? '' : e.target.value)}
                                  className="h-8 min-w-[140px] rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700"
                                  disabled={p.action === 'skip'}
                                >
                                  <option value="none">Kategorisiz</option>
                                  {categories
                                    .slice()
                                    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name))
                                    .map((category) => (
                                      <option key={category.id} value={category.id}>{category.name}</option>
                                    ))}
                                </select>
                              </td>
                              <td className="px-1 py-1">
                                <select
                                  value={p.action || (p.matched_product_id ? 'update' : 'create')}
                                  onChange={(e) => updateAiPreviewProduct(i, 'action', e.target.value)}
                                  className="h-8 min-w-[116px] rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700"
                                >
                                  {p.matched_product_id && <option value="update">Güncelle</option>}
                                  {!p.matched_product_id && <option value="create">Ekle</option>}
                                  <option value="skip">Atla</option>
                                </select>
                              </td>
                              <td className="px-1 py-1 text-center">
                                <button
                                  type="button"
                                  onClick={() => removeAiPreviewProduct(i)}
                                  className="text-red-500 hover:text-red-700"
                                  title="Bu ürünü çıkar"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex gap-3 mt-4">
                      <Button onClick={aiConfirmProducts} disabled={aiSaving} className="flex-1">
                        {aiSaving ? 'Kaydediliyor...' : `Onayla ve Kaydet (${aiPreviewProducts.length})`}
                      </Button>
                      <Button variant="outline" onClick={cancelAiPreview} disabled={aiSaving}>
                        Vazgeç
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Products Tab */}
          <TabsContent value="products" className="space-y-6">
            <Card>
              <CardContent>
                {/* Toplu İşlemler Bar */}
                {selectedProductsForBulk.size > 0 && (
                  <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Check className="w-5 h-5 text-blue-600" />
                        <span className="font-medium text-blue-900">
                          {selectedProductsForBulk.size} ürün seçildi
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={deselectAllProducts}
                        >
                          Seçimi Temizle
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => setShowBulkPriceModal(true)}
                          className="bg-orange-600 hover:bg-orange-700"
                        >
                          <DollarSign className="w-4 h-4 mr-2" />
                          Toplu Fiyat
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => setShowBulkCategoryModal(true)}
                          className="bg-purple-600 hover:bg-purple-700"
                        >
                          <Tags className="w-4 h-4 mr-2" />
                          Toplu Kategori
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Action Bar */}
                <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 pt-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-3 self-end sm:self-auto">
                    <div className="translate-y-1">
                      <h3 className="text-xl font-extrabold tracking-tight text-slate-900">Ürün Listesi</h3>
                    </div>
                    {selectedProducts.size > 0 && (
                      <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-100">
                        <Check className="w-4 h-4" />
                        {selectedProducts.size} ürün seçili
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {selectedProducts.size > 0 && (
                      <>
                        <Button 
                          variant="outline" 
                          onClick={clearSelection}
                          size="sm"
                        >
                          Seçimi Temizle
                        </Button>
                        <Button 
                          onClick={() => setShowQuickQuoteDialog(true)}
                          className="bg-blue-600 hover:bg-blue-700"
                          size="sm"
                        >
                          <FileText className="w-4 h-4 mr-2" />
                          Teklif Oluştur
                        </Button>
                      </>
                    )}
                  </div>
                  <Dialog open={showAddProductDialog} onOpenChange={setShowAddProductDialog}>
                    <DialogTrigger asChild>
                      <Button className="bg-emerald-600 hover:bg-emerald-700">
                        <Plus className="w-4 h-4 mr-2" />
                        Yeni Ürün Ekle
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Yeni Ürün Ekle</DialogTitle>
                        <DialogDescription>
                          Manuel olarak yeni bir ürün ekleyebilirsiniz
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="product-name">Ürün Adı</Label>
                          <Input
                            id="product-name"
                            placeholder="Ürün adını girin"
                            value={newProductForm.name}
                            onChange={(e) => setNewProductForm({...newProductForm, name: e.target.value})}
                          />
                        </div>
                        
                        <div>
                          <Label htmlFor="product-company">Firma</Label>
                          <Select 
                            value={newProductForm.company_id} 
                            onValueChange={(value) => setNewProductForm({...newProductForm, company_id: value})}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Firma seçin" />
                            </SelectTrigger>
                            <SelectContent>
                              {companies.map((company) => (
                                <SelectItem key={company.id} value={company.id}>
                                  {company.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1.5">
                            <Label htmlFor="product-category" className="text-slate-700">Kategori (Opsiyonel)</Label>
                            <button
                              type="button"
                              onClick={() => setShowInlineCategoryForm(!showInlineCategoryForm)}
                              className="text-xs font-black text-emerald-600 hover:text-emerald-700 flex items-center gap-1 cursor-pointer select-none transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" /> Hızlı Kategori Ekle
                            </button>
                          </div>
                          <Select 
                            value={newProductForm.category_id || "none"} 
                            onValueChange={(value) => setNewProductForm({...newProductForm, category_id: value === "none" ? "" : value})}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Kategori seçin" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Kategorisiz</SelectItem>
                              {categories
                                .sort((a, b) => {
                                  if (a.sort_order !== b.sort_order) {
                                    return a.sort_order - b.sort_order;
                                  }
                                  return a.name.localeCompare(b.name);
                                })
                                .map((category) => (
                                <SelectItem key={category.id} value={category.id}>
                                  <div className="flex items-center gap-2">
                                    <div 
                                      className="w-2 h-2 rounded-full" 
                                      style={{backgroundColor: category.color}}
                                    ></div>
                                    {category.name}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {/* Expandable Inline Category Creation Form */}
                          {showInlineCategoryForm && (
                            <div className="mt-3 bg-emerald-50/40 border border-emerald-100 rounded-2xl p-3.5 space-y-3.5 animate-in slide-in-from-top-2 duration-200">
                              <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                                <Tags className="w-3.5 h-3.5 text-emerald-600" />
                                Hızlı Yeni Kategori Oluştur
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="inline-category-name" className="text-slate-600 text-xs font-semibold">Kategori Adı</Label>
                                <Input
                                  id="inline-category-name"
                                  placeholder="Kategori adını girin (Örn: Camlar)"
                                  value={inlineCategoryName}
                                  onChange={(e) => setInlineCategoryName(e.target.value)}
                                  className="h-9 text-sm bg-white"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-slate-600 text-xs font-semibold block mb-1">Kategori Rengi</Label>
                                <div className="flex items-center gap-2.5">
                                  {['#10B981', '#0D9488', '#3B82F6', '#8B5CF6', '#F43F5E', '#F59E0B', '#6B7280'].map((color) => (
                                    <button
                                      key={color}
                                      type="button"
                                      onClick={() => setInlineCategoryColor(color)}
                                      className={`w-6.5 h-6.5 rounded-full cursor-pointer shadow-xxs transition-transform hover:scale-110 flex items-center justify-center border ${
                                        inlineCategoryColor === color ? 'border-emerald-600 ring-2 ring-emerald-200 ring-offset-1 scale-105' : 'border-slate-200/50'
                                      }`}
                                      style={{ backgroundColor: color }}
                                    >
                                      {inlineCategoryColor === color && (
                                        <Check className="w-3.5 h-3.5 text-white stroke-[3.5]" />
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div className="flex gap-2 justify-end pt-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setInlineCategoryName('');
                                    setInlineCategoryColor('#10B981');
                                    setShowInlineCategoryForm(false);
                                  }}
                                  className="h-8 text-xs font-semibold border-slate-200 bg-white"
                                >
                                  İptal
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={isSavingInlineCategory || !inlineCategoryName.trim()}
                                  onClick={saveInlineCategory}
                                  className="h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5"
                                >
                                  {isSavingInlineCategory ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Plus className="w-3.5 h-3.5" />
                                  )}
                                  Oluştur ve Seç
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="product-price">Liste Fiyatı</Label>
                            <Input
                              id="product-price"
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={newProductForm.list_price}
                              onChange={(e) => setNewProductForm({...newProductForm, list_price: e.target.value})}
                            />
                          </div>
                          
                          <div>
                            <Label htmlFor="product-currency">Para Birimi</Label>
                            <Select 
                              value={newProductForm.currency} 
                              onValueChange={(value) => setNewProductForm({...newProductForm, currency: value})}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="USD">USD ($)</SelectItem>
                                <SelectItem value="EUR">EUR (€)</SelectItem>
                                <SelectItem value="TRY">TRY (₺)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div>
                          <Label htmlFor="product-discounted">İndirimli Fiyat (Opsiyonel)</Label>
                          <Input
                            id="product-discounted"
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={newProductForm.discounted_price}
                            onChange={(e) => setNewProductForm({...newProductForm, discounted_price: e.target.value})}
                          />
                        </div>

                        <div>
                          <Label htmlFor="product-description">Açıklama (Opsiyonel)</Label>
                          <Input
                            id="product-description"
                            placeholder="Ürün açıklaması"
                            value={newProductForm.description}
                            onChange={(e) => setNewProductForm({...newProductForm, description: e.target.value})}
                          />
                        </div>

                        <div>
                          <Label htmlFor="product-image">Görsel URL (Opsiyonel)</Label>
                          <Input
                            id="product-image"
                            type="url"
                            placeholder="https://example.com/image.jpg"
                            value={newProductForm.image_url}
                            onChange={(e) => setNewProductForm({...newProductForm, image_url: e.target.value})}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button 
                          variant="outline" 
                          onClick={() => {
                            setShowAddProductDialog(false);
                            resetNewProductForm();
                          }}
                        >
                          İptal
                        </Button>
                        <Button 
                          onClick={createProduct}
                          disabled={loading}
                          className="bg-emerald-600 hover:bg-emerald-700"
                        >
                          {loading ? 'Ekleniyor...' : 'Ürün Ekle'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>

                {/* Search and Filter Controls */}
                <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_12px_35px_rgba(15,118,110,0.10)]">
                  <div className="grid gap-3 lg:grid-cols-[1fr_240px_auto] lg:items-center">
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                        <Search className="h-4.5 w-4.5" />
                      </div>
                      <Input
                        placeholder="Ürün adı, marka veya açıklama ara..."
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        className="h-14 w-full rounded-2xl border-2 border-emerald-100 bg-gradient-to-r from-emerald-50/70 to-white pl-16 pr-12 text-base font-bold text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/15"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => handleSearch('')}
                          className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200 transition hover:text-slate-700"
                          aria-label="Aramayı temizle"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <Select value={selectedCategory || "all"} onValueChange={handleCategoryFilter}>
                      <SelectTrigger className="h-14 rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 font-bold text-slate-700 shadow-sm">
                        <SelectValue placeholder="Kategori seç" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tüm Kategoriler</SelectItem>
                        {categories
                          .sort((a, b) => {
                            if (a.sort_order !== b.sort_order) {
                              return a.sort_order - b.sort_order;
                            }
                            return a.name.localeCompare(b.name);
                          })
                          .map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Select value={selectedCompanyFilter || "all"} onValueChange={(v) => setSelectedCompanyFilter(v === "all" ? '' : v)}>
                      <SelectTrigger className="h-14 rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 font-bold text-slate-700 shadow-sm">
                        <SelectValue placeholder="Firma seç" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tüm Firmalar</SelectItem>
                        {(companies || [])
                          .slice()
                          .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                          .map((co) => (
                            <SelectItem key={co.id} value={co.id}>{co.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {(searchQuery || selectedCategory || selectedCompanyFilter) && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          handleSearch('');
                          handleCategoryFilter('');
                          setSelectedCompanyFilter('');
                        }}
                        className="h-14 rounded-2xl border-slate-200 bg-white px-5 font-bold text-slate-600 hover:bg-slate-50"
                      >
                        Temizle
                      </Button>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 ring-1 ring-emerald-100">
                      {searchQuery ? `"${searchQuery}" aranıyor` : `${totalProducts} ürün içinde arama`}
                    </span>
                    {selectedCategory && (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                        Kategori filtresi aktif
                      </span>
                    )}
                    {selectedCompanyFilter && (
                      <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700 ring-1 ring-indigo-100">
                        Firma: {(companies.find((c) => c.id === selectedCompanyFilter) || {}).name || '—'}
                      </span>
                    )}
                  </div>
                </div>

                {/* E. Kategoriler Arası Hızlı Atlama Barı (Kategori Karouseli) */}
                <div className="mb-6 select-none bg-slate-50/70 rounded-3xl p-4 border border-slate-100">
                  <div className="text-[10px] font-black text-emerald-800 uppercase tracking-widest mb-3 pl-1.5 flex items-center gap-1.5">
                    <Tags className="w-3.5 h-3.5 text-emerald-600" />
                    Kategoriler Arası Hızlı Geçiş
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-5 py-2 justify-start">
                    {categories
                      .sort((a, b) => {
                        if (a.sort_order !== b.sort_order) {
                          return a.sort_order - b.sort_order;
                        }
                        return a.name.localeCompare(b.name);
                      })
                      .map((category) => {
                        const productCount = products.filter(p => p.category_id === category.id).length;
                        if (productCount === 0) return null;
                        
                        return (
                          <button
                            key={category.id}
                            onClick={() => {
                              const el = document.getElementById(`category-${category.id}`);
                              if (el) {
                                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }
                            }}
                            className="flex flex-col items-center gap-2 group select-none cursor-pointer"
                          >
                            {/* The exact square image box wrapper */}
                            <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl flex-shrink-0 transition-all group-hover:scale-105">
                              {/* Product count badge absolutely positioned on the top-right corner of the image wrapper */}
                              <span className="absolute -top-1.5 -right-1.5 text-[9px] sm:text-[10px] font-black bg-emerald-600 text-white px-1.5 py-0.5 rounded-full shadow-sm z-10 border border-white">
                                {productCount}
                              </span>
                              
                              {category.image_url ? (
                                <img 
                                  src={category.image_url} 
                                  alt={category.name}
                                  className="w-full h-full rounded-xl object-cover border border-slate-200/80 group-hover:border-emerald-400 group-hover:shadow-sm transition-all pointer-events-none"
                                />
                              ) : (
                                <div 
                                  className="w-full h-full rounded-xl flex items-center justify-center border border-slate-200/80 group-hover:border-emerald-400 text-white font-bold text-lg sm:text-xl transition-all" 
                                  style={{ backgroundColor: category.color }}
                                >
                                  {category.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>
                            
                            {/* Category Name below the square wrapper */}
                            <span className="text-[11px] sm:text-xs font-semibold text-slate-600 group-hover:text-emerald-950 max-w-[64px] sm:max-w-[80px] text-center transition-colors break-words leading-tight mt-1">
                              {category.name}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>

                <div className="space-y-8">
                  {(() => {
                    // Group products by category
                    const groupedProducts = {};
                    
                    products.forEach(product => {
                      const categoryId = product.category_id || 'uncategorized';
                      if (!groupedProducts[categoryId]) {
                        groupedProducts[categoryId] = [];
                      }
                      groupedProducts[categoryId].push(product);
                    });

                    // Sort categories by sort_order (same as category management), then uncategorized last
                    const sortedGroups = Object.entries(groupedProducts).sort(([a], [b]) => {
                      if (a === 'uncategorized') return 1;
                      if (b === 'uncategorized') return -1;
                      
                      // Sort by category sort_order
                      const categoryA = categories.find(c => c.id === a);
                      const categoryB = categories.find(c => c.id === b);
                      
                      const sortOrderA = categoryA?.sort_order || 0;
                      const sortOrderB = categoryB?.sort_order || 0;
                      
                      if (sortOrderA !== sortOrderB) {
                        return sortOrderA - sortOrderB;
                      }
                      
                      // If same sort_order, sort alphabetically
                      const nameA = categoryA?.name || '';
                      const nameB = categoryB?.name || '';
                      return nameA.localeCompare(nameB);
                    });

                    return sortedGroups.map(([categoryId, categoryProducts], index) => {
                      const category = categories.find(c => c.id === categoryId);
                      const categoryName = category ? category.name : 'Kategorisiz Ürünler';
                      const categoryColor = category ? category.color : '#64748b';
                      
                      // Favori ürünleri ve diğer ürünleri ayır
                      const favoriteProducts = categoryProducts.filter(p => p.is_favorite);
                      const nonFavoriteProducts = categoryProducts.filter(p => !p.is_favorite);
                      
                      // Gösterilecek ürünleri belirle
                      let visibleProducts;
                      let hasMoreProducts = false;
                      const isExpanded = expandedCategories.has(categoryId);
                      
                      if (isExpanded) {
                        // Kategori genişletilmişse tüm ürünleri göster
                        visibleProducts = categoryProducts;
                      } else {
                        // Favori sayısına göre gösterim mantığı
                        if (favoriteProducts.length === 0) {
                          // Favori yoksa ilk 5 ürünü göster
                          visibleProducts = categoryProducts.slice(0, 5);
                          hasMoreProducts = categoryProducts.length > 5;
                        } else if (favoriteProducts.length >= 5) {
                          // 5 veya daha fazla favori varsa tüm favorileri göster
                          visibleProducts = favoriteProducts;
                          hasMoreProducts = nonFavoriteProducts.length > 0;
                        } else {
                          // 5'ten az favori var
                          if (categoryProducts.length >= 5) {
                            // Toplam ürün 5 veya daha fazla ise, en az 5 ürün göster (favori + favori olmayan)
                            visibleProducts = [...favoriteProducts, ...nonFavoriteProducts].slice(0, 5);
                            hasMoreProducts = categoryProducts.length > 5;
                          } else {
                            // Toplam ürün 5'ten az ise, tüm ürünleri göster
                            visibleProducts = categoryProducts;
                            hasMoreProducts = false;
                          }
                        }
                      }
                      
                      const hiddenCount = categoryProducts.length - visibleProducts.length;

                      return (
                        <div key={categoryId} id={`category-${categoryId}`} className="space-y-4">
                          {/* Category Header */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b-2" style={{borderColor: categoryColor}}>
                            <div className="flex items-center gap-3">
                              {category && category.image_url ? (
                                <img 
                                  src={category.image_url} 
                                  alt={categoryName}
                                  className="w-7 h-7 rounded-lg object-cover border border-slate-100 shadow-sm flex-shrink-0 pointer-events-none"
                                />
                              ) : (
                                <div 
                                  className="w-5 h-5 rounded-lg flex items-center justify-center shadow-sm" 
                                  style={{backgroundColor: categoryColor}}
                                >
                                  <Package className="w-3 h-3 text-white" />
                                </div>
                              )}
                              <h3 className="text-xl font-bold text-slate-800 tracking-tight">
                                {categoryName}
                              </h3>
                              <div className="flex gap-2">
                                <Badge variant="secondary" className="bg-slate-100 text-slate-700 font-medium">
                                  {categoryProducts.length} ürün
                                </Badge>
                                {favoriteProducts.length > 0 && (
                                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 flex items-center gap-1 font-medium">
                                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                    {favoriteProducts.length} favori
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {/* İndirimli Fiyat Toggle Butonu - Her kategoride göster */}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowDiscountedPrices(!showDiscountedPrices)}
                                className="p-2 border-slate-200 text-slate-600 hover:text-slate-800 hover:bg-slate-50 h-9 w-9"
                                title={showDiscountedPrices ? "İndirimli fiyatları gizle" : "İndirimli fiyatları göster"}
                              >
                                {showDiscountedPrices ? (
                                  <EyeOff className="w-4 h-4" />
                                ) : (
                                  <Eye className="w-4 h-4" />
                                )}
                              </Button>
                            </div>
                          </div>

                          {/* Modern Premium Product List Table */}
                          <div className="overflow-hidden bg-white border border-slate-100 rounded-2xl shadow-sm">
                            <Table className="table-fixed w-full">
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-12">
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        className="rounded border-gray-300"
                                        checked={visibleProducts.every(p => selectedProducts.has(p.id))}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            const newSelected = new Map(selectedProducts);
                                            visibleProducts.forEach(p => newSelected.set(p.id, 1));
                                            setSelectedProducts(newSelected);
                                          } else {
                                            const newSelected = new Map(selectedProducts);
                                            visibleProducts.forEach(p => newSelected.delete(p.id));
                                            setSelectedProducts(newSelected);
                                          }
                                        }}
                                      />
                                      <span className="text-xs">Seç / Adet</span>
                                    </div>
                                  </TableHead>
                                  <TableHead className="w-80">Ürün</TableHead>
                                  <TableHead className="w-32">Firma</TableHead>
                                  <TableHead className="w-28">Marka</TableHead>
                                  <TableHead className="w-28">Liste Fiyatı</TableHead>
                                  {showDiscountedPrices && <TableHead className="w-28">İndirimli Fiyat</TableHead>}
                                  <TableHead className="w-24">Para Birimi</TableHead>
                                  <TableHead className="w-28">TL Fiyat</TableHead>
                                  {showDiscountedPrices && <TableHead className="w-28">TL İndirimli</TableHead>}
                                  <TableHead className="w-24">Stok</TableHead>
                                  <TableHead className="w-16">Toplu</TableHead>
                                  <TableHead className="w-24">İşlemler</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {visibleProducts.map((product) => {
                                  const company = companies.find(c => c.id === product.company_id);
                                  const isEditing = editingProduct === product.id;
                                  
                                  return (
                                    <TableRow 
                                      key={product.id}
                                      className={selectedProducts.has(product.id) ? 'bg-blue-50 border-blue-200' : ''}
                                    >
                                      <TableCell>
                                        <div className="flex items-center gap-3 relative z-10">
                                          {/* Teklif için checkbox */}
                                          <input
                                            type="checkbox"
                                            className="rounded border-gray-300 relative z-20 flex-shrink-0"
                                            checked={selectedProducts.has(product.id)}
                                            onChange={(e) => {
                                              if (e.target.checked) {
                                                toggleProductSelection(product.id, 1);
                                              } else {
                                                toggleProductSelection(product.id, 0);
                                              }
                                            }}
                                            title="Teklif için seç"
                                          />
                                          {selectedProducts.has(product.id) && (
                                            <input
                                              type="number"
                                              min="1"
                                              value={selectedProducts.get(product.id) || 1}
                                              onChange={(e) => {
                                                const quantity = parseInt(e.target.value) || 1;
                                                toggleProductSelection(product.id, quantity);
                                              }}
                                              className="w-10 px-1 py-0.5 text-xs border rounded relative z-30 bg-white flex-shrink-0"
                                              placeholder="1"
                                            />
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className="font-medium">
                                        {isEditing ? (
                                          <div className="space-y-2">
                                            <Input
                                              value={editForm.name}
                                              onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                                              className="min-w-[200px]"
                                              placeholder="Ürün adı"
                                            />
                                            <Input
                                              value={editForm.description}
                                              onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                                              className="min-w-[200px]"
                                              placeholder="Açıklama (opsiyonel)"
                                            />
                                            <Input
                                              value={editForm.brand}
                                              onChange={(e) => setEditForm({...editForm, brand: e.target.value})}
                                              className="min-w-[200px]"
                                              placeholder="Marka (opsiyonel)"
                                            />
                                            <Input
                                              value={editForm.image_url}
                                              onChange={(e) => setEditForm({...editForm, image_url: e.target.value})}
                                              className="min-w-[200px]"
                                              placeholder="Görsel URL (opsiyonel)"
                                              type="url"
                                            />
                                            <Select 
                                              value={editForm.category_id || "none"} 
                                              onValueChange={(value) => setEditForm({...editForm, category_id: value === "none" ? "" : value})}
                                            >
                                              <SelectTrigger className="min-w-[200px]">
                                                <SelectValue placeholder="Kategori" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="none">Kategorisiz</SelectItem>
                                                {categories
                                                  .sort((a, b) => {
                                                    if (a.sort_order !== b.sort_order) {
                                                      return a.sort_order - b.sort_order;
                                                    }
                                                    return a.name.localeCompare(b.name);
                                                  })
                                                  .map((category) => (
                                                  <SelectItem key={category.id} value={category.id}>
                                                    {category.name}
                                                  </SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                          </div>
                                        ) : (
                                          <div className="space-y-1">
                                            <div className="flex items-start gap-3 relative z-0 ml-2">
                                              {product.image_url && (
                                                <img 
                                                  src={product.image_url} 
                                                  alt={product.name}
                                                  className="w-12 h-12 object-cover rounded border cursor-pointer hover:opacity-75 transition-opacity relative z-0 flex-shrink-0"
                                                  onError={(e) => {e.target.style.display = 'none'}}
                                                  onClick={() => openImagePreview(product.image_url, product.name)}
                                                  title="Görseli büyük boyutta görüntülemek için tıklayın"
                                                />
                                              )}
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                  <div className="font-medium truncate pr-2" title={product.name}>{product.name}</div>
                                                  <button
                                                    onClick={() => toggleProductFavorite(product.id)}
                                                    className={`flex-shrink-0 p-1 rounded-full hover:bg-gray-100 transition-colors ${
                                                      product.is_favorite ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'
                                                    }`}
                                                    title={product.is_favorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
                                                  >
                                                    <svg className="w-4 h-4" fill={product.is_favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                                    </svg>
                                                  </button>
                                                </div>
                                                {product.description && (
                                                  <div className="text-sm text-slate-500 mt-1 truncate" title={product.description}>{product.description}</div>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                      </TableCell>
                                      <TableCell className="w-32">
                                        {isEditing ? (
                                          <Select 
                                            value={editForm.company_id} 
                                            onValueChange={(value) => setEditForm({...editForm, company_id: value})}
                                          >
                                            <SelectTrigger className="w-28">
                                              <SelectValue placeholder="Firma" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {companies.map((comp) => (
                                                <SelectItem key={comp.id} value={comp.id}>
                                                  {comp.name}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        ) : (
                                          <div className="space-y-1">
                                            <Badge variant="outline" className="truncate" title={company?.name || 'Unknown'}>{company?.name || 'Unknown'}</Badge>
                                          </div>
                                        )}
                                      </TableCell>
                                      <TableCell className="w-28">
                                        {isEditing ? (
                                          <Input
                                            value={editForm.brand}
                                            onChange={(e) => setEditForm({...editForm, brand: e.target.value})}
                                            className="w-24"
                                            placeholder="Marka"
                                          />
                                        ) : (
                                          product.brand && (
                                            <Badge variant="secondary" className="truncate" title={product.brand}>
                                              {product.brand}
                                            </Badge>
                                          )
                                        )}
                                      </TableCell>
                                      <TableCell className="w-28">
                                        {isEditing ? (
                                          <Input
                                            type="number"
                                            step="0.01"
                                            value={editForm.list_price}
                                            onChange={(e) => setEditForm({...editForm, list_price: e.target.value})}
                                            className="w-24"
                                          />
                                        ) : (
                                          `${getCurrencySymbol(product.currency)} ${formatPrice(product.list_price)}`
                                        )}
                                      </TableCell>
                                      {showDiscountedPrices && (
                                        <TableCell>
                                          {isEditing ? (
                                            <Input
                                              type="number"
                                              step="0.01"
                                              value={editForm.discounted_price}
                                              onChange={(e) => setEditForm({...editForm, discounted_price: e.target.value})}
                                              className="w-24"
                                              placeholder="İndirimli fiyat"
                                            />
                                          ) : (
                                            product.discounted_price ? (
                                              `${getCurrencySymbol(product.currency)} ${formatPrice(product.discounted_price)}`
                                            ) : '-'
                                          )}
                                        </TableCell>
                                      )}
                                      <TableCell className="w-24">
                                        {isEditing ? (
                                          <Select 
                                            value={editForm.currency} 
                                            onValueChange={(value) => setEditForm({...editForm, currency: value})}
                                          >
                                            <SelectTrigger className="w-20">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="USD">USD</SelectItem>
                                              <SelectItem value="EUR">EUR</SelectItem>
                                              <SelectItem value="TRY">TRY</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        ) : (
                                          <Badge 
                                            className="cursor-pointer hover:bg-primary/90" 
                                            onClick={() => startEditProduct(product)}
                                          >
                                            {product.currency}
                                          </Badge>
                                        )}
                                      </TableCell>
                                      <TableCell className="w-28">
                                        ₺ {product.list_price_try ? formatPrice(product.list_price_try) : '---'}
                                      </TableCell>
                                      {showDiscountedPrices && (
                                        <TableCell className="w-28">
                                          {product.discounted_price_try ? (
                                            `₺ ${formatPrice(product.discounted_price_try)}`
                                          ) : '-'}
                                        </TableCell>
                                      )}
                                      <TableCell className="w-24">
                                        {product.is_favorite ? (
                                          <Input
                                            type="number"
                                            min="0"
                                            value={product.stock_quantity || 0}
                                            onChange={(e) => updateProductStock(product.id, parseInt(e.target.value) || 0)}
                                            className="w-16 text-center text-sm"
                                            placeholder="0"
                                          />
                                        ) : (
                                          <span className="text-gray-400 text-sm">-</span>
                                        )}
                                      </TableCell>
                                      <TableCell className="w-16">
                                        {/* Toplu işlem seçimi - Sağ tarafta */}
                                        <Button
                                          size="sm"
                                          variant={selectedProductsForBulk.has(product.id) ? "default" : "outline"}
                                          onClick={() => toggleProductSelectionForBulk(product.id)}
                                          className={selectedProductsForBulk.has(product.id) ? "bg-blue-600 hover:bg-blue-700" : ""}
                                        >
                                          {selectedProductsForBulk.has(product.id) ? (
                                            <Check className="w-4 h-4" />
                                          ) : (
                                            <Plus className="w-4 h-4" />
                                          )}
                                        </Button>
                                      </TableCell>
                                      <TableCell className="w-24">
                                        <div className="flex gap-2">
                                          {isEditing ? (
                                            <>
                                              <Button 
                                                size="sm" 
                                                onClick={saveEditProduct}
                                                disabled={loading}
                                                className="bg-green-600 hover:bg-green-700"
                                              >
                                                <Save className="w-4 h-4" />
                                              </Button>
                                              <Button 
                                                size="sm" 
                                                variant="outline" 
                                                onClick={cancelEditProduct}
                                              >
                                                <X className="w-4 h-4" />
                                              </Button>
                                            </>
                                          ) : (
                                            <>
                                              <Button 
                                                size="sm" 
                                                variant="outline" 
                                                onClick={() => startEditProduct(product)}
                                              >
                                                <Edit className="w-4 h-4" />
                                              </Button>
                                              <Button 
                                                size="sm" 
                                                variant="destructive" 
                                                onClick={() => deleteProduct(product.id)}
                                              >
                                                <Trash2 className="w-4 h-4" />
                                              </Button>
                                            </>
                                          )}
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                          
                          {/* Diğer Ürünleri Göster Butonu */}
                          {hasMoreProducts && !isExpanded && (
                            <div className="flex justify-center pt-3 border-t">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const newExpanded = new Set(expandedCategories);
                                  newExpanded.add(categoryId);
                                  setExpandedCategories(newExpanded);
                                }}
                                className="bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100"
                              >
                                <Plus className="w-4 h-4 mr-2" />
                                Diğer Ürünleri Göster ({hiddenCount} ürün)
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })})()}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
                           {/* Quotes Tab - Redesigned to be high-productivity and single-screen */}
          <TabsContent value="quotes" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
              
              {/* PDF Canvas Workspace (col-span-3) - A4 Styled Sheet */}
              <div className="lg:col-span-3 space-y-6">

                {/* A4 Paper Canvas */}
                <div className="w-full bg-white shadow-xl border border-slate-200 p-8 sm:p-12 pb-0 sm:pb-0 rounded-2xl font-sans min-h-[1050px] flex flex-col justify-between relative overflow-hidden select-text">

                  {/* Decorative Header Bar */}
                  <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-emerald-600 to-teal-600" />
                  
                  <div className="flex-1">
                    {/* 1. Header Details */}
                    <div className="relative border-b pb-6 mb-8">
                      {/* Premium Quote Header */}
                      <div className="relative overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-950 via-emerald-800 to-teal-600 px-6 py-5 pr-56 shadow-lg shadow-emerald-950/10 select-none">
                        <div className="absolute right-[-70px] top-[-70px] h-44 w-44 rounded-full border border-white/10 bg-white/5" />
                        <div className="absolute right-20 bottom-[-56px] h-32 w-32 rounded-full bg-cyan-200/10" />
                        <div className="absolute right-36 top-5 h-12 w-12 rounded-full bg-white/10" />
                        <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-emerald-300 to-cyan-300" />

                        <div className="relative z-10 flex items-center gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10 shadow-inner">
                            <FileText className="h-6 w-6 text-emerald-100" />
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-100/75">Çorlu Karavan</p>
                            <h2 className="m-0 text-2xl font-black uppercase tracking-tight text-white">Fiyat Teklif Formu</h2>
                          </div>
                        </div>
                      </div>

                      <div className="absolute right-4 top-6 z-20 flex items-center rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-right text-xs font-bold text-emerald-50 shadow-inner backdrop-blur-sm select-none">
                        <div className="whitespace-nowrap text-sm text-emerald-50">{new Date().toLocaleDateString('tr-TR')}</div>
                      </div>
                    </div>

                    {/* Yüklü teklif için belirgin KAPAT şeridi */}
                    {loadedQuote && (
                      <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 select-none">
                        <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">Teklif Düzenleniyor</p>
                          <p className="truncate text-sm font-bold text-amber-900" title={loadedQuote.name}>{loadedQuote.name}</p>
                        </div>
                        <Button
                          onClick={() => { clearSelection(); toast.success('Teklif kapatıldı — yeni teklif alanına geçildi'); }}
                          className="shrink-0 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl flex items-center gap-1.5 px-4"
                        >
                          <X className="w-4 h-4" /> Teklifi Kapat
                        </Button>
                      </div>
                    )}

                    {/* 2. Editable Title Field */}
                    <div className="mb-6 space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <label className="text-[9px] font-extrabold text-emerald-700 uppercase tracking-wider block">Teklif Başlığı</label>
                        <button
                          type="button"
                          onClick={() => setShowQuoteDiscountedPrices(!showQuoteDiscountedPrices)}
                          className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-700"
                          title="Maliyet/Geliş fiyatlarını göster/gizle"
                        >
                          {showQuoteDiscountedPrices ? (
                            <EyeOff className="w-4 h-4 text-rose-500" />
                          ) : (
                            <Eye className="w-4 h-4 text-emerald-600" />
                          )}
                        </button>
                      </div>
                      <input
                        type="text"
                        value={quoteName}
                        onChange={(e) => setQuoteName(e.target.value)}
                        placeholder="Teklif Başlığı Girin (Örn: Mehmet Bey Karavan Güneş Paneli Teklifi)"
                        className="w-full border-none bg-transparent hover:bg-slate-50 focus:bg-slate-50 focus:ring-1 focus:ring-emerald-500 rounded px-2.5 py-1.5 text-base font-black text-slate-800 focus:outline-none transition-all"
                      />
                    </div>

                    {/* 3. Products Table */}
                    <div className="border border-slate-200 rounded-xl mb-8 bg-slate-50/45 shadow-sm overflow-visible">
                      <Table className="table-auto w-full text-left">
                        <TableHeader>
                          <TableRow className="bg-slate-100/70 hover:bg-slate-100/70 border-b border-slate-200">
                            <TableHead className="w-16 text-center text-xs font-black text-slate-700 border-r border-slate-200/80">Resim</TableHead>
                            <TableHead className="text-xs font-black text-slate-700 border-r border-slate-200/80">Ürün Bilgisi</TableHead>
                            <TableHead className="w-28 text-xs font-black text-slate-700 border-r border-slate-200/80">Marka</TableHead>
                            <TableHead className="w-24 text-xs font-black text-slate-700 text-center border-r border-slate-200/80">Adet</TableHead>
                            <TableHead className="w-32 text-xs font-black text-slate-700 text-right border-r border-slate-200/80">Birim Fiyat</TableHead>
                            <TableHead className="w-32 text-xs font-black text-slate-700 text-right border-r border-slate-200/80">Birim Fiyat (TL)</TableHead>
                            <TableHead className="w-32 text-xs font-black text-slate-700 text-right border-r border-slate-200/80">Tutar</TableHead>
                            <TableHead className="w-32 text-xs font-black text-slate-700 text-right border-r border-slate-200/80">Tutar (TL)</TableHead>
                            <TableHead className="w-12 text-center"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {getSelectedProductsData().length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={9} className="p-12 text-center text-slate-400/80 italic text-xs bg-white rounded-b-xl">
                                Teklifinizde henüz ürün bulunmamaktadır. Alttaki arama satırından hızlıca ürün ekleyebilirsiniz.
                              </TableCell>
                            </TableRow>
                          ) : (
                            getSelectedProductsData().map((product) => {
                              const customPrice = selectedProductsCustomPrices.get(product.id);
                              const currentUnitPrice = customPrice !== undefined && customPrice !== null ? customPrice : (product.list_price || 0);
                              
                              // Calculate TL values
                              let unitPriceTRY = currentUnitPrice;
                              if (product.currency === 'USD') {
                                unitPriceTRY = currentUnitPrice * (exchangeRates.USD || 34.0);
                              } else if (product.currency === 'EUR') {
                                unitPriceTRY = currentUnitPrice * (exchangeRates.EUR || 37.0);
                              }
                              
                              const quantity = selectedProducts.get(product.id) || 1;
                              const lineTotalTRY = unitPriceTRY * quantity;

                              // Calculate Cost (Geliş) TL values
                              const discountedPrice = parseFloat(product.discounted_price) || parseFloat(product.list_price) || 0;
                              let discountedPriceTRY = discountedPrice;
                              if (product.currency === 'USD') {
                                discountedPriceTRY = discountedPrice * (exchangeRates.USD || 34.0);
                              } else if (product.currency === 'EUR') {
                                discountedPriceTRY = discountedPrice * (exchangeRates.EUR || 37.0);
                              }
                              const lineTotalDiscountedTRY = discountedPriceTRY * quantity;

                              return (
                                <TableRow 
                                    key={product.id} 
                                    draggable={true}
                                    onDragStart={(e) => handleProductDragStart(e, product.id)}
                                    onDragOver={handleProductDragOver}
                                    onDragEnd={handleProductDragEnd}
                                    onDrop={(e) => handleProductDrop(e, product.id)}
                                    className={`border-b border-slate-200/80 bg-white hover:bg-slate-50/65 transition-all select-none cursor-move ${
                                      draggedProductId === product.id ? 'opacity-40 scale-[0.98] bg-slate-50 border-emerald-300' : ''
                                    }`}
                                  >
                                  {/* Product Image */}
                                  <TableCell className="p-3.5 text-center select-none border-r border-slate-200/40">
                                    {product.image_url ? (
                                      <img 
                                        src={product.image_url} 
                                        alt="" 
                                        onClick={() => openProductDetails(product)}
                                        className="w-14 h-14 object-cover rounded-xl border border-slate-100 shadow-xxs cursor-pointer hover:scale-105 hover:opacity-90 transition-all duration-200" 
                                        title="Ürün detaylarını görüntülemek için tıklayın"
                                      />
                                    ) : (
                                      <div className="w-14 h-14 bg-slate-100 rounded-xl border border-slate-100 flex items-center justify-center text-slate-300">
                                        <Package className="w-6 h-6" />
                                      </div>
                                    )}
                                  </TableCell>
                                  
                                  {/* Name / Desc */}
                                  <TableCell className="p-3.5 border-r border-slate-200/40">
                                    <div className="font-bold text-slate-800 text-sm" title={product.name}>
                                      {product.name}
                                    </div>
                                    {product.description && (
                                      <div className="text-xs text-slate-500 mt-1" title={product.description}>
                                        {product.description}
                                      </div>
                                    )}
                                  </TableCell>
                                  
                                  {/* Brand */}
                                  <TableCell className="p-3.5 text-slate-600 text-sm font-semibold border-r border-slate-200/40">
                                    {product.brand || <span className="text-slate-300">-</span>}
                                  </TableCell>
                                  
                                  {/* Quantity adjusters inside cell */}
                                  <TableCell className="p-3.5 border-r border-slate-200/40">
                                    <div className="flex items-center justify-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => toggleProductSelection(product.id, Math.max(1, (selectedProducts.get(product.id) || 1) - 1))}
                                        className="w-6 h-6 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg flex items-center justify-center text-slate-600 hover:text-slate-800 transition-colors text-sm font-bold"
                                      >
                                        -
                                      </button>
                                      <span className="w-6 text-center text-sm font-extrabold text-slate-800">
                                        {selectedProducts.get(product.id) || 1}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => toggleProductSelection(product.id, (selectedProducts.get(product.id) || 1) + 1)}
                                        className="w-6 h-6 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg flex items-center justify-center text-slate-600 hover:text-slate-800 transition-colors text-sm font-bold"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </TableCell>
                                  
                                  {/* Unit Price (Editable in product base currency) */}
                                  <TableCell className="p-3.5 text-right text-sm border-r border-slate-200/40">
                                    <div className="flex flex-col items-end">
                                      <div className="flex items-center justify-end gap-1 font-bold text-slate-700">
                                        <span className="text-slate-400 text-xs font-black select-none">{getCurrencySymbol(product.currency)}</span>
                                        <input
                                          type="number"
                                          min="0"
                                          step="1"
                                          value={customPrice !== undefined && customPrice !== null ? Math.round(customPrice) : Math.round(product.list_price || 0)}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            const newMap = new Map(selectedProductsCustomPrices);
                                            if (val === '') {
                                              newMap.delete(product.id);
                                            } else {
                                              newMap.set(product.id, parseFloat(val) >= 0 ? parseFloat(val) : 0);
                                            }
                                            setSelectedProductsCustomPrices(newMap);
                                          }}
                                          className={`w-20 text-right border-b border-dashed focus:outline-none bg-transparent font-bold p-0.5 transition-colors ${
                                            customPrice !== undefined && customPrice !== null 
                                              ? 'border-purple-300 text-purple-700 focus:border-purple-500 font-extrabold' 
                                              : 'border-slate-200 hover:border-slate-400 focus:border-emerald-500 text-slate-800'
                                          }`}
                                          title="Özel Birim Fiyat Tanımla"
                                        />
                                      </div>
                                      {customPrice !== undefined && customPrice !== null && (
                                        <div className="text-[9px] text-purple-600 font-extrabold mt-0.5 select-none bg-purple-50 px-1 py-0.5 rounded border border-purple-100/50 flex items-center justify-center max-w-[65px] ml-auto">
                                          Özel Fiyat
                                        </div>
                                      )}
                                      {showQuoteDiscountedPrices && (
                                        <div className="text-[10px] text-purple-600 font-extrabold mt-1">
                                          Geliş: {getCurrencySymbol(product.currency)} {formatPrice(product.discounted_price || product.list_price || 0)}
                                        </div>
                                      )}
                                    </div>
                                  </TableCell>

                                  {/* Unit Price TL */}
                                  <TableCell className="p-3.5 text-right text-sm border-r border-slate-200/40">
                                    <div className="flex flex-col items-end">
                                      <div className="font-extrabold text-slate-800">
                                        ₺ {formatPrice(unitPriceTRY)}
                                      </div>
                                      {product.currency !== 'TRY' && (
                                        <div className="text-[9px] text-slate-400 font-bold select-none mt-0.5">
                                          (1 {product.currency} = ₺{formatPrice(exchangeRates[product.currency] || 0)})
                                        </div>
                                      )}
                                      {showQuoteDiscountedPrices && (
                                        <div className="text-[10px] text-purple-600 font-extrabold mt-1">
                                          Geliş: ₺ {formatPrice(discountedPriceTRY)}
                                        </div>
                                      )}
                                    </div>
                                  </TableCell>
                                  
                                  {/* Line Total */}
                                  <TableCell className="p-3.5 text-right text-sm border-r border-slate-200/40">
                                    <div className="flex flex-col items-end">
                                      <div className={`font-black ${customPrice !== undefined && customPrice !== null ? 'text-purple-700' : 'text-slate-900'}`}>
                                        {getCurrencySymbol(product.currency)} {formatPrice(currentUnitPrice * quantity)}
                                      </div>
                                      {customPrice !== undefined && customPrice !== null && (
                                        <span className="text-[9px] text-purple-500 font-bold mt-0.5 select-none">(Özel Toplam)</span>
                                      )}
                                      {showQuoteDiscountedPrices && (
                                        <div className="text-[10px] text-purple-500 font-bold mt-1">
                                          Geliş: {getCurrencySymbol(product.currency)} {formatPrice((parseFloat(product.discounted_price) || parseFloat(product.list_price) || 0) * quantity)}
                                        </div>
                                      )}
                                    </div>
                                  </TableCell>

                                  {/* Line Total TL */}
                                  <TableCell className="p-3.5 text-right text-sm border-r border-slate-200/40">
                                    <div className="flex flex-col items-end">
                                      <div className="font-black text-slate-900">
                                        ₺ {formatPrice(lineTotalTRY)}
                                      </div>
                                      {customPrice !== undefined && customPrice !== null && (
                                        <span className="text-[9px] text-purple-500 font-bold mt-0.5 select-none">(Özel Toplam TL)</span>
                                      )}
                                      {showQuoteDiscountedPrices && (
                                        <div className="text-[10px] text-purple-500 font-bold mt-1">
                                          Geliş: ₺ {formatPrice(lineTotalDiscountedTRY)}
                                        </div>
                                      )}
                                    </div>
                                  </TableCell>
                                  
                                  {/* Remove row & Reorder */}
                                  <TableCell className="p-3.5 text-center">
                                    <div className="flex items-center justify-center gap-2.5 select-none">
                                      {/* GripVertical icon indicating Draggable Row */}
                                      <div 
                                        className="text-slate-450 hover:text-emerald-650 cursor-grab active:cursor-grabbing p-1.5 hover:bg-slate-100/85 rounded-lg transition-colors"
                                        title="Sürükleyip Bırakarak Sırayı Değiştirin"
                                      >
                                        <GripVertical className="w-4.5 h-4.5 stroke-[2.5]" />
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => toggleProductSelection(product.id, 0)}
                                        className="text-slate-400 hover:text-rose-600 p-1.5 hover:bg-rose-50 rounded-lg transition-colors"
                                        title="Ürünü Çıkar"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          )}
                          
                          {/* Autocomplete Input Row (Styled as a blank row inside table) */}
                          <TableRow className="bg-slate-50/45 hover:bg-slate-50/65 border-t border-slate-200 rounded-b-xl">
                            <TableCell className="p-3.5 text-center border-r border-slate-200/40">
                              <Search className="w-4.5 h-4.5 text-emerald-500 mx-auto" />
                            </TableCell>
                            <TableCell colSpan={8} className="p-2.5 relative">
                              <input
                                ref={quoteSearchInputRef}
                                type="text"
                                placeholder="Teklif sayfasına ürün eklemek için yazın..."
                                value={quoteProductSearch}
                                onChange={(e) => {
                                  setQuoteProductSearch(e.target.value);
                                  if (quoteSearchInputRef.current) {
                                    const rect = quoteSearchInputRef.current.getBoundingClientRect();
                                    setQuoteSearchDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
                                  }
                                }}
                                className="w-full border-none bg-transparent focus:ring-0 focus:outline-none text-sm font-bold text-emerald-800 placeholder-emerald-600/40 px-2.5 py-3"
                              />
                              
                              {/* Inline Search Dropdown */}
                              {quoteProductSearch && quoteSearchDropdownPos && (
                                <div
                                  style={{
                                    position: 'fixed',
                                    top: quoteSearchDropdownPos.top,
                                    left: quoteSearchDropdownPos.left,
                                    width: quoteSearchDropdownPos.width,
                                    zIndex: 9999
                                  }}
                                  className="bg-white border border-slate-200 rounded-xl shadow-2xl max-h-64 overflow-y-auto">
                                  {products
                                    .filter(p => 
                                      p.name.toLowerCase().includes(quoteProductSearch.toLowerCase()) || 
                                      (p.brand && p.brand.toLowerCase().includes(quoteProductSearch.toLowerCase()))
                                    )
                                    .slice(0, 8)
                                    .map(p => (
                                      <div
                                        key={p.id}
                                        onClick={() => {
                                          toggleProductSelection(p.id, 1);
                                          setQuoteProductSearch('');
                                        }}
                                        className="p-3 hover:bg-emerald-50/40 hover:text-emerald-950 cursor-pointer flex items-center justify-between text-xs transition-colors border-b border-slate-50"
                                      >
                                        <div className="flex items-center gap-2">
                                          {p.image_url ? (
                                            <img src={p.image_url} alt="" className="w-8 h-8 min-w-[32px] min-h-[32px] max-w-[32px] max-h-[32px] object-cover rounded" />
                                          ) : (
                                            <div className="w-8 h-8 min-w-[32px] min-h-[32px] bg-slate-100 rounded flex items-center justify-center text-slate-300">
                                              <Package className="w-4 h-4" />
                                            </div>
                                          )}
                                          <div>
                                            <span className="font-bold text-slate-800">{p.name}</span>
                                            {p.brand && <span className="text-[10px] text-slate-400 ml-1.5 uppercase font-black">{p.brand}</span>}
                                          </div>
                                        </div>
                                        <span className="font-extrabold text-emerald-700">₺ {formatPrice(p.list_price_try || 0)}</span>
                                      </div>
                                    ))}
                                  {products.filter(p => 
                                    p.name.toLowerCase().includes(quoteProductSearch.toLowerCase()) || 
                                    (p.brand && p.brand.toLowerCase().includes(quoteProductSearch.toLowerCase()))
                                  ).length === 0 && (
                                    <div className="p-3 text-slate-400 italic text-center text-xs">Aramayla eşleşen ürün bulunamadı</div>
                                  )}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>

                    {/* Manuel kalem ekleme — sistemde kayıtlı olmayan ürün/hizmeti elle gir */}
                    <div className="mt-3 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/40 p-3">
                      <div className="text-[10px] font-black text-emerald-800 uppercase tracking-widest mb-2">Manuel Kalem Ekle</div>
                      <div className="flex flex-wrap gap-2 items-center">
                        <input
                          value={manualItem.name}
                          onChange={(e) => setManualItem(s => ({ ...s, name: e.target.value }))}
                          placeholder="Kalem adı (ör. Özel montaj aparatı)"
                          className="flex-1 min-w-[180px] h-9 px-3 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                        <input
                          value={manualItem.price}
                          onChange={(e) => setManualItem(s => ({ ...s, price: e.target.value }))}
                          placeholder="Fiyat"
                          inputMode="decimal"
                          className="w-28 h-9 px-3 border border-slate-200 rounded-md text-sm bg-white text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                        <select
                          value={manualItem.currency}
                          onChange={(e) => setManualItem(s => ({ ...s, currency: e.target.value }))}
                          className="h-9 px-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        >
                          <option value="TRY">₺</option>
                          <option value="USD">$</option>
                          <option value="EUR">€</option>
                        </select>
                        <input
                          value={manualItem.qty}
                          onChange={(e) => setManualItem(s => ({ ...s, qty: e.target.value }))}
                          placeholder="Adet"
                          inputMode="numeric"
                          className="w-16 h-9 px-3 border border-slate-200 rounded-md text-sm bg-white text-center tabular-nums focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                        <Button size="sm" onClick={addManualQuoteItem} className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white">
                          <Plus className="w-4 h-4 mr-1" /> Ekle
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* 4. Bottom Calculations Grid and Notes (Visual Split Layer in soft slate tint) */}
                  <div className="-mx-8 sm:-mx-12 px-8 sm:px-12 pt-8 pb-6 bg-slate-50/70 border-t border-slate-200/80 rounded-b-2xl select-text">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start mb-6">
                      
                      {/* Left: Interactive Notes */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-emerald-800 uppercase tracking-widest block">Teklif Notları (Sayfa Altı Açıklamalar)</label>
                        <textarea
                          value={quoteNotes}
                          onChange={(e) => setQuoteNotes(e.target.value)}
                          placeholder="Örn: Ödeme koşulları, nakliye, teslim süresi ve montaj detayları bu alana yazılır."
                          className="w-full min-h-[140px] border border-slate-200 bg-white hover:border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl p-3.5 text-xs text-slate-700 focus:outline-none transition-all leading-relaxed shadow-xxs"
                        />
                      </div>

                      {/* Right: Calculations Grid & Actions Panel */}
                      <div className="flex flex-col gap-4 max-w-md ml-auto w-full">
                        <div className="bg-slate-50/50 rounded-2xl p-6 space-y-4 border border-slate-100 w-full text-sm">
                          
                          {/* Dövizli Detaylar (Sadece ilgili para biriminde ürün varsa gösterilir) */}
                          {calculateQuoteTotals.totalUSD > 0 && (
                            <div className="border-b border-slate-100 pb-2 space-y-1">
                              <div className="flex justify-between items-center text-slate-500 font-medium">
                                <span>USD Ürün Toplamı</span>
                                <span className="font-extrabold text-blue-600">$ {formatPrice(calculateQuoteTotals.totalUSD)}</span>
                              </div>
                              <div className="text-xs text-slate-400 text-right font-bold">
                                Karşılığı: ₺ {formatPrice(calculateQuoteTotals.usdInTry)} (1 USD = ₺{exchangeRates.USD || '34.00'})
                              </div>
                            </div>
                          )}

                          {calculateQuoteTotals.totalEUR > 0 && (
                            <div className="border-b border-slate-100 pb-2 space-y-1">
                              <div className="flex justify-between items-center text-slate-500 font-medium">
                                <span>EUR Ürün Toplamı</span>
                                <span className="font-extrabold text-indigo-600">€ {formatPrice(calculateQuoteTotals.totalEUR)}</span>
                              </div>
                              <div className="text-xs text-slate-400 text-right font-bold space-y-1">
                                <div>Karşılığı: ₺ {formatPrice(calculateQuoteTotals.eurInTry)} (1 EUR = ₺{exchangeRates.EUR || '37.00'})</div>
                                <div>Dolar Karşılığı: $ {formatPrice(calculateQuoteTotals.eurInUsd)} (1 EUR = $ {((parseFloat(exchangeRates.EUR) || 37.0) / (parseFloat(exchangeRates.USD) || 34.0)).toFixed(4)})</div>
                              </div>
                            </div>
                          )}

                          {calculateQuoteTotals.totalTRY > 0 && (
                            <div className="flex justify-between items-center text-slate-500 pb-1">
                              <span>TRY Ürün Toplamı</span>
                              <span className="font-extrabold text-slate-700">₺ {formatPrice(calculateQuoteTotals.totalTRY)}</span>
                            </div>
                          )}

                          <div className="flex justify-between items-center text-slate-500 pt-1.5 border-t border-slate-200/60">
                            <span className="font-bold">Genel Liste Toplamı</span>
                            <span className="font-black text-slate-800">₺ {formatPrice(calculateQuoteTotals.totalListPrice)}</span>
                          </div>

                          {/* Inline Edit Discount */}
                          <div className="flex justify-between items-center text-rose-600 font-medium">
                            <span>Uygulanan İndirim (%)</span>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={quoteDiscount || 0}
                                onChange={(e) => setQuoteDiscount(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                                className="w-14 h-7 border border-slate-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 rounded-md text-center text-sm font-bold text-rose-700 focus:outline-none bg-white"
                              />
                              <span className="font-extrabold">- ₺ {formatPrice(calculateQuoteTotals.discountAmount)}</span>
                            </div>
                          </div>

                          {/* Inline Edit Labor */}
                          <div className="flex justify-between items-center text-cyan-600 font-medium">
                            <span>İşçilik Maliyeti (₺)</span>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min="0"
                                value={quoteLaborCost || 0}
                                onChange={(e) => setQuoteLaborCost(Math.max(0, parseFloat(e.target.value) || 0))}
                                className="w-24 h-7 border border-slate-200 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-md text-center text-sm font-bold text-cyan-700 focus:outline-none bg-white"
                              />
                              <span className="font-extrabold">+ ₺ {formatPrice(calculateQuoteTotals.laborCost)}</span>
                            </div>
                          </div>

                          {/* Net Grand Total */}
                          <div className="border-t border-slate-200 pt-3 mt-1.5 flex flex-col items-end">
                            <div className="flex justify-between items-center w-full font-black text-slate-900 text-base">
                              <span>NET TOPLAM</span>
                              <span className="text-emerald-700 text-xl">₺ {formatPrice(calculateQuoteTotals.totalNetPrice)}</span>
                            </div>
                            
                            {calculateQuoteTotals.totalNetPrice > 0 && exchangeRates.EUR && (
                              <span className="text-xs font-extrabold text-slate-400 mt-1">
                                € {formatPrice(calculateQuoteTotals.totalNetPrice / exchangeRates.EUR)} EUR
                              </span>
                            )}
                            {calculateQuoteTotals.totalNetPrice > 0 && exchangeRates.USD && (
                              <span className="text-xs font-extrabold text-slate-400 mt-0.5">
                                $ {formatPrice(calculateQuoteTotals.totalNetPrice / exchangeRates.USD)} USD
                              </span>
                            )}
                          </div>

                          {/* Maliyet Gözü Kartı (Sadece göz ikonu aktifse satıcıya maliyetleri gösterir) */}
                          {showQuoteDiscountedPrices && (
                            <div className="mt-5 pt-4 border-t border-dashed border-purple-200 bg-purple-50/40 rounded-xl p-4 text-sm space-y-2.5 text-purple-950 font-medium">
                              <div className="font-bold text-purple-800 uppercase tracking-wider text-xs mb-1 select-none">BANA GELİŞ MALİYETLERİ (GİZLİ)</div>
                              
                              {calculateQuoteTotals.totalUSDDiscounted > 0 && (
                                <div className="flex justify-between">
                                  <span>USD Geliş Toplamı:</span>
                                  <span className="font-bold">$ {formatPrice(calculateQuoteTotals.totalUSDDiscounted)}</span>
                                </div>
                              )}
                              
                              {calculateQuoteTotals.totalEURDiscounted > 0 && (
                                <div className="flex justify-between">
                                  <span>EUR Geliş Toplamı:</span>
                                  <span className="font-bold">€ {formatPrice(calculateQuoteTotals.totalEURDiscounted)}</span>
                                </div>
                              )}
                              
                              <div className="flex justify-between">
                                <span>Geliş Liste Toplamı:</span>
                                <span className="font-bold">₺ {formatPrice(calculateQuoteTotals.totalListPriceDiscounted)}</span>
                              </div>
                              
                              <div className="flex justify-between text-rose-700">
                                <span>İndirim Payı (-%):</span>
                                <span>- ₺ {formatPrice(calculateQuoteTotals.discountAmountDiscounted)}</span>
                              </div>
                              
                              <div className="flex justify-between text-purple-700 font-extrabold border-t border-purple-200/60 pt-2 text-sm">
                                <span>NET GELİŞ TOPLAMI:</span>
                                <span>₺ {formatPrice(calculateQuoteTotals.totalNetPriceDiscounted)}</span>
                              </div>

                              {calculateQuoteTotals.laborCost > 0 && (
                                <div className="flex justify-between text-emerald-700">
                                  <span>İşçilik (tamamı kâr):</span>
                                  <span>+ ₺ {formatPrice(calculateQuoteTotals.laborCost)}</span>
                                </div>
                              )}

                              <div className="flex justify-between text-emerald-800 font-black border-t border-purple-200/60 pt-1.5 text-sm select-none">
                                <span>BRÜT KAZANÇ (KÂR):</span>
                                <span>₺ {formatPrice(calculateQuoteTotals.totalNetPrice - calculateQuoteTotals.totalNetPriceDiscounted)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                        
                        {/* 2. Action Controls Panel (Moved below the calculations card) */}
                        <div className="border-2 border-emerald-100 rounded-3xl bg-gradient-to-b from-emerald-50/60 to-white/60 p-5.5 space-y-4 shadow-sm select-none">
                          
                          {/* Master Save Trigger */}
                          <Button
                            onClick={saveQuote}
                            disabled={selectedProducts.size === 0}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-5 rounded-2xl flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-98 text-sm"
                          >
                            <Save className="w-5 h-5" />
                            {loadedQuote ? 'Değişiklikleri Güncelle' : 'Teklifi Kaydet'}
                          </Button>
                          
                          {/* PDF Generation and Download */}
                          <Button
                            variant="outline"
                            disabled={selectedProducts.size === 0}
                            onClick={async () => {
                              if (selectedProducts.size === 0) {
                                toast.error('Önce teklife ürün ekleyin');
                                return;
                              }
                              try {
                                let quoteId = loadedQuote?.id;
                                
                                // Auto save/update quote
                                const selectedProductData = getSelectedProductsData().map(p => ({
                                  id: p.id,
                                  quantity: p.quantity || 1,
                                  custom_price: p.customPrice !== null && p.customPrice !== undefined ? parseFloat(p.customPrice) : null
                                }));
                                
                                const newQuoteData = {
                                  name: quoteName || `Teklif - ${new Date().toLocaleDateString('tr-TR')}`,
                                  discount_percentage: parseFloat(quoteDiscount) || 0,
                                  labor_cost: parseFloat(quoteLaborCost) || 0,
                                  products: selectedProductData,
                                  notes: quoteNotes.trim() || ''
                                };
                                
                                if (loadedQuote && loadedQuote.id) {
                                  await fetch(`${API}/quotes/${loadedQuote.id}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(newQuoteData)
                                  });
                                } else {
                                  const createResponse = await fetch(`${API}/quotes`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(newQuoteData)
                                  });
                                  const savedQuote = await createResponse.json();
                                  quoteId = savedQuote.id;
                                }
                                
                                await fetchQuotes();
                                
                                // Download PDF
                                const pdfUrl = `${API}/quotes/${quoteId}/pdf`;
                                const link = document.createElement('a');
                                link.href = pdfUrl;
                                link.download = `${loadedQuote?.name || quoteName || 'Teklif'}.pdf`;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                                toast.success('PDF indiriliyor...');
                              } catch (e) {
                                toast.error('PDF indirme başarısız oldu');
                              }
                            }}
                            className="w-full border-slate-200 hover:bg-slate-50 text-slate-700 font-extrabold py-4.5 rounded-xl flex items-center justify-center gap-2 transition-colors text-xs bg-white shadow-xxs"
                          >
                            <Download className="w-4.5 h-4.5 text-blue-500" />
                            PDF İndir
                          </Button>

                          {/* Reset Canvas Sheet */}
                          <Button
                            variant="ghost"
                            onClick={() => {
                              clearSelection();
                              toast.success('Yeni teklif hazırlama alanına geçildi');
                            }}
                            className="w-full text-slate-400 hover:text-slate-600 hover:bg-slate-100/50 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <X className="w-4 h-4" />
                            Temizle / Yeni Teklif
                          </Button>
                        </div>
                      </div>

                    </div>
                    
                    {/* PDF Footer Watermark Removed */}
                  </div>
                </div>
              </div>

              {/* Controls Panel & History (col-span-1) */}
              <div className="lg:col-span-1 space-y-5">

                {/* 2. Action Controls Panel (Moved to calculations card) */}

                {/* 3. Searchable Saved Quotes panel */}
                <Card className="border-2 border-slate-200 rounded-3xl shadow-lg bg-gradient-to-b from-slate-50 to-white">
                  <CardHeader className="bg-slate-100/60 border-b border-slate-200 pb-3 rounded-t-3xl">
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <History className="w-4 h-4 text-slate-500" />
                        Kayıtlı Teklifler ({quotes.length})
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3.5">
                    
                    {/* Search query input */}
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Kayıtlı tekliflerde arama..."
                        value={quoteSearchTerm}
                        onChange={(e) => handleQuoteSearch(e.target.value)}
                        className="w-full px-3.5 py-2 pl-9 border border-slate-200 rounded-xl text-xs bg-slate-50/50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                      <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                    </div>

                    {/* Saved Quotes List */}
                    {quotes.length === 0 ? (
                      <div className="text-center py-8 text-slate-400 text-xs italic">
                        Kayıtlı bir teklif bulunmamaktadır
                      </div>
                    ) : filteredQuotes.length === 0 ? (
                      <div className="text-center py-6 text-slate-400 text-xs italic">
                        "{quoteSearchTerm}" araması için sonuç bulunamadı
                      </div>
                    ) : (
                      <div className="space-y-2.5 max-h-[650px] overflow-y-auto pr-1 no-scrollbar">
                        {filteredQuotes.map((quote) => {
                          const isActiveEditingThis = loadedQuote?.id === quote.id;
                          return (
                            <div
                              key={quote.id} 
                              className={`p-[18px] border rounded-2xl transition-all shadow-sm flex flex-col justify-between gap-3.5 ${
                                isActiveEditingThis 
                                  ? 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/20 shadow-md'
                                  : 'border-slate-200 bg-white ring-1 ring-slate-100/80 shadow-[0_8px_22px_rgba(15,23,42,0.07)] hover:border-emerald-200 hover:ring-emerald-100 hover:shadow-lg'
                              }`}
                            >
                              <div className="flex justify-between items-start gap-3.5">
                                <div className="min-w-0 flex-1">
                                  <div className="text-[10px] font-black tracking-wider text-emerald-700/80 mb-1 tabular-nums">
                                    QT-{(quote.id || '').replace(/-/g, '').slice(0, 8).toUpperCase()}
                                  </div>
                                  <h5 className="font-extrabold text-slate-900 text-[15px] truncate leading-snug" title={quote.name}>
                                    {quote.name}
                                  </h5>
                                  <div className="flex flex-wrap items-center gap-2 mt-2.5 text-xs font-bold text-slate-500">
                                    <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full ring-1 ring-emerald-100">
                                      {quote.products?.length || 0} Ürün
                                    </span>
                                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                                      {new Date(quote.created_at).toLocaleDateString('tr-TR')}
                                    </span>
                                  </div>
                                </div>
                                <div className="text-right whitespace-nowrap">
                                  <span className="font-black text-slate-950 text-base tabular-nums">
                                    ₺ {formatPrice(quote.total_net_price)}
                                  </span>
                                  {quote.discount_percentage > 0 && (
                                    <div className="text-[11px] text-rose-500 font-extrabold mt-1">
                                      %{quote.discount_percentage} İndirim
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Card Action Buttons (Compact text links style) */}
                              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 text-[11px] font-bold">
                                {/* Load / Edit */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    try {
                                      const productIds = new Map();
                                      const productData = new Map();
                                      const customPrices = new Map();
                                      
                                      quote.products.forEach(p => {
                                        productIds.set(p.id, p.quantity || 1);
                                        if (p.custom_price !== undefined && p.custom_price !== null) {
                                          let loadedCustomPrice = parseFloat(p.custom_price);
                                          const fullProduct = products.find(prod => prod.id === p.id);
                                          if (fullProduct && fullProduct.currency && fullProduct.currency !== 'TRY') {
                                            const rate = parseFloat(exchangeRates[fullProduct.currency]) || (fullProduct.currency === 'USD' ? 34.0 : 37.0);
                                            // If the custom price is far larger than base list price, it was stored in TRY
                                            if (loadedCustomPrice > (parseFloat(fullProduct.list_price) || 0) * 3) {
                                              loadedCustomPrice = loadedCustomPrice / rate;
                                            }
                                          }
                                          customPrices.set(p.id, loadedCustomPrice);
                                        }
                                        const fullProduct = products.find(prod => prod.id === p.id);
                                        if (fullProduct) {
                                          productData.set(p.id, { ...fullProduct, quantity: p.quantity || 1 });
                                        } else {
                                          productData.set(p.id, p);
                                        }
                                      });
                                      
                                      setSelectedProducts(new Map(productIds));
                                      setSelectedProductsData(new Map(productData));
                                      setSelectedProductsCustomPrices(customPrices);
                                      setQuoteDiscount(quote.discount_percentage);
                                      setQuoteLaborCost(quote.labor_cost || 0);
                                      setQuoteNotes(quote.notes || '');
                                      setLoadedQuote({ ...quote });
                                      setQuoteName(quote.name);
                                      // Müşteri bağını da geri yükle (rapor 02: kopuyordu)
                                      setSelectedQuoteCustomer(quote.customer_id || '');

                                      toast.success(`"${quote.name}" teklifi yüklendi`);
                                    } catch (e) {
                                      toast.error('Teklif yükleme başarısız oldu');
                                    }
                                  }}
                                  className={`flex flex-1 items-center justify-center gap-1 px-3 py-2 rounded-xl border text-[11px] font-extrabold transition-all duration-150 ${
                                    isActiveEditingThis
                                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                                      : 'bg-emerald-50/50 border-emerald-200/60 text-emerald-700 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 hover:shadow-xs'
                                  }`}
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                  {isActiveEditingThis ? 'Düzenleniyor' : 'Düzenle'}
                                </button>
                                
                                {/* PDF */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const pdfUrl = `${API}/quotes/${quote.id}/pdf`;
                                    const link = document.createElement('a');
                                    link.href = pdfUrl;
                                    link.download = `${quote.name}.pdf`;
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                    toast.success('PDF indiriliyor...');
                                  }}
                                  className="flex flex-1 items-center justify-center gap-1 px-3 py-2 rounded-xl border bg-blue-50/50 border-blue-200/60 text-blue-700 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all duration-150 text-[11px] font-extrabold hover:shadow-xs"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  PDF İndir
                                </button>

                                {/* Delete */}
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (window.confirm(`"${quote.name}" teklifini silmek istediğinizden emin misiniz?`)) {
                                      try {
                                        const response = await fetch(`${API}/quotes/${quote.id}`, { method: 'DELETE' });
                                        if (response.ok) {
                                          toast.success('Teklif silindi');
                                          await fetchQuotes();
                                          if (loadedQuote?.id === quote.id) {
                                            clearSelection();
                                          }
                                        } else {
                                          toast.error('Teklif silinemedi');
                                        }
                                      } catch (e) {
                                        toast.error('Teklif silinemedi');
                                      }
                                    }
                                  }}
                                  className="flex flex-1 items-center justify-center gap-1 px-3 py-2 rounded-xl border bg-rose-50/50 border-rose-200/60 text-rose-600 hover:bg-rose-600 hover:text-white hover:border-rose-600 transition-all duration-150 text-[11px] font-extrabold hover:shadow-xs"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Sil
                                </button>
                              </div>

                              {/* Servise Gönder (müşteri teklifi onaylayınca) */}
                              <button
                                type="button"
                                onClick={() => sendQuoteToService(quote)}
                                className="flex w-full items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-500 hover:text-white hover:border-amber-500 transition-all duration-150 text-[11px] font-extrabold hover:shadow-xs"
                                title="Müşteri teklifi onayladıysa servise aktar"
                              >
                                <Wrench className="w-3.5 h-3.5" />
                                Servise Gönder
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

              </div>
              
            </div>
          </TabsContent>

            {/* Para Birimi Değiştirme Dialog */}
            <Dialog open={showCurrencyChangeDialog} onOpenChange={closeCurrencyChangeDialog}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Para Birimini Değiştir</DialogTitle>
                  <DialogDescription>
                    {selectedUploadForCurrency?.filename} dosyasındaki tüm ürünlerin para birimini değiştirin
                  </DialogDescription>
                </DialogHeader>
                
                <div className="py-4 space-y-4">
                  {selectedUploadForCurrency && (
                    <div className="p-4 bg-slate-50 rounded-lg">
                      <div className="text-sm font-medium mb-2">Mevcut Para Birimi Dağılımı:</div>
                      <div className="flex gap-2 flex-wrap">
                        {Object.entries(selectedUploadForCurrency.currency_distribution || {}).map(([currency, count]) => (
                          <Badge key={currency} variant="outline">
                            {currency}: {count} ürün
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div>
                    <Label htmlFor="new-currency">Yeni Para Birimi</Label>
                    <Select value={newCurrency} onValueChange={setNewCurrency}>
                      <SelectTrigger>
                        <SelectValue placeholder="Para birimi seçin" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD - Amerikan Doları</SelectItem>
                        <SelectItem value="EUR">EUR - Euro</SelectItem>
                        <SelectItem value="TRY">TRY - Türk Lirası</SelectItem>
                        <SelectItem value="GBP">GBP - İngiliz Sterlini</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
                      <div className="text-sm text-amber-700">
                        <strong>Uyarı:</strong> Bu işlem geri alınamaz! Tüm ürünlerin fiyatları güncel döviz kurlarına göre dönüştürülecek.
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={closeCurrencyChangeDialog}>
                    İptal
                  </Button>
                  <Button 
                    onClick={changeCurrency} 
                    disabled={changingCurrency || !newCurrency}
                    className="bg-yellow-600 hover:bg-yellow-700"
                  >
                    {changingCurrency ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Değiştiriliyor...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Para Birimini Değiştir
                      </>
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Upload History Dialog */}
            <Dialog open={showUploadHistoryDialog} onOpenChange={closeUploadHistoryDialog}>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {selectedCompanyForHistory?.name} - Upload Geçmişi
                  </DialogTitle>
                  <DialogDescription>
                    Bu firmaya ait tüm Excel yükleme işlemleri ve detayları
                  </DialogDescription>
                </DialogHeader>
                
                {loadingHistory ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="w-6 h-6 animate-spin mr-2" />
                    Yükleniyor...
                  </div>
                ) : uploadHistory.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    Bu firma için henüz upload geçmişi bulunmuyor
                  </div>
                ) : (
                  <div className="space-y-4">
                    {uploadHistory.map((upload) => (
                      <Card key={upload.id} className="border-slate-200">
                        <CardHeader className="pb-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <CardTitle className="text-base">{upload.filename}</CardTitle>
                              <CardDescription>
                                {new Date(upload.upload_date).toLocaleDateString('tr-TR', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </CardDescription>
                            </div>
                            <Badge variant={upload.status === 'completed' ? 'default' : 'destructive'}>
                              {upload.status === 'completed' ? 'Tamamlandı' : 'Hata'}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                            <div className="text-center">
                              <div className="text-2xl font-bold text-emerald-600">
                                {upload.total_products}
                              </div>
                              <div className="text-sm text-slate-500">Toplam Ürün</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-blue-600">
                                {upload.new_products}
                              </div>
                              <div className="text-sm text-slate-500">Yeni Ürün</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-orange-600">
                                {upload.updated_products}
                              </div>
                              <div className="text-sm text-slate-500">Güncellenmiş</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-purple-600">
                                {upload.price_changes?.length || 0}
                              </div>
                              <div className="text-sm text-slate-500">Fiyat Değişikliği</div>
                            </div>
                          </div>

                          {/* Para Birimi Dağılımı */}
                          {upload.currency_distribution && Object.keys(upload.currency_distribution).length > 0 && (
                            <div className="mb-4">
                              <h4 className="text-sm font-medium mb-2">Para Birimi Dağılımı:</h4>
                              <div className="flex gap-2 flex-wrap">
                                {Object.entries(upload.currency_distribution).map(([currency, count]) => (
                                  <Badge key={currency} variant="outline">
                                    {currency}: {count} ürün
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Fiyat Değişiklikleri */}
                          {upload.price_changes && upload.price_changes.length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium mb-2">Fiyat Değişiklikleri:</h4>
                              <div className="max-h-32 overflow-y-auto space-y-1">
                                {upload.price_changes.slice(0, 5).map((change, index) => (
                                  <div key={index} className="text-sm p-2 bg-slate-50 rounded">
                                    <span className="font-medium">{change.product_name}</span>
                                    <span className={`ml-2 ${change.change_type === 'increase' ? 'text-red-600' : 'text-green-600'}`}>
                                      {change.old_price} → {change.new_price} {change.currency}
                                      ({change.change_type === 'increase' ? '+' : ''}{change.change_percent}%)
                                    </span>
                                  </div>
                                ))}
                                {upload.price_changes.length > 5 && (
                                  <div className="text-xs text-slate-500 text-center">
                                    ve {upload.price_changes.length - 5} değişiklik daha...
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Para Birimi Değiştirme Butonu */}
                          <div className="mt-4 pt-4 border-t border-slate-200">
                            <div className="flex justify-between items-center">
                              <div className="text-sm text-slate-600">
                                Bu listedeki tüm ürünlerin para birimini değiştir
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openCurrencyChangeDialog(upload)}
                                className="bg-yellow-50 hover:bg-yellow-100 text-yellow-800 border-yellow-200"
                              >
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Para Birimini Değiştir
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </DialogContent>
            </Dialog>

          {/* Akü Test Tab */}
          <TabsContent value="battery-test" className="space-y-6">
            <BatteryTestSection />
          </TabsContent>

          {/* MPPT Hesaplayıcı */}
          <TabsContent value="mppt" className="space-y-6">
            <div className="flex items-center gap-2">
              <Calculator className="w-6 h-6 text-lime-600" />
              <div>
                <h2 className="text-2xl font-black text-slate-800">MPPT Hesaplayıcı</h2>
                <p className="text-sm text-slate-500">Panel özelliklerini girin, yapay zekâ uygun MPPT şarj kontrol cihazını önersin</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Form */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                <div>
                  <Label>Panel (sistemden seç)</Label>
                  <Select value={mpptForm.productId} onValueChange={pickMpptPanelFromProduct}>
                    <SelectTrigger><SelectValue placeholder="Güneş paneli ürünü seç..." /></SelectTrigger>
                    <SelectContent>
                      {(products || []).filter((p) => {
                          const n = (p.name || '').toLocaleLowerCase('tr-TR');
                          // Sadece Monokristal Güneş Panelleri; çıkma/kontrol/esnek/koruma vb. hariç
                          return n.includes('monokristal') && n.includes('güneş panel') && !n.includes('çıkma');
                        }).slice(0, 50).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {mpptForm.name && (
                    <p className="mt-1.5 text-sm text-slate-600">Seçili: <strong>{mpptForm.name}</strong></p>
                  )}
                </div>

                {/* Adet — panel değerlerinin üstünde, ayrı (kaydetmeye dahil değil) */}
                <div>
                  <Label>Panel Adedi (sistemdeki toplam)</Label>
                  <Input type="number" min="1" value={mpptForm.adet} onChange={(e) => setMpptForm({ ...mpptForm, adet: e.target.value })} className="w-32" />
                </div>

                {mpptForm.productId && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Panel Değerleri</span>
                      <Button type="button" size="sm" variant="outline" onClick={savePanelSpecs} disabled={mpptSpecsSaving} className="h-7 text-xs border-lime-300 text-lime-700 hover:bg-lime-50">
                        {mpptSpecsSaving ? 'Kaydediliyor...' : 'Değerleri Kaydet'}
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div><Label className="text-xs">Güç (W)</Label><Input type="number" value={mpptForm.watt} onChange={(e) => setMpptForm({ ...mpptForm, watt: e.target.value })} placeholder="205" /></div>
                      <div><Label className="text-xs">Voc (V)</Label><Input type="number" step="0.1" value={mpptForm.voc} onChange={(e) => setMpptForm({ ...mpptForm, voc: e.target.value })} placeholder="22.1" /></div>
                      <div><Label className="text-xs">Vmp (V)</Label><Input type="number" step="0.1" value={mpptForm.vmp} onChange={(e) => setMpptForm({ ...mpptForm, vmp: e.target.value })} placeholder="18.6" /></div>
                      <div><Label className="text-xs">Isc (A)</Label><Input type="number" step="0.01" value={mpptForm.isc} onChange={(e) => setMpptForm({ ...mpptForm, isc: e.target.value })} placeholder="10.30" /></div>
                      <div><Label className="text-xs">Imp (A)</Label><Input type="number" step="0.01" value={mpptForm.imp} onChange={(e) => setMpptForm({ ...mpptForm, imp: e.target.value })} placeholder="9.95" /></div>
                    </div>
                    <p className="text-[11px] text-slate-400">Değerleri bir kez girip <strong>Kaydet</strong> → sonraki seçimlerde otomatik gelir. Voc girilirse voltaj sınıfı kesin hesaplanır. Sistem 12V.</p>
                  </div>
                )}

                <Button onClick={callMppt} disabled={mpptLoading || !mpptForm.watt} className="w-full bg-lime-600 hover:bg-lime-700 text-white font-bold">
                  {mpptLoading ? 'Hesaplanıyor...' : 'MPPT Öner'}
                </Button>
              </div>

              {/* Sonuç */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                {!mpptResult ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 py-12">
                    <Calculator className="w-12 h-12 mb-3 text-slate-300" />
                    <p>Panel bilgilerini girip "MPPT Öner"e basın.</p>
                  </div>
                ) : (() => {
                  const c = mpptResult.computed || {}; const r = mpptResult.recommendation || {}; const m = r.onerilen_mppt || {};
                  const stdV = m.secilen_voltaj_v || 0;
                  const stdA = m.standart_akim_a || c.onerilen_standart_akim_a || 0;
                  // Sistemdeki MPPT ürünlerinden uygun olanlar (isimden V+A parse)
                  const sysMppt = (products || [])
                    .filter((p) => /mppt/i.test(p.name || '') && !/çıkma/i.test(p.name || ''))
                    .map((p) => {
                      const n = p.name || '';
                      const vM = n.match(/(\d+)\s*V/i); const aM = n.match(/(\d+)\s*A/i);
                      // Fiyat: indirimli varsa o, yoksa liste (₺ karşılığıyla)
                      const priceTry = p.discounted_price_try ?? p.list_price_try ?? null;
                      const priceOrig = p.discounted_price ?? p.list_price ?? null;
                      return {
                        name: n, v: vM ? +vM[1] : null, a: aM ? +aM[1] : null,
                        priceTry, priceOrig, currency: p.currency || 'TRY'
                      };
                    })
                    .filter((x) => x.a && x.a >= stdA && (x.v == null || x.v >= stdV))
                    .sort((a, b) => (a.a - b.a) || ((a.v || 999) - (b.v || 999)))
                    .slice(0, 5);
                  return (
                    <div className="space-y-4">
                      <div className="rounded-xl bg-gradient-to-br from-[#1B3A5C] to-[#15293f] text-white p-4">
                        <div className="text-[11px] uppercase tracking-wider text-emerald-300 font-bold mb-1">Önerilen MPPT</div>
                        <div className="text-3xl font-black tabular-nums">{m.etiket || (m.standart_akim_a ? `${m.standart_akim_a} A` : '—')} <span className="text-base font-semibold text-white/70">MPPT (12V)</span></div>
                        <div className="text-white/70 text-sm mt-1">Hesaplanan şarj akımı: <strong className="tabular-nums">{c.hesaplanan_sarj_akimi_a} A</strong>{m.secilen_voltaj_v ? <> · Max PV: <strong className="tabular-nums">{m.secilen_voltaj_v} V</strong></> : null}</div>
                      </div>
                      {r.ozet && <p className="text-sm text-slate-700">{r.ozet}</p>}
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-lg bg-slate-50 p-2.5"><div className="text-[11px] text-slate-400 uppercase">Toplam Güç</div><div className="font-bold tabular-nums">{c.toplam_watt} W</div></div>
                        <div className="rounded-lg bg-slate-50 p-2.5"><div className="text-[11px] text-slate-400 uppercase">Panel</div><div className="font-bold tabular-nums">{c.adet} × {c.panel_watt}W</div></div>
                      </div>
                      {sysMppt.length > 0 ? (
                        <div>
                          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Sistemdeki Uygun MPPT'ler</div>
                          <div className="space-y-1.5">
                            {sysMppt.map((md, i) => (
                              <div key={i} className="flex items-center justify-between rounded-lg border border-lime-200 bg-lime-50/50 px-3 py-2 text-sm">
                                <span className="font-semibold text-slate-800">{md.name}</span>
                                <span className="text-right shrink-0 ml-2">
                                  <span className="text-slate-500 tabular-nums">{md.a}A{md.v ? ` · ${md.v}V` : ''}</span>
                                  {md.priceTry != null && md.priceTry > 0 && (
                                    <span className="block font-bold text-emerald-700 tabular-nums">
                                      ₺{formatPrice(md.priceTry)}
                                      {md.currency !== 'TRY' && md.priceOrig != null && (
                                        <span className="font-normal text-slate-400"> ({md.currency === 'EUR' ? '€' : '$'}{formatPrice(md.priceOrig)})</span>
                                      )}
                                    </span>
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg p-3">
                          Sistemde {stdV}V/{stdA}A değerini karşılayan kayıtlı MPPT yok. Uygun bir MPPT ürünü ekleyin.
                        </div>
                      )}
                      {(r.uyarilar || []).length > 0 && (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 space-y-1">
                          <div className="text-xs font-bold text-rose-700 uppercase tracking-wider flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Uyarılar</div>
                          {(r.uyarilar || []).map((w, i) => <div key={i} className="text-sm text-rose-700">{w}</div>)}
                        </div>
                      )}
                      {r.aciklama && <p className="text-xs text-slate-500 border-t pt-3">{r.aciklama}</p>}
                    </div>
                  );
                })()}
              </div>
            </div>
          </TabsContent>

          {/* Kablo Şeması Tab */}
          <TabsContent value="wiring-diagram" className="m-0 p-0">
            {!hideChromeForWiring && (
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <Cable className="w-6 h-6 text-cyan-600" />
                  <h2 className="text-2xl font-black text-slate-800">Kablo Şeması</h2>
                </div>
                <Button onClick={toggleWiringFullscreen} className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-xl">
                  <Eye className="w-4 h-4 mr-2" /> Tam Ekran
                </Button>
              </div>
            )}
            {hideChromeForWiring && (
              <button onClick={toggleWiringFullscreen} title="Tam ekrandan çık" className="fixed top-3 right-3 z-[60] inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-slate-900/85 text-white text-sm font-bold shadow-lg hover:bg-slate-900">
                <X className="w-4 h-4" /> Tam Ekrandan Çık
              </button>
            )}
            <KabloSemasiSection fullscreen={hideChromeForWiring} />
          </TabsContent>

          {/* ===================== SERVİS (Tadilat/Bakım) ===================== */}
          <TabsContent value="service" className="space-y-6">
            {serviceDialogOpen ? (
              /* ===== INLINE FORM (popup yerine, Sözleşmeler gibi) ===== */
              <div className="max-w-4xl mx-auto">
                <button
                  type="button"
                  onClick={() => setServiceDialogOpen(false)}
                  className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                >
                  <ChevronUp className="w-4 h-4 -rotate-90" /> Listeye dön
                </button>

                <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  {/* Lacivert başlık bandı (sözleşmeler gibi) */}
                  <div className="relative overflow-hidden bg-gradient-to-br from-[#1B3A5C] to-[#15293f] px-6 py-5">
                    <div className="absolute right-[-50px] top-[-50px] h-36 w-36 rounded-full bg-white/10" />
                    <div className="relative flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-white/10">
                        <Wrench className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <h2 className="m-0 text-lg font-black text-white">{serviceEditingId ? 'Servis Kaydını Düzenle' : 'Yeni Servis Kaydı'}</h2>
                        <p className="m-0 text-xs font-medium text-emerald-50/80">Araç, yapılan işlemler ve teslim bilgilerini girin</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 space-y-7">
                    {/* Müşteri & Araç */}
                    <div>
                      <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-emerald-700">
                        <Users className="w-3.5 h-3.5" /> Müşteri & Araç
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label>Müşteri Adı</Label>
                          <Input value={serviceForm.customer_name} onChange={(e) => setServiceForm({ ...serviceForm, customer_name: e.target.value })} placeholder="Ad Soyad" />
                        </div>
                        <div>
                          <Label>Telefon</Label>
                          <Input value={serviceForm.phone} onChange={(e) => setServiceForm({ ...serviceForm, phone: e.target.value })} placeholder="05xx ..." />
                        </div>
                        {/* ARAÇ — tür/marka + model TEK panelde; seçim üstte rozetle belli */}
                        <div className="sm:col-span-2">
                          {(() => {
                            const VEHICLE_TYPES = ['15M³ PSA', '17M³ PSA', 'MERCEDES', 'IVECO', 'VOLKSWAGEN', 'MAN', 'FORD', 'SEMİ ENTEGRE', 'OTOBÜS', 'ÇEKME KARAVAN'];
                            const MODEL_SUGGESTIONS = {
                              'MERCEDES': ['Sprinter', 'Vito'],
                              'VOLKSWAGEN': ['Crafter', 'Transporter', 'Volt', 'Caravelle', 'Caddy'],
                              'FORD': ['Transit', 'Transit Custom', 'Tourneo'],
                              'IVECO': ['Daily'],
                              'MAN': ['TGE'],
                              'FIAT': ['Ducato', 'Doblo'],
                              'PEUGEOT': ['Boxer', 'Expert'],
                              'CITROEN': ['Jumper', 'Jumpy'],
                              'RENAULT': ['Master', 'Trafic'],
                            };
                            const selected = serviceForm.vehicle_brand || '';
                            const model = serviceForm.vehicle_model || '';
                            const brandKey = selected.trim().toLocaleUpperCase('tr-TR');
                            const sugg = MODEL_SUGGESTIONS[brandKey] || [];
                            const chooseBrand = (v) => setServiceForm({ ...serviceForm, vehicle_brand: selected === v ? '' : v, vehicle_model: selected === v ? serviceForm.vehicle_model : '' });
                            return (
                              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                  <div className="text-[11px] font-black uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
                                    <Wrench className="w-3.5 h-3.5" /> Araç
                                  </div>
                                  {(selected || model) ? (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-600 text-white text-xs font-bold shadow-sm">
                                      <Check className="w-3.5 h-3.5" />
                                      {[selected, model].filter(Boolean).join(' · ')}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-slate-400 italic">Henüz araç seçilmedi</span>
                                  )}
                                </div>

                                <div>
                                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Tür / Marka</div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {VEHICLE_TYPES.map((v) => {
                                      const on = selected === v;
                                      return (
                                        <button
                                          key={v}
                                          type="button"
                                          onClick={() => chooseBrand(v)}
                                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${on ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                        >
                                          {v}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                {sugg.length > 0 && (
                                  <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Model</div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {sugg.map((m) => {
                                        const on = model === m;
                                        return (
                                          <button
                                            key={m}
                                            type="button"
                                            onClick={() => setServiceForm({ ...serviceForm, vehicle_model: on ? '' : m })}
                                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${on ? 'bg-sky-600 border-sky-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                          >
                                            {m}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-200/80">
                                  <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Marka (elle)</div>
                                    <Input value={serviceForm.vehicle_brand} onChange={(e) => setServiceForm({ ...serviceForm, vehicle_brand: e.target.value })} placeholder="Ford, Fiat ..." className="h-9 bg-white" />
                                  </div>
                                  <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Model (elle)</div>
                                    <Input value={serviceForm.vehicle_model} onChange={(e) => setServiceForm({ ...serviceForm, vehicle_model: e.target.value })} placeholder="Transit, Ducato ..." className="h-9 bg-white" />
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                        <div>
                          <div className="flex items-center justify-between">
                            <Label>Plaka</Label>
                            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer select-none">
                              <input type="checkbox" checked={!!serviceForm.is_trailer} onChange={(e) => setServiceForm({ ...serviceForm, is_trailer: e.target.checked, plate: e.target.checked ? '' : serviceForm.plate })} className="accent-emerald-600" />
                              Çekme karavan (plakasız)
                            </label>
                          </div>
                          {serviceForm.is_trailer ? (
                            <div className="h-10 flex items-center px-3 rounded-md bg-slate-50 border border-dashed border-slate-300 text-xs text-slate-500 italic">Plakasız — müşteri adıyla takip edilir</div>
                          ) : (
                            <Input value={serviceForm.plate} onChange={(e) => setServiceForm({ ...serviceForm, plate: e.target.value })} placeholder="59 ABC 123" />
                          )}
                        </div>
                        <div>
                          <Label>Durum</Label>
                          <Select value={serviceForm.status} onValueChange={(v) => setServiceForm({ ...serviceForm, status: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="received">Bekliyor</SelectItem>
                              <SelectItem value="in_progress">Devam Ediyor</SelectItem>
                              <SelectItem value="delivered">Teslim Edildi</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* Tarihler */}
                    <div>
                      <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-emerald-700">
                        <History className="w-3.5 h-3.5" /> Tarihler
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label>Geliş Tarihi</Label>
                          <Input type="date" value={serviceForm.arrival_date} onChange={(e) => setServiceForm({ ...serviceForm, arrival_date: e.target.value })} />
                        </div>
                        <div>
                          <Label>Teslim Tarihi</Label>
                          <Input type="date" value={serviceForm.delivery_date} onChange={(e) => setServiceForm({ ...serviceForm, delivery_date: e.target.value })} />
                        </div>
                      </div>
                    </div>

                    {/* Yapılan İşlemler / Parçalar (kalem listesi — sözleşmeler gibi) */}
                    <div>
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-emerald-700">
                          <Package className="w-3.5 h-3.5" /> Yapılan İşlemler / Parçalar
                        </div>
                        <Button type="button" size="sm" variant="outline" onClick={addServiceItem} className="h-8 text-xs font-bold border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                          <Plus className="w-3.5 h-3.5 mr-1" /> Kalem Ekle
                        </Button>
                      </div>
                      {(serviceForm.items || []).length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-2">Henüz kalem yok. "Kalem Ekle" ile yapılan işlem / parça ekleyin (her satır ayrı; toplam otomatik hesaplanır).</p>
                      ) : (
                        <div className="overflow-hidden rounded-xl border border-slate-200">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                                <th className="text-left font-bold px-3 py-2">Parça / İşlem</th>
                                <th className="text-center font-bold px-2 py-2 w-16">Adet</th>
                                <th className="text-right font-bold px-2 py-2 w-28">Birim (₺)</th>
                                <th className="text-right font-bold px-3 py-2 w-28">Tutar (₺)</th>
                                <th className="w-9"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {(serviceForm.items || []).map((it, idx) => (
                                <tr key={idx} className="border-t border-slate-100">
                                  <td className="px-2 py-1.5">
                                    <input value={it.name} onChange={(e) => updateServiceItem(idx, 'name', e.target.value)} placeholder="Solar panel, akü, işçilik..." className="w-full h-8 px-2 border border-slate-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                                  </td>
                                  <td className="px-1 py-1.5">
                                    <input type="number" min="0" step="1" value={it.qty} onChange={(e) => updateServiceItem(idx, 'qty', e.target.value)} className="w-full h-8 px-1 border border-slate-200 rounded text-sm text-center tabular-nums focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                                  </td>
                                  <td className="px-1 py-1.5">
                                    <div className="flex items-center gap-1">
                                      <input type="number" min="0" step="0.01" value={it.unit_price} onChange={(e) => updateServiceItem(idx, 'unit_price', e.target.value)} className="w-full h-8 px-1 border border-slate-200 rounded text-sm text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                                      <select value={it.currency || 'TRY'} onChange={(e) => updateServiceItem(idx, 'currency', e.target.value)} className="h-8 px-0.5 border border-slate-200 rounded text-xs bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500" title="Para birimi">
                                        <option value="TRY">₺</option>
                                        <option value="EUR">€</option>
                                        <option value="USD">$</option>
                                      </select>
                                      {(it.currency && it.currency !== 'TRY') && (
                                        <input type="number" min="0" step="0.01" value={it.rate ?? ''} onChange={(e) => updateServiceItem(idx, 'rate', e.target.value)} placeholder="kur" title="1 birim = ? ₺" className="w-14 h-8 px-1 border border-slate-200 rounded text-xs text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-slate-700">₺ {formatPrice(serviceItemLineTRY(it))}</td>
                                  <td className="px-1 py-1.5 text-center">
                                    <button type="button" onClick={() => removeServiceItem(idx)} className="text-rose-400 hover:text-rose-600" title="Kalemi sil"><Trash2 className="w-4 h-4" /></button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Fotoğraflar */}
                    <div>
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-emerald-700">
                          <Eye className="w-3.5 h-3.5" /> Fotoğraflar
                        </div>
                        <label className="inline-flex items-center gap-1 h-8 px-3 text-xs font-bold rounded-md border border-emerald-200 text-emerald-700 hover:bg-emerald-50 cursor-pointer">
                          <Plus className="w-3.5 h-3.5" /> Fotoğraf Ekle
                          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addServicePhotos(e.target.files); e.target.value = ''; }} />
                        </label>
                      </div>
                      {(serviceForm.photos || []).length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-2">Geliş/işlem fotoğrafları ekleyebilirsiniz (otomatik küçültülür).</p>
                      ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                          {(serviceForm.photos || []).map((src, idx) => (
                            <div key={idx} className="relative group aspect-square rounded-lg overflow-hidden border border-slate-200">
                              <img src={src} alt={`Foto ${idx + 1}`} onClick={() => openImagePreview(src, `Servis Fotoğrafı ${idx + 1}`)} className="w-full h-full object-cover cursor-zoom-in hover:opacity-90 transition-opacity" title="Görüntülemek için tıklayın" />
                              <button type="button" onClick={() => removeServicePhoto(idx)} className="absolute top-1 right-1 bg-rose-600 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" title="Kaldır">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Ödeme / Tahsilatlar */}
                    <div>
                      <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-emerald-700">
                        <DollarSign className="w-3.5 h-3.5" /> Ödeme / Tahsilatlar
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label>{(serviceForm.items || []).length > 0 ? 'Toplam Tutar (kalemlerden)' : 'Toplam Tutar (₺)'}</Label>
                          {(serviceForm.items || []).length > 0 ? (
                            <div className="h-10 flex items-center px-3 rounded-md bg-slate-50 border border-slate-200 font-bold text-slate-800 tabular-nums">₺ {formatPrice(serviceItemsTotal(serviceForm.items))}</div>
                          ) : (
                            <Input type="number" min="0" step="0.01" value={serviceForm.cost} onChange={(e) => setServiceForm({ ...serviceForm, cost: e.target.value })} placeholder="0" />
                          )}
                        </div>
                      </div>

                      {/* Tahsilatlar listesi (çoklu para birimi) */}
                      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="font-bold text-slate-700 text-xs uppercase tracking-wider flex items-center gap-2"><DollarSign className="w-3.5 h-3.5 text-emerald-600" /> Tahsilatlar</div>
                          <Button type="button" size="sm" variant="outline" onClick={addServiceCollection} className="h-8 text-xs font-bold border-emerald-200 text-emerald-700 hover:bg-emerald-50"><Plus className="w-3.5 h-3.5 mr-1" /> Tahsilat Ekle</Button>
                        </div>
                        {(serviceForm.collections || []).length === 0 ? (
                          <p className="text-xs text-slate-400 italic">Henüz tahsilat yok. Aldıkça ekleyin; kalan tutardan otomatik düşülür.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {(serviceForm.collections || []).map((c, ci) => (
                              <div key={c.id || ci} className="grid items-center gap-1.5" style={{ gridTemplateColumns: 'auto minmax(110px, 1fr) 90px 56px 76px 28px' }}>
                                <input type="date" value={c.date || ''} onChange={(e) => updateServiceCollection(ci, 'date', e.target.value)} className="h-8 px-1 border border-slate-200 rounded text-xs" />
                                <input value={c.description || ''} onChange={(e) => updateServiceCollection(ci, 'description', e.target.value)} placeholder="açıklama" className="h-8 px-2 border border-slate-200 rounded text-sm min-w-0" />
                                <input type="number" min="0" step="0.01" value={c.amount ?? ''} onChange={(e) => updateServiceCollection(ci, 'amount', e.target.value)} placeholder="tutar" className="h-8 px-1 border border-slate-200 rounded text-sm text-right tabular-nums" />
                                <select value={c.currency || 'TRY'} onChange={(e) => updateServiceCollection(ci, 'currency', e.target.value)} className="h-8 px-1 border border-slate-200 rounded text-sm bg-white"><option value="TRY">₺</option><option value="EUR">€</option><option value="USD">$</option></select>
                                <input type="number" step="0.01" value={c.currency !== 'TRY' ? (c.rate ?? '') : ''} onChange={(e) => updateServiceCollection(ci, 'rate', e.target.value)} placeholder="kur" title="1 birim = ? ₺ (boşsa güncel kur kullanılır)" disabled={c.currency === 'TRY'} className={`h-8 px-1 border border-slate-200 rounded text-sm text-right tabular-nums ${c.currency === 'TRY' ? 'invisible' : ''}`} />
                                <button type="button" onClick={() => removeServiceCollection(ci)} className="text-rose-400 hover:text-rose-600 shrink-0"><Trash2 className="w-4 h-4" /></button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {(() => {
                        const grossTotal = (serviceForm.items || []).length > 0 ? serviceItemsTotal(serviceForm.items) : (parseFloat(serviceForm.cost) || 0);
                        const discount = Math.min(parseFloat(serviceForm.discount_amount) || 0, grossTotal);
                        const total = grossTotal - discount;
                        const adv = parseFloat(serviceForm.advance_amount) || 0;
                        const collected = adv + serviceCollectedTRY(serviceForm.collections);
                        const remaining = total - collected;
                        const pct = total > 0 ? Math.max(0, Math.min(100, Math.round(collected / total * 100))) : 0;
                        const st = total <= 0 ? null : (remaining <= 0.01 ? { t: 'TAMAMLANDI', c: 'bg-emerald-500' } : (collected > 0.01 ? { t: `ÖDEME %${pct}`, c: 'bg-amber-500' } : { t: 'ÖDENMEDİ', c: 'bg-rose-500' }));
                        const over = remaining < -0.01;
                        return (
                          <div className="mt-3 rounded-xl bg-gradient-to-r from-[#1B3A5C] to-[#15293f] text-white px-4 py-3 space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-white/70">Toplam</span>
                              <span className="tabular-nums font-semibold">₺ {formatPrice(grossTotal)}</span>
                            </div>
                            {/* İndirim: % veya ₺ — biri girilince diğeri otomatik hesaplanır */}
                            <div className="flex items-center justify-between text-sm gap-2">
                              <span className="font-bold text-rose-200 shrink-0">İndirim</span>
                              <div className="flex items-center gap-1.5">
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number" min="0" max="100" step="0.1"
                                    value={serviceForm.discount_percent}
                                    onChange={(e) => setServiceDiscountPercent(e.target.value)}
                                    placeholder="0"
                                    className="w-16 h-7 px-1.5 rounded bg-white/10 border border-white/20 text-right text-sm tabular-nums text-rose-200 placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-rose-300"
                                  />
                                  <span className="text-white/50 text-xs">%</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-white/50 text-xs">₺</span>
                                  <input
                                    type="number" min="0" step="0.01"
                                    value={serviceForm.discount_amount}
                                    onChange={(e) => setServiceDiscountAmount(e.target.value)}
                                    placeholder="0"
                                    className="w-24 h-7 px-1.5 rounded bg-white/10 border border-white/20 text-right text-sm tabular-nums text-rose-200 placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-rose-300"
                                  />
                                </div>
                              </div>
                            </div>
                            {discount > 0 && (
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-white/70">İndirimli Toplam</span>
                                <span className="tabular-nums font-semibold">₺ {formatPrice(total)}</span>
                              </div>
                            )}
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-emerald-300">Tahsil Edilen</span>
                              <span className="tabular-nums font-semibold text-emerald-300">₺ {formatPrice(collected)}</span>
                            </div>
                            <div className="border-t border-white/15" />
                            <div className="flex items-end justify-between">
                              <div>
                                <div className="text-[10px] uppercase tracking-[0.18em] text-white/50">Kalan Tutar</div>
                                <div className="text-[11px] text-white/60">Teslimde tahsil edilecek</div>
                              </div>
                              <div className="text-right">
                                <div className="text-2xl font-black tabular-nums">₺ {formatPrice(Math.max(remaining, 0))}</div>
                                <div className="mt-1 flex justify-end">
                                  {over ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-violet-500">FAZLA ÖDEME</span> : (st && <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${st.c}`}>{st.t}</span>)}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Notlar (serbest metin) */}
                    <div>
                      <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-emerald-700">
                        <FileText className="w-3.5 h-3.5" /> Notlar
                      </div>
                      <textarea
                        value={serviceForm.notes}
                        onChange={(e) => setServiceForm({ ...serviceForm, notes: e.target.value })}
                        rows={3}
                        placeholder="Ek notlar ..."
                        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    {/* Servis geçmişi (düzenlemede) */}
                    {serviceEditingId && serviceHistory.length > 0 && (
                      <div>
                        <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-emerald-700">
                          <History className="w-3.5 h-3.5" /> Servis Geçmişi ({serviceHistory.length})
                        </div>
                        <div className="space-y-2">
                          {serviceHistory.map((h) => (
                            <div key={h.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm">
                              <div className="min-w-0">
                                <span className="font-bold text-slate-700">{h.order_no || '—'}</span>
                                <span className="text-slate-400 mx-2">·</span>
                                <span className="text-slate-600">{h.arrival_date || (h.created_at ? new Date(h.created_at).toLocaleDateString('tr-TR') : '')}</span>
                                {h.operations && <span className="text-slate-400 ml-2 truncate">— {h.operations.slice(0, 40)}</span>}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {h.cost != null && h.cost > 0 && <span className="font-semibold text-slate-700 tabular-nums">₺ {formatPrice(h.cost)}</span>}
                                <button type="button" onClick={() => window.open(`${API}/services/${h.id}/pdf`, '_blank')} className="text-blue-500 hover:text-blue-700" title="PDF"><Download className="w-4 h-4" /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 flex items-center justify-between gap-2">
                    <div>
                      {serviceEditingId && (
                        <Button variant="outline" onClick={() => window.open(`${API}/services/${serviceEditingId}/pdf`, '_blank')} className="border-blue-200 text-blue-700 hover:bg-blue-50 font-bold">
                          <Download className="w-4 h-4 mr-2" /> Teslim Formu (PDF)
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={() => setServiceDialogOpen(false)}>İptal</Button>
                      <Button onClick={saveService} disabled={serviceSaving} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                        {serviceSaving ? 'Kaydediliyor...' : (serviceEditingId ? 'Güncelle' : 'Kaydet')}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : viewingService ? (
              (() => {
                const s = viewingService;
                const meta = SERVICE_STATUS_META[s.status] || SERVICE_STATUS_META.received;
                const isTrailer = s.is_trailer || !(s.plate || '').trim();
                const vehicle = [s.vehicle_brand, s.vehicle_model].filter(Boolean).join(' ') || (isTrailer ? 'Çekme Karavan' : 'Araç belirtilmemiş');
                const total = Math.max(((s.items || []).length > 0 ? serviceItemsTotal(s.items) : (s.cost != null ? s.cost : 0)) - serviceDiscountTRY(s), 0);
                const collected = serviceCollectedTotalTRY(s);
                const remaining = Math.max(total - collected, 0);
                const pct = total > 0 ? Math.max(0, Math.min(100, Math.round(collected / total * 100))) : 0;
                const payStatus = total <= 0 ? null : (remaining <= 0.01 ? { t: 'TAMAMLANDI', c: 'bg-emerald-500' } : (collected > 0.01 ? { t: `ÖDEME %${pct}`, c: 'bg-amber-500' } : { t: 'ÖDENMEDİ', c: 'bg-rose-500' }));
                return (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <Button variant="ghost" size="sm" onClick={backFromServiceView} className="text-slate-500">← Listeye dön</Button>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button variant="outline" size="sm" onClick={() => openEditServiceDialog(s)} className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"><Edit className="w-4 h-4 mr-2" /> Düzenle</Button>
                        <Button variant="outline" size="sm" onClick={() => window.open(`${API}/services/${s.id}/pdf`, '_blank')} className="border-blue-300 text-blue-700 hover:bg-blue-50"><Download className="w-4 h-4 mr-2" /> PDF İndir</Button>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden max-w-4xl mx-auto">
                      <div className="relative overflow-hidden bg-gradient-to-br from-[#1B3A5C] to-[#15293f] text-white px-6 sm:px-8 py-7">
                        <div className="absolute right-[-40px] top-[-40px] h-40 w-40 rounded-full bg-white/5" />
                        <div className="relative flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-emerald-300 text-[11px] font-bold uppercase tracking-[0.18em] mb-2"><Wrench className="w-3.5 h-3.5" /> Servis Kaydı{s.order_no ? ` · ${s.order_no}` : ''}</div>
                            <h2 style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="text-3xl sm:text-4xl font-semibold leading-tight">{s.customer_name || vehicle}</h2>
                            {s.customer_name && <div className="mt-1 text-white/70 text-sm">{vehicle}</div>}
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {isTrailer ? <span className="px-2 py-0.5 bg-amber-400/20 text-amber-100 rounded text-xs font-bold border border-amber-300/30">Çekme Karavan</span> : (s.plate && <span className="px-2 py-0.5 bg-white/10 rounded text-xs font-mono font-bold tracking-wider">{s.plate}</span>)}
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${meta.badge}`}><span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} /> {meta.label}</span>
                            </div>
                          </div>
                          <div className="text-right text-sm shrink-0 space-y-2">
                            <div><div className="text-white/45 text-[10px] uppercase tracking-widest">Geliş</div><div className="font-semibold tabular-nums">{s.arrival_date || '—'}</div></div>
                            <div><div className="text-white/45 text-[10px] uppercase tracking-widest">Teslim</div><div className="font-semibold tabular-nums">{s.delivery_date || '—'}</div></div>
                          </div>
                        </div>
                      </div>

                      {(s.customer_name || s.phone) && (
                        <div className="px-6 sm:px-8 py-4 bg-[#FBFCFD] border-b border-slate-100 flex flex-wrap gap-x-8 gap-y-2 text-sm">
                          {s.customer_name && <div className="flex items-center gap-2"><Users className="w-4 h-4 text-slate-400" /><span className="font-semibold text-slate-800">{s.customer_name}</span></div>}
                          {s.phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-slate-400" /><span className="text-slate-700">{s.phone}</span></div>}
                        </div>
                      )}

                      <div className="px-4 sm:px-8 py-6 bg-white">
                        <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-[#1B3A5C]"><Package className="w-3.5 h-3.5" /> Yapılan İşlemler / Parçalar</div>
                        {(s.items || []).length > 0 ? (
                          <div className="ring-1 ring-slate-300 rounded-lg overflow-x-auto">
                            <table className="w-full border-collapse text-[13px]">
                              <thead><tr className="bg-[#1B3A5C] text-white text-[11px] uppercase tracking-wider">
                                <th className="px-2 py-1.5 text-left font-semibold border border-[#2E5A86] w-8">#</th>
                                <th className="px-2 py-1.5 text-left font-semibold border border-[#2E5A86]">İşlem / Parça</th>
                                <th className="px-2 py-1.5 text-center font-semibold border border-[#2E5A86] w-14">Adet</th>
                                <th className="px-2 py-1.5 text-right font-semibold border border-[#2E5A86] w-28">Birim ₺</th>
                                <th className="px-2 py-1.5 text-right font-semibold border border-[#2E5A86] w-28">Tutar ₺</th>
                              </tr></thead>
                              <tbody>
                                {(s.items || []).map((it, i) => {
                                  const qty = parseFloat(it.qty) || 0; const up = parseFloat(it.unit_price) || 0;
                                  return (<tr key={i} className="hover:bg-emerald-50/40">
                                    <td className="px-2 py-1 text-slate-400 tabular-nums border border-slate-200">{i + 1}</td>
                                    <td className="px-2 py-1 text-slate-700 border border-slate-200">{it.name}</td>
                                    <td className="px-2 py-1 text-center text-slate-500 tabular-nums border border-slate-200">{qty || ''}</td>
                                    <td className="px-2 py-1 text-right text-slate-500 tabular-nums border border-slate-200">₺ {formatPrice(up)}</td>
                                    <td className="px-2 py-1 text-right font-semibold text-[#1B3A5C] tabular-nums border border-slate-200">₺ {formatPrice(qty * up)}</td>
                                  </tr>);
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : s.operations ? (
                          <div className="text-sm text-slate-700 bg-slate-50 rounded-lg p-4 whitespace-pre-wrap break-words">{s.operations}</div>
                        ) : <p className="text-sm text-slate-400 italic">İşlem girilmemiş.</p>}
                      </div>

                      {Array.isArray(s.photos) && s.photos.length > 0 && (
                        <div className="px-4 sm:px-8 pb-6 bg-white">
                          <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-[#1B3A5C]"><Eye className="w-3.5 h-3.5" /> Fotoğraflar ({s.photos.length})</div>
                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                            {s.photos.map((src, i) => (
                              <a key={i} href={src} target="_blank" rel="noreferrer" className="block aspect-square rounded-lg overflow-hidden ring-1 ring-slate-200 hover:ring-emerald-400">
                                <img src={src} alt={`foto ${i + 1}`} className="w-full h-full object-cover" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {total > 0 && (
                        <div className="px-4 sm:px-8 pb-6 bg-[#FBFCFD]">
                          <div className="rounded-2xl bg-gradient-to-br from-[#1B3A5C] to-[#15293f] text-white px-5 py-5 shadow-lg grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2 text-sm">
                              {serviceDiscountTRY(s) > 0 ? (
                                <>
                                  <div className="flex justify-between text-white/65"><span>Toplam</span><span className="tabular-nums font-semibold text-white/70 line-through">₺ {formatPrice(total + serviceDiscountTRY(s))}</span></div>
                                  <div className="flex justify-between items-center rounded-lg bg-rose-500/25 border border-rose-300/40 px-2.5 py-1.5 -mx-1">
                                    <span className="font-bold text-rose-200">İndirim{s.discount_percent > 0 ? ` (%${s.discount_percent})` : ''}</span>
                                    <span className="tabular-nums font-black text-rose-200 text-base">-₺ {formatPrice(serviceDiscountTRY(s))}</span>
                                  </div>
                                  <div className="flex justify-between"><span className="font-semibold text-white">İndirimli Toplam</span><span className="tabular-nums font-bold text-white text-base">₺ {formatPrice(total)}</span></div>
                                </>
                              ) : (
                                <div className="flex justify-between text-white/65"><span>Toplam</span><span className="tabular-nums font-semibold text-white">₺ {formatPrice(total)}</span></div>
                              )}
                              <div className="flex justify-between text-white/65"><span>Tahsil Edilen</span><span className="tabular-nums font-semibold text-emerald-300">₺ {formatPrice(collected)}</span></div>
                            </div>
                            <div className="flex flex-col justify-center sm:items-end">
                              <div className="text-[11px] uppercase tracking-[0.2em] text-emerald-300 font-bold">Kalan Tutar</div>
                              <div className="text-4xl font-black tabular-nums text-white mt-0.5">₺ {formatPrice(remaining)}</div>
                              {payStatus && <div className="mt-3"><span className={`text-[11px] font-bold px-2.5 py-1 rounded-full text-white ${payStatus.c}`}>{payStatus.t}</span></div>}
                              <div className="w-full sm:w-44 h-2 bg-white/15 rounded-full mt-2 overflow-hidden"><div className="h-full bg-emerald-400 rounded-full" style={{ width: `${pct}%` }} /></div>
                            </div>
                          </div>
                        </div>
                      )}

                      {s.notes && (
                        <div className="px-4 sm:px-8 pb-8 bg-[#FBFCFD] space-y-3">
                          {s.notes && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm">
                              <div className="font-bold text-amber-800 text-xs uppercase tracking-wider mb-1">Notlar</div>
                              <div className="text-amber-900 whitespace-pre-wrap">{s.notes}</div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()
            ) : (
            <>
            {/* Başlık + Yeni kayıt */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                  <Wrench className="w-6 h-6 text-emerald-600" /> Servis Takip
                </h2>
                <p className="text-sm text-slate-500">Tadilata/bakıma gelen araçlar, yapılan işlemler ve teslim durumu</p>
              </div>
              <Button onClick={openNewServiceDialog} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl">
                <Plus className="w-4 h-4 mr-2" /> Yeni Servis Kaydı
              </Button>
            </div>

            {/* Durum filtresi (segmented — sözleşmeler gibi) */}
            <div className="inline-flex flex-wrap rounded-xl bg-slate-100 p-1 gap-1">
              {[
                { key: 'received', label: 'Bekliyor', Icon: Folder },
                { key: 'in_progress', label: 'Devam Ediyor', Icon: Wrench },
                { key: 'delivered', label: 'Teslim Edildi', Icon: CheckCircle2 },
                { key: 'all', label: 'Tümü', Icon: FileText },
              ].map(({ key, label, Icon }) => {
                const active = serviceStatusFilter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setServiceStatusFilter(key)}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    <Icon className="w-4 h-4" /> {label} <span className="text-slate-400 font-semibold">{serviceCounts[key]}</span>
                  </button>
                );
              })}
            </div>

            {/* Arama */}
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                value={serviceSearch}
                onChange={(e) => setServiceSearch(e.target.value)}
                placeholder="Müşteri, plaka, araç veya telefon ara..."
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>

            {/* Kayıt listesi */}
            {(() => {
              const q = serviceSearch.trim().toLocaleLowerCase('tr-TR');
              const filtered = (serviceStatusFilter === 'all'
                ? services
                : services.filter((s) => s.status === serviceStatusFilter)
              ).filter((s) => {
                if (!q) return true;
                return [s.customer_name, s.plate, s.vehicle_brand, s.vehicle_model, s.phone]
                  .filter(Boolean)
                  .some((v) => String(v).toLocaleLowerCase('tr-TR').includes(q));
              });
              if (filtered.length === 0) {
                return (
                  <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200">
                    <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">Henüz servis kaydı yok</p>
                    <p className="text-slate-400 text-sm mb-4">İlk aracını eklemek için “Yeni Servis Kaydı”na bas</p>
                  </div>
                );
              }
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filtered.map((s, si) => {
                    const meta = SERVICE_STATUS_META[s.status] || SERVICE_STATUS_META.received;
                    const isTrailer = s.is_trailer || !(s.plate || '').trim();
                    const vehicle = [s.vehicle_brand, s.vehicle_model].filter(Boolean).join(' ') || (isTrailer ? 'Çekme Karavan' : 'Araç belirtilmemiş');
                    const total = Math.max(((s.items || []).length > 0 ? serviceItemsTotal(s.items) : (s.cost != null ? s.cost : 0)) - serviceDiscountTRY(s), 0);
                    const collected = serviceCollectedTotalTRY(s);
                    const remaining = Math.max(total - collected, 0);
                    const pct = total > 0 ? Math.max(0, Math.min(100, Math.round(collected / total * 100))) : 0;
                    const payStatus = total <= 0 ? null : (collected - total > 0.01 ? { t: 'FAZLA ÖDEME', c: 'bg-violet-500 text-white' } : (remaining <= 0.01 ? { t: 'TAMAMLANDI', c: 'bg-emerald-500 text-white' } : (collected > 0.01 ? { t: `ÖDEME %${pct}`, c: 'bg-amber-500 text-white' } : { t: 'ÖDENMEDİ', c: 'bg-rose-500 text-white' })));
                    return (
                      <div key={s.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${s.status === 'received' ? 'bg-amber-50 text-amber-600' : s.status === 'in_progress' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
                              <Wrench className="w-5 h-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              {s.order_no && <div className="text-[10px] font-black tracking-wider text-slate-400 mb-0.5">{s.order_no}</div>}
                              <div className="font-bold text-slate-800 truncate" title={s.customer_name || vehicle}>{s.customer_name || vehicle}</div>
                              <div className="text-sm text-slate-500 truncate" title={vehicle}>{vehicle}</div>
                              {isTrailer ? (
                                <div className="inline-block mt-1 px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-xs font-bold border border-amber-200">Çekme Karavan</div>
                              ) : (
                                s.plate && <div className="inline-block mt-1 px-2 py-0.5 bg-slate-100 rounded text-xs font-mono font-bold tracking-wider text-slate-700">{s.plate}</div>
                              )}
                            </div>
                          </div>
                          {/* Sıra düzenleme okları (görünen listede komşusuyla yer değiştirir) */}
                          <div className="flex flex-col shrink-0 -my-1">
                            <button type="button" disabled={si === 0} onClick={() => swapServices(s.id, filtered[si - 1]?.id)} title="Yukarı taşı" className="text-slate-300 hover:text-emerald-600 disabled:opacity-30 disabled:hover:text-slate-300">
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button type="button" disabled={si === filtered.length - 1} onClick={() => swapServices(s.id, filtered[si + 1]?.id)} title="Aşağı taşı" className="text-slate-300 hover:text-emerald-600 disabled:opacity-30 disabled:hover:text-slate-300">
                              <ChevronDown className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${meta.badge}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} /> {meta.label}
                            </span>
                            {payStatus && <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${payStatus.c}`}>{payStatus.t}</span>}
                          </div>
                        </div>

                        {s.phone && (
                          <div className="text-sm text-slate-600">
                            <div className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-slate-400" /> {s.phone}</div>
                          </div>
                        )}

                        {Array.isArray(s.items) && s.items.length > 0 ? (
                          <div className="text-xs text-slate-500 flex items-center gap-1.5"><Package className="w-3.5 h-3.5 text-slate-400" /> {s.items.length} kalem{Array.isArray(s.photos) && s.photos.length > 0 ? ` · ${s.photos.length} foto` : ''}</div>
                        ) : (s.operations && (
                          <div className="text-sm text-slate-700 bg-slate-50 rounded-lg p-2.5 whitespace-pre-wrap break-words line-clamp-3">
                            {s.operations}
                          </div>
                        ))}

                        <div className="flex items-center justify-between text-xs text-slate-500 mt-auto pt-1">
                          <span>Geliş: <strong className="text-slate-700">{s.arrival_date || '—'}</strong></span>
                          <span>Teslim: <strong className="text-slate-700">{s.delivery_date || '—'}</strong></span>
                        </div>

                        {total > 0 && (
                          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs space-y-1">
                            <div className="flex items-center justify-between"><span className="text-slate-500">Toplam</span><span className="font-bold text-slate-700 tabular-nums">₺ {formatPrice(total)}</span></div>
                            {collected > 0 && <div className="flex items-center justify-between"><span className="text-slate-500">Tahsil Edilen</span><span className="font-semibold text-slate-600 tabular-nums">₺ {formatPrice(collected)}</span></div>}
                            <div className="flex items-center justify-between"><span className="text-slate-500">Kalan</span><span className="font-black text-emerald-700 tabular-nums">₺ {formatPrice(remaining)}</span></div>
                          </div>
                        )}

                        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 mt-auto">
                          <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs" onClick={() => openServiceView(s)}>
                            <Eye className="w-4 h-4 mr-1" /> Görüntüle
                          </Button>
                          {s.status !== 'delivered' && (
                            <Button size="sm" variant="ghost" className="text-slate-600" onClick={() => setServiceStatus(s.id, s.status === 'received' ? 'in_progress' : 'delivered')} title={s.status === 'received' ? 'İşleme Al' : 'Teslim Et'}>
                              {s.status === 'received' ? <Wrench className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="text-blue-600 hover:text-blue-800" onClick={() => window.open(`${API}/services/${s.id}/pdf`, '_blank')} title="Teslim Formu (PDF)">
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-slate-500" onClick={() => openEditServiceDialog(s)} title="Düzenle">
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => deleteService(s.id)} title="Sil">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            </>
            )}
          </TabsContent>

              </div> {/* max-w container */}
            </div> {/* Right Main Work Area */}
          </Tabs> {/* Root Sidebar Tabs */}

        {/* Kategori Ürün Atama Dialog'u */}
      <Dialog open={showCategoryProductDialog} onOpenChange={setShowCategoryProductDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div 
                className="w-4 h-4 rounded-full" 
                style={{backgroundColor: selectedCategoryForProducts?.color}}
              ></div>
              "{selectedCategoryForProducts?.name}" Kategorisine Ürün Ekle
            </DialogTitle>
            <DialogDescription>
              Kategorisi olmayan {uncategorizedProducts.length} ürün arasından seçim yapabilirsiniz
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            {/* Arama Çubuğu */}
            <div className="mb-4">
              <div className="relative">
                <Input
                  placeholder="Ürün ara... (tüm ürünler arasında)"
                  value={categoryDialogSearchQuery}
                  onChange={(e) => setCategoryDialogSearchQuery(e.target.value)}
                  className="pr-10"
                />
                {loadingCategoryProducts && (
                  <RefreshCw className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 animate-spin text-slate-400" />
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {allProductsForCategory.length} toplam ürün • {uncategorizedProducts.length} kategorisiz ürün
              </p>
            </div>
            
            {uncategorizedProducts.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Package className="w-12 h-12 mx-auto mb-4 text-slate-400" />
                <p>Kategorisi olmayan ürün bulunmuyor.</p>
                <p className="text-sm">Tüm ürünler zaten kategorilere atanmış.</p>
              </div>
            ) : (
              <>
                {/* Tümünü Seç/Bırak Butonu */}
                <div className="flex items-center justify-between mb-4 pb-4 border-b">
                  <p className="text-sm text-slate-600">
                    {selectedProductsForCategory.size} / {uncategorizedProducts.length} ürün seçildi
                  </p>
                  <div className="space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const allIds = new Set(uncategorizedProducts.map(p => p.id));
                        setSelectedProductsForCategory(allIds);
                      }}
                    >
                      Tümünü Seç
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedProductsForCategory(new Set())}
                    >
                      Seçimi Temizle
                    </Button>
                  </div>
                </div>

                {/* Ürün Listesi */}
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {uncategorizedProducts.map((product) => {
                    const company = companies.find(c => c.id === product.company_id);
                    const isSelected = selectedProductsForCategory.has(product.id);
                    
                    return (
                      <div
                        key={product.id}
                        className={`flex items-center p-3 rounded-lg border transition-colors cursor-pointer ${
                          isSelected 
                            ? 'bg-blue-50 border-blue-200' 
                            : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                        onClick={() => {
                          const newSelected = new Set(selectedProductsForCategory);
                          if (isSelected) {
                            newSelected.delete(product.id);
                          } else {
                            newSelected.add(product.id);
                          }
                          setSelectedProductsForCategory(newSelected);
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}} // Handled by div onClick
                          className="mr-3"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-slate-900">{product.name}</div>
                          <div className="text-sm text-slate-500">
                            {company?.name || 'Bilinmeyen Firma'} • ₺ {formatPrice(product.list_price_try || 0)}
                          </div>
                        </div>
                        {isSelected && (
                          <Check className="w-5 h-5 text-blue-600" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowCategoryProductDialog(false);
                setSelectedProductsForCategory(new Set());
              }}
            >
              İptal
            </Button>
            {selectedProductsForCategory.size > 0 && (
              <Button 
                onClick={assignProductsToCategory}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                {selectedProductsForCategory.size} Ürünü Kategoriye Ekle
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hızlı Teklif Oluşturma Dialog'u */}
      <Dialog open={showQuickQuoteDialog} onOpenChange={setShowQuickQuoteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              Hızlı Teklif Oluştur
            </DialogTitle>
            <DialogDescription>
              {selectedProducts.size} seçili ürün için teklif oluşturuluyor
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="space-y-4">
              {/* Müşteri Adı */}
              <div>
                <Label htmlFor="customer-name">Müşteri Adı *</Label>
                <Input
                  id="customer-name"
                  placeholder="Örn: Mehmet Yılmaz"
                  value={quickQuoteCustomerName}
                  onChange={(e) => setQuickQuoteCustomerName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && quickQuoteCustomerName.trim()) {
                      createQuickQuote();
                    }
                  }}
                  className="mt-1"
                  autoFocus
                />
              </div>
              
              {/* Teklif Notları */}
              <div>
                <Label htmlFor="quote-notes">Notlar (Opsiyonel)</Label>
                <textarea
                  id="quote-notes"
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-1"
                  value={quickQuoteNotes}
                  onChange={(e) => setQuickQuoteNotes(e.target.value)}
                  placeholder="Teklif ile ilgili notlar..."
                />
              </div>

              {/* Seçili Ürün Özeti */}
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-sm font-medium text-slate-700 mb-2">Seçili Ürün Özeti:</div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {getSelectedProductsData().slice(0, 3).map((product, index) => (
                    <div key={product.id} className="text-xs text-slate-600 flex justify-between">
                      <span className="truncate">{product.name}</span>
                      <span>₺{formatPrice(product.list_price_try || 0)}</span>
                    </div>
                  ))}
                  {selectedProducts.size > 3 && (
                    <div className="text-xs text-slate-500 italic">
                      ... ve {selectedProducts.size - 3} ürün daha
                    </div>
                  )}
                </div>
                <div className="mt-2 pt-2 border-t text-sm font-medium">
                  Toplam: ₺{formatPrice(calculateQuoteTotals.totalListPrice)}
                </div>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowQuickQuoteDialog(false);
                setQuickQuoteCustomerName('');
              }}
            >
              İptal
            </Button>
            <Button 
              onClick={createQuickQuote}
              disabled={!quickQuoteCustomerName.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <FileText className="w-4 h-4 mr-2" />
              Teklif Oluştur
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Package Create/Edit Dialog */}
      <Dialog open={showPackageDialog} onOpenChange={setShowPackageDialog}>
        <DialogContent className="max-w-6xl w-[80vw] max-h-[90vh] overflow-y-auto p-0">
          {/* Modern Header */}
          <div className="bg-gradient-to-r from-teal-600 to-cyan-600 p-6 text-white">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                <Package className="w-7 h-7" />
                {editingPackage ? 'Paketi Düzenle' : 'Yeni Paket Oluştur'}
              </DialogTitle>
              <DialogDescription className="text-teal-50 text-base mt-2">
                Paket bilgilerini girin ve ürünleri seçin
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
            {/* Left Column - Package Info */}
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border-2 border-blue-200 shadow-lg">
                <h3 className="text-lg font-bold text-blue-900 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Paket Bilgileri
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="package-name" className="text-blue-900 font-medium">
                      Paket Adı <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="package-name"
                      value={packageForm.name}
                      onChange={(e) => setPackageForm({...packageForm, name: e.target.value})}
                      placeholder="Örn: Premium Karavan Paketi"
                      className="mt-1 border-blue-300 focus:border-blue-500"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="package-price" className="text-blue-900 font-medium">
                      Satış Fiyatı (₺)
                    </Label>
                    <Input
                      id="package-price"
                      type="number"
                      step="0.01"
                      value={packageForm.sale_price}
                      onChange={(e) => setPackageForm({...packageForm, sale_price: e.target.value})}
                      placeholder="800000"
                      className="mt-1 border-blue-300 focus:border-blue-500"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="package-discount" className="text-blue-900 font-medium">
                      İndirim Yüzdesi (%)
                    </Label>
                    <Input
                      id="package-discount"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={packageForm.discount_percentage}
                      onChange={(e) => setPackageForm({...packageForm, discount_percentage: e.target.value})}
                      placeholder="0"
                      className="mt-1 border-blue-300 focus:border-blue-500"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="package-notes" className="text-blue-900 font-medium">
                      Notlar
                    </Label>
                    <textarea
                      id="package-notes"
                      className="flex min-h-[100px] w-full rounded-md border-2 border-blue-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none mt-1"
                      value={packageForm.notes}
                      onChange={(e) => setPackageForm({...packageForm, notes: e.target.value})}
                      placeholder="Paket ile ilgili notlar, özel açıklamalar..."
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="package-image" className="text-blue-900 font-medium">
                      Görsel URL
                    </Label>
                    <Input
                      id="package-image"
                      value={packageForm.image_url}
                      onChange={(e) => setPackageForm({...packageForm, image_url: e.target.value})}
                      placeholder="https://example.com/image.jpg"
                      className="mt-1 border-blue-300 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Products Selection */}
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border-2 border-green-200 shadow-lg">
                <h3 className="text-lg font-bold text-green-900 mb-4 flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Ürünler (Yakında)
                </h3>
                
                <div className="text-center py-8 text-green-700">
                  <Package className="w-16 h-16 mx-auto mb-4 opacity-30" />
                  <p className="text-sm">Ürün seçimi özelliği yakında eklenecek</p>
                  <p className="text-xs mt-2 text-green-600">Şimdilik paket bilgilerini kaydedebilirsiniz</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer with Actions */}
          <div className="border-t bg-slate-50 p-6 flex items-center justify-between">
            <div className="text-sm text-slate-600">
              {packageForm.name ? (
                <span className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-600" />
                  Paket adı girildi
                </span>
              ) : (
                <span className="text-red-600">* Paket adı zorunludur</span>
              )}
            </div>
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                onClick={() => setShowPackageDialog(false)}
                className="px-6"
              >
                İptal
              </Button>
              <Button 
                onClick={editingPackage ? updatePackage : createPackage}
                className="bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white px-8"
                disabled={!packageForm.name}
              >
                {editingPackage ? (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Güncelle
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Oluştur
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Package Products Selection Dialog - Replaced with full page edit */}

      {/* Package Copy Dialog */}
      <Dialog open={copyPackageDialog} onOpenChange={setCopyPackageDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Paket Kopyala</DialogTitle>
            <DialogDescription>
              {packageToCopy?.name} paketini kopyalayarak yeni bir paket oluşturun.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="copy-name" className="text-right">
                Yeni Ad
              </Label>
              <Input
                id="copy-name"
                value={copyPackageName}
                onChange={(e) => setCopyPackageName(e.target.value)}
                className="col-span-3"
                placeholder="Yeni paket adı..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setCopyPackageDialog(false)}
            >
              İptal
            </Button>
            <Button onClick={copyPackage} disabled={!copyPackageName.trim()}>
              <Copy className="w-4 h-4 mr-2" />
              Kopyala
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Edit Dialog */}
      <Dialog open={editingCategory !== null} onOpenChange={(open) => !open && setEditingCategory(null)}>
        <DialogContent className="max-w-md bg-white border border-slate-100 shadow-xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-slate-800">Kategoriyi Düzenle</DialogTitle>
            <DialogDescription className="text-slate-500">
              Kategori adı, açıklaması, rengi ve küçük resmini güncelleyin.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Kategori Adı</Label>
              <Input
                value={editCategoryForm.name}
                onChange={(e) => setEditCategoryForm({...editCategoryForm, name: e.target.value})}
                placeholder="Örn: Mobilya"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Açıklama (Opsiyonel)</Label>
              <Input
                value={editCategoryForm.description}
                onChange={(e) => setEditCategoryForm({...editCategoryForm, description: e.target.value})}
                placeholder="Kategoriye ait kısa bir açıklama"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Küçük Resim URL (Opsiyonel)</Label>
              <Input
                value={editCategoryForm.image_url}
                onChange={(e) => setEditCategoryForm({...editCategoryForm, image_url: e.target.value})}
                placeholder="https://example.com/image.png"
              />
            </div>
            {editingCategory && (
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                  Kategori Ürünlerinin Görsellerinden Seç
                </Label>
                {(() => {
                  const categoryProductsWithImages = products.filter(
                    (p) => p.category_id === editingCategory.id && p.image_url
                  );
                  
                  // Benzersiz resim URL'lerini filtrele
                  const uniqueImages = Array.from(new Set(categoryProductsWithImages.map(p => p.image_url)))
                    .map(url => categoryProductsWithImages.find(p => p.image_url === url));

                  if (uniqueImages.length === 0) {
                    return (
                      <p className="text-xs text-slate-400 italic py-1">
                        Bu kategoride görseli olan ürün bulunmamaktadır.
                      </p>
                    );
                  }

                  return (
                    <div className="w-full max-w-[395px] overflow-x-auto py-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                      <div className="flex gap-2 min-w-max">
                        {uniqueImages.map((prod) => (
                          <button
                            key={prod.id}
                            type="button"
                            onClick={() => setEditCategoryForm({ ...editCategoryForm, image_url: prod.image_url })}
                            className={`relative w-12 h-12 rounded-lg border-2 overflow-hidden flex-shrink-0 transition-all ${
                              editCategoryForm.image_url === prod.image_url 
                                ? 'border-emerald-600 ring-2 ring-emerald-100 scale-95' 
                                : 'border-slate-200 hover:border-slate-300'
                            }`}
                            title={prod.name}
                          >
                            <img 
                              src={prod.image_url} 
                              alt={prod.name} 
                              className="w-full h-full object-cover pointer-events-none"
                            />
                            {editCategoryForm.image_url === prod.image_url && (
                              <div className="absolute inset-0 bg-emerald-600/10 flex items-center justify-center">
                                <div className="bg-emerald-600 text-white rounded-full p-0.5">
                                  <Check className="w-3 h-3 stroke-[3]" />
                                </div>
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Renk</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={editCategoryForm.color}
                  onChange={(e) => setEditCategoryForm({...editCategoryForm, color: e.target.value})}
                  className="w-16 h-10 p-1"
                />
                <Input
                  value={editCategoryForm.color}
                  onChange={(e) => setEditCategoryForm({...editCategoryForm, color: e.target.value})}
                  placeholder="#3B82F6"
                  className="flex-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditingCategory(null)}>
              İptal
            </Button>
            <Button onClick={updateCategory} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
              Güncelle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Group Create/Edit Dialog */}
      <Dialog open={showCategoryGroupDialog} onOpenChange={setShowCategoryGroupDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingCategoryGroup ? 'Kategori Grubunu Düzenle' : 'Yeni Kategori Grubu'}
            </DialogTitle>
            <DialogDescription>
              Kategorilerinizi mantıksal gruplar halinde düzenleyin
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="group-name">Grup Adı</Label>
                <Input
                  id="group-name"
                  value={categoryGroupForm.name}
                  onChange={(e) => setCategoryGroupForm({...categoryGroupForm, name: e.target.value})}
                  placeholder="Örn: Enerji Grubu"
                />
              </div>
              <div>
                <Label htmlFor="group-color">Renk</Label>
                <div className="flex gap-2">
                  <Input
                    id="group-color"
                    type="color"
                    value={categoryGroupForm.color}
                    onChange={(e) => setCategoryGroupForm({...categoryGroupForm, color: e.target.value})}
                    className="w-16"
                  />
                  <Input
                    value={categoryGroupForm.color}
                    onChange={(e) => setCategoryGroupForm({...categoryGroupForm, color: e.target.value})}
                    placeholder="#6B7280"
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
            <div>
              <Label htmlFor="group-description">Açıklama (Opsiyonel)</Label>
              <Input
                id="group-description"
                value={categoryGroupForm.description}
                onChange={(e) => setCategoryGroupForm({...categoryGroupForm, description: e.target.value})}
                placeholder="Grup açıklaması"
              />
            </div>
            <div>
              <Label>Kategoriler</Label>
              <div className="mt-2 space-y-2 max-h-60 overflow-y-auto border rounded-lg p-3">
                {categories.map((category) => (
                  <div key={category.id} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`category-${category.id}`}
                      checked={categoryGroupForm.category_ids.includes(category.id)}
                      onChange={(e) => {
                        const newCategoryIds = e.target.checked
                          ? [...categoryGroupForm.category_ids, category.id]
                          : categoryGroupForm.category_ids.filter(id => id !== category.id);
                        setCategoryGroupForm({
                          ...categoryGroupForm,
                          category_ids: newCategoryIds
                        });
                      }}
                      className="rounded border-gray-300"
                    />
                    <label 
                      htmlFor={`category-${category.id}`}
                      className="flex items-center gap-2 flex-1 cursor-pointer"
                    >
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      <span className="text-sm">{category.name}</span>
                    </label>
                  </div>
                ))}
                {categories.length === 0 && (
                  <p className="text-sm text-slate-500">Henüz kategori bulunmuyor</p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowCategoryGroupDialog(false);
                setEditingCategoryGroup(null);
                setCategoryGroupForm({ name: '', description: '', color: '#6B7280', category_ids: [] });
              }}
            >
              İptal
            </Button>
            <Button 
              onClick={editingCategoryGroup ? updateCategoryGroup : createCategoryGroup}
              disabled={!categoryGroupForm.name.trim()}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {editingCategoryGroup ? 'Güncelle' : 'Oluştur'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

        </div>
      )}

      {/* Görsel Önizleme Modal */}
      <Dialog open={showImagePreview} onOpenChange={setShowImagePreview}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-4">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm">
                  🖼️
                </div>
                {previewImageTitle}
              </DialogTitle>
            </div>
            <DialogDescription>
              Görseli yakınlaştırmak için tıklayın. Yeni sekmede açmak için sağ tıklayın.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex items-center justify-center bg-gray-50 rounded-lg min-h-[400px] max-h-[70vh] overflow-hidden">
            {previewImageUrl && (
              <img 
                src={previewImageUrl} 
                alt={previewImageTitle}
                className="max-w-full max-h-full object-contain cursor-zoom-in hover:scale-105 transition-transform duration-200"
                onClick={() => window.open(previewImageUrl, '_blank')}
                onError={(e) => {
                  e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjNmNGY2Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzlmYTJhOCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkfDtnJzZWwgWcO8a2xlbmVtZWRpPC90ZXh0Pjwvc3ZnPg==';
                  e.target.alt = 'Görsel yüklenemedi';
                }}
                style={{ maxHeight: '70vh' }}
              />
            )}
          </div>
          
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="text-sm text-gray-500">
              💡 İpucu: Görseli yeni sekmede açmak için tıklayın
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.open(previewImageUrl, '_blank')}
                className="flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Yeni Sekmede Aç
              </Button>
              <Button 
                variant="default" 
                size="sm"
                onClick={closeImagePreview}
              >
                Kapat
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Gelişmiş Ürün Detay Modalı */}
      <Dialog open={showProductDetail} onOpenChange={setShowProductDetail}>
        <DialogContent className="max-w-3xl max-h-[90vh] p-5 bg-white rounded-3xl border border-slate-100 shadow-2xl">
          {detailProduct && (() => {
            const product = detailProduct;
            const category = categories.find(c => c.id === product.category_id);
            const inQuote = selectedProducts.has(product.id);
            const quoteQuantity = inQuote ? selectedProducts.get(product.id) : 0;
            
            // Calculate TRY Price
            let priceTRY = product.list_price || 0;
            if (product.currency === 'USD') {
              priceTRY = priceTRY * (exchangeRates.USD || 34.0);
            } else if (product.currency === 'EUR') {
              priceTRY = priceTRY * (exchangeRates.EUR || 37.0);
            }

            // Calculate TRY Discounted Price if visible
            let discPriceTRY = product.discounted_price || product.list_price || 0;
            if (product.currency === 'USD') {
              discPriceTRY = discPriceTRY * (exchangeRates.USD || 34.0);
            } else if (product.currency === 'EUR') {
              discPriceTRY = discPriceTRY * (exchangeRates.EUR || 37.0);
            }
            
            return (
              <>
                <DialogHeader className="border-b border-slate-100 pb-3">
                  <div className="flex items-center justify-between">
                    <DialogTitle className="text-xl font-bold text-slate-800 flex items-center gap-2">
                      <span>🔍 Ürün Detayları</span>
                    </DialogTitle>
                  </div>
                </DialogHeader>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4 overflow-y-auto max-h-[65vh]">
                  {/* Left Column - Large Image */}
                  <div className="flex flex-col gap-3">
                    <div className="relative aspect-square bg-slate-50 border border-slate-150 rounded-2xl overflow-hidden flex items-center justify-center group shadow-xxs">
                      {product.image_url ? (
                        <img 
                          src={product.image_url} 
                          alt={product.name}
                          onClick={() => window.open(product.image_url, '_blank')}
                          className="max-w-full max-h-full object-contain cursor-zoom-in group-hover:scale-[1.02] transition-transform duration-200"
                        />
                      ) : (
                        <div className="text-slate-300 flex flex-col items-center gap-2 select-none">
                          <Package className="w-16 h-16 stroke-[1.2]" />
                          <span className="text-xs font-semibold text-slate-400">Ürün Görseli Yok</span>
                        </div>
                      )}
                      
                      {product.brand && (
                        <span className="absolute top-3 left-3 bg-white/95 text-slate-700 text-[10px] font-black tracking-wider uppercase px-2 py-1 rounded-lg border border-slate-200/50 shadow-xxs">
                          {product.brand}
                        </span>
                      )}
                    </div>
                    {product.image_url && (
                      <div className="text-[10px] font-bold text-slate-400 text-center select-none">
                        💡 Görseli yeni sekmede açmak için üzerine tıklayın
                      </div>
                    )}
                  </div>
                  
                  {/* Right Column - Product Meta and Actions */}
                  <div className="flex flex-col justify-between h-full space-y-4">
                    <div className="space-y-3.5 flex-1">
                      {/* Category Badge & Name */}
                      <div className="space-y-2">
                        {category ? (
                          <div 
                            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border"
                            style={{ 
                              backgroundColor: `${category.color}15`, 
                              borderColor: `${category.color}35`,
                              color: category.color 
                            }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: category.color }}></span>
                            {category.name}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 border border-slate-200 text-slate-500">
                            Kategorisiz
                          </span>
                        )}
                        
                        <h2 className="text-lg font-black text-slate-800 leading-snug break-words">
                          {product.name}
                        </h2>
                      </div>
                      
                      {/* Price Details Card */}
                      <div className="bg-slate-50/75 border border-slate-200/60 rounded-2xl p-4 space-y-3">
                        <div className="flex justify-between items-baseline border-b border-slate-200/40 pb-2">
                          <span className="text-xs font-bold text-slate-500">Birim Satış Fiyatı:</span>
                          <div className="text-right">
                            <span className="text-lg font-black text-slate-900">
                              {getCurrencySymbol(product.currency)} {formatPrice(product.list_price)}
                            </span>
                            <div className="text-[11px] font-bold text-emerald-650 mt-0.5">
                              ₺ {formatPrice(priceTRY)}
                            </div>
                          </div>
                        </div>
                        
                        {/* Cost/Discounted Price if visible */}
                        {(showDiscountedPrices || showQuoteDiscountedPrices) && (
                          <div className="flex justify-between items-baseline pt-1">
                            <span className="text-xs font-bold text-purple-600">Geliş Maliyeti (İskontolu):</span>
                            <div className="text-right">
                              <span className="text-sm font-extrabold text-purple-700">
                                {getCurrencySymbol(product.currency)} {formatPrice(product.discounted_price || product.list_price)}
                              </span>
                              <div className="text-[10px] font-bold text-purple-500 mt-0.5">
                                ₺ {formatPrice(discPriceTRY)}
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* Exchange Rates metadata info */}
                        <div className="text-[9px] font-semibold text-slate-400 select-none pt-1">
                          📊 Çevrim Oranı: 1 USD = ₺{formatExchangeRate(exchangeRates.USD)} | 1 EUR = ₺{formatExchangeRate(exchangeRates.EUR)}
                        </div>
                      </div>
                      
                      {/* Description */}
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider select-none">Açıklama</span>
                        <p className="text-sm text-slate-500 leading-relaxed max-h-[140px] overflow-y-auto pr-1 break-words">
                          {product.description || "Bu ürün için herhangi bir açıklama bulunmamaktadır."}
                        </p>
                      </div>
                    </div>
                    
                    {/* Add to Quote controls inside the footer */}
                    <div className="border-t border-slate-100 pt-4 mt-auto">
                      {inQuote ? (
                        <div className="bg-emerald-50/50 border border-emerald-100/60 rounded-2xl p-3 flex items-center justify-between">
                          <span className="text-xs font-black text-emerald-700 flex items-center gap-1 select-none">
                            <Check className="w-4 h-4 stroke-[3]" /> Teklifinizde Seçili
                          </span>
                          
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleProductSelection(product.id, Math.max(0, quoteQuantity - 1))}
                              className="w-8 h-8 bg-white hover:bg-emerald-50 border border-slate-200 rounded-xl flex items-center justify-center text-slate-700 hover:text-emerald-700 transition-colors shadow-xxs text-sm font-bold cursor-pointer"
                            >
                              -
                            </button>
                            <span className="w-8 text-center text-sm font-black text-slate-800 select-none">
                              {quoteQuantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleProductSelection(product.id, quoteQuantity + 1)}
                              className="w-8 h-8 bg-white hover:bg-emerald-50 border border-slate-200 rounded-xl flex items-center justify-center text-slate-700 hover:text-emerald-700 transition-colors shadow-xxs text-sm font-bold cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          onClick={() => {
                            toggleProductSelection(product.id, 1);
                            toast.success(`"${product.name}" teklife eklendi.`);
                          }}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow"
                        >
                          <Plus className="w-5 h-5" />
                          Teklife Ekle (1 Adet)
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Toplu Fiyat Güncelleme Modal */}
      <Dialog open={showBulkPriceModal} onOpenChange={setShowBulkPriceModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Toplu Fiyat Güncelleme</DialogTitle>
            <DialogDescription>
              {selectedProductsForBulk.size} ürünün fiyatını güncelleyin
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Fiyat Türü</label>
              <select
                value={bulkPriceApplyTo}
                onChange={(e) => setBulkPriceApplyTo(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="list_price">Liste Fiyatı</option>
                <option value="discounted_price">İndirimli Fiyat</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Değişiklik Tipi</label>
              <select
                value={bulkPriceChangeType}
                onChange={(e) => setBulkPriceChangeType(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="percentage">Yüzde (%)</option>
                <option value="fixed">Sabit Miktar</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Değer {bulkPriceChangeType === 'percentage' ? '(%)' : ''}
              </label>
              <Input
                type="number"
                step="0.01"
                value={bulkPriceChangeValue}
                onChange={(e) => setBulkPriceChangeValue(e.target.value)}
                placeholder={bulkPriceChangeType === 'percentage' ? 'Örn: 10' : 'Örn: 50'}
              />
              <p className="text-xs text-slate-500 mt-1">
                {bulkPriceChangeType === 'percentage'
                  ? `${bulkPriceChangeValue > 0 ? '+' : ''}${bulkPriceChangeValue}% değişiklik uygulanacak`
                  : `${bulkPriceChangeValue > 0 ? '+' : ''}${bulkPriceChangeValue} eklenecek/çıkarılacak`
                }
              </p>
              {bulkPriceChangeType === 'fixed' && (
                <p className="text-xs font-semibold text-amber-600 mt-1">
                  ⚠️ Sabit tutar her ürünün KENDİ para biriminde uygulanır: USD ürüne +50 → +50$, EUR ürüne +50 → +50€.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkPriceModal(false)}>
              İptal
            </Button>
            <Button onClick={bulkUpdatePrice} className="bg-orange-600 hover:bg-orange-700">
              Güncelle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toplu Kategori Atama Modal */}
      <Dialog open={showBulkCategoryModal} onOpenChange={setShowBulkCategoryModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Toplu Kategori Atama</DialogTitle>
            <DialogDescription>
              {selectedProductsForBulk.size} ürüne kategori atayın
            </DialogDescription>
          </DialogHeader>

          <div>
            <label className="block text-sm font-medium mb-2">Kategori</label>
            <select
              value={bulkCategoryId}
              onChange={(e) => setBulkCategoryId(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
            >
              <option value="">Kategori seçin</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkCategoryModal(false)}>
              İptal
            </Button>
            <Button onClick={bulkUpdateCategory} className="bg-purple-600 hover:bg-purple-700">
              Ata
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Web Scraping Dialog */}
      <Dialog open={showScrapeDialog} onOpenChange={setShowScrapeDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              Web Sitesinden Ürün Yükle
            </DialogTitle>
            <DialogDescription>
              Bir e-ticaret sitesinin URL'sini girin, ürünleri otomatik olarak çekelim
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* URL Girişi */}
            <div className="flex gap-2">
              <Input
                placeholder="https://www.example.com/urunler"
                value={scrapeUrl}
                onChange={(e) => setScrapeUrl(e.target.value)}
                className="flex-1"
                disabled={isScraping}
              />
              <Button 
                onClick={scrapeWebsite} 
                disabled={isScraping || !scrapeUrl.trim()}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isScraping ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Yükleniyor...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Ürünleri Çek
                  </>
                )}
              </Button>
            </div>
            
            {/* Firma Seçimi */}
            {scrapedProducts.length > 0 && (
              <>
                <div>
                  <label className="text-sm font-medium mb-2 block">Firma Seçin</label>
                  <select
                    value={scrapeCompanyId}
                    onChange={(e) => setScrapeCompanyId(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="">Firma seçin...</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                
                {/* Ürün Listesi */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">
                      Bulunan Ürünler ({scrapedProducts.length})
                    </label>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedScrapedProducts(new Set(scrapedProducts.map((_, i) => i)))}
                      >
                        Tümünü Seç
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedScrapedProducts(new Set())}
                      >
                        Tümünü Kaldır
                      </Button>
                    </div>
                  </div>
                  
                  <div className="border rounded-lg max-h-96 overflow-y-auto">
                    {scrapedProducts.map((product, index) => {
                      // Discount'u parse et - string veya number olabilir
                      const discountValue = product.discount === '' || product.discount === null || product.discount === undefined 
                        ? 0 
                        : (typeof product.discount === 'string' ? parseFloat(product.discount) || 0 : product.discount);
                      const discount = discountValue;
                      const originalPrice = product.price || 0;
                      const discountedPrice = originalPrice * (1 - discount / 100);
                      
                      return (
                        <div
                          key={`product-${index}-${product.discount || 0}`}
                          className={`flex items-center gap-3 p-3 border-b hover:bg-gray-50 ${
                            selectedScrapedProducts.has(index) ? 'bg-blue-50' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedScrapedProducts.has(index)}
                            onChange={(e) => {
                              const newSet = new Set(selectedScrapedProducts);
                              if (e.target.checked) {
                                newSet.add(index);
                              } else {
                                newSet.delete(index);
                              }
                              setSelectedScrapedProducts(newSet);
                            }}
                            className="rounded"
                          />
                          {product.image_url && (
                            <img
                              src={product.image_url}
                              alt={product.name}
                              className="w-16 h-16 object-cover rounded border"
                              onError={(e) => {e.target.style.display = 'none'}}
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 truncate">{product.name}</div>
                            <div className="text-sm space-y-1">
                              {/* Orijinal Fiyat */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={discount > 0 ? "line-through text-gray-400" : "text-gray-900 font-medium"}>
                                  ₺{originalPrice.toFixed(2)}
                                </span>
                                
                                {/* İndirimli Fiyat - Sadece iskonto varsa */}
                                {discount > 0 && (
                                  <>
                                    <span className="text-green-600 font-bold text-base">
                                      ₺{discountedPrice.toFixed(2)}
                                    </span>
                                    <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-medium">
                                      %{discount} İndirim
                                    </span>
                                  </>
                                )}
                              </div>
                              
                              <div className="text-gray-500">
                                {product.brand && `${product.brand}`}
                                {product.category && ` • ${product.category}`}
                              </div>
                            </div>
                          </div>
                          
                          {/* İskonto Oranı Input */}
                          <div className="flex items-center gap-2">
                            <input
                              key={`discount-input-${index}`}
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              defaultValue={discount || 0}
                              onBlur={(e) => {
                                // Input'tan çıkınca final değeri işle
                                const value = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                const clampedValue = Math.max(0, Math.min(100, value));
                                
                                console.log('Setting discount for product', index, 'to', clampedValue);
                                
                                // Final değeri kaydet
                                setScrapedProducts(prev => {
                                  const updated = prev.map((item, idx) => {
                                    if (idx === index) {
                                      return { ...item, discount: clampedValue };
                                    }
                                    return item;
                                  });
                                  return updated;
                                });
                                
                                // Input'u güncelle
                                e.target.value = clampedValue;
                              }}
                              onKeyDown={(e) => {
                                // Enter tuşuna basınca da blur tetikle
                                if (e.key === 'Enter') {
                                  e.target.blur();
                                }
                              }}
                              placeholder="0"
                              className="w-16 px-2 py-1 text-sm border rounded text-center"
                            />
                            <span className="text-sm text-gray-500">%</span>
                            {discount > 0 && (
                              <span className="text-xs text-green-600 font-medium">
                                -{discount}%
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScrapeDialog(false)}>
              İptal
            </Button>
            <Button 
              onClick={saveScratedProducts}
              disabled={!scrapeCompanyId || selectedScrapedProducts.size === 0}
              className="bg-green-600 hover:bg-green-700"
            >
              <Save className="w-4 h-4 mr-2" />
              {selectedScrapedProducts.size} Ürünü Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Scroll to Top Button */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-20 right-6 p-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 z-50 cursor-pointer group border border-emerald-500/20"
          title="Yukarı Git"
        >
          <ChevronUp className="w-6 h-6 transition-transform group-hover:-translate-y-0.5" />
        </button>
      )}

      {/* Scroll to Bottom Button */}
      {showScrollBottom && (
        <button
          onClick={scrollToBottom}
          className="fixed bottom-6 right-6 p-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 z-50 cursor-pointer group border border-emerald-500/20"
          title="Aşağı Git"
        >
          <ChevronDown className="w-6 h-6 transition-transform group-hover:translate-y-0.5" />
        </button>
      )}

      {/* Toast Notifications */}
      <Toaster />
    </div>
  );
}
export default App;
