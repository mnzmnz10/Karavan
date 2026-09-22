// Mobil API katmanı — masaüstü App.js'ten bağımsız, backend'e doğrudan.
// Auth: web'de same-origin cookie, native'de CapacitorHttp cookie jar (httpOnly session_token).
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
export const API = `${BACKEND_URL}/api`;

const http = axios.create({ baseURL: API, withCredentials: true, timeout: 30000 });

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
};

export const services = {
  list: () => http.get("/services").then((r) => r.data),
  get: (id) => http.get(`/services/${id}`).then((r) => r.data),
  create: (payload) => http.post("/services", payload).then((r) => r.data),
  update: (id, payload) => http.put(`/services/${id}`, payload).then((r) => r.data),
};

export default http;
