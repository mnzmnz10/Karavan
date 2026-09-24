// Face ID girişi (native simülasyonu): teklif → kaydet, kayıtlıyla giriş, geçersiz şifrede temizle.
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import Login from "../screens/Login";

const mockBio = { saved: false, set: [], deleted: 0, cred: { username: "karavan_admin", password: "gizli" } };
const mockLogin = { calls: [], fail401: false };
jest.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
jest.mock("@capgo/capacitor-native-biometric", () => ({
  AccessControl: { BIOMETRY_ANY: 2 },
  BiometryType: { TOUCH_ID: 1, FACE_ID: 2, FINGERPRINT: 3 },
  NativeBiometric: {
    isAvailable: () => Promise.resolve({ isAvailable: true, biometryType: 2 }),
    isCredentialsSaved: () => Promise.resolve({ isSaved: mockBio.saved }),
    setCredentials: (o) => { mockBio.set.push(o); mockBio.saved = true; return Promise.resolve(); },
    getSecureCredentials: () => Promise.resolve(mockBio.cred),
    deleteCredentials: () => { mockBio.deleted++; mockBio.saved = false; return Promise.resolve(); },
  },
}));
jest.mock("../api", () => ({
  auth: {
    login: (u, p) => {
      mockLogin.calls.push([u, p]);
      return mockLogin.fail401 ? Promise.reject({ response: { status: 401, data: { detail: "x" } } }) : Promise.resolve({});
    },
  },
}));
jest.mock("sonner", () => { const f = () => {}; const t = () => {}; t.success = f; t.error = f; t.warning = f; return { toast: t }; });
jest.mock("@capacitor/haptics", () => ({ ImpactStyle: {}, NotificationType: {}, Haptics: { impact: () => Promise.resolve(), notification: () => Promise.resolve() } }));

global.IS_REACT_ACT_ENVIRONMENT = true;
let container, root;
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));
const btn = (t) => Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent.includes(t));
const setVal = async (input, v) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  await act(async () => { setter.call(input, v); input.dispatchEvent(new Event("input", { bubbles: true })); });
};

beforeEach(() => {
  Object.assign(mockBio, { saved: false, set: [], deleted: 0 });
  Object.assign(mockLogin, { calls: [], fail401: false });
  localStorage.clear();
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

test("şifreyle giriş sonrası Face ID teklifi: evet → Anahtar Zinciri'ne biyometri korumalı kayıt", async () => {
  global.confirm = () => true;
  let done = 0;
  await act(async () => { root.render(<Login onDone={() => { done++; }} />); }); await flush();
  expect(btn("Face ID ile giriş")).toBeFalsy(); // kayıt yokken buton yok
  const [u, p] = document.body.querySelectorAll("input");
  await setVal(u, "karavan_admin"); await setVal(p, "gizli");
  await act(async () => { document.body.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); await flush();
  expect(done).toBe(1);
  expect(mockBio.set[0]).toMatchObject({ username: "karavan_admin", password: "gizli", server: "corlukaravan.shop", accessControl: 2 });
});

test("teklif reddedilirse bir daha sorulmaz", async () => {
  let asked = 0;
  global.confirm = () => { asked++; return false; };
  await act(async () => { root.render(<Login onDone={() => {}} />); }); await flush();
  const [u, p] = document.body.querySelectorAll("input");
  await setVal(u, "a"); await setVal(p, "b");
  await act(async () => { document.body.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); await flush();
  expect(asked).toBe(1);
  expect(JSON.parse(localStorage.getItem("mz:bio_declined"))).toBe(true);
  expect(mockBio.set.length).toBe(0);
});

test("kayıtlı kimlikle Face ID girişi; 401'de kayıt silinir", async () => {
  mockBio.saved = true;
  let done = 0;
  await act(async () => { root.render(<Login onDone={() => { done++; }} />); }); await flush();
  await act(async () => { btn("Face ID ile giriş").dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await flush();
  expect(mockLogin.calls[0]).toEqual(["karavan_admin", "gizli"]);
  expect(done).toBe(1);
  mockLogin.fail401 = true;
  await act(async () => { btn("Face ID ile giriş").dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await flush();
  expect(mockBio.deleted).toBe(1);
  expect(btn("Face ID ile giriş")).toBeFalsy();
});
