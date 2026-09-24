// Çevrimdışı açılış: ağ hatasında son oturum hatırlanır; 401'de giriş ekranı
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

jest.mock("../api", () => ({
  __esModule: true,
  auth: { check: () => global.__AUTH(), logout: () => Promise.resolve({}) },
  quotes: { list: () => Promise.resolve([]) },
  services: { list: () => Promise.resolve([]) },
  products: { list: () => Promise.resolve([]) },
  categories: { list: () => Promise.resolve([]) },
  default: { get: () => Promise.resolve({ data: [] }) },
  docUrl: {}, openDoc: () => {},
}));
jest.mock("sonner", () => { const f = () => {}; const t = () => {}; t.success = f; t.error = f; t.warning = f; return { toast: t, Toaster: () => null }; });
jest.mock("../screens/Login", () => () => <div>LOGIN_SCREEN</div>);

global.IS_REACT_ACT_ENVIRONMENT = true;
global.matchMedia = global.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
let container, root;
beforeEach(() => { localStorage.clear(); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

const boot = async () => {
  const MobileApp = require("../MobileApp").default;
  await act(async () => { root.render(<MobileApp />); });
  await act(() => new Promise((r) => setTimeout(r, 50)));
};

test("ağ hatası + önceki oturum → uygulama açılır (çevrimdışı)", async () => {
  localStorage.setItem("mz:was_authed", JSON.stringify({ username: "karavan_admin" }));
  global.__AUTH = () => Promise.reject({ response: { status: 0, data: { detail: "İnternet bağlantısı yok" } } });
  await boot();
  expect(document.body.textContent).not.toContain("LOGIN_SCREEN");
});

test("401 → giriş ekranı", async () => {
  localStorage.setItem("mz:was_authed", JSON.stringify({ username: "x" }));
  global.__AUTH = () => Promise.reject({ response: { status: 401 } });
  await boot();
  expect(document.body.textContent).toContain("LOGIN_SCREEN");
});

test("ağ hatası, önceki oturum yok → giriş ekranı", async () => {
  global.__AUTH = () => Promise.reject({ response: { status: 0 } });
  await boot();
  expect(document.body.textContent).toContain("LOGIN_SCREEN");
});
