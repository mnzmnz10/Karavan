// Safari davranışı: history.back() pushState'ten SONRA uygulanır (Chrome gibi iptal edilmez).
// Detay → Düzenle: detay kapanır + form açılır; form hemen kapanmamalı. Geri tuşu formu kapatmalı.
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

jest.mock("../api", () => {
  const ok = (v) => () => Promise.resolve(v);
  const S = { id: "s1", customer_name: "Test Müşteri", status: "in_progress", arrival_date: "2026-09-22", items: [] };
  return {
    __esModule: true,
    services: { list: ok([S]), get: ok(S), update: ok({}), create: ok({}), remove: ok({}) },
    products: { list: ok([]), favorites: ok([]), toggleFavorite: ok({}) },
    rates: { get: ok({ TRY: 1, EUR: 50, USD: 45 }) },
    docUrl: { service: () => "" }, openDoc: () => {},
    default: { get: ok({ data: [] }) },
  };
});
jest.mock("sonner", () => { const f = () => {}; const t = () => {}; t.success = f; t.error = f; t.warning = f; return { toast: t }; });

// Safari benzeri history: back() kuyruğa girer, sonradan yapılan pushState'i iptal ETMEZ
const H = { entries: [{ state: null }], i: 0 };
beforeAll(() => {
  Object.defineProperty(window, "history", { configurable: true, value: {
    get state() { return H.entries[H.i].state; },
    get length() { return H.entries.length; },
    pushState(state) { H.entries = H.entries.slice(0, H.i + 1); H.entries.push({ state }); H.i++; },
    replaceState(state) { H.entries[H.i] = { state }; },
    back() { setTimeout(() => { if (H.i > 0) { H.i--; window.dispatchEvent(new PopStateEvent("popstate", { state: H.entries[H.i].state })); } }, 10); },
  } });
});

global.IS_REACT_ACT_ENVIRONMENT = true;
global.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
let container, root;
const wait = (ms) => act(() => new Promise((r) => setTimeout(r, ms)));
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await wait(0); };
beforeEach(() => { H.entries = [{ state: null }]; H.i = 0; localStorage.clear(); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

test("Safari: Düzenle formu açık kalır, geri tuşu formu kapatır ve geçmiş temiz kalır", async () => {
  const Services = require("../screens/Services").default;
  await act(async () => { root.render(<Services go={() => {}} />); }); await wait(20);
  await click(Array.from(container.querySelectorAll("div")).find((d) => d.textContent.trim() === "Test Müşteri"));
  expect(container.textContent).toContain("Servis Kaydı");
  await click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent.trim() === "Düzenle"));
  await wait(300);
  expect(container.textContent).toContain("Servisi Düzenle"); // hemen kapanmamalı
  await act(async () => { window.history.back(); }); await wait(300); // kullanıcı geri
  expect(container.textContent).not.toContain("Servisi Düzenle");
  expect(H.i).toBe(0); // artık kayıt yok
});
