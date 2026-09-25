// Mobil API katmanı — masaüstü App.js'ten bağımsız, backend'e doğrudan.
// Auth: web'de same-origin cookie, native'de CapacitorHttp cookie jar (httpOnly session_token).
import axios from "axios";
import { cache } from "./cache";
import { registerRunner, enqueue, applyPending, applyPendingOne, pendingRecord, realId, isTmpId } from "./outbox";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
export const API = `${BACKEND_URL}/api`;

const http = axios.create({ baseURL: API, withCredentials: true, timeout: 30000 });

// Ağ hatası / zaman aşımı → ekranların gösterdiği `detail` alanına anlaşılır mesaj
// (sunucu yanıtı olan hatalara dokunulmaz; detail'leri aynen gösterilir)
http.interceptors.response.use(undefined, (err) => {
  if (err && !err.response) {
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    const msg = offline ? "İnternet bağlantısı yok" : err.code === "ECONNABORTED" ? "Sunucu yanıt vermedi (zaman aşımı)" : "Sunucuya ulaşılamadı";
    err.response = { status: 0, data: { detail: msg } };
  }
  return Promise.reject(err);
});

export const auth = {
  check: () => http.get("/auth/check").then((r) => r.data),
  login: (username, password, remember_me = true) =>
    http.post("/auth/login", { username, password, remember_me }).then((r) => r.data),
  logout: () => http.post("/auth/logout").then((r) => r.data),
};

export const products = {
  list: ({ search = "", page = 1, limit = 30, company_id, category_id } = {}) =>
    http
      .get("/products", { params: { search, page, limit, company_id, category_id } })
      .then((r) => r.data),
  favorites: () => http.get("/products/favorites").then((r) => r.data),
  toggleFavorite: (id) => http.post(`/products/${id}/toggle-favorite`).then((r) => r.data),
};

// Akü testi: fotoğraftan değer okuma (AI) + kuralla durum; PDF blob döner
export const battery = {
  extract: (files) => {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f, f.name || "foto.jpg"));
    return http.post("/battery-analysis/extract", fd, { timeout: 120000 }).then((r) => r.data);
  },
  assess: (values) => http.post("/battery-analysis/assess", values).then((r) => r.data),
  pdf: (payload) => http.post("/battery-analysis/pdf", payload, { responseType: "blob", timeout: 60000 }).then((r) => r.data),
};

// MPPT hesaplama (panel değerleri kayıtlıysa otomatik gelir)
export const mppt = {
  specs: (productId) => http.get(`/mppt/panel-specs/${productId}`).then((r) => r.data),
  recommend: (payload) => http.post("/mppt/recommend", payload, { timeout: 90000 }).then((r) => r.data),
};

export const rates = {
  get: () => http.get("/exchange-rates").then((r) => r.data?.rates || {}),
};

export const companies = {
  list: () => http.get("/companies").then((r) => r.data),
};

export const categories = {
  list: () => http.get("/categories").then((r) => r.data),
};

export const quotes = {
  list: () => http.get("/quotes").then((r) => r.data),
  get: (id) => http.get(`/quotes/${id}`).then((r) => r.data),
  create: (payload) => http.post("/quotes", payload).then((r) => r.data),
  update: (id, payload) => http.put(`/quotes/${id}`, payload).then((r) => r.data),
  remove: (id) => http.delete(`/quotes/${id}`).then((r) => r.data),
};

// Servis yazmaları çevrimdışı kuyruğa düşer (outbox.js); okumalar bekleyen değişiklikleri üstüne uygular
const svcRaw = {
  create: (payload) => http.post("/services", payload).then((r) => r.data),
  update: (id, payload) => http.put(`/services/${id}`, payload).then((r) => r.data),
};
registerRunner("svc:create", (_id, payload) => svcRaw.create(payload));
registerRunner("svc:update", (id, payload) => svcRaw.update(id, payload));
const offlineErr = (e) => e?.response?.status === 0;

export const services = {
  list: () => http.get("/services").then((r) => applyPending("svc", r.data)),
  get: (id) => {
    const rid = realId(id);
    if (isTmpId(rid)) { const p = pendingRecord("svc", rid); return p ? Promise.resolve(p) : Promise.reject({ response: { status: 404, data: { detail: "Kayıt bulunamadı" } } }); }
    return http.get(`/services/${rid}`).then((r) => applyPendingOne("svc", r.data)).catch((e) => {
      // çevrimdışı: listedeki önbellek kaydı (fotoğrafsız) + bekleyen değişiklikler
      const c = offlineErr(e) && (cache.get("services") || []).find((x) => x.id === rid);
      if (c) return applyPendingOne("svc", c);
      throw e;
    });
  },
  create: (payload) => svcRaw.create(payload).catch((e) => { if (offlineErr(e)) return enqueue("svc:create", null, payload); throw e; }),
  update: (id, payload) => {
    const rid = realId(id);
    if (isTmpId(rid)) return Promise.resolve().then(() => enqueue("svc:update", rid, payload)); // oluşturması hâlâ kuyrukta → birleşir
    return svcRaw.update(rid, payload).catch((e) => { if (offlineErr(e)) return enqueue("svc:update", rid, payload); throw e; });
  },
  remove: (id) => http.delete(`/services/${realId(id)}`).then((r) => r.data),
  // Fatura (PDF): yükle / sil → güncel fatura listesi { invoices }
  invoiceUpload: (id, file) => {
    const fd = new FormData();
    fd.append("file", file, file.name || "fatura.pdf");
    return http.post(`/services/${realId(id)}/invoices`, fd, { timeout: 120000 }).then((r) => r.data.invoices || []);
  },
  invoiceRemove: (id, invId) => http.delete(`/services/${realId(id)}/invoices/${invId}`).then((r) => r.data.invoices || []),
};

// Belge (PDF/Excel) URL'leri. Native'de window.open -> mobileDownload köprüsü
// (CapacitorHttp + Share sheet); web'de yeni sekmede açılır.
export const docUrl = {
  quote: (id) => `${API}/quotes/${id}/pdf`,
  service: (id) => `${API}/services/${id}/pdf`,
  invoice: (id, invId) => `${API}/services/${id}/invoices/${invId}`,
  contract: (id) => `${API}/contracts/${id}/download`,
  worklist: (id) => `${API}/contracts/${id}/pdf?plain=1`, // fiyatsız iş listesi (ürün + adet)
};
export const openDoc = (url) => window.open(url, "_blank");

export default http;
