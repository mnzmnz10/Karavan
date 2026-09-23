// Mobil teklif ekranı smoke testi (jsdom, API mock) — tarayıcı açmadan render + akış doğrulaması.
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import Quotes from "../screens/Quotes";
import Dashboard from "../screens/Dashboard";

const RATE_OLD = 44035.460306916844 / 948; // teklif anı USD kuru
const QUOTE = {
  id: "q1", name: "Test Teklif", customer_name: "Ali", created_at: "2026-09-20T10:00:00",
  discount_percentage: 0, labor_cost: 1000,
  total_discounted_price: 93070.92, total_net_price: 94070.92,
  total_cost_price: 999999, gross_profit: -1, // bayat kayıt — mobil canlı hesaplamalı
  products: [
    { id: "pUSD", name: "Akü 315Ah", currency: "USD", list_price: 1080, custom_price: 948, list_price_try: 44035.460306916844,
      discounted_price: 810, discounted_price_try: 44035.460306916844, quantity: 2 },
    { id: "manual-1", name: "Montaj seti", manual: true, currency: "TRY", list_price: 5000, list_price_try: 5000,
      discounted_price: 0, discounted_price_try: 0, quantity: 1 },
  ],
};
const CATALOG = [{ id: "pUSD", name: "Akü 315Ah", currency: "USD", list_price: 1080, list_price_try: 1080 * 47, discounted_price: 810 }];

jest.mock("../api", () => {
  const calls = { update: [], create: [] };
  const ok = (v) => () => Promise.resolve(v);
  return {
    __esModule: true,
    __calls: calls,
    quotes: {
      list: () => Promise.resolve([global.__QUOTE]),
      update: (id, p) => { calls.update.push(p); return Promise.resolve({ ...global.__QUOTE, ...p }); },
      create: (p) => { calls.create.push(p); return Promise.resolve({ ...global.__QUOTE, id: "q2", ...p }); },
      remove: ok({}),
    },
    products: { list: () => Promise.resolve(global.__CATALOG) },
    services: { list: ok([]), create: ok({ id: "s1" }), update: ok({}) },
    docUrl: { quote: () => "", service: () => "" },
    openDoc: () => {},
    default: { get: ok({ data: [] }) },
  };
});
jest.mock("sonner", () => { const f = () => {}; const t = () => {}; t.success = f; t.error = f; t.warning = f; return { toast: t }; });

global.IS_REACT_ACT_ENVIRONMENT = true;
let container, root;
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));
const text = () => container.textContent.replace(/\s+/g, " ");
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await flush(); };
const btnWith = (t) => Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes(t));
const money = (n) => Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 0 });

beforeEach(() => {
  global.__QUOTE = JSON.parse(JSON.stringify(QUOTE));
  global.__CATALOG = CATALOG;
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function openDetail() {
  await act(async () => { root.render(<Quotes go={() => {}} />); });
  await flush();
  const row = Array.from(container.querySelectorAll("div")).find((d) => d.textContent.trim() === "Test Teklif");
  await click(row);
}

test("detay: satır tutarı adetli, kâr göz kapalıyken gizli, açınca canlı hesap", async () => {
  await openDetail();
  const t = text();
  expect(t).toContain("Genel Toplam");
  expect(t).toContain(`₺${money(44035.46 * 2)}`); // adet × birim (önceden birim gösteriyordu)
  expect(t).toContain(`2 × ₺${money(44035.46)}`);
  expect(t).not.toContain("Maliyet"); // göz kapalı
  await click(container.querySelector('button[aria-label="Göster/Gizle"]'));
  const cost = 810 * RATE_OLD * 2; // manuel 0 geliş
  const profit = 94070.92 - cost;
  expect(text()).toContain(`Maliyet₺${money(cost)}`);
  expect(text()).toContain(`Kâr₺${money(profit)}`);
  // göz butonunda yazı yok
  expect(container.querySelector('button[aria-label="Göster/Gizle"]').textContent.trim()).toBe("");
});

test("kalem editörü: + adet → güncel kurla yeni net önizleme, kaydet payload", async () => {
  await openDetail();
  await click(btnWith("Kalemleri düzenle"));
  expect(text()).toContain("Kalemleri Düzenle");
  await click(container.querySelector('button[aria-label="Artır"]'));
  const newNet = 948 * 47 * 3 + 5000 + 1000;
  expect(text()).toContain(`₺${money(newNet)}`);
  const api = require("../api");
  const saveBtns = Array.from(container.querySelectorAll("button")).filter((b) => b.textContent.trim().startsWith("Kaydet"));
  await click(saveBtns[saveBtns.length - 1]);
  const p = api.__calls.update.at(-1).products;
  expect(p).toEqual([
    { id: "pUSD", quantity: 3, custom_price: 948 },
    { manual: true, id: "manual-1", name: "Montaj seti", price: 5000, quantity: 1, currency: "TRY", cost: 0 },
  ]);
});

test("düzenle: sadece ad değişince indirim/işçilik gönderilmez; hedef net → hassas yüzde", async () => {
  await openDetail();
  await click(btnWith("Düzenle"));
  const api = require("../api");
  const setVal = async (input, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    await act(async () => { setter.call(input, v); input.dispatchEvent(new Event("input", { bubbles: true })); });
  };
  const nameInput = container.querySelector('input[placeholder="Teklif adı *"]');
  await setVal(nameInput, "Yeni Ad");
  let save = Array.from(container.querySelectorAll("button")).filter((b) => b.textContent.trim() === "Kaydet").at(-1);
  await click(save);
  expect(api.__calls.update.at(-1)).toEqual({ name: "Yeni Ad" });

  await click(btnWith("Düzenle"));
  await setVal(container.querySelector('input[placeholder^="Net toplamı ayarla"]'), "90000");
  save = Array.from(container.querySelectorAll("button")).filter((b) => b.textContent.trim() === "Kaydet").at(-1);
  await click(save);
  const d = api.__calls.update.at(-1).discount_percentage;
  const base = 93070.92;
  expect(base * (1 - d / 100) + 1000).toBeCloseTo(90000, 6);
});

test("servise aktar: form net = teklif net, geliş 0 korunur", async () => {
  await openDetail();
  await click(btnWith("Servise aktar"));
  const t = text();
  expect(t).toContain("Yeni Servis");
  expect(t).toContain(`₺${money(94070)}`); // brüt yuvarlanmış kalemler (net ≥ brüt → iskonto 0)
  const inputs = Array.from(container.querySelectorAll('input[placeholder="Parça/işlem"]')).map((i) => i.value);
  expect(inputs).toEqual(["Akü 315Ah", "Montaj seti", "İşçilik"]);
});

test("kopyala: payload katalog + manuel", async () => {
  await openDetail();
  await click(btnWith("Kopyala"));
  const api = require("../api");
  const c = api.__calls.create.at(-1);
  expect(c.name).toBe("Test Teklif (Kopya)");
  expect(c.labor_cost).toBe(1000);
  expect(c.products[0]).toEqual({ id: "pUSD", quantity: 2, custom_price: 948 });
  expect(c.products[1]).toMatchObject({ manual: true, price: 5000, cost: 0 });
});

test("dashboard render", async () => {
  await act(async () => { root.render(<Dashboard go={() => {}} />); });
  await flush();
  expect(text()).toContain("Bu ay teslim edilen servis");
  expect(container.querySelector('button[aria-label="Göster/Gizle"]').textContent.trim()).toBe("");
});

test("kalem editörü: birim fiyatı TL düzenle → custom_price güncel kurla", async () => {
  await openDetail();
  await click(btnWith("Kalemleri düzenle"));
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  const inp = container.querySelectorAll('input[aria-label="Birim fiyat"]')[0];
  await act(async () => { setter.call(inp, "47000"); inp.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(text()).toContain(`₺${money(47000 * 2 + 5000 + 1000)}`);
  const saveBtns = Array.from(container.querySelectorAll("button")).filter((b) => b.textContent.trim().startsWith("Kaydet"));
  await click(saveBtns.at(-1));
  const api = require("../api");
  expect(api.__calls.update.at(-1).products[0]).toEqual({ id: "pUSD", quantity: 2, custom_price: 1000 }); // 47000 / 47
});

test("WhatsApp özeti: kalem+toplam var, maliyet yok", async () => {
  await openDetail();
  const a = container.querySelector('a[aria-label="WhatsApp"]');
  const msg = decodeURIComponent(a.getAttribute("href").split("text=")[1]);
  expect(msg).toContain("Akü 315Ah × 2");
  expect(msg).toContain(`Toplam: ₺${money(94070.92)}`);
  expect(msg).toContain("İşçilik");
  expect(msg).not.toMatch(/Maliyet|Kâr|810/);
});

test("daha önce aktarılmış teklif: rozet + onay", async () => {
  localStorage.setItem("mz:services", JSON.stringify([{ id: "s1", customer_name: "Ali", notes: "x\n\n[Teklif: Test Teklif]" }]));
  let asked = 0;
  global.confirm = () => { asked++; return false; };
  await openDetail();
  expect(text()).toContain("Servise aktarıldı");
  await click(btnWith("Servise aktar"));
  expect(asked).toBe(1);
  expect(text()).not.toContain("Yeni Servis");
});

test("liste: servise aktarılan teklifte 'Serviste' rozeti", async () => {
  localStorage.setItem("mz:services", JSON.stringify([{ id: "s1", notes: "[Teklif: Test Teklif]" }]));
  await act(async () => { root.render(<Quotes go={() => {}} />); });
  await flush();
  expect(text()).toContain("Serviste");
});

test("Özet'ten teklif detayı deep-link", async () => {
  localStorage.setItem("mz:quote_open", JSON.stringify("q1"));
  await act(async () => { root.render(<Quotes go={() => {}} />); });
  await flush();
  expect(text()).toContain("Genel Toplam");
});


test("teklif filtreleri: Serviste / Bekleyen", async () => {
  localStorage.setItem("mz:services", JSON.stringify([{ id: "s1", notes: "[Teklif: Test Teklif]" }]));
  await act(async () => { root.render(<Quotes go={() => {}} />); });
  await flush();
  await click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent.trim() === "Bekleyen"));
  expect(container.textContent).not.toContain("Test Teklif");
  await click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent.trim() === "Serviste"));
  expect(container.textContent).toContain("Test Teklif");
});
