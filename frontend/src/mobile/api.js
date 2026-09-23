// Mobil API katmanı — masaüstü App.js'ten bağımsız, backend'e doğrudan.
// Auth: web'de same-origin cookie, native'de CapacitorHttp cookie jar (httpOnly session_token).
import axios from "axios";

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

export const services = {
  list: () => http.get("/services").then((r) => r.data),
  get: (id) => http.get(`/services/${id}`).then((r) => r.data),
  create: (payload) => http.post("/services", payload).then((r) => r.data),
  update: (id, payload) => http.put(`/services/${id}`, payload).then((r) => r.data),
  remove: (id) => http.delete(`/services/${id}`).then((r) => r.data),
};

// Belge (PDF/Excel) URL'leri. Native'de window.open -> mobileDownload köprüsü
// (CapacitorHttp + Share sheet); web'de yeni sekmede açılır.
export const docUrl = {
  quote: (id) => `${API}/quotes/${id}/pdf`,
  service: (id) => `${API}/services/${id}/pdf`,
  contract: (id) => `${API}/contracts/${id}/download`,
};
export const openDoc = (url) => window.open(url, "_blank");

export default http;
