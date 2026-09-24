// Mobil ekran smoke testleri (jsdom, API mock): Servis detay/form indirimi, Ürünler gözü, Sepet, Sözleşme listesi.
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import Services from "../screens/Services";
import ServiceForm from "../screens/ServiceForm";
import Products from "../screens/Products";
import Contracts, { contractStatementText } from "../screens/Contracts";
import Dashboard from "../screens/Dashboard";
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
const text = () => document.body.textContent.replace(/\s+/g, " ");
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await flush(); };
const btnWith = (t) => Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent.includes(t));
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
  const row = Array.from(document.body.querySelectorAll("div")).find((d) => d.textContent.trim() === "Test Müşteri");
  await click(row);
  expect(text()).toContain("İskonto");
  expect(text()).not.toContain("BRÜT KAZANÇ");
  const eyes = document.body.querySelectorAll('button[aria-label="Göster/Gizle"]');
  eyes.forEach((b) => expect(b.textContent.trim()).toBe(""));
  await click(eyes[eyes.length - 1]);
  const cost = 30000 + 18000 + 0;
  expect(text()).toContain(money(70000 - cost)); // kâr = net − geliş
});

test("servis formu: iskonto görünür, % → ₺, net + kâr göz arkasında, kayıt payload", async () => {
  await render(<ServiceForm open initial={global.__SERVICE} onClose={() => {}} onSaved={() => {}} prodCost={{}} />);
  expect(text()).toContain(`Net toplam₺${money(70000)}`);
  expect(text()).not.toContain("Brüt kazanç");
  expect(document.body.querySelector('input[placeholder="birim"]')).toBeNull(); // geliş girişi gizli
  await click(document.body.querySelector('button[aria-label="Göster/Gizle"]'));
  expect(text()).toContain(`Brüt kazanç₺${money(70000 - 48000)}`);
  expect(text()).toContain("İşçilik (tamamı kâr)");
  expect(document.body.querySelectorAll('input[placeholder="birim"]').length).toBe(3);

  // % alanına 10 yaz + blur → ₺ = 7.773,2
  const pct = document.body.querySelector('input[placeholder="%"]');
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
  expect(document.body.querySelector("input").value).toBe("Tekliften");
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
  const eye = document.body.querySelector('button[aria-label="Göster/Gizle"]');
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
  await click(document.body.querySelector('button[title="Teklife ekle"]'));
  await click(btnWith("Teklif Oluştur"));
  await setVal(document.body.querySelector('input[placeholder="Teklif adı *"]'), "Sepet Test");
  await setVal(document.body.querySelector('input[placeholder^="Net toplamı ayarla"]'), "9000");
  const createBtn = Array.from(document.body.querySelectorAll("button")).filter((b) => b.textContent.includes("Teklif Oluştur")).at(-1);
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
  const row = Array.from(document.body.querySelectorAll("div")).find((d) => d.textContent.trim() === "Solar Panel 450W");
  await click(row);
  await click(document.body.querySelector('button[aria-label="Favori"]'));
  const api = require("../api");
  expect(api.__calls.fav).toEqual(["p1"]);
  expect(document.body.querySelector('button[aria-label="Favori"] svg').getAttribute("style")).toContain("fill");
});

test("yeni servis: eski kayıttan müşteri önerisi → telefon/plaka dolar", async () => {
  localStorage.setItem("mz:services", JSON.stringify([{ customer_name: "Mustafa Akçaoluk", phone: "05551112233", plate: "59 AB 123", vehicle_brand: "Fiat", arrival_date: "2026-09-01" }]));
  await render(<ServiceForm open initial={null} onClose={() => {}} onSaved={() => {}} prodCost={{}} />);
  const nameInput = document.body.querySelector('input[placeholder="Zorunlu"]');
  await setVal(nameInput, "must");
  const sug = btnWith("Mustafa Akçaoluk");
  expect(sug).toBeTruthy();
  await click(sug);
  expect(nameInput.value).toBe("Mustafa Akçaoluk");
  expect(document.body.querySelector('input[inputmode="tel"]').value).toBe("05551112233");
  expect(btnWith("59 AB 123")).toBeFalsy(); // öneri kapandı
});

test("servis formu: katalogdan ekle → satış liste, geliş indirimli", async () => {
  await render(<ServiceForm open initial={{ id: "s9", customer_name: "X", items: [] }} onClose={() => {}} onSaved={() => {}} prodCost={{}} />);
  await setVal(document.body.querySelector('input[placeholder="Katalogdan ürün ekle"]'), "sola");
  await click(btnWith("Solar Panel 450W"));
  const names = Array.from(document.body.querySelectorAll('input[placeholder="Parça/işlem"]')).map((i) => i.value);
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
  const row = Array.from(document.body.querySelectorAll("div")).find((d) => d.textContent.trim() === "Test Müşteri");
  await click(row);
  expect(text()).toContain(`Tahsil edilen₺${money(30000)}`);
  expect(text()).toContain(`Kalan₺${money(40000)}`);
  await click(btnWith("Tahsilat Ekle"));
  await setVal(document.body.querySelector('input[placeholder="Tutar"]'), "500");
  const sel = document.body.querySelector("select");
  await act(async () => { sel.value = "USD"; sel.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(document.body.querySelector('input[placeholder="kur"]').value).toBe("48.84");
  const saves = Array.from(document.body.querySelectorAll("button")).filter((b) => b.textContent.trim() === "Kaydet");
  await click(saves.at(-1));
  const api = require("../api");
  const p = api.__calls.svcUpdate.at(-1);
  expect(p.collections.length).toBe(2);
  expect(p.collections[1]).toMatchObject({ amount: 500, currency: "USD", rate: 48.84 });
  expect(text()).toContain(`Kalan₺${money(40000 - 500 * 48.84)}`);
  await click(document.body.querySelector('button[aria-label="Tahsilatı sil"]'));
  expect(api.__calls.svcUpdate.at(-1).collections.map((c) => c.id)).not.toContain("c1");
});

test("servis formu: garanti/ödeme hesabı payload", async () => {
  await render(<ServiceForm open initial={{ ...global.__SERVICE, warranty_months: 6 }} onClose={() => {}} onSaved={() => {}} prodCost={{}} />);
  const w = document.body.querySelector('input[placeholder="Kapsam…"]');
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
  const pill = Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent.trim() === "İşlemde");
  await click(pill);
  const api = require("../api");
  const p = api.__calls.svcUpdate.at(-1);
  expect(p.status).toBe("delivered");
  expect(p.delivery_date).toBe(require("../ui").todayISO());
});

test("sepet: liste fiyatı (alış gizli) + özel fiyat custom_price olarak gider", async () => {
  await render(
    <SessionCtx.Provider value={{ username: "t" }}>
      <CartProvider><Products /><CartBar /></CartProvider>
    </SessionCtx.Provider>
  );
  await act(() => new Promise((r) => setTimeout(r, 600)));
  const addBtns = document.body.querySelectorAll('button[title="Teklife ekle"]');
  await click(addBtns[addBtns.length - 1]); // Solar Panel 450W (liste 10.000, alış 7.000)
  expect(btnWith("Teklif Oluştur").textContent).toContain(money(10000));
  await click(btnWith("Teklif Oluştur"));
  expect(text()).not.toContain(money(7000));
  await setVal(document.body.querySelector('input[aria-label="Birim fiyat"]'), "9500");
  await setVal(document.body.querySelector('input[placeholder="Teklif adı *"]'), "Özel Fiyat");
  const createBtn = Array.from(document.body.querySelectorAll("button")).filter((b) => b.textContent.includes("Teklif Oluştur")).at(-1);
  expect(createBtn.textContent).toContain(money(9500));
  await click(createBtn);
  const api = require("../api");
  expect(api.__calls.qCreate.at(-1).products[0]).toEqual({ id: "p1", quantity: 1, custom_price: 9500 });
});

test("ürün detayı: göz açıkken son tekliflerdeki fiyat", async () => {
  localStorage.setItem("mz:quotes", JSON.stringify([{ id: "qa", name: "Ahmet Karavan", created_at: "2026-09-01", products: [{ id: "p1", list_price_try: 9800, quantity: 2, custom_price: 9800 }] }]));
  localStorage.setItem("mz:show_disc", "true");
  await render(
    <SessionCtx.Provider value={{ username: "t" }}>
      <CartProvider><Products /></CartProvider>
    </SessionCtx.Provider>
  );
  await act(() => new Promise((r) => setTimeout(r, 600)));
  const row = Array.from(document.body.querySelectorAll("div")).find((d) => d.textContent.trim() === "Solar Panel 450W");
  await click(row);
  expect(text()).toContain("Son tekliflerde (1)");
  expect(text()).toContain("Ahmet Karavan");
  expect(text()).toContain(`₺${money(9800)}`);
});

test("sepet formu taslağı kalıcı", async () => {
  localStorage.setItem("mz:cart_form", JSON.stringify({ name: "Yarım Teklif", labor: "1500" }));
  localStorage.setItem("mz:cart", JSON.stringify([{ product: global.__PRODUCTS[1], qty: 1 }]));
  await render(<CartProvider><CartBar /></CartProvider>);
  await click(btnWith("Teklif Oluştur"));
  expect(document.body.querySelector('input[placeholder="Teklif adı *"]').value).toBe("Yarım Teklif");
  await setVal(document.body.querySelector('input[placeholder="Müşteri adı (boşsa teklif adı)"]'), "Veli");
  expect(JSON.parse(localStorage.getItem("mz:cart_form")).customer).toBe("Veli");
});

test("servis Gecikmiş filtresi (sadece varsa görünür)", async () => {
  await render(<Services />);
  expect(btnWith("Gecikmiş")).toBeFalsy();
  act(() => root.unmount()); root = createRoot(container);
  global.__SERVICE.delivery_date = "2026-01-01";
  localStorage.clear();
  await render(<Services />);
  await click(btnWith("Gecikmiş"));
  expect(text()).toContain("Test Müşteri");
});

test("servis hesap özeti WhatsApp: toplam/ödenen/kalan, maliyet yok", async () => {
  global.__SERVICE.phone = "05551112233";
  global.__SERVICE.collections = [{ id: "c1", amount: 30000, currency: "TRY" }];
  await render(<Services />);
  const row = Array.from(document.body.querySelectorAll("div")).find((d) => d.textContent.trim() === "Test Müşteri");
  await click(row);
  const a = Array.from(document.body.querySelectorAll("a")).find((x) => x.textContent.includes("Hesap özeti"));
  const msg = decodeURIComponent(a.getAttribute("href").split("text=")[1]);
  expect(a.getAttribute("href")).toContain("wa.me/905551112233");
  expect(msg).toContain(`Toplam: ₺${money(70000)}`);
  expect(msg).toContain(`Ödenen: ₺${money(30000)}`);
  expect(msg).toContain(`Kalan: ₺${money(40000)}`);
  expect(msg).toContain("İskonto");
  expect(msg).not.toMatch(/maliyet|kâr|30\.000,0|9\.000/i.source ? /maliyet|kâr/i : /x/);
});

test("ürün WhatsApp paylaşımı: liste fiyatı var, alış yok", async () => {
  await render(
    <SessionCtx.Provider value={{ username: "t" }}>
      <CartProvider><Products /></CartProvider>
    </SessionCtx.Provider>
  );
  await act(() => new Promise((r) => setTimeout(r, 600)));
  const row = Array.from(document.body.querySelectorAll("div")).find((d) => d.textContent.trim() === "Solar Panel 450W");
  await click(row);
  const a = document.body.querySelector('a[aria-label="WhatsApp ile paylaş"]');
  const msg = decodeURIComponent(a.getAttribute("href").split("text=")[1]);
  expect(msg).toContain("Solar Panel 450W");
  expect(msg).toContain(`Fiyat: ₺${money(10000)}`);
  expect(msg).not.toContain(money(7000));
});

test("aynı müşteriyle yeni servis: müşteri/araç dolu, kalem boş", async () => {
  global.__SERVICE.phone = "05551112233";
  global.__SERVICE.plate = "59 AB 1";
  await render(<Services />);
  const row = Array.from(document.body.querySelectorAll("div")).find((d) => d.textContent.trim() === "Test Müşteri");
  await click(row);
  await click(btnWith("Aynı müşteriyle yeni kayıt"));
  await act(() => new Promise((r) => setTimeout(r, 250)));
  expect(text()).toContain("Yeni Servis");
  expect(document.body.querySelector('input[placeholder="Zorunlu"]').value).toBe("Test Müşteri");
  expect(document.body.querySelector('input[inputmode="tel"]').value).toBe("05551112233");
  expect(document.body.querySelectorAll('input[placeholder="Parça/işlem"]').length).toBe(0);
});

test("servisten kaynak teklife git", async () => {
  global.__SERVICE.notes = "not\n\n[Teklif: Kırklareli AFAD]";
  let went = null;
  await render(<Services go={(t) => { went = t; }} />);
  const row = Array.from(document.body.querySelectorAll("div")).find((d) => d.textContent.trim() === "Test Müşteri");
  await click(row);
  await click(btnWith("Kaynak teklifi aç"));
  expect(went).toBe("quotes");
  expect(JSON.parse(localStorage.getItem("mz:quote_search"))).toBe("Kırklareli AFAD");
});

test("Özet'ten servis detayı deep-link", async () => {
  localStorage.setItem("mz:svc_open", JSON.stringify("s1"));
  await render(<Services />);
  expect(text()).toContain("Servis Kaydı");
  expect(localStorage.getItem("mz:svc_open")).toBe("null");
});

test("servis detay: foto sil (onaylı)", async () => {
  global.__SERVICE.photos = ["data:image/jpeg;base64,AAA", "data:image/jpeg;base64,BBB"];
  global.confirm = () => true;
  await render(<Services />);
  const row = Array.from(document.body.querySelectorAll("div")).find((d) => d.textContent.trim() === "Test Müşteri");
  await click(row);
  await click(document.body.querySelectorAll('button[aria-label="Fotoğrafı sil"]')[0]);
  const api = require("../api");
  expect(api.__calls.svcUpdate.at(-1)).toEqual({ photos: ["data:image/jpeg;base64,BBB"] });
  expect(document.body.querySelectorAll('button[aria-label="Fotoğrafı sil"]').length).toBe(1);
});

test("dashboard: son 6 ay ciro grafiği", async () => {
  const d = new Date();
  global.__SERVICE.status = "delivered";
  global.__SERVICE.delivery_date = new Date(d.getFullYear(), d.getMonth(), 5, 12).toISOString().slice(0, 10);
  await render(<Dashboard go={() => {}} />);
  expect(text()).toContain("Son 6 ay teslim cirosu");
  expect(text()).toContain("70b"); // net 70.000
});

test("servis detay: adetli kalemde birim fiyat", async () => {
  await render(<Services />);
  const row = Array.from(document.body.querySelectorAll("div")).find((d) => d.textContent.trim() === "Test Müşteri");
  await click(row);
  expect(text()).toContain(`2 × ₺${money(13866)}`);
});

test("servis detay: Teslim et → status + teslim tarihi", async () => {
  await render(<Services />);
  const row = Array.from(document.body.querySelectorAll("div")).find((d) => d.textContent.trim() === "Test Müşteri");
  await click(row);
  await click(btnWith("Teslim et"));
  const api = require("../api");
  expect(api.__calls.svcUpdate.at(-1)).toEqual({ status: "delivered", delivery_date: require("../ui").todayISO() });
  expect(btnWith("Teslim et")).toBeFalsy();
});

test("daysIn: teslim edilmemiş araç gün sayısı", () => {
  const { daysIn } = require("../screens/Services");
  const d = new Date(); d.setDate(d.getDate() - 5);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  expect(daysIn({ status: "in_progress", arrival_date: iso })).toBe(5);
  expect(daysIn({ status: "delivered", arrival_date: iso })).toBeNull();
});

test("servis formu: foto alanı olmayan kayıt düzenlenince photos gönderilmez", async () => {
  const rec = { ...global.__SERVICE }; delete rec.photos;
  await render(<ServiceForm open initial={rec} onClose={() => {}} onSaved={() => {}} prodCost={{}} />);
  await click(btnWith("Kaydet"));
  const api = require("../api");
  expect("photos" in api.__calls.svcUpdate.at(-1)).toBe(false);
});

test("Teklifler '+': boş sepetle sadece manuel kalemli teklif", async () => {
  const Quotes = require("../screens/Quotes").default;
  await render(<CartProvider><Quotes go={() => {}} /></CartProvider>);
  await click(document.body.querySelector('button[aria-label="Yeni teklif"]'));
  await click(btnWith("Elle Kalem Ekle"));
  await setVal(document.body.querySelector('input[placeholder="Kalem adı"]'), "Montaj");
  await setVal(document.body.querySelector('input[placeholder="Satış ₺"]'), "3000");
  await setVal(document.body.querySelector('input[placeholder="Teklif adı *"]'), "Sadece Manuel");
  await click(Array.from(document.body.querySelectorAll("button")).filter((b) => b.textContent.includes("Teklif Oluştur")).at(-1));
  const api = require("../api");
  const p = api.__calls.qCreate.at(-1);
  expect(p.name).toBe("Sadece Manuel");
  expect(p.products).toEqual([expect.objectContaining({ manual: true, name: "Montaj", price: 3000 })]);
});

test("yeni sözleşme: bilinen müşteri adı telefonu doldurur", async () => {
  localStorage.setItem("mz:services", JSON.stringify([{ customer_name: "Mustafa Akçaoluk", phone: "05551112233" }]));
  await render(<Contracts />);
  await click(document.body.querySelector("header button, button")); // başlıktaki +
  const plus = Array.from(document.body.querySelectorAll("button")).find((b) => b.querySelector("svg") && b.className.includes("rounded-full") && b.textContent.trim() === "");
  if (!document.body.querySelector('input[placeholder="Müşteri adı"]')) await click(plus);
  await setVal(document.body.querySelector('input[placeholder="Müşteri adı"]'), "Mustafa Akçaoluk");
  expect(document.body.querySelector('input[placeholder="Telefon"]').value).toBe("0555 111 22 33");
});

test("servis Bugün filtresi", async () => {
  const d = new Date(); const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  global.__SERVICE.delivery_date = require("../ui").todayISO();
  await render(<Services />);
  const chip = Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent.trim().startsWith("Bugün"));
  expect(chip).toBeTruthy();
  await click(chip);
  expect(text()).toContain("Test Müşteri");
  void iso;
});

test("todayISO yerel tarih", () => {
  const { todayISO } = require("../ui");
  const d = new Date();
  expect(todayISO()).toBe(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
});

test("sepet: satırdan ürün çıkar", async () => {
  localStorage.setItem("mz:cart", JSON.stringify([{ product: global.__PRODUCTS[1], qty: 3 }]));
  await render(<CartProvider><CartBar /></CartProvider>);
  await click(btnWith("Teklif Oluştur"));
  await click(document.body.querySelector('button[aria-label="Sepetten çıkar"]'));
  expect(JSON.parse(localStorage.getItem("mz:cart"))).toEqual([]);
});

test("servis formu: + İşçilik geliş 0 ile eklenir", async () => {
  await render(<ServiceForm open initial={{ id: "s9", customer_name: "X", items: [] }} onClose={() => {}} onSaved={() => {}} prodCost={{}} />);
  await click(Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent.trim() === "İşçilik"));
  const priceInput = document.body.querySelector('input[placeholder="Satış"]');
  await setVal(priceInput, "2500");
  await click(btnWith("Kaydet"));
  const api = require("../api");
  expect(api.__calls.svcUpdate.at(-1).items[0]).toMatchObject({ name: "İşçilik", unit_price: 2500, unit_cost: 0 });
});

test("servis düzenle: kaydedilmemiş değişiklikte kapatma onayı", async () => {
  let closed = 0, asked = 0;
  global.confirm = () => { asked++; return false; };
  await render(<ServiceForm open initial={global.__SERVICE} onClose={() => { closed++; }} onSaved={() => {}} prodCost={{}} />);
  const xBtn = () => Array.from(document.body.querySelectorAll("button")).find((b) => b.className.includes("ml-auto flex h-8 w-8"));
  await click(xBtn()); // değişiklik yok → direkt kapanır
  expect(closed).toBe(1); expect(asked).toBe(0);
  await setVal(document.body.querySelector('input[placeholder="Zorunlu"]'), "Başka Ad");
  await click(xBtn());
  expect(asked).toBe(1); expect(closed).toBe(1); // reddedildi → açık kaldı
});

test("Android geri: en üstteki sheet kapanır, sheet yoksa false", async () => {
  expect(window.__mzBack()).toBe(false);
  await render(<Services />);
  const row = Array.from(document.body.querySelectorAll("div")).find((d) => d.textContent.trim() === "Test Müşteri");
  await click(row);
  expect(text()).toContain("Servis Kaydı");
  await click(btnWith("Tahsilat Ekle"));
  expect(document.body.querySelector('input[placeholder="Tutar"]')).toBeTruthy(); // tahsilat sheet açık (üstte)
  let handled;
  await act(async () => { handled = window.__mzBack(); });
  await act(() => new Promise((r) => setTimeout(r, 250)));
  expect(handled).toBe(true);
  expect(document.body.querySelector('input[placeholder="Tutar"]')).toBeNull(); // üstteki kapandı
  expect(text()).toContain("Servis Kaydı"); // alttaki açık
});

test("web geri (popstate): üstteki sheet kapanır; UI'dan kapatınca history geri alınır", async () => {
  await render(<Services />);
  const row = Array.from(document.body.querySelectorAll("div")).find((d) => d.textContent.trim() === "Test Müşteri");
  await click(row);
  expect(window.history.state?.mzSheet).toBeGreaterThan(0);
  await act(async () => { window.dispatchEvent(new PopStateEvent("popstate", { state: null })); });
  await act(() => new Promise((r) => setTimeout(r, 250)));
  expect(text()).not.toContain("Servis Kaydı");
});

test("web geri iç içe: sadece üstteki sheet kapanır", async () => {
  await render(<Services />);
  const row = Array.from(document.body.querySelectorAll("div")).find((d) => d.textContent.trim() === "Test Müşteri");
  await click(row);
  const detailId = window.history.state.mzSheet;
  await click(btnWith("Tahsilat Ekle"));
  expect(document.body.querySelector('input[placeholder="Tutar"]')).toBeTruthy();
  await act(async () => { window.dispatchEvent(new PopStateEvent("popstate", { state: { mzSheet: detailId } })); });
  await act(() => new Promise((r) => setTimeout(r, 250)));
  expect(document.body.querySelector('input[placeholder="Tutar"]')).toBeNull();
  expect(text()).toContain("Servis Kaydı");
});

test("warrantyEnd: teslim + ay", () => {
  const { warrantyEnd } = require("../screens/Services");
  expect(warrantyEnd({ delivery_date: "2026-01-15", warranty_months: 12 })).toEqual({ end: "2027-01-15", active: true });
  expect(warrantyEnd({ delivery_date: "2020-01-15", warranty_months: 6 })).toEqual({ end: "2020-07-15", active: false });
  expect(warrantyEnd({ warranty_months: 6 })).toBeNull();
  expect(warrantyEnd({ delivery_date: "2026-01-15" })).toBeNull();
});

test("servis Garantide filtresi", async () => {
  global.__SERVICE.status = "delivered";
  global.__SERVICE.delivery_date = require("../ui").todayISO();
  global.__SERVICE.warranty_months = 12;
  await render(<Services />);
  const chip = Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent.trim().startsWith("Garantide"));
  expect(chip).toBeTruthy();
  await click(chip);
  expect(text()).toContain("Test Müşteri");
});

test("servis araması: telefon ve plaka boşluksuz", async () => {
  global.__SERVICE.phone = "0555 111 22 33";
  global.__SERVICE.plate = "59 ABC 123";
  await render(<Services />);
  const input = document.body.querySelector('input[placeholder^="Müşteri, plaka"]');
  await setVal(input, "5551112233");
  expect(text()).toContain("Test Müşteri");
  await setVal(input, "59abc");
  expect(text()).toContain("Test Müşteri");
  await setVal(input, "5559999");
  expect(text()).not.toContain("Test Müşteri");
});

test("müşteri özeti: servis detayından aç, sayılar + açık bakiye, teklife geç", async () => {
  localStorage.setItem("mz:quotes", JSON.stringify([{ id: "qa", name: "Solar Teklifi", customer_name: "test müşteri", created_at: "2026-09-01", total_net_price: 50000, products: [] }]));
  let went = null;
  await render(<Services go={(t) => { went = t; }} />);
  const row = Array.from(document.body.querySelectorAll("div")).find((d) => d.textContent.trim() === "Test Müşteri");
  await click(row);
  await click(Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent.trim() === "Test Müşteri"));
  expect(text()).toContain("Müşteri");
  expect(text()).toContain("Solar Teklifi");
  expect(text()).toContain(`Açık bakiye₺${money(70000)}`);
  await click(Array.from(document.body.querySelectorAll("div")).find((d) => d.textContent.trim().startsWith("Solar Teklifi") && d.className.includes("min-w-0")));
  expect(went).toBe("quotes");
  expect(JSON.parse(localStorage.getItem("mz:quote_open"))).toBe("qa");
});

test("Özet genel arama: plaka ile servis bul → detay deep-link", async () => {
  global.__SERVICE.plate = "59 ABC 123";
  let went = null;
  await render(<Dashboard go={(t) => { went = t; }} />);
  await setVal(document.body.querySelector('input[placeholder^="Her yerde ara"]'), "59 abc");
  expect(text()).toContain("Servisler");
  await click(Array.from(document.body.querySelectorAll("div")).find((d) => d.textContent.trim() === "Test Müşteri"));
  expect(went).toBe("service");
  expect(JSON.parse(localStorage.getItem("mz:svc_open"))).toBe("s1");
});

test("Özet genel arama: ürün bul (liste fiyatı, geliş yok) → Ürünler aramasına geç", async () => {
  let went = null;
  await render(<Dashboard go={(t) => { went = t; }} />);
  await setVal(document.body.querySelector('input[placeholder^="Her yerde ara"]'), "panel");
  await flush();
  expect(text()).toContain("Ürünler");
  expect(text()).toContain(`₺${money(10000)}`);
  expect(text()).not.toContain(money(7000));
  await click(Array.from(document.body.querySelectorAll("div")).find((d) => d.textContent.trim() === "Solar Panel 450W"));
  expect(went).toBe("products");
  expect(JSON.parse(localStorage.getItem("mz:prod_search"))).toBe("Solar Panel 450W");
  await render(<CartProvider><Products /></CartProvider>);
  expect(document.body.querySelector("input").value).toBe("Solar Panel 450W");
  expect(JSON.parse(localStorage.getItem("mz:prod_search"))).toBe(null);
});

test("ürün satırı: sepetteyse − ile azalt, 0'da buton kaybolur", async () => {
  await render(<SessionCtx.Provider value={{ username: "t" }}><CartProvider><Products /></CartProvider></SessionCtx.Provider>);
  await act(() => new Promise((r) => setTimeout(r, 600)));
  const card = () => Array.from(document.body.querySelectorAll("div")).find((d) => d.className.includes("items-center gap-3") && d.textContent.includes("Solar Panel 450W"));
  const dec = () => card().querySelector('button[aria-label="Sepetten bir azalt"]');
  expect(dec()).toBeFalsy();
  await click(card().querySelector('button[title="Teklife ekle"]'));
  await click(card().querySelector('button[title="Teklife ekle"]'));
  expect(card().querySelector('button[title="Teklife ekle"]').textContent).toBe("2");
  await click(dec());
  expect(card().querySelector('button[title="Teklife ekle"]').textContent).toBe("1");
  await click(dec());
  expect(dec()).toBeFalsy();
});

test("sözleşme ödeme özeti: toplam + tahsilatlar (döviz sembolü) + TL tahsil, kalan yok", () => {
  const t = contractStatementText({ title: "IVECO Karavan", customer_name: "Ali Veli", data: { grandTotal: 1000000, collections: [
    { date: "2026-09-01", description: "KAPORA", amount: "100000", currency: "TRY" },
    { date: "2026-09-10", description: "ARA ÖDEME", amount: "2000", currency: "EUR", rate: "50" },
  ] } });
  expect(t).toContain("Merhaba Ali Veli,");
  expect(t).toContain(`Sözleşme toplamı: ₺${money(1000000)}`);
  expect(t).toContain(`KAPORA: ₺${money(100000)}`);
  expect(t).toContain(`ARA ÖDEME: €${money(2000)}`);
  expect(t).toContain(`Tahsil edilen: ₺${money(200000)}`);
  expect(t).not.toMatch(/Kalan/i);
});

test("Özet teslim takvimi: yarın / gecikmiş etiketi, dokun → servis detayı", async () => {
  const iso = (off) => { const d = new Date(); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  global.__SERVICE.delivery_date = iso(1);
  let went = null;
  await render(<Dashboard go={(t) => { went = t; }} />);
  expect(text()).toContain("Teslim Takvimi");
  expect(text()).toContain("Yarın");
  const card = Array.from(document.body.querySelectorAll("div")).find((d) => d.textContent.includes("Yarın") && d.className.includes("gap-3"));
  await click(card);
  expect(went).toBe("service");
  expect(JSON.parse(localStorage.getItem("mz:svc_open"))).toBe("s1");
  act(() => root.unmount());
  root = createRoot(container);
  global.__SERVICE.delivery_date = iso(-3);
  localStorage.clear();
  await render(<Dashboard go={() => {}} />);
  expect(text()).toContain("3 gün gecikti");
});

test("tahsilat: 'Kalanın tamamı' tutarı doldurur (₺ ve €/kur), açıklama çipi", async () => {
  global.__SERVICE.collections = [{ id: "c1", date: "2026-09-23", description: "EFT", amount: 30000, currency: "TRY", rate: null }];
  await render(<Services />);
  await click(Array.from(document.body.querySelectorAll("div")).find((d) => d.textContent.trim() === "Test Müşteri"));
  await click(btnWith("Tahsilat Ekle"));
  await click(btnWith("Kalanın tamamı"));
  expect(document.body.querySelector('input[placeholder="Tutar"]').value).toBe("40000");
  const sel = document.body.querySelector("select");
  await act(async () => { sel.value = "EUR"; sel.dispatchEvent(new Event("change", { bubbles: true })); });
  await click(btnWith("Kalanın tamamı"));
  expect(document.body.querySelector('input[placeholder="Tutar"]').value).toBe(String(Math.round((40000 / 55.9) * 100) / 100));
  await click(Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent.trim() === "Nakit"));
  expect(document.body.querySelector('input[placeholder^="Açıklama"]').value).toBe("Nakit");
});

test("servis detayı: plaka + telefon kopyala butonları panoya yazar", async () => {
  Object.assign(global.__SERVICE, { plate: "59 ABC 123", phone: "0555 111 22 33" });
  const copied = [];
  Object.defineProperty(navigator, "clipboard", { value: { writeText: (t) => { copied.push(t); return Promise.resolve(); } }, configurable: true });
  await render(<Services />);
  await click(Array.from(document.body.querySelectorAll("div")).find((d) => d.textContent.trim() === "Test Müşteri"));
  expect(text()).toContain("59 ABC 123");
  await click(document.body.querySelector('button[aria-label="Plakayı kopyala"]'));
  await click(document.body.querySelector('button[aria-label="Telefonu kopyala"]'));
  expect(copied).toEqual(["59 ABC 123", "0555 111 22 33"]);
});

test("çevrimdışı bekleyen servis: listede 'Gönderilmedi' rozeti + başlıkta sayı", async () => {
  global.__SERVICE._pending = true;
  localStorage.setItem("mz:outbox", JSON.stringify([{ op: "svc:update", id: "s1", payload: { status: "delivered" }, ts: 1 }]));
  await render(<Services />);
  expect(text()).toContain("Gönderilmedi");
  expect(text()).toContain("1 gönderilmedi");
});

test("tahsilat raporu: özet kartı gözle gizli, rapor ay toplamı + tür kırılımı + detaya geçiş", async () => {
  const d = new Date(); const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  global.__SERVICE.collections = [
    { id: "c1", date: `${ym}-02`, description: "Nakit", amount: 30000, currency: "TRY" },
    { id: "c2", date: `${ym}-05`, description: "EFT", amount: 500, currency: "EUR", rate: 50 },
    { id: "c3", date: "2020-01-01", description: "Kart", amount: 999, currency: "TRY" },
  ];
  let went = null;
  await render(<Dashboard go={(t) => { went = t; }} />);
  expect(text()).toContain("Bu ay tahsilat");
  expect(text()).toContain("₺ •••");
  await click(Array.from(document.body.querySelectorAll("div")).find((x) => x.textContent.startsWith("Bu ay tahsilat") && x.className.includes("justify-between")));
  expect(text()).toContain("Tahsilat Raporu");
  expect(text()).toContain(`₺${money(55000)}`); // 30000 + 500×50, eski ay hariç
  expect(text()).toContain("Nakit");
  expect(text()).toContain("EFT/Havale");
  expect(text()).not.toContain(money(999));
  await click(Array.from(document.body.querySelectorAll("div")).find((x) => x.className.includes("gap-3") && x.textContent.includes("EFT · EFT/Havale")));
  expect(went).toBe("service");
  expect(JSON.parse(localStorage.getItem("mz:svc_open"))).toBe("s1");
});

test("eski aktarım: gelişi boş İşçilik kalemi maliyet sayılmaz (kâr = net − ürün gelişi)", async () => {
  // Tekliften eski aktarım: unit_cost alanları hiç yok; ürün gelişi katalog adından, KDV satırı bilinmiyor → maliyet = satış
  global.__SERVICE.items = [
    { name: "Solar Panel 450W", qty: 1, unit_price: 14338, currency: "TRY" }, // katalog gelişi 7000
    { name: "Yüzde 10 KDV", qty: 1, unit_price: 2000, currency: "TRY" },
    { name: "İşçilik", qty: 1, unit_price: 5662, currency: "TRY" },
  ];
  global.__SERVICE.discount_amount = 0;
  await render(<Services />);
  await click(Array.from(document.body.querySelectorAll("div")).find((d) => d.textContent.trim() === "Test Müşteri"));
  const eyes = document.body.querySelectorAll('button[aria-label="Göster/Gizle"]');
  await click(eyes[eyes.length - 1]);
  expect(text()).toContain(`Maliyet₺${money(7000 + 2000)}`);
  expect(text()).toContain(`Kâr₺${money(22000 - 9000)}`);
});
