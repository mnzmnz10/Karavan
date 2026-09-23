// Mobil ekran smoke testleri (jsdom, API mock): Servis detay/form indirimi, Ürünler gözü, Sepet, Sözleşme listesi.
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import Services from "../screens/Services";
import ServiceForm from "../screens/ServiceForm";
import Products from "../screens/Products";
import Contracts from "../screens/Contracts";
import { CartProvider, CartBar } from "../Cart";
import { SessionCtx } from "../session";

// ABDÜLKADİR ÇAKIR benzeri: brüt 77.732, iskonto 7.732 → net 70.000; işçilik (geliş 0) dahil
const SERVICE = {
  id: "s1", customer_name: "Test Müşteri", status: "in_progress", arrival_date: "2026-09-22", discount_amount: 7732,
  items: [
    { name: "Akü", qty: 1, unit_price: 40000, unit_cost: 30000, currency: "TRY" },
    { name: "Panel", qty: 2, unit_price: 13866, unit_cost: 9000, currency: "TRY" },
    { name: "İşçilik", qty: 1, unit_price: 10000, unit_cost: 0, currency: "TRY" },
  ],
};
const PRODUCTS = [
  { id: "p1", name: "Solar Panel 450W", currency: "TRY", list_price: 10000, list_price_try: 10000, discounted_price: 7000, discounted_price_try: 7000 },
];

jest.mock("../api", () => {
  const calls = { svcUpdate: [], svcCreate: [] };
  const ok = (v) => () => Promise.resolve(v);
  return {
    __esModule: true,
    __calls: calls,
    quotes: { list: ok([]), create: ok({}), update: ok({}) },
    products: { list: () => Promise.resolve(global.__PRODUCTS) },
    categories: { list: ok([{ id: "c1", name: "Solar" }]) },
    companies: { list: ok([]) },
    services: {
      list: () => Promise.resolve([global.__SERVICE]),
      get: () => Promise.resolve(global.__SERVICE),
      update: (id, p) => { calls.svcUpdate.push(p); return Promise.resolve({ ...global.__SERVICE, ...p }); },
      create: (p) => { calls.svcCreate.push(p); return Promise.resolve({ id: "s2", ...p }); },
      remove: ok({}),
    },
    docUrl: { quote: () => "", service: () => "", contract: () => "" },
    openDoc: () => {},
    default: {
      get: (url) => Promise.resolve({ data: url === "/contracts" ? [{ id: "k1", title: "IVECO Karavan", stage: "proposal", data: { grandTotal: 1000, kur: 40, sections: [] } }] : [] }),
      put: ok({ data: {} }), post: ok({ data: {} }), delete: ok({ data: {} }),
    },
  };
});
jest.mock("sonner", () => { const f = () => {}; const t = () => {}; t.success = f; t.error = f; t.warning = f; return { toast: t }; });

global.IS_REACT_ACT_ENVIRONMENT = true;
global.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
let container, root;
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));
const text = () => container.textContent.replace(/\s+/g, " ");
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await flush(); };
const btnWith = (t) => Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes(t));
const money = (n) => Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 0 });
const render = async (el) => { await act(async () => { root.render(el); }); await flush(); };
const setVal = async (input, v) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  await act(async () => { setter.call(input, v); input.dispatchEvent(new Event("input", { bubbles: true })); });
};

beforeEach(() => {
  global.__SERVICE = JSON.parse(JSON.stringify(SERVICE));
  global.__PRODUCTS = PRODUCTS;
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

test("servis listesi net tutarı, detay iskonto + göz arkasında kâr", async () => {
  await render(<Services />);
  expect(text()).toContain(`₺${money(70000)}`); // satırda net
  const row = Array.from(container.querySelectorAll("div")).find((d) => d.textContent.trim() === "Test Müşteri");
  await click(row);
  expect(text()).toContain("İskonto");
  expect(text()).not.toContain("BRÜT KAZANÇ");
  const eyes = container.querySelectorAll('button[aria-label="Göster/Gizle"]');
  eyes.forEach((b) => expect(b.textContent.trim()).toBe(""));
  await click(eyes[eyes.length - 1]);
  const cost = 30000 + 18000 + 0;
  expect(text()).toContain(money(70000 - cost)); // kâr = net − geliş
});

test("servis formu: iskonto görünür, % → ₺, net + kâr göz arkasında, kayıt payload", async () => {
  await render(<ServiceForm open initial={global.__SERVICE} onClose={() => {}} onSaved={() => {}} prodCost={{}} />);
  expect(text()).toContain(`Net toplam₺${money(70000)}`);
  expect(text()).not.toContain("Brüt kazanç");
  expect(container.querySelector('input[placeholder="birim"]')).toBeNull(); // geliş girişi gizli
  await click(container.querySelector('button[aria-label="Göster/Gizle"]'));
  expect(text()).toContain(`Brüt kazanç₺${money(70000 - 48000)}`);
  expect(text()).toContain("İşçilik (tamamı kâr)");
  expect(container.querySelectorAll('input[placeholder="birim"]').length).toBe(3);

  // % alanına 10 yaz + blur → ₺ = 7.773,2
  const pct = container.querySelector('input[placeholder="%"]');
  await setVal(pct, "10");
  await act(async () => { pct.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
  await flush();
  expect(text()).toContain(`Net toplam₺${money(77732 * 0.9)}`);
  const api = require("../api");
  await click(btnWith("Kaydet"));
  const p = api.__calls.svcUpdate.at(-1);
  expect(p.discount_amount).toBeCloseTo(7773.2, 2);
  expect(p.discount_percent).toBeCloseTo(10, 2);
  expect(p.items.find((i) => i.name === "İşçilik").unit_cost).toBe(0);
  expect(p.fromQuote).toBeUndefined();
});

test("teklif aktarımı: taslak yüklenmez, taslak yazılmaz", async () => {
  localStorage.setItem("mz:service_draft", JSON.stringify({ customer_name: "ESKİ TASLAK" }));
  const init = { fromQuote: true, customer_name: "Tekliften", items: [{ name: "X", qty: 1, unit_price: 100, unit_cost: 0, currency: "TRY" }], discount_amount: 10 };
  await render(<ServiceForm open initial={init} onClose={() => {}} onSaved={() => {}} prodCost={{}} />);
  expect(container.querySelector("input").value).toBe("Tekliften");
  expect(text()).toContain(`Net toplam₺${money(90)}`);
  expect(localStorage.getItem("mz:service_draft")).toContain("ESKİ TASLAK");
});

test("ürünler: liste fiyatı görünür, göz indirimliyi açar, yazısız", async () => {
  await render(
    <SessionCtx.Provider value={{ username: "t" }}>
      <CartProvider><Products /><CartBar /></CartProvider>
    </SessionCtx.Provider>
  );
  await act(() => new Promise((r) => setTimeout(r, 600))); // arama debounce
  expect(text()).toContain("Solar Panel 450W");
  expect(text()).toContain(money(10000));
  expect(text()).not.toContain(money(7000));
  const eye = container.querySelector('button[aria-label="Göster/Gizle"]');
  expect(eye.textContent.trim()).toBe("");
  await click(eye);
  expect(text()).toContain(money(7000));
});

test("sözleşme listesi render", async () => {
  await render(<Contracts />);
  expect(text()).toContain("IVECO Karavan");
});
