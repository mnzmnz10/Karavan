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
  { id: "p2", name: "Favori Akü", is_favorite: true, currency: "TRY", list_price: 5000, list_price_try: 5000, discounted_price: 4000, discounted_price_try: 4000 },
  { id: "p1", name: "Solar Panel 450W", currency: "TRY", list_price: 10000, list_price_try: 10000, discounted_price: 7000, discounted_price_try: 7000 },
];

jest.mock("../api", () => {
  const calls = { svcUpdate: [], svcCreate: [], qCreate: [], qUpdate: [], fav: [] };
  const ok = (v) => () => Promise.resolve(v);
  return {
    __esModule: true,
    __calls: calls,
    quotes: {
      list: ok([]),
      create: (p) => { calls.qCreate.push(p); return Promise.resolve({ id: "qn", total_discounted_price: 11000 }); }, // sunucu güncel kur tabanı
      update: (id, p) => { calls.qUpdate.push(p); return Promise.resolve({}); },
    },
    products: {
      list: () => Promise.resolve(global.__PRODUCTS),
      favorites: () => Promise.resolve(global.__PRODUCTS.filter((p) => p.is_favorite)),
      toggleFavorite: (id) => { calls.fav.push(id); return Promise.resolve({ success: true, is_favorite: true }); },
    },
    categories: { list: ok([{ id: "c1", name: "Solar" }]) },
    companies: { list: ok([]) },
    rates: { get: ok({ TRY: 1, EUR: 55.9, USD: 48.838 }) },
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

test("sepet: hedef net sunucu tabanıyla uzlaştırılır (eski kurlu sepet)", async () => {
  await render(
    <SessionCtx.Provider value={{ username: "t" }}>
      <CartProvider><Products /><CartBar /></CartProvider>
    </SessionCtx.Provider>
  );
  await act(() => new Promise((r) => setTimeout(r, 600)));
  await click(container.querySelector('button[title="Teklife ekle"]'));
  await click(btnWith("Teklif Oluştur"));
  await setVal(container.querySelector('input[placeholder="Teklif adı *"]'), "Sepet Test");
  await setVal(container.querySelector('input[placeholder^="Net toplamı ayarla"]'), "9000");
  const createBtn = Array.from(container.querySelectorAll("button")).filter((b) => b.textContent.includes("Teklif Oluştur")).at(-1);
  await click(createBtn);
  const api = require("../api");
  expect(api.__calls.qCreate.length).toBe(1);
  const pct = api.__calls.qUpdate.at(-1).discount_percentage;
  expect(11000 * (1 - pct / 100)).toBeCloseTo(9000, 6); // sunucu tabanında tam 9.000
});

test("ürünler: favoriler kartı + detayda yıldız toggle", async () => {
  await render(
    <SessionCtx.Provider value={{ username: "t" }}>
      <CartProvider><Products /></CartProvider>
    </SessionCtx.Provider>
  );
  await act(() => new Promise((r) => setTimeout(r, 600)));
  await click(btnWith("Favoriler"));
  await act(() => new Promise((r) => setTimeout(r, 600)));
  expect(text()).toContain("Favori Akü");
  expect(text()).not.toContain("Solar Panel 450W");
  await click(btnWith("Tümü"));
  await act(() => new Promise((r) => setTimeout(r, 600)));
  const row = Array.from(container.querySelectorAll("div")).find((d) => d.textContent.trim() === "Solar Panel 450W");
  await click(row);
  await click(container.querySelector('button[aria-label="Favori"]'));
  const api = require("../api");
  expect(api.__calls.fav).toEqual(["p1"]);
  expect(container.querySelector('button[aria-label="Favori"] svg').getAttribute("style")).toContain("fill");
});

test("yeni servis: eski kayıttan müşteri önerisi → telefon/plaka dolar", async () => {
  localStorage.setItem("mz:services", JSON.stringify([{ customer_name: "Mustafa Akçaoluk", phone: "05551112233", plate: "59 AB 123", vehicle_brand: "Fiat", arrival_date: "2026-09-01" }]));
  await render(<ServiceForm open initial={null} onClose={() => {}} onSaved={() => {}} prodCost={{}} />);
  const nameInput = container.querySelector('input[placeholder="Zorunlu"]');
  await setVal(nameInput, "must");
  const sug = btnWith("Mustafa Akçaoluk");
  expect(sug).toBeTruthy();
  await click(sug);
  expect(nameInput.value).toBe("Mustafa Akçaoluk");
  expect(container.querySelector('input[inputmode="tel"]').value).toBe("05551112233");
  expect(btnWith("59 AB 123")).toBeFalsy(); // öneri kapandı
});

test("servis formu: katalogdan ekle → satış liste, geliş indirimli", async () => {
  await render(<ServiceForm open initial={{ id: "s9", customer_name: "X", items: [] }} onClose={() => {}} onSaved={() => {}} prodCost={{}} />);
  await setVal(container.querySelector('input[placeholder="Katalogdan ürün ekle"]'), "sola");
  await click(btnWith("Solar Panel 450W"));
  const names = Array.from(container.querySelectorAll('input[placeholder="Parça/işlem"]')).map((i) => i.value);
  expect(names).toEqual(["Solar Panel 450W"]);
  const api = require("../api");
  await click(btnWith("Kaydet"));
  const it = api.__calls.svcUpdate.at(-1).items[0];
  expect(it).toMatchObject({ unit_price: 10000, unit_cost: 7000, qty: 1 });
});

test("servis tahsilat: kalan hesap, USD tahsilat ekle (kur), sil", async () => {
  global.__SERVICE.collections = [{ id: "c1", date: "2026-09-23", description: "EFT", amount: 30000, currency: "TRY", rate: null }];
  global.confirm = () => true;
  await render(<Services />);
  const row = Array.from(container.querySelectorAll("div")).find((d) => d.textContent.trim() === "Test Müşteri");
  await click(row);
  expect(text()).toContain(`Tahsil edilen₺${money(30000)}`);
  expect(text()).toContain(`Kalan₺${money(40000)}`);
  await click(btnWith("Tahsilat Ekle"));
  await setVal(container.querySelector('input[placeholder="Tutar"]'), "500");
  const sel = container.querySelector("select");
  await act(async () => { sel.value = "USD"; sel.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(container.querySelector('input[placeholder="kur"]').value).toBe("48.84");
  const saves = Array.from(container.querySelectorAll("button")).filter((b) => b.textContent.trim() === "Kaydet");
  await click(saves.at(-1));
  const api = require("../api");
  const p = api.__calls.svcUpdate.at(-1);
  expect(p.collections.length).toBe(2);
  expect(p.collections[1]).toMatchObject({ amount: 500, currency: "USD", rate: 48.84 });
  expect(text()).toContain(`Kalan₺${money(40000 - 500 * 48.84)}`);
  await click(container.querySelector('button[aria-label="Tahsilatı sil"]'));
  expect(api.__calls.svcUpdate.at(-1).collections.map((c) => c.id)).not.toContain("c1");
});

test("servis formu: garanti/ödeme hesabı payload", async () => {
  await render(<ServiceForm open initial={{ ...global.__SERVICE, warranty_months: 6 }} onClose={() => {}} onSaved={() => {}} prodCost={{}} />);
  const w = container.querySelector('input[placeholder="Kapsam…"]');
  await setVal(w, "Akü 2 yıl");
  const api = require("../api");
  await click(btnWith("Kaydet"));
  const p = api.__calls.svcUpdate.at(-1);
  expect(p.warranty_months).toBe(6);
  expect(p.warranty_note).toBe("Akü 2 yıl");
  expect(p.payment_account).toBeNull();
});

test("sözleşme aşama filtresi", async () => {
  await render(<Contracts />);
  await click(btnWith("Anlaşıldı"));
  expect(text()).not.toContain("IVECO Karavan");
  await click(btnWith("Teklif"));
  expect(text()).toContain("IVECO Karavan");
});

test("servis Ödenmemiş filtresi", async () => {
  await render(<Services />);
  await click(btnWith("Ödenmemiş"));
  expect(text()).toContain("Test Müşteri"); // net 70.000, tahsilat yok
  global.__SERVICE.collections = [{ id: "c", amount: 70000, currency: "TRY" }];
});

test("durum Teslim'e geçince teslim tarihi bugün", async () => {
  await render(<Services />);
  const pill = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.trim() === "İşlemde");
  await click(pill);
  const api = require("../api");
  const p = api.__calls.svcUpdate.at(-1);
  expect(p.status).toBe("delivered");
  expect(p.delivery_date).toBe(new Date().toISOString().slice(0, 10));
});

test("sepet: liste fiyatı (alış gizli) + özel fiyat custom_price olarak gider", async () => {
  await render(
    <SessionCtx.Provider value={{ username: "t" }}>
      <CartProvider><Products /><CartBar /></CartProvider>
    </SessionCtx.Provider>
  );
  await act(() => new Promise((r) => setTimeout(r, 600)));
  const addBtns = container.querySelectorAll('button[title="Teklife ekle"]');
  await click(addBtns[addBtns.length - 1]); // Solar Panel 450W (liste 10.000, alış 7.000)
  expect(btnWith("Teklif Oluştur").textContent).toContain(money(10000));
  await click(btnWith("Teklif Oluştur"));
  expect(text()).not.toContain(money(7000));
  await setVal(container.querySelector('input[aria-label="Birim fiyat"]'), "9500");
  await setVal(container.querySelector('input[placeholder="Teklif adı *"]'), "Özel Fiyat");
  const createBtn = Array.from(container.querySelectorAll("button")).filter((b) => b.textContent.includes("Teklif Oluştur")).at(-1);
  expect(createBtn.textContent).toContain(money(9500));
  await click(createBtn);
  const api = require("../api");
  expect(api.__calls.qCreate.at(-1).products[0]).toEqual({ id: "p1", quantity: 1, custom_price: 9500 });
});
