import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { CartProvider, useCart } from '../../cart/CartContext';
import CartPanel, { CartAddButton } from '../CartPanel';

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PANEL = { id: 'p1', name: 'Solar Panel 450W', currency: 'EUR', list_price: 200, list_price_try: 10000, discounted_price: 140, discounted_price_try: 7000 };
const memStore = () => { const m = {}; return { get: (k) => (k in m ? m[k] : null), set: (k, v) => { m[k] = v; }, m }; };

let container; let root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); jest.useRealTimers(); });

const btn = (txt) => [...document.body.querySelectorAll('button')].find((b) => b.textContent.includes(txt));

test('Ekle → yatay çubukta görünür; adet/çıkar çalışır; Teklif Oluştur editöre aktarım çağırır', async () => {
  const onCreate = jest.fn();
  await act(async () => root.render(
    <CartProvider storage={memStore()}>
      <CartAddButton product={PANEL} />
      <CartPanel onCreate={onCreate} />
    </CartProvider>,
  ));
  expect(container.querySelector('[aria-label="Teklif sepeti"]')).toBeNull(); // boşken çubuk yok
  await act(async () => btn('Ekle').click());
  const bar = container.querySelector('[aria-label="Teklif sepeti"]');
  expect(bar.textContent).toContain('Solar Panel 450W');
  await act(async () => bar.querySelector('[aria-label="Adet artır"]').click());
  expect(bar.textContent).toContain('₺20.000'); // 2 × 10.000 liste
  expect(bar.textContent).not.toMatch(/İskonto|İşçilik|Maliyet/);
  await act(async () => btn('Teklif Oluştur').click());
  expect(onCreate).toHaveBeenCalled();
  await act(async () => bar.querySelector('[aria-label="Solar Panel 450W sepetten çıkar"]').click());
  expect(container.querySelector('[aria-label="Teklif sepeti"]')).toBeNull();
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
