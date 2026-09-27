// Teklif sepeti hesapları — mobil sepet ve masaüstü panel aynı kuralları kullanır.
// Satış = LİSTE fiyatı (backend teklifi list_price_try'den hesaplar; indirimli = alış, müşteriye gösterilmez).

export const EMPTY_FORM = {
  name: '', customer: '', discount: '', discTL: '', targetNet: '', discMode: 'pct', labor: '', notes: '', manualItems: [],
};

export const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

export const priceTRY = (p) => Number(p?.list_price_try) || 0;
// Ürünün TL kuru (1 birim döviz = ? ₺) — özel fiyatı ürün para birimine çevirmek için
export const rateOf = (p) => ((p?.currency || 'TRY') === 'TRY' ? 1 : (Number(p?.list_price) > 0 ? Number(p.list_price_try) / Number(p.list_price) : 0));
// Satır birim satış (TL): özel fiyat girildiyse o, yoksa liste
export const unitTRY = (x) => (x.price != null && x.price !== '' ? Number(x.price) || 0 : priceTRY(x.product));
// Birim alış (TL): tedarikçi grubunda en ucuz, yoksa indirimli, yoksa liste
export const costTRY = (p) => Number(p?.best_discounted_price_try) || Number(p?.discounted_price_try) || priceTRY(p);

export function cartTotals(rows, form) {
  const itemsTotal = rows.reduce((a, x) => a + unitTRY(x) * x.qty, 0);
  const manual = form.manualItems || [];
  const manualTotal = manual.reduce((a, m) => a + (parseFloat(m.price) || 0) * (parseFloat(m.qty) || 1), 0);
  const subtotal = itemsTotal + manualTotal;
  const discPct = Math.min(100, Math.max(0, parseFloat(form.discount) || 0));
  const laborTL = Math.max(0, parseFloat(form.labor) || 0);
  const discAmt = subtotal * (discPct / 100);
  const grand = subtotal - discAmt + laborTL;
  const cost = rows.reduce((a, x) => a + costTRY(x.product) * x.qty, 0)
    + manual.reduce((a, m) => a + (parseFloat(m.cost) || 0) * (parseFloat(m.qty) || 1), 0);
  return { itemsTotal, manualTotal, subtotal, discPct, discAmt, laborTL, grand, cost, profit: grand - cost };
}

// İndirim çift yön: % girilince ₺ hesaplanır, ₺ girilince %; net hedefi indirimi tam ayarlar. Form yaması döner.
export function discountPatch(kind, v, subtotal, laborTL) {
  if (kind === 'pct') {
    const pct = Math.min(100, Math.max(0, parseFloat(v) || 0));
    return { discMode: 'pct', discount: v, targetNet: '', discTL: pct > 0 && subtotal > 0 ? String(Math.round(subtotal * pct / 100)) : '' };
  }
  if (kind === 'tl') {
    const tl = Math.max(0, parseFloat(v) || 0);
    return { discMode: 'tl', discTL: v, targetNet: '', discount: tl > 0 && subtotal > 0 ? String(Math.min(100, tl / subtotal * 100)) : '' };
  }
  const target = parseFloat(v);
  if (isNaN(target)) return { discMode: 'net', targetNet: v, discount: '', discTL: '' };
  const discAmt = Math.max(0, Math.min(subtotal, subtotal + laborTL - target));
  return { discMode: 'net', targetNet: v, discount: subtotal > 0 ? String(discAmt / subtotal * 100) : '', discTL: String(Math.round(discAmt)) };
}

// Sepet + form → teklif oluştur. Sepetteki TL fiyatlar eklendiği anın kuruyla; sunucu güncel kurla fiyatlar.
// ₺ indirim ya da hedef net girildiyse yüzde sunucunun gerçek tabanıyla yeniden hesaplanır → net TAM tutar.
export async function submitCartQuote(rows, form, { create, update }) {
  const manual = (form.manualItems || []).filter((m) => (m.name || '').trim() && parseFloat(m.price) > 0);
  if (rows.length === 0 && manual.length === 0) throw new Error('En az bir ürün veya kalem ekleyin');
  const name = (form.name || '').trim();
  if (!name) throw new Error('Teklif adı girin');
  const { discPct, laborTL } = cartTotals(rows, form);
  const doc = await create({
    name,
    customer_name: (form.customer || '').trim() || name,
    discount_percentage: discPct,
    labor_cost: laborTL,
    notes: (form.notes || '').trim() || undefined,
    products: [
      ...rows.map((x) => {
        const o = { id: x.product.id, quantity: x.qty };
        // Özel fiyat ürün para biriminde gönderilir (backend custom_price × güncel kur)
        if (x.price != null && x.price !== '' && rateOf(x.product) > 0) o.custom_price = (Number(x.price) || 0) / rateOf(x.product);
        return o;
      }),
      ...manual.map((m) => ({
        manual: true,
        name: m.name.trim(),
        price: parseFloat(m.price) || 0,
        quantity: Math.max(1, parseInt(m.qty, 10) || 1),
        cost: m.cost === '' || m.cost == null ? undefined : (parseFloat(m.cost) || 0),
        currency: 'TRY',
      })),
    ],
  });
  const base = Number(doc?.total_discounted_price) || 0;
  let wantPct = null;
  if (form.discMode === 'net' && Number.isFinite(parseFloat(form.targetNet)) && base > 0) {
    wantPct = Math.min(100, Math.max(0, (base + laborTL - parseFloat(form.targetNet)) / base * 100));
  } else if (form.discMode === 'tl' && parseFloat(form.discTL) > 0 && base > 0) {
    wantPct = Math.min(100, parseFloat(form.discTL) / base * 100);
  }
  if (wantPct != null && doc?.id && Math.abs(wantPct - discPct) > 1e-9) {
    try { await update(doc.id, { discount_percentage: wantPct }); } catch { /* yüzde düzeltmesi opsiyonel */ }
  }
  return doc;
}
