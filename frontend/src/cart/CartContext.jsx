// Ortak teklif sepeti: mobil ve masaüstü aynı sağlayıcıyı kullanır.
// - Yerelde saklanır (uygulama kapanınca yarım teklif korunur)
// - Sunucuyla eşitlenir (GET/PUT /api/cart): telefonda başlanan sepet bilgisayarda görünür.
//   Yerel değişiklik 600 ms sonra gönderilir; uzak değişiklik (rev büyümüş) yerelde bekleyen düzenleme yoksa alınır.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { EMPTY_FORM, num, unitTRY } from './cartLogic';

const CartCtx = createContext(null);
export const useCart = () => useContext(CartCtx);

const POLL_MS = 15000;
const PUSH_DELAY = 600;

const toMap = (list) => {
  const m = new Map();
  (Array.isArray(list) ? list : []).forEach((x) => {
    if (x?.product?.id) m.set(x.product.id, { product: x.product, qty: x.qty || 1, price: x.price ?? null });
  });
  return m;
};

export function CartProvider({ api, storage, onAdd, extra, children }) {
  const [items, setItems] = useState(() => toMap(storage?.get('cart')));
  const [form, setFormState] = useState(() => {
    const f = storage?.get('cart_form');
    return { ...EMPTY_FORM, ...(f && typeof f === 'object' ? f : {}) };
  });
  const itemsRef = useRef(items);
  const formRef = useRef(form);
  itemsRef.current = items;
  formRef.current = form;

  const revRef = useRef(Number(storage?.get('cart_rev')) || 0);
  const dirtyRef = useRef(false);     // gönderilmemiş yerel değişiklik var
  const inflightRef = useRef(false);  // PUT sürüyor
  const timerRef = useRef(null);
  const [syncState, setSyncState] = useState('idle'); // idle | saving | offline

  const push = useCallback(async () => {
    if (!api?.put) return;
    if (inflightRef.current) { clearTimeout(timerRef.current); timerRef.current = setTimeout(push, 400); return; }
    inflightRef.current = true;
    dirtyRef.current = false;
    setSyncState('saving');
    try {
      const r = await api.put({
        items: Array.from(itemsRef.current.values()).map((x) => {
          const p = num(x.price);
          return { product_id: x.product.id, qty: Math.max(1, x.qty | 0), price: x.price != null && x.price !== '' && p >= 0 ? p : null };
        }),
        form: formRef.current,
      });
      revRef.current = r?.rev ?? revRef.current;
      storage?.set('cart_rev', revRef.current);
      setSyncState('idle');
    } catch {
      dirtyRef.current = true; // sonraki değişiklikte / yoklamada yeniden denenir
      setSyncState('offline');
    } finally {
      inflightRef.current = false;
    }
  }, [api, storage]);

  const applyRemote = useCallback((r) => {
    setItems(toMap(r.items));
    setFormState({ ...EMPTY_FORM, ...(r.form || {}) });
    revRef.current = r.rev || 0;
    storage?.set('cart_rev', revRef.current);
  }, [storage]);

  const pull = useCallback(async (initial = false) => {
    if (!api?.get || inflightRef.current) return;
    try {
      const r = await api.get();
      if (!r || dirtyRef.current || inflightRef.current) return;
      if (!r.rev) {
        // sunucuda hiç sepet yok: bu cihazda (özellik öncesinden) kalan sepet varsa yukarı gönder
        if (initial && (itemsRef.current.size || (formRef.current.name || '').trim())) { dirtyRef.current = true; push(); }
        return;
      }
      // ilk açılışta ürünler güncel fiyatla gelsin diye rev aynı olsa da al
      if (initial || r.rev !== revRef.current) applyRemote(r);
      setSyncState('idle');
    } catch {
      setSyncState('offline');
    }
  }, [api, push, applyRemote]);

  // Yerel kayıt + (yerel değişiklikse) sunucuya gönder
  useEffect(() => {
    storage?.set('cart', Array.from(items.values()));
    storage?.set('cart_form', form);
    if (!dirtyRef.current || !api?.put) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(push, PUSH_DELAY);
  }, [items, form, storage, api, push]);

  // İlk yükleme + odak/görünürlük + periyodik yoklama
  useEffect(() => {
    if (!api?.get) return undefined;
    pull(true);
    const onFocus = () => { if (document.visibilityState === 'visible') pull(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    const t = setInterval(() => { if (document.visibilityState === 'visible') pull(); }, POLL_MS);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      clearInterval(t);
    };
  }, [api, pull]);

  // Sayfa kapanırken bekleyen değişikliği gönder
  useEffect(() => () => { if (dirtyRef.current) push(); }, [push]);

  const edit = (fn) => { dirtyRef.current = true; fn(); };

  const add = (product, qty = 1) => {
    edit(() => setItems((prev) => {
      const n = new Map(prev);
      const cur = n.get(product.id);
      n.set(product.id, { product, qty: (cur?.qty || 0) + qty, price: cur?.price ?? null });
      return n;
    }));
    onAdd?.(product);
  };
  const setQty = (id, qty) => edit(() => setItems((prev) => {
    const n = new Map(prev);
    if (qty <= 0) n.delete(id);
    else if (n.has(id)) n.set(id, { ...n.get(id), qty });
    return n;
  }));
  const remove = (id) => setQty(id, 0);
  // Özel satış fiyatı (TL); boş → listeye döner
  const setPrice = (id, price) => edit(() => setItems((prev) => {
    const n = new Map(prev);
    if (n.has(id)) n.set(id, { ...n.get(id), price: price === '' || price == null ? null : price });
    return n;
  }));
  const setForm = (patch) => edit(() => setFormState((f) => ({ ...f, ...(typeof patch === 'function' ? patch(f) : patch) })));
  const clear = () => edit(() => { setItems(new Map()); setFormState({ ...EMPTY_FORM }); });

  const rows = useMemo(() => Array.from(items.values()), [items]);
  const count = useMemo(() => rows.reduce((a, x) => a + x.qty, 0), [rows]);
  const total = useMemo(() => rows.reduce((a, x) => a + unitTRY(x) * x.qty, 0), [rows]);

  const value = { items, rows, add, setQty, setPrice, remove, clear, count, total, form, setForm, syncState, refresh: () => pull(), ...(extra || {}) };
  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}
