import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
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
import { Trash2, Upload, RefreshCw, Plus, TrendingUp, Building2, Package, DollarSign, Edit, Save, X, FileText, Check, Archive, Download, Wrench, Eye, EyeOff, AlertTriangle, Tags, Copy, Pin, StickyNote, Users, Star, Search, Phone, Mail, MapPin, Calculator, Battery, Loader2, ScanSearch } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster } from './components/ui/sonner';
import LazyImage from './components/LazyImage';
import { CacheManager, debounce } from './utils/cache';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// ============================================================================
// AKÜ TEST RAPORU BİLEŞENİ (Gemini AI ile)
// ============================================================================
function BatteryTestSection() {
  // Her akü: { id, files: File[], previews: string[], report: string|null, imagesBase64: string[]|null, loading: bool, error: string|null }
  const [batteries, setBatteries] = useState([
    { id: 1, files: [], previews: [], report: null, imagesBase64: null, loading: false, error: null }
  ]);
  const [customerName, setCustomerName] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [analyzingAll, setAnalyzingAll] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

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
        report: null,
        imagesBase64: null,
        loading: false,
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
      report: null,
      imagesBase64: null
    });
  };

  const analyzeBattery = async (batteryId) => {
    const battery = batteries.find(b => b.id === batteryId);
    if (!battery) return;
    if (battery.files.length === 0) {
      toast.error('Önce en az bir test görseli yükleyin.');
      return;
    }
    updateBattery(batteryId, { loading: true, error: null });
    try {
      const formData = new FormData();
      battery.files.forEach(f => formData.append('files', f));
      const res = await axios.post(`${API}/battery-analysis`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000
      });
      const data = res.data;
      updateBattery(batteryId, {
        report: data.report || '',
        imagesBase64: data.images_base64 || [],
        loading: false
      });
      toast.success('Analiz tamamlandı.');
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || 'Bilinmeyen hata';
      updateBattery(batteryId, { loading: false, error: String(detail) });
      toast.error(`Analiz hatası: ${detail}`);
    }
  };

  const analyzeAll = async () => {
    setAnalyzingAll(true);
    try {
      for (const b of batteries) {
        if (b.files.length === 0) continue;
        // Sıralı çalıştır (rate-limit dostu)
         
        await analyzeBattery(b.id);
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
              UNI-T UT673A test cihazı görsellerini yükleyin, Gemini AI ile analiz edin ve profesyonel PDF rapor oluşturun.
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
        </div>

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

              {/* Tekil analiz butonu */}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => analyzeBattery(battery.id)}
                  disabled={battery.loading || battery.files.length === 0 || analyzingAll}
                  className="border-red-300 text-red-700 hover:bg-red-50"
                >
                  {battery.loading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analiz Ediliyor...</>
                  ) : (
                    <><ScanSearch className="w-4 h-4 mr-2" /> Bu Aküyü Analiz Et</>
                  )}
                </Button>
              </div>

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
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Görseller Analiz Ediliyor...</>
            ) : (
              <><ScanSearch className="w-5 h-5 mr-2" /> Tüm Görselleri Analiz Et</>
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
            <li className="flex gap-2"><span className="text-blue-500">•</span> "Görselleri Analiz Et" butonu ile Gemini 1.5 Flash AI analizi başlatın.</li>
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
    password: ''
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
  const [uploadCurrency, setUploadCurrency] = useState('USD'); // Excel yükleme için para birimi
  const [uploadDiscount, setUploadDiscount] = useState(''); // Excel yükleme için iskonto yüzdesi
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
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#3B82F6');
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
  const [allProductsForCategory, setAllProductsForCategory] = useState([]);
  const [loadingCategoryProducts, setLoadingCategoryProducts] = useState(false);
  
  // Ürünler sekmesinden teklif oluşturma için state'ler
  const [showQuickQuoteDialog, setShowQuickQuoteDialog] = useState(false);
  const [quickQuoteCustomerName, setQuickQuoteCustomerName] = useState('');
  const [quickQuoteNotes, setQuickQuoteNotes] = useState(''); // Hızlı teklif notları
  const [activeTab, setActiveTab] = useState('products');
  const [quotes, setQuotes] = useState([]);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [quoteSearchTerm, setQuoteSearchTerm] = useState('');
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
  const [newCurrency, setNewCurrency] = useState('USD');
  const [changingCurrency, setChangingCurrency] = useState(false);

  // İnternet fiyat arama state'leri
  const [marketPriceModal, setMarketPriceModal] = useState(false);
  const [marketPriceProduct, setMarketPriceProduct] = useState(null);
  const [marketPriceResult, setMarketPriceResult] = useState(null);
  const [marketPriceLoading, setMarketPriceLoading] = useState(false);
  const [marketPriceCache, setMarketPriceCache] = useState({}); // { productId: { result, timestamp } }
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
  // İnternet fiyat arama - Gemini AI
  const searchMarketPrice = async (product) => {
    // Cache kontrolü - 30 dakika geçerliliği var
    const cached = marketPriceCache[product.id];
    if (cached && (Date.now() - cached.timestamp) < 30 * 60 * 1000) {
      setMarketPriceProduct(product);
      setMarketPriceResult(cached.result);
      setMarketPriceModal(true);
      return;
    }

    setMarketPriceProduct(product);
    setMarketPriceResult(null);
    setMarketPriceLoading(true);
    setMarketPriceModal(true);

    try {
      const response = await axios.post(`${API}/market-price-search`, {
        product_name: product.name,
        brand: product.brand || '',
      }, { withCredentials: true });

      const result = response.data;
      setMarketPriceResult(result);

      // Cache'e kaydet
      setMarketPriceCache(prev => ({
        ...prev,
        [product.id]: { result, timestamp: Date.now() }
      }));
    } catch (error) {
      console.error('Market price search error:', error);
      setMarketPriceResult({ error: 'Fiyat araması başarısız oldu.' });
    } finally {
      setMarketPriceLoading(false);
    }
  };

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
        setLoginForm({ username: '', password: '' });
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
    }
  }, [isAuthenticated]);

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
      toast.error('Firma oluşturulamadı');
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

  const uploadExcelFile = async () => {
    let companyId = null;
    let companyName = '';

    // Mevcut firma seçildiyse
    if (useExistingCompany) {
      if (!selectedCompany) {
        toast.error('Lütfen bir firma seçin');
        return;
      }
      companyId = selectedCompany;
    } else {
      // Yeni firma adı girildiyse
      if (!uploadCompanyName.trim()) {
        toast.error('Lütfen firma adını girin');
        return;
      }
      companyName = uploadCompanyName.trim();
    }

    if (!uploadFile) {
      toast.error('Lütfen bir dosya seçin');
      return;
    }

    try {
      setLoading(true);

      // Eğer yeni firma adı girildiyse, önce firmayı oluştur
      if (!useExistingCompany) {
        const companyResponse = await axios.post(`${API}/companies`, { name: companyName });
        companyId = companyResponse.data.id;
        toast.success(`"${companyName}" firması oluşturuldu`);
        // Firma listesini güncelle
        await loadCompanies();
      }

      // Excel dosyasını yükle
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('currency', uploadCurrency); // Para birimini de gönder
      formData.append('discount', uploadDiscount || '0'); // İskonto yüzdesini de gönder

      const response = await axios.post(`${API}/companies/${companyId}/upload-excel`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      // Form alanlarını temizle
      setUploadFile(null);
      setSelectedCompany('');
      setUploadCompanyName('');
      setUploadCurrency('USD');
      setUploadDiscount('');
      await loadProducts(1, true);
      toast.success(response.data.message);
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error(error.response?.data?.detail || 'Dosya yüklenemedi');
    } finally {
      setLoading(false);
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
        updateData.category_id = null;
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
        color: newCategoryColor
      });
      
      setNewCategoryName('');
      setNewCategoryDescription('');
      
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
  }, [searchQuery, selectedCategory]);

  // Category dialog search effect - OPTİMİZE EDİLDİ
  React.useEffect(() => {
    if (showCategoryProductDialog) {
      const delayedSearch = setTimeout(() => {
        loadAllProductsForCategory(categoryDialogSearchQuery);
      }, 200); // HIZLANDIRILDI

      return () => clearTimeout(delayedSearch);
    }
  }, [categoryDialogSearchQuery, showCategoryProductDialog]);

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
      }
    }
    
    console.log('📊 Yeni selectedProducts:', Array.from(newSelected.entries()));
    console.log('📊 Seçili ürün sayısı:', newSelected.size);
    
    setSelectedProducts(newSelected);
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

  const clearSelection = () => {
    setSelectedProducts(new Map());
    setSelectedProductsData(new Map());
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

      const selectedProductData = getSelectedProductsData().map(p => ({
        id: p.id,
        quantity: p.quantity || 1
      }));

      console.log('💾 Teklif Kaydediliyor/Güncelleniyor:');
      console.log('📦 Seçili Ürün Sayısı:', selectedProducts.size);
      console.log('📦 Gönderilecek Ürünler:', selectedProductData);
      console.log('📝 Yüklü Teklif:', loadedQuote);

      // Eğer mevcut bir teklif yüklenmişse ve isim değişmemişse onu güncelle
      if (loadedQuote && loadedQuote.id && 
          (loadedQuote.name === quoteName || quoteName === '')) {
        
        console.log('🔄 Mevcut teklif güncelleniyor:', loadedQuote.id);
        
        const updateResponse = await fetch(`${API}/quotes/${loadedQuote.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: loadedQuote.name,
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
        toast.success(`"${loadedQuote.name}" teklifi güncellendi!`);
        
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

      const selectedProductData = getSelectedProductsData().map(p => ({
        id: p.id,
        quantity: p.quantity || 1
      }));

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
        notes: quickQuoteNotes.trim() || `${selectedProductData.length} ürün ile oluşturulan teklif`
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
      return product ? { ...product, quantity } : null;
    }).filter(Boolean);
  }, [selectedProducts, selectedProductsData]);

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
    
    // Hangi fiyatı kullanacağımızı belirle (indirimli fiyat gösterim durumuna göre)
    const totalListPrice = selectedProductsData.reduce((sum, p) => {
      let price = 0;
      if (showQuoteDiscountedPrices && p.discounted_price_try) {
        // İndirimli fiyat gösteriliyorsa ve indirimli fiyat varsa onu kullan
        price = parseFloat(p.discounted_price_try) || 0;
      } else {
        // Yoksa liste fiyatını kullan
        price = parseFloat(p.list_price_try) || 0;
      }
      const quantity = p.quantity || 1;
      return sum + (price * quantity);
    }, 0);
    
    const discountAmount = totalListPrice * (parseFloat(quoteDiscount) || 0) / 100;
    const laborCost = parseFloat(quoteLaborCost) || 0;
    const totalNetPrice = totalListPrice - discountAmount + laborCost;
    
    // Toplam ürün adedi hesapla
    const totalQuantity = selectedProductsData.reduce((sum, p) => sum + (p.quantity || 1), 0);
    
    return {
      totalListPrice: isNaN(totalListPrice) ? 0 : totalListPrice,
      discountAmount: isNaN(discountAmount) ? 0 : discountAmount,
      laborCost: isNaN(laborCost) ? 0 : laborCost,
      totalNetPrice: isNaN(totalNetPrice) ? 0 : totalNetPrice,
      totalWithLaborAndDiscount: isNaN(totalNetPrice) ? 0 : totalNetPrice,
      productCount: selectedProductsData.length,
      totalQuantity: totalQuantity
    };
  }, [selectedProducts, selectedProductsData, showQuoteDiscountedPrices, quoteDiscount, quoteLaborCost]);

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

  // WhatsApp share with PDF download - improved for mobile and no message content
  const shareViaWhatsAppWithPDF = async (quoteName, quoteId) => {
    try {
      // 1. PDF'i otomatik indir
      const pdfUrl = `${API}/quotes/${quoteId}/pdf`;
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = `${quoteName}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // 2. WhatsApp URL'ini oluştur - MESAJ İÇERİĞİ YOK
      const isMobile = isMobileDevice();
      const userAgent = navigator.userAgent.toLowerCase();
      const isAndroid = userAgent.includes('android');
      
      let whatsappUrl;
      
      if (isMobile) {
        if (isAndroid) {
          // Android için intent URL de deneyelim
          whatsappUrl = 'whatsapp://send';
        } else {
          // iOS için
          whatsappUrl = 'whatsapp://send';
        }
        toast.success('PDF indirildi! WhatsApp uygulaması açılıyor...');
      } else {
        // Desktop: WhatsApp Web - boş konuşma
        whatsappUrl = 'https://web.whatsapp.com/send';
        toast.success('PDF indirildi! WhatsApp Web açılıyor...');
      }

      // 3. WhatsApp'ı aç - sadece yeni sekme, fallback yok
      setTimeout(() => {
        if (isMobile && isAndroid) {
          // Android için özel işlem
          try {
            // Önce WhatsApp app protokolünü dene
            const androidLink = document.createElement('a');
            androidLink.href = 'whatsapp://send';
            androidLink.target = '_blank';
            androidLink.rel = 'noopener noreferrer';
            document.body.appendChild(androidLink);
            androidLink.click();
            document.body.removeChild(androidLink);
            
            // Eğer bu çalışmazsa intent kullan
            setTimeout(() => {
              try {
                window.open('intent://send/#Intent;scheme=whatsapp;package=com.whatsapp;end', '_blank');
              } catch (e) {
                // Son çare: Google Play Store
                window.open('https://play.google.com/store/apps/details?id=com.whatsapp', '_blank');
                toast.error('WhatsApp uygulaması bulunamadı. Play Store\'dan yükleyebilirsiniz.');
              }
            }, 1000);
            
          } catch (error) {
            console.error('Android WhatsApp açma hatası:', error);
            window.open('https://play.google.com/store/apps/details?id=com.whatsapp', '_blank');
          }
        } else {
          // iOS ve Desktop için standart yöntem
          const newWindow = window.open(whatsappUrl, '_blank', 'noopener,noreferrer,width=800,height=600');
          
          // Popup block kontrolü
          setTimeout(() => {
            if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
              // Yeni sekme açmaya çalış - mevcut sekmeyi değiştirme
              try {
                const link = document.createElement('a');
                link.href = whatsappUrl;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              } catch (e) {
                toast.error('WhatsApp açılamadı. Lütfen popup blocker\'ı devre dışı bırakın.');
              }
            }
          }, 100);
        }
      }, 1500);

    } catch (error) {
      console.error('WhatsApp PDF paylaşım hatası:', error);
      toast.error('PDF indirme veya WhatsApp paylaşımı başarısız oldu');
    }
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
                    type="text"
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
                    type="password"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({...loginForm, password: e.target.value})}
                    placeholder="Şifrenizi girin"
                    required
                    className="mt-1"
                  />
                </div>
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
        /* Main Application */
        <div className="w-[80vw] mx-auto py-4">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-4">
                <img 
                  src="/logo.png" 
                  alt="Çorlu Karavan Logo" 
                  className="w-16 h-16 object-contain"
                />
                <div className="flex-1">
                  <h1 className="text-4xl font-bold text-slate-800">
                    Çorlu Karavan
                  </h1>
                  <div className="flex items-center gap-3">
                    <p className="text-lg text-slate-600">Fiyat Takip Sistemi</p>
                    <span className="text-xs text-slate-400 font-light">made by Mehmet Necdet</span>
                  </div>
                </div>
              </div>
              <Button 
                variant="outline"
                onClick={handleLogout}
                className="text-slate-600 hover:text-slate-800"
              >
                Çıkış Yap
              </Button>
            </div>
          </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {loading ? (
            // Loading skeletons
            <>
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader>
                    <div className="h-4 bg-slate-200 rounded w-1/2 mb-2"></div>
                    <div className="h-8 bg-slate-300 rounded w-1/3"></div>
                  </CardHeader>
                </Card>
              ))}
            </>
          ) : (
            <>
              <StatsCard
                title="Toplam Firma"
                value={stats.totalCompanies}
                icon={Building2}
                description="Kayıtlı tedarikçi sayısı"
              />
              <StatsCard
                title="Toplam Ürün"
                value={stats.totalProducts}
                icon={Package}
                description="Sisteme yüklenmiş ürün"
              />
              <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-emerald-800">Döviz Kurları</CardTitle>
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-emerald-700">USD/TRY:</span>
                      <span className="text-lg font-bold text-emerald-900">
                        {exchangeRates.USD ? formatExchangeRate(exchangeRates.USD) : '---'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-emerald-700">EUR/TRY:</span>
                      <span className="text-lg font-bold text-emerald-900">
                        {exchangeRates.EUR ? formatExchangeRate(exchangeRates.EUR) : '---'}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-emerald-600 mt-1">Güncel döviz kurları</p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-4 mb-8">
          <Button 
            onClick={refreshPrices} 
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Kurları Güncelle
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 h-auto sm:h-16 p-1 bg-slate-100 rounded-xl">
            <TabsTrigger 
              value="products" 
              className="h-12 sm:h-14 text-sm sm:text-base font-medium transition-all duration-200 data-[state=active]:bg-blue-500 data-[state=active]:text-white data-[state=active]:shadow-lg hover:bg-blue-100 text-blue-700 rounded-lg"
            >
              <div className="flex items-center gap-1 sm:gap-2">
                <Package className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">Ürünler</span>
                <span className="sm:hidden">Ürün</span>
              </div>
            </TabsTrigger>
            <TabsTrigger 
              value="quotes"
              className="h-12 sm:h-14 text-sm sm:text-base font-medium transition-all duration-200 data-[state=active]:bg-purple-500 data-[state=active]:text-white data-[state=active]:shadow-lg hover:bg-purple-100 text-purple-700 rounded-lg"
            >
              <div className="flex items-center gap-1 sm:gap-2">
                <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">Teklifler</span>
                <span className="sm:hidden">Teklif</span>
                {selectedProducts.size > 0 && (
                  <Badge variant="secondary" className="ml-1 bg-white text-purple-700">
                    {selectedProducts.size}
                  </Badge>
                )}
              </div>
            </TabsTrigger>
            <TabsTrigger 
              value="packages"
              className="h-12 sm:h-14 text-sm sm:text-base font-medium transition-all duration-200 data-[state=active]:bg-teal-500 data-[state=active]:text-white data-[state=active]:shadow-lg hover:bg-teal-100 text-teal-700 rounded-lg"
            >
              <div className="flex items-center gap-1 sm:gap-2">
                <Package className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">Paketler</span>
                <span className="sm:hidden">Paket</span>
              </div>
            </TabsTrigger>
            <TabsTrigger 
              value="companies"
              className="h-12 sm:h-14 text-sm sm:text-base font-medium transition-all duration-200 data-[state=active]:bg-green-500 data-[state=active]:text-white data-[state=active]:shadow-lg hover:bg-green-100 text-green-700 rounded-lg"
            >
              <div className="flex items-center gap-1 sm:gap-2">
                <Building2 className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">Firmalar</span>
                <span className="sm:hidden">Firma</span>
              </div>
            </TabsTrigger>
            <TabsTrigger 
              value="categories"
              className="h-12 sm:h-14 text-sm sm:text-base font-medium transition-all duration-200 data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow-lg hover:bg-orange-100 text-orange-700 rounded-lg"
            >
              <div className="flex items-center gap-1 sm:gap-2">
                <Tags className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">Kategoriler</span>
                <span className="sm:hidden">Ktgr</span>
              </div>
            </TabsTrigger>
            <TabsTrigger 
              value="upload"
              className="h-12 sm:h-14 text-sm sm:text-base font-medium transition-all duration-200 data-[state=active]:bg-indigo-500 data-[state=active]:text-white data-[state=active]:shadow-lg hover:bg-indigo-100 text-indigo-700 rounded-lg"
            >
              <div className="flex items-center gap-1 sm:gap-2">
                <Upload className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">Excel Yükle</span>
                <span className="sm:hidden">Excel</span>
              </div>
            </TabsTrigger>
            <TabsTrigger 
              value="battery-test"
              className="h-12 sm:h-14 text-sm sm:text-base font-medium transition-all duration-200 data-[state=active]:bg-red-500 data-[state=active]:text-white data-[state=active]:shadow-lg hover:bg-red-100 text-red-700 rounded-lg"
            >
              <div className="flex items-center gap-1 sm:gap-2">
                <Battery className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">Akü Test</span>
                <span className="sm:hidden">Akü</span>
              </div>
            </TabsTrigger>
          </TabsList>

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
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                            <div 
                              className="w-4 h-4 rounded-full" 
                              style={{backgroundColor: category.color}}
                            ></div>
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

          {/* Upload Tab */}
          {/* Packages Tab */}
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
                <CardTitle>Excel Dosyası Yükle</CardTitle>
                <CardDescription>Ürün fiyat listelerinizi Excel formatında yükleyin</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <h4 className="font-semibold text-amber-800 mb-2">Renk Kodlama (Renkli Excel için):</h4>
                  <p className="text-sm text-amber-700 space-y-1">
                    <span className="block">🔴 <strong>Kırmızı:</strong> Ürün Adı</span>
                    <span className="block">🔵 <strong>Mavi:</strong> Ürün Açıklaması</span>
                    <span className="block">🟡 <strong>Sarı:</strong> Marka (yeni!)</span>
                    <span className="block">🟢 <strong>Yeşil:</strong> Liste Fiyatı</span>
                    <span className="block">🟠 <strong>Turuncu:</strong> İndirimli Fiyat</span>
                  </p>
                  <p className="text-xs text-amber-600 mt-2">
                    💼 <strong>Firma:</strong> Aşağıdaki dropdown'dan seçilir/oluşturulur
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
                    <Label htmlFor="file-upload">Excel Dosyası</Label>
                    <Input
                      id="file-upload"
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={(e) => setUploadFile(e.target.files[0])}
                    />
                  </div>

                  <Button 
                    onClick={uploadExcelFile} 
                    disabled={loading || (!selectedCompany && useExistingCompany) || (!uploadCompanyName.trim() && !useExistingCompany) || !uploadFile}
                    className="w-full"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {loading ? 'Yükleniyor...' : 'Excel Dosyası Yükle'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Products Tab */}
          <TabsContent value="products" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Ürün Listesi</CardTitle>
                <CardDescription>Tüm yüklenmiş ürünler ve fiyatları</CardDescription>
              </CardHeader>
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
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-4">
                    <h3 className="text-lg font-semibold">Ürün Yönetimi</h3>
                    {selectedProducts.size > 0 && (
                      <div className="flex items-center gap-2 text-sm text-emerald-600">
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
                          <Label htmlFor="product-category">Kategori (Opsiyonel)</Label>
                          <Select 
                            value={newProductForm.category_id || "none"} 
                            onValueChange={(value) => setNewProductForm({...newProductForm, category_id: value === "none" ? "" : value})}
                          >
                            <SelectTrigger>
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
                <div className="flex flex-col md:flex-row gap-4 mb-6">
                  <div className="flex-1">
                    <Input
                      placeholder="Ürün ara..."
                      value={searchQuery}
                      onChange={(e) => handleSearch(e.target.value)}
                      className="w-full"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Select value={selectedCategory || "all"} onValueChange={handleCategoryFilter}>
                      <SelectTrigger className="w-48">
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
                    {(searchQuery || selectedCategory) && (
                      <Button 
                        variant="outline" 
                        onClick={() => {
                          handleSearch('');
                          handleCategoryFilter('');
                        }}
                      >
                        Temizle
                      </Button>
                    )}
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
                        <div key={categoryId} className="space-y-4">
                          {/* Category Header */}
                          <div className="flex items-center gap-3 pb-2 border-b-2" style={{borderColor: categoryColor}}>
                            <div 
                              className="w-4 h-4 rounded-full" 
                              style={{backgroundColor: categoryColor}}
                            ></div>
                            <h3 className="text-lg font-semibold text-slate-800">
                              {categoryName}
                            </h3>
                            <div className="flex items-center gap-2 ml-auto">
                              {/* İndirimli Fiyat Toggle Butonu - Her kategoride göster */}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowDiscountedPrices(!showDiscountedPrices)}
                                className="p-2"
                                title={showDiscountedPrices ? "İndirimli fiyatları gizle" : "İndirimli fiyatları göster"}
                              >
                                {showDiscountedPrices ? (
                                  <EyeOff className="w-4 h-4" />
                                ) : (
                                  <Eye className="w-4 h-4" />
                                )}
                              </Button>
                              <Badge variant="outline">
                                {categoryProducts.length} ürün
                                {favoriteProducts.length > 0 && ` (${favoriteProducts.length} favori)`}
                              </Badge>
                            </div>
                          </div>

                          {/* Products Table for this category */}
                          <div className="overflow-x-auto">
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
                                                onClick={() => searchMarketPrice(product)}
                                                className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 border-blue-200"
                                                title="İnternette fiyat ara"
                                              >
                                                <ScanSearch className="w-4 h-4" />
                                              </Button>
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
                          
                          {/* Daha Az Göster Butonu */}
                          {isExpanded && (
                            <div className="flex justify-center pt-3 border-t">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const newExpanded = new Set(expandedCategories);
                                  newExpanded.delete(categoryId);
                                  setExpandedCategories(newExpanded);
                                }}
                                className="bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100"
                              >
                                <X className="w-4 h-4 mr-2" />
                                Daha Az Göster
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
                
                {/* Product count display */}
                {products.length > 0 && (
                  <div className="mt-4 text-center text-sm text-slate-600">
                    Toplam {totalProducts} ürün gösteriliyor
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Quotes Tab - Modern Redesigned */}
          <TabsContent value="quotes" className="space-y-6">
            <Card className="border-t-4 border-t-blue-500">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
                <CardTitle className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                    <FileText className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="text-xl font-bold text-blue-900">Teklif Yönetimi</div>
                    <div className="text-sm font-normal text-blue-600">Hızlı ve profesyonel teklif oluşturun</div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {/* Internal Tab System */}
                <div className="border-b bg-white">
                  <div className="flex">
                    <button
                      className={`px-6 py-3 font-medium transition-all ${
                        quoteSubTab === 'create'
                          ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                          : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
                      }`}
                      onClick={() => setQuoteSubTab('create')}
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        <span>Yeni Teklif</span>
                        {selectedProducts.size > 0 && (
                          <span className="ml-1 px-2 py-0.5 text-xs bg-blue-600 text-white rounded-full">
                            {selectedProducts.size}
                          </span>
                        )}
                      </div>
                    </button>
                    <button
                      className={`px-6 py-3 font-medium transition-all ${
                        quoteSubTab === 'list'
                          ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                          : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
                      }`}
                      onClick={() => setQuoteSubTab('list')}
                    >
                      <div className="flex items-center gap-2">
                        <Archive className="w-4 h-4" />
                        <span>Tekliflerim</span>
                        {quotes.length > 0 && (
                          <span className="ml-1 px-2 py-0.5 text-xs bg-gray-600 text-white rounded-full">
                            {quotes.length}
                          </span>
                        )}
                      </div>
                    </button>
                  </div>
                </div>

                {/* Create Quote Tab Content */}
                {quoteSubTab === 'create' && (
                  <div className="p-6">
                    {selectedProducts.size > 0 ? (
                  <div className="space-y-6">
                    {/* Selected Products Summary - Modern Blue Theme */}
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-5 shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-bold text-blue-900 flex items-center gap-2">
                          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                            <Package className="w-4 h-4 text-white" />
                          </div>
                          Seçili Ürünler ({selectedProducts.size} çeşit, {calculateQuoteTotals.totalQuantity} adet)
                        </h4>
                        <div className="flex items-center gap-2">
                          {selectedProducts.size > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                // Eğer yüklü bir teklif varsa ve değişiklik yapıldıysa otomatik kaydet
                                if (loadedQuote && loadedQuote.id) {
                                  try {
                                    const selectedProductData = getSelectedProductsData().map(p => ({
                                      id: p.id,
                                      quantity: p.quantity || 1
                                    }));
                                    
                                    console.log('🔄 Teklif kapatılmadan önce otomatik güncelleniyor...');
                                    
                                    const updateResponse = await fetch(`${API}/quotes/${loadedQuote.id}`, {
                                      method: 'PUT',
                                      headers: {
                                        'Content-Type': 'application/json',
                                      },
                                      body: JSON.stringify({
                                        name: loadedQuote.name,
                                        customer_id: selectedQuoteCustomer || null,
                                        labor_cost: parseFloat(quoteLaborCost) || 0,
                                        discount_percentage: parseFloat(quoteDiscount) || 0,
                                        products: selectedProductData,
                                        notes: quoteNotes.trim() || ''
                                      })
                                    });
                                    
                                    if (updateResponse.ok) {
                                      await fetchQuotes();
                                      toast.success('Değişiklikler kaydedildi');
                                    }
                                  } catch (error) {
                                    console.error('Otomatik kaydetme hatası:', error);
                                  }
                                }
                                
                                // Sonra teklifi kapat
                                clearSelection();
                              }}
                              className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 border-red-200"
                              title="Teklifi Kapat"
                            >
                              <X className="w-4 h-4 mr-1" />
                              <span className="text-xs font-medium">Teklifi Kapat</span>
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setShowQuoteDiscountedPrices(!showQuoteDiscountedPrices);
                            }}
                            className="p-1.5 border-blue-300 hover:bg-blue-100"
                            title={showQuoteDiscountedPrices ? "İndirimli fiyatları gizle" : "İndirimli fiyatları göster"}
                          >
                            {showQuoteDiscountedPrices ? (
                              <EyeOff className="w-4 h-4 text-blue-600" />
                            ) : (
                              <Eye className="w-4 h-4 text-blue-600" />
                            )}
                          </Button>
                        </div>
                      </div>
                      
                      {/* Hızlı Ürün Ekleme - Kompakt */}
                      <div className="border-t-2 border-blue-200 pt-4 mt-3">
                        <div className="flex items-center gap-3">
                          {/* Kategori Seçimi */}
                          <select
                            value={quickAddCategory}
                            onChange={(e) => setQuickAddCategory(e.target.value)}
                            className="px-3 py-2 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                          >
                            <option value="all">Tüm Kategoriler</option>
                            {categories.map(cat => (
                              <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                          </select>
                          
                          {/* Arama Kutusu */}
                          <div className="flex-1 relative">
                            <input
                              type="text"
                              placeholder="Ürün ara ve ekle..."
                              value={quickAddSearch}
                              onChange={(e) => {
                                setQuickAddSearch(e.target.value);
                                setShowQuickAddDropdown(e.target.value.length > 0);
                              }}
                              onFocus={() => quickAddSearch.length > 0 && setShowQuickAddDropdown(true)}
                              className="w-full px-4 py-2 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
                            
                            {/* Dropdown Sonuçlar */}
                            {showQuickAddDropdown && (
                              <div className="absolute z-50 w-full mt-1 bg-white border-2 border-blue-300 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                                {getQuickAddProducts().length > 0 ? (
                                  getQuickAddProducts().map(product => {
                                    const company = companies.find(c => c.id === product.company_id);
                                    return (
                                      <div
                                        key={product.id}
                                        className="flex items-center justify-between p-2 hover:bg-blue-50 cursor-pointer border-b last:border-b-0"
                                        onClick={() => {
                                          toggleProductSelection(product.id, quickAddQuantity);
                                          setQuickAddSearch('');
                                          setShowQuickAddDropdown(false);
                                          setQuickAddQuantity(1);
                                          toast.success(`${product.name} eklendi`);
                                        }}
                                      >
                                        <div className="flex-1">
                                          <div className="text-sm font-medium text-gray-900">{product.name}</div>
                                          <div className="text-xs text-gray-500">{company?.name}</div>
                                        </div>
                                        <div className="text-sm font-bold text-blue-700">
                                          ₺{formatPrice(product.list_price_try || 0)}
                                        </div>
                                      </div>
                                    );
                                  })
                                ) : (
                                  <div className="p-3 text-sm text-gray-500 text-center">
                                    Ürün bulunamadı
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          
                          {/* Adet Girişi */}
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-700">Adet:</span>
                            <input
                              type="number"
                              min="1"
                              value={quickAddQuantity}
                              onChange={(e) => setQuickAddQuantity(parseInt(e.target.value) || 1)}
                              className="w-16 px-2 py-2 border border-blue-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>
                        </div>
                      </div>
                      
                      <div className="grid gap-2 max-h-96 overflow-y-auto mt-4">
                        {getSelectedProductsData().map((product) => {
                          const company = companies.find(c => c.id === product.company_id);
                          return (
                            <div key={product.id} className="flex items-center justify-between bg-white rounded-lg p-3 text-sm shadow-sm border border-blue-100 hover:border-blue-300 transition-all">
                              <div className="flex items-center gap-3 flex-1 relative z-0">
                                {product.image_url && (
                                  <img 
                                    src={product.image_url} 
                                    alt={product.name}
                                    className="w-12 h-12 object-cover rounded-lg cursor-pointer hover:opacity-75 transition-opacity border border-gray-200 relative z-0"
                                    onError={(e) => {e.target.style.display = 'none'}}
                                    onClick={() => openImagePreview(product.image_url, product.name)}
                                    title="Görseli büyük boyutta görüntülemek için tıklayın"
                                  />
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold text-gray-900 truncate">{product.name}</div>
                                  <div className="text-slate-500 text-xs">{company?.name}</div>
                                </div>
                              </div>
                              <div className="flex items-center gap-4 relative z-10">
                                <div className="flex items-center gap-2 relative z-20">
                                  <span className="text-xs text-slate-600 font-medium">Adet:</span>
                                  <input
                                    type="number"
                                    min="1"
                                    value={product.quantity || 1}
                                    onChange={(e) => {
                                      const quantity = parseInt(e.target.value) || 1;
                                      toggleProductSelection(product.id, quantity);
                                    }}
                                    className="w-16 px-2 py-1.5 text-sm border border-blue-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent relative z-30 bg-white"
                                  />
                                </div>
                                <div className="text-right min-w-[120px]">
                                  {showQuoteDiscountedPrices && product.discounted_price_try ? (
                                    <>
                                      <div className="font-bold text-green-600">₺ {formatPrice((product.discounted_price_try || 0) * (product.quantity || 1))}</div>
                                      <div className="text-xs text-slate-500 line-through">
                                        ₺ {formatPrice((product.list_price_try || 0) * (product.quantity || 1))}
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <div className="font-bold text-blue-900">₺ {formatPrice((product.list_price_try || 0) * (product.quantity || 1))}</div>
                                      <div className="text-xs text-slate-500">
                                        ₺ {formatPrice(product.list_price_try || 0)} × {product.quantity || 1}
                                      </div>
                                    </>
                                  )}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => toggleProductSelection(product.id, 0)}
                                  className="text-red-600 hover:text-red-800 hover:bg-red-50 p-1.5"
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Grid Layout: Left - Form Fields, Right - Live Summary */}
                    <div className="grid md:grid-cols-3 gap-6">
                      {/* Left Column - Form Fields */}
                      <div className="md:col-span-2 space-y-4">
                        {/* Teklif Adı */}
                        <div className="bg-white border-2 border-blue-200 rounded-xl p-4 shadow-sm">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 bg-blue-500 text-white rounded-lg flex items-center justify-center">
                              <FileText className="w-4 h-4" />
                            </div>
                            <span className="font-semibold text-blue-900">Teklif Adı</span>
                          </div>
                          <Input
                            placeholder="Teklif adını girin..."
                            value={quoteName}
                            onChange={(e) => setQuoteName(e.target.value)}
                            className="w-full border-blue-200 focus:border-blue-500 focus:ring-blue-500"
                          />
                        </div>

                        {/* İndirim */}
                        <div className="bg-white border-2 border-amber-200 rounded-xl p-4 shadow-sm">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 bg-amber-500 text-white rounded-lg flex items-center justify-center">
                                <TrendingUp className="w-4 h-4" />
                              </div>
                              <span className="font-semibold text-amber-900">İndirim Oranı</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                placeholder="0"
                                value={quoteDiscount}
                                onChange={(e) => setQuoteDiscount(parseFloat(e.target.value) || 0)}
                                className="w-20 text-center border-amber-300 focus:border-amber-500"
                              />
                              <span className="text-amber-700 font-bold">%</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {[5, 10, 15, 20, 25].map(percent => (
                              <Button
                                key={percent}
                                variant="outline"
                                size="sm"
                                onClick={() => setQuoteDiscount(percent)}
                                className={`flex-1 text-xs ${quoteDiscount === percent ? 'bg-amber-100 border-amber-500 text-amber-900' : 'border-amber-300 hover:bg-amber-50'}`}
                              >
                                {percent}%
                              </Button>
                            ))}
                          </div>
                        </div>

                        {/* İşçilik Maliyeti */}
                        <div className="bg-white border-2 border-cyan-200 rounded-xl p-4 shadow-sm">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 bg-cyan-500 text-white rounded-lg flex items-center justify-center">
                                <Wrench className="w-4 h-4" />
                              </div>
                              <span className="font-semibold text-cyan-900">İşçilik Maliyeti</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-cyan-700 font-bold">₺</span>
                              <Input
                                type="number"
                                min="0"
                                step="100"
                                placeholder="0"
                                value={quoteLaborCost}
                                onChange={(e) => setQuoteLaborCost(parseFloat(e.target.value) || 0)}
                                className="w-32 text-right border-cyan-300 focus:border-cyan-500"
                              />
                              {quoteLaborCost > 0 && (
                                <Button
                                  size="sm"
                                  onClick={() => setQuoteLaborCost(0)}
                                  className="bg-green-600 hover:bg-green-700 px-2 py-1"
                                  title="Temizle"
                                >
                                  <Check className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            {[2000, 5000, 10000, 20000].map(amount => (
                              <Button
                                key={amount}
                                variant="outline"
                                size="sm"
                                onClick={() => setQuoteLaborCost(amount)}
                                className={`text-xs ${quoteLaborCost === amount ? 'bg-cyan-100 border-cyan-500 text-cyan-900' : 'border-cyan-300 hover:bg-cyan-50'}`}
                              >
                                ₺{amount/1000}k
                              </Button>
                            ))}
                          </div>
                        </div>
                        
                        {/* Teklif Notları - Collapsible */}
                        <details className="bg-white border-2 border-gray-200 rounded-xl shadow-sm">
                          <summary className="cursor-pointer p-4 font-semibold text-gray-900 hover:bg-gray-50 rounded-xl flex items-center gap-2">
                            <FileText className="w-4 h-4 text-gray-600" />
                            <span>Teklif Notları {quoteNotes && `(${quoteNotes.length} karakter)`}</span>
                          </summary>
                          <div className="p-4 pt-0">
                            <textarea
                              className="flex min-h-[80px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                              value={quoteNotes}
                              onChange={(e) => setQuoteNotes(e.target.value)}
                              placeholder="Teklif ile ilgili özel notlar, açıklamalar veya koşullar..."
                            />
                          </div>
                        </details>
                      </div>

                      {/* Right Column - Live Summary */}
                      <div className="md:col-span-1">
                        <div className="bg-gradient-to-br from-emerald-50 to-green-50 border-2 border-emerald-300 rounded-xl p-5 shadow-lg sticky top-4">
                          <h4 className="font-bold text-emerald-900 mb-4 text-lg flex items-center gap-2">
                            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
                              <Calculator className="w-4 h-4 text-white" />
                            </div>
                            Canlı Özet
                          </h4>
                          <div className="space-y-3">
                            <div className="bg-white rounded-lg p-3 border border-emerald-200">
                              <div className="text-xs text-emerald-700 mb-1">Ürün Sayısı</div>
                              <div className="text-2xl font-bold text-emerald-900">
                                {calculateQuoteTotals.productCount}
                              </div>
                            </div>
                            <div className="bg-white rounded-lg p-3 border border-emerald-200">
                              <div className="text-xs text-emerald-700 mb-1">Toplam Liste Fiyatı</div>
                              <div className="text-xl font-bold text-gray-900">
                                ₺ {formatPrice(calculateQuoteTotals.totalListPrice)}
                              </div>
                            </div>
                            {quoteDiscount > 0 && (
                              <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                                <div className="text-xs text-red-700 mb-1">İndirim ({quoteDiscount}%)</div>
                                <div className="text-xl font-bold text-red-600">
                                  - ₺ {formatPrice(calculateQuoteTotals.discountAmount)}
                                </div>
                              </div>
                            )}
                            {quoteLaborCost > 0 && (
                              <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                                <div className="text-xs text-green-700 mb-1">İşçilik</div>
                                <div className="text-xl font-bold text-green-600">
                                  + ₺ {formatPrice(calculateQuoteTotals.laborCost)}
                                </div>
                              </div>
                            )}
                            <div className="bg-gradient-to-r from-emerald-100 to-green-100 rounded-lg p-4 border-2 border-emerald-400 mt-4">
                              <div className="text-sm text-emerald-800 mb-2 font-semibold">NET TOPLAM</div>
                              <div className="text-3xl font-bold text-emerald-900">
                                ₺ {formatPrice(calculateQuoteTotals.totalNetPrice)}
                              </div>
                              <div className="text-xs text-emerald-700 italic mt-2">
                                € {formatPrice(calculateQuoteTotals.totalNetPrice / (exchangeRates.EUR || 48.5))} EUR
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons - Modern Blue Theme */}
                    <div className="flex flex-wrap gap-3 pt-4 border-t-2 border-blue-100">
                      <Button 
                        onClick={saveQuote}
                        disabled={selectedProducts.size === 0}
                        className="bg-blue-600 hover:bg-blue-700 flex-1 min-w-[200px] h-12 text-base font-semibold shadow-md"
                      >
                        <Save className="w-5 h-5 mr-2" />
                        {loadedQuote && (loadedQuote.name === quoteName || quoteName === '') 
                          ? 'Teklifi Güncelle' 
                          : 'Teklifi Kaydet'}
                      </Button>

                      <Button 
                        onClick={async () => {
                          try {
                            let quoteId = null;
                            
                            // Eğer mevcut bir teklif yüklenmişse ve isim değişmemişse onu güncelle
                            if (loadedQuote && loadedQuote.id && 
                                (loadedQuote.name === quoteName || quoteName === '')) {
                              
                              const selectedProductData = getSelectedProductsData().map(p => ({
                                id: p.id,
                                quantity: p.quantity || 1
                              }));
                              
                              const updateResponse = await fetch(`${API}/quotes/${loadedQuote.id}`, {
                                method: 'PUT',
                                headers: {
                                  'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                  name: loadedQuote.name, // İsmi aynı tut
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
                              quoteId = updatedQuote.id;
                              
                              // Teklifler listesini yenile
                              await fetchQuotes();
                              
                              toast.success(`"${loadedQuote.name}" teklifi güncellendi!`);
                            } else {
                              // Yeni teklif oluştur veya farklı isimle kaydet
                              const selectedProductData = getSelectedProductsData().map(p => ({
                                id: p.id,
                                quantity: p.quantity || 1
                              }));
                              
                              console.log('🔍 Quotes tab - quote creation data:');
                              console.log('🔍 selectedProducts Map:', selectedProducts);
                              console.log('🔍 selectedProductsData Map:', selectedProductsData);
                              console.log('🔍 getSelectedProductsData() result:', getSelectedProductsData());
                              console.log('🔍 selectedProductData for API:', selectedProductData);

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
                              quoteId = savedQuote.id;
                              
                              // Teklifler listesini yenile
                              await fetchQuotes();
                              
                              toast.success('Teklif başarıyla oluşturuldu!');
                            }
                            
                            // PDF'i hemen indir
                            const pdfUrl = `${API}/quotes/${quoteId}/pdf`;
                            const link = document.createElement('a');
                            link.href = pdfUrl;
                            link.download = `${loadedQuote?.name || quoteName || 'Teklif'}.pdf`;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            
                            // Teklifleri yenile
                            await fetchQuotes();
                            
                          } catch (error) {
                            console.error('PDF oluşturma hatası:', error);
                            toast.error('PDF oluşturulamadı: ' + error.message);
                          }
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 flex-1 min-w-[180px] h-12 text-base font-semibold shadow-md"
                      >
                        <Download className="w-5 h-5 mr-2" />
                        PDF İndir
                      </Button>
                      
                      {loadedQuote && loadedQuote.id && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            shareViaWhatsAppWithPDF(loadedQuote.name, loadedQuote.id);
                          }}
                          className="bg-green-500 text-white hover:bg-green-600 border-green-600 min-w-[160px] h-12 text-base font-semibold shadow-md"
                          title="Teklifi WhatsApp ile paylaş"
                        >
                          <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                          </svg>
                          WhatsApp
                        </Button>
                      )}
                      
                      <Button 
                        variant="outline" 
                        onClick={async () => {
                          // Eğer yüklü bir teklif varsa ve değişiklik yapıldıysa otomatik kaydet
                          if (loadedQuote && loadedQuote.id) {
                            try {
                              const selectedProductData = getSelectedProductsData().map(p => ({
                                id: p.id,
                                quantity: p.quantity || 1
                              }));
                              
                              console.log('🔄 Teklif temizlenmeden önce otomatik güncelleniyor...');
                              
                              const updateResponse = await fetch(`${API}/quotes/${loadedQuote.id}`, {
                                method: 'PUT',
                                headers: {
                                  'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                  name: loadedQuote.name,
                                  customer_id: selectedQuoteCustomer || null,
                                  labor_cost: parseFloat(quoteLaborCost) || 0,
                                  discount_percentage: parseFloat(quoteDiscount) || 0,
                                  products: selectedProductData,
                                  notes: quoteNotes.trim() || ''
                                })
                              });
                              
                              if (updateResponse.ok) {
                                await fetchQuotes();
                                toast.success('Değişiklikler kaydedildi');
                              }
                            } catch (error) {
                              console.error('Otomatik kaydetme hatası:', error);
                            }
                          }
                          
                          // Sonra temizle
                          clearSelection();
                        }}
                        className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 min-w-[140px] h-12 text-base font-semibold"
                      >
                        <X className="w-5 h-5 mr-2" />
                        Temizle
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-16 text-slate-500">
                    <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <FileText className="w-12 h-12 text-blue-400" />
                    </div>
                    <h3 className="text-xl font-bold mb-2 text-gray-900">Henüz Ürün Seçilmedi</h3>
                    <p className="text-sm mb-6 text-gray-600">
                      Teklif oluşturmak için önce "Ürünler" sekmesinden ürün seçin
                    </p>
                    <Button 
                      variant="outline"
                      onClick={() => setActiveTab('products')}
                      className="bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100"
                    >
                      <Package className="w-4 h-4 mr-2" />
                      Ürünlere Git
                    </Button>
                  </div>
                )}
                  </div>
                )}

                {/* List Quotes Tab Content */}
                {quoteSubTab === 'list' && (
                  <div className="p-6">
                    {/* Search and Stats Header */}
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-xl font-bold text-gray-900">Kayıtlı Teklifler</h3>
                          <p className="text-sm text-gray-600 mt-1">
                            {quotes.length} teklif
                            {filteredQuotes.length !== quotes.length && ` (${filteredQuotes.length} sonuç gösteriliyor)`}
                          </p>
                        </div>
                      </div>
                      
                      {/* Search Box */}
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Teklif adı ile ara..."
                          value={quoteSearchTerm}
                          onChange={(e) => handleQuoteSearch(e.target.value)}
                          className="w-full px-4 py-3 pl-10 border-2 border-blue-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
                        />
                        <svg className="w-5 h-5 text-gray-400 absolute left-3 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                    </div>

                    {/* Quote List */}
                    {quotes.length === 0 ? (
                      <div className="text-center py-16">
                        <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <FileText className="w-12 h-12 text-blue-400" />
                        </div>
                        <h3 className="text-xl font-bold mb-2 text-gray-900">Henüz Teklif Yok</h3>
                        <p className="text-sm mb-6 text-gray-600">
                          İlk teklifinizi oluşturmak için "Yeni Teklif" sekmesine gidin
                        </p>
                        <Button 
                          variant="outline"
                          onClick={() => setQuoteSubTab('create')}
                          className="bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100"
                        >
                          <FileText className="w-4 h-4 mr-2" />
                          Yeni Teklif Oluştur
                        </Button>
                      </div>
                    ) : filteredQuotes.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                          <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
                          <p className="text-lg mb-2">"{quoteSearchTerm}" araması için sonuç bulunamadı</p>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="mt-2"
                            onClick={() => handleQuoteSearch('')}
                          >
                            Aramayı Temizle
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {filteredQuotes.map((quote) => (
                          <div key={quote.id} className="border-2 border-blue-100 rounded-xl p-5 hover:border-blue-300 hover:shadow-md transition-all bg-white">
                            <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4">
                              <div className="flex-1">
                                <h4 className="font-bold text-lg text-gray-900 mb-2">{quote.name}</h4>
                                <div className="flex flex-wrap items-center gap-3 text-sm">
                                  <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">
                                    {quote.products.length} ürün
                                  </span>
                                  <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full font-medium">
                                    %{quote.discount_percentage} indirim
                                  </span>
                                  {quote.labor_cost > 0 && (
                                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full font-medium">
                                      ₺{formatPrice(quote.labor_cost)} işçilik
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-slate-600">
                                  <span className="font-semibold text-gray-900 text-base">
                                    Net: ₺{formatPrice(quote.total_net_price)}
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    {new Date(quote.created_at).toLocaleDateString('tr-TR')}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => {
                                    try {
                                      const productIds = new Map();
                                      const productData = new Map();
                                      
                                      quote.products.forEach(p => {
                                        productIds.set(p.id, p.quantity || 1);
                                        
                                        // Ürün detaylarını products array'inden bul
                                        const fullProduct = products.find(prod => prod.id === p.id);
                                        if (fullProduct) {
                                          // Tam ürün bilgilerini kullan (görsel dahil)
                                          productData.set(p.id, {
                                            ...fullProduct,
                                            quantity: p.quantity || 1
                                          });
                                        } else {
                                          // Bulunamazsa backend'den gelen veriyi kullan
                                          productData.set(p.id, p);
                                        }
                                      });
                                      
                                      setSelectedProducts(new Map(productIds));
                                      setSelectedProductsData(new Map(productData));
                                      setQuoteDiscount(quote.discount_percentage);
                                      setQuoteLaborCost(quote.labor_cost || 0);
                                      setQuoteNotes(quote.notes || '');
                                      setLoadedQuote({...quote});
                                      setQuoteName(quote.name);
                                      setQuoteSubTab('create');
                                      
                                      toast.success(`"${quote.name}" teklifi düzenleme için yüklendi`);
                                    } catch (error) {
                                      toast.error('Teklif yükleme işlemi başarısız oldu');
                                    }
                                  }}
                                  className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-300"
                                  title={`"${quote.name}" teklifini önizle`}
                                >
                                  <Eye className="w-4 h-4 mr-1" />
                                  Önizle
                                </Button>
                                  
                                <Button
                                  variant="default"
                                  size="sm"
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
                                  className="bg-emerald-600 hover:bg-emerald-700"
                                >
                                  <Download className="w-4 h-4 mr-1" />
                                  PDF
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    shareViaWhatsAppWithPDF(quote.name, quote.id);
                                  }}
                                  className="bg-green-500 text-white hover:bg-green-600 border-green-600"
                                  title="PDF'i WhatsApp ile paylaş"
                                >
                                  <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.520-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                                  </svg>
                                  WhatsApp
                                </Button>
                                  
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={async () => {
                                    if (window.confirm(`"${quote.name}" teklifini silmek istediğinizden emin misiniz?`)) {
                                      try {
                                        const response = await fetch(`${API}/quotes/${quote.id}`, {
                                          method: 'DELETE'
                                        });
                                        
                                        if (response.ok) {
                                          await fetchQuotes();
                                          toast.success('Teklif silindi');
                                        } else {
                                          throw new Error('Silme işlemi başarısız');
                                        }
                                      } catch (error) {
                                        toast.error('Teklif silinemedi');
                                      }
                                    }
                                  }}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  <X className="w-4 h-4 mr-1" />
                                  Sil
                                </Button>
                              </div>
                            </div>
                            
                            {/* Product Details - Collapsible */}
                            <details className="mt-4">
                              <summary className="cursor-pointer text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                                Ürünleri Göster ({quote.products.length} ürün)
                              </summary>
                              <div className="mt-3 space-y-2 pl-6">
                                {quote.products.map((product, index) => (
                                  <div key={index} className="flex justify-between items-center py-2 px-3 bg-blue-50 rounded-lg text-sm border border-blue-100">
                                    <span className="font-medium text-gray-900">{product.name}</span>
                                    <span className="text-slate-600">
                                      ₺{formatPrice(product.discounted_price_try || product.list_price_try)} × {product.quantity}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </details>
                          </div>
                        ))}
                        </div>
                      )}
                  </div>
                )}
              </CardContent>
            </Card>
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

            {/* İnternet Fiyat Arama Modal */}
            <Dialog open={marketPriceModal} onOpenChange={setMarketPriceModal}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <ScanSearch className="w-5 h-5 text-blue-600" />
                    İnternet Fiyatları
                  </DialogTitle>
                  <DialogDescription className="truncate">
                    {marketPriceProduct?.name}
                  </DialogDescription>
                </DialogHeader>

                {marketPriceLoading ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    <p className="text-sm text-slate-500">Gemini AI internette araştırıyor...</p>
                  </div>
                ) : marketPriceResult?.error ? (
                  <div className="py-6 text-center text-red-500 text-sm">{marketPriceResult.error}</div>
                ) : marketPriceResult ? (
                  <div className="space-y-4">
                    {/* Ortalama fiyat */}
                    {marketPriceResult.average_price && (
                      <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                        <span className="text-sm font-medium text-green-800">İnternet ortalaması</span>
                        <span className="text-xl font-bold text-green-700">
                          {marketPriceResult.currency === 'TRY' ? '₺' : marketPriceResult.currency} {Number(marketPriceResult.average_price).toLocaleString('tr-TR')}
                        </span>
                      </div>
                    )}

                    {/* Sistemdeki fiyatla karşılaştırma */}
                    {marketPriceProduct?.list_price_try && marketPriceResult.average_price && (
                      <div className="flex items-center justify-between text-sm px-1">
                        <span className="text-slate-500">Sistemdeki fiyatın</span>
                        {(() => {
                          const diff = ((marketPriceResult.average_price - marketPriceProduct.list_price_try) / marketPriceProduct.list_price_try * 100).toFixed(1);
                          return (
                            <span className={diff > 0 ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
                              {diff > 0 ? `%${diff} üzerinde` : `%${Math.abs(diff)} altında`}
                            </span>
                          );
                        })()}
                      </div>
                    )}

                    {/* Site listesi */}
                    {marketPriceResult.results?.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Bulunan fiyatlar</p>
                        {marketPriceResult.results.map((item, i) => (
                          <div key={i} className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm text-slate-700 truncate">{item.site}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-sm font-medium text-slate-800">
                                {item.currency === 'TRY' ? '₺' : item.currency} {Number(item.price).toLocaleString('tr-TR')}
                              </span>
                              {item.url && (
                                <a href={item.url} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-700">
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {marketPriceResult.note && (
                      <p className="text-xs text-slate-400 italic">{marketPriceResult.note}</p>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t">
                      <p className="text-xs text-slate-400">Gemini AI · 30 dk cache</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setMarketPriceCache(prev => { const n = {...prev}; delete n[marketPriceProduct.id]; return n; });
                          searchMarketPrice(marketPriceProduct);
                        }}
                        className="text-xs"
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Yenile
                      </Button>
                    </div>
                  </div>
                ) : null}
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

        </Tabs>

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
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={closeImagePreview}
                className="h-6 w-6 p-0 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </Button>
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
                Değer {bulkPriceChangeType === 'percentage' ? '(%)' : '(₺)'}
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
                  : `${bulkPriceChangeValue > 0 ? '+' : ''}${bulkPriceChangeValue}₺ eklenecek/çıkarılacak`
                }
              </p>
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

      {/* Toast Notifications */}
      <Toaster />
    </div>
  );
}
export default App;