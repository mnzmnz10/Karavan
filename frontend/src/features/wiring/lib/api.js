import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

// Karavan backend'ine port edildi: tüm uçlar "wiring-" namespace'inde
// (Karavan'ın mevcut route'larıyla çakışmayı önlemek için).
const client = axios.create({ baseURL: API, withCredentials: true });

export async function uploadImage(file) {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await client.post('/wiring-upload', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data; // { id, url, path }
}

export function fileUrl(id) {
  return `${API}/wiring-files/${id}`;
}

// Görselin arka planını (köşe/beyaz) kaldırır, yeni şeffaf PNG image_id döndürür.
export async function removeBackground(payload) {
  const { data } = await client.post('/wiring-remove-bg', payload);
  return data; // { id, url }
}

export async function listProjects() {
  const { data } = await client.get('/wiring-projects');
  return data;
}

export async function createProject(payload) {
  const { data } = await client.post('/wiring-projects', payload);
  return data;
}

export async function updateProject(id, payload) {
  const { data } = await client.put(`/wiring-projects/${id}`, payload);
  return data;
}

export async function getProject(id) {
  const { data } = await client.get(`/wiring-projects/${id}`);
  return data;
}

export async function deleteProject(id) {
  const { data } = await client.delete(`/wiring-projects/${id}`);
  return data;
}

export async function exportPdf(payload) {
  const res = await client.post('/wiring-export-pdf', payload, { responseType: 'blob' });
  return res.data;
}

export async function listTemplates() {
  const { data } = await client.get('/wiring-device-templates');
  return data;
}

export async function createTemplate(payload) {
  const { data } = await client.post('/wiring-device-templates', payload);
  return data;
}

export async function updateTemplate(id, payload) {
  const { data } = await client.put(`/wiring-device-templates/${id}`, payload);
  return data;
}

export async function deleteTemplate(id) {
  const { data } = await client.delete(`/wiring-device-templates/${id}`);
  return data;
}
