// Servis kalemleri: alt kalem (sub: true) kendinden önceki en yakın ana kaleme bağlıdır.
// Düz liste korunur → toplam/kâr hesapları ve eski kayıtlar değişmeden çalışır.
// Kategori başlığı (header: true): yalnız ad taşır; altındaki (sonraki başlığa kadar) kalemler o kategoridedir.
// Başlık adet/fiyat/maliyet 0 taşır → mevcut toplam/kâr hesaplarına girmez.

// idx'teki ana kalemin bloğunun bittiği yer (son alt kaleminden sonraki index)
const blockEnd = (items, idx) => {
  let j = idx + 1;
  while (j < items.length && items[j]?.sub) j++;
  return j;
};

// Ana kalemin (veya alt kalemin bağlı olduğu ananın) bloğunun sonuna yeni alt kalem ekle
export const insertSubItem = (items, idx, item) => {
  const list = [...(items || [])];
  let p = idx;
  while (p > 0 && list[p]?.sub) p--;
  const at = blockEnd(list, p);
  list.splice(at, 0, { ...item, sub: true });
  return list;
};

// Ana kalem silinince alt kalemleri de gider; alt kalem ve başlık tek başına silinir (başlığın kalemleri kalır)
export const removeItemWithSubs = (items, idx) => {
  const list = items || [];
  const end = list[idx]?.sub || list[idx]?.header ? idx + 1 : blockEnd(list, idx);
  return list.filter((_, i) => i < idx || i >= end);
};

// Baştaki ya da başlığın hemen altındaki (ana kalemi olmayan) alt kalemi ana kaleme çevir
export const normalizeSubs = (items) => (items || []).map((it, i, l) => ({ ...it, sub: !it.header && i > 0 && !!it.sub && !l[i - 1].header }));

export const CATEGORY_SUGGESTIONS = ['Elektrik İşleri', 'Su İşleri', 'Gaz İşleri', 'Solar / Enerji', 'Mobilya', 'Dış Aksesuar', 'İşçilik'];
export const newHeaderItem = (name = '') => ({ name, header: true, qty: 0, unit_price: 0, unit_cost: 0, currency: 'TRY', rate: '' });

// Sürükle-bırak için kalıcı satır kimliği. shortcut: nesneye _uid yazar (kayıt payload'ı alanları tek tek seçtiği için gitmez).
// Oturum öneki: taslaktan (cache) geri gelen eski _uid'lerle çakışmasın.
const uidPrefix = Math.random().toString(36).slice(2, 7);
let uidSeq = 0;
export const itemKey = (it) => it._uid || (it._uid = `${uidPrefix}-${++uidSeq}`);

// from'daki satırı over'ın yerine taşı (aşağı → over'ın altına, yukarı → üstüne).
// Ana kalem alt kalemleriyle birlikte taşınır; ana kalem/başlık başka bir bloğun ortasına düşmez.
// Alt kalem her yere bırakılabilir; başa ya da başlığın altına düşerse ana kaleme çevrilir.
export const moveServiceItem = (items, from, over) => {
  const list = [...(items || [])];
  if (from === over || from < 0 || over < 0 || from >= list.length || over >= list.length) return list;
  const it = list[from];
  const len = it.sub || it.header ? 1 : blockEnd(list, from) - from;
  if (over > from && over < from + len) return list; // kendi bloğunun içine
  const moving = list.splice(from, len);
  let at = over > from ? over - len + 1 : over;
  if (!it.sub) {
    if (over > from) while (at < list.length && list[at]?.sub) at++;
    else while (at > 0 && list[at]?.sub) at--;
  }
  list.splice(at, 0, ...moving);
  return normalizeSubs(list);
};

// Başlığın ara toplamı: kendisinden sonraki başlığa kadar olan kalemler (alt kalemler dahil)
export const categorySubtotal = (items, idx, lineFn) => {
  let sum = 0;
  for (let j = idx + 1; j < (items || []).length && !items[j]?.header; j++) sum += lineFn(items[j]);
  return sum;
};

// Boş ana satır ayıklanırken ilk kalan alt kalem yeni ana olur; önceki bloğa bağlanmaz.
// Adı dolu başlık fiyatsız da olsa kalır; boş başlık atılır.
export const cleanServiceItems = (items) => {
  let parentKept = false;
  return (items || []).reduce((out, it) => {
    if (it.header) {
      parentKept = false;
      if ((it.name || '').trim()) out.push({ ...newHeaderItem(it.name), sub: false, ...(it._uid ? { _uid: it._uid } : {}) });
      return out;
    }
    if (!it.sub) parentKept = false;
    if (!(it.name || '').trim() && !(parseFloat(it.unit_price) > 0)) return out;
    out.push({ ...it, sub: !!it.sub && parentKept });
    parentKept = true;
    return out;
  }, []);
};

export const serviceItemQty = (qty) => {
  const value = parseFloat(qty);
  return Number.isNaN(value) ? 1 : value;
};

// KDV: kayıtta kdv_enabled + kdv_rate (%). Eski kayıtlarda alan yok → KDV'siz.
// net = indirim düşülmüş KDV hariç toplam (₺); KDV kuruşa yuvarlanır, kâra girmez.
export const DEFAULT_KDV_RATE = 20;
export const serviceKdvRate = (svc) => {
  if (!svc?.kdv_enabled) return 0;
  const r = parseFloat(String(svc.kdv_rate ?? '').replace(',', '.'));
  return Number.isFinite(r) && r >= 0 ? Math.min(r, 100) : DEFAULT_KDV_RATE;
};
export const serviceKdvAmount = (net, svc) => {
  const cents = (Number(net) || 0) * serviceKdvRate(svc);
  // İkili kayan nokta hatası yarım kuruşu aşağı düşürmesin (0,29 × %50 = 0,145).
  return Math.round(cents + Number.EPSILON * Math.max(1, Math.abs(cents))) / 100;
};
