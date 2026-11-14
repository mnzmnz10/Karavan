// Servis kalemleri: alt kalem (sub: true) kendinden önceki en yakın ana kaleme bağlıdır.
// Düz liste korunur → toplam/kâr hesapları ve eski kayıtlar değişmeden çalışır.

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

// Ana kalem silinince alt kalemleri de gider; alt kalem tek başına silinir
export const removeItemWithSubs = (items, idx) => {
  const list = items || [];
  const end = list[idx]?.sub ? idx + 1 : blockEnd(list, idx);
  return list.filter((_, i) => i < idx || i >= end);
};

// Kayıttan önce: baştaki (ana kalemi olmayan) alt kalemi ana kaleme çevir
export const normalizeSubs = (items) => (items || []).map((it, i) => ({ ...it, sub: i > 0 && !!it.sub }));

// Boş ana satır ayıklanırken ilk kalan alt kalem yeni ana olur; önceki bloğa bağlanmaz.
export const cleanServiceItems = (items) => {
  let parentKept = false;
  return (items || []).reduce((out, it) => {
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
