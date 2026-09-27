import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { CartProvider, useCart } from '../../cart/CartContext';
import CartPanel, { CartAddButton } from '../CartPanel';

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../../mobile/api', () => {
  const calls = { create: [], update: [] };
  return {
    __calls: calls,
    quotes: {
      create: (p) => { calls.create.push(p); return Promise.resolve({ id: 'q1', name: p.name, total_discounted_price: 20000 }); },
      update: (id, p) => { calls.update.push(p); return Promise.resolve({}); },
    },
  };
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PANEL = { id: 'p1', name: 'Solar Panel 450W', currency: 'EUR', list_price: 200, list_price_try: 10000, discounted_price: 140, discounted_price_try: 7000 };
const memStore = () => { const m = {}; return { get: (k) => (k in m ? m[k] : null), set: (k, v) => { m[k] = v; }, m }; };
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let container; let root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); jest.useRealTimers(); });

const setVal = async (el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const btn = (txt) => [...document.body.querySelectorAll('button')].find((b) => b.textContent.includes(txt));

test('Ekle → panelde görünür; hedef net ile teklif oluşturulur, sepet boşalır, maliyet sadece göz açıkken', async () => {
  const onCreated = jest.fn();
  const renderIt = (showCost) => act(async () => root.render(
    <CartProvider storage={memStore()}>
      <CartAddButton product={PANEL} />
      <CartPanel showCost={showCost} onCreated={onCreated} onOpenEditor={() => {}} />
    </CartProvider>,
  ));
  await renderIt(false);
  expect(container.textContent).toContain('Soldaki listeden');
  await act(async () => btn('Ekle').click());
  await act(async () => container.querySelector('[aria-label="Adet artır"]').click());
  expect(container.textContent).toContain('Solar Panel 450W');
  expect(container.textContent).toContain('₺20.000'); // 2 × 10.000
  expect(container.textContent).not.toContain('Maliyet');

  await renderIt(true);
  expect(container.textContent).toContain('Maliyet ₺14.000');
  expect(container.textContent).toContain('Kâr ₺6.000');

  await setVal(container.querySelector('[aria-label="Teklif adı"]'), 'Ahmet Karavan');
  await setVal(container.querySelector('[aria-label="Hedef net toplam"]'), '18000');
  await act(async () => btn('Teklif Oluştur').click());
  await flush();
  const api = require('../../mobile/api');
  expect(api.__calls.create[0]).toMatchObject({ name: 'Ahmet Karavan', customer_name: 'Ahmet Karavan', products: [{ id: 'p1', quantity: 2 }] });
  expect(api.__calls.create[0].discount_percentage).toBeCloseTo(10); // (20000 − 18000) / 20000
  expect(api.__calls.update).toHaveLength(0); // taban aynı → düzeltme isteği gerekmez
  expect(onCreated).toHaveBeenCalled();
  expect(container.textContent).toContain('Soldaki listeden'); // sepet boşaldı
});

function Probe() { const c = useCart(); return <div data-testid="n">{c.count}|{c.form.name}</div>; }

test('sepet sunucuyla eşitlenir: yerel değişiklik gönderilir, başka cihazın değişikliği alınır', async () => {
  jest.useFakeTimers();
  let server = { items: [], form: {}, rev: 0 };
  const puts = [];
  const api = {
    get: jest.fn(() => Promise.resolve(server)),
    put: jest.fn((st) => { puts.push(st); server = { ...server, rev: server.rev + 1 }; return Promise.resolve(server); }),
  };
  const store = memStore();
  await act(async () => root.render(
    <CartProvider api={api} storage={store}>
      <CartAddButton product={PANEL} />
      <Probe />
    </CartProvider>,
  ));
  await act(async () => btn('Ekle').click());
  await act(async () => { jest.advanceTimersByTime(700); });
  expect(puts).toHaveLength(1);
  expect(puts[0].items).toEqual([{ product_id: 'p1', qty: 1, price: null }]);

  // telefon sepeti değiştirdi (rev arttı) → odaklanınca alınır
  server = { items: [{ product: PANEL, qty: 3, price: null }], form: { name: 'Telefondan' }, rev: 5 };
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  await act(async () => { await Promise.resolve(); });
  expect(container.querySelector('[data-testid="n"]').textContent).toBe('3|Telefondan');
  expect(store.m.cart_rev).toBe(5);
  await act(async () => { jest.advanceTimersByTime(700); });
  expect(puts).toHaveLength(1); // uzaktan gelen değişiklik geri gönderilmez
});
