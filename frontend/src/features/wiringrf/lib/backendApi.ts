import type {
  ProjectMeta,
  ProjectSnapshot,
  ProjectVersion,
  Port,
} from "@/features/wiringrf/types";

const API_BASE = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;

export interface BackendProjectData {
  snapshot?: ProjectSnapshot;
  meta?: ProjectMeta;
  versions?: ProjectVersion[];
}

export interface BackendProject {
  id: string;
  name: string;
  vehicle_name: string;
  author: string;
  description: string;
  data: BackendProjectData;
  created_at: string;
  updated_at: string;
}

export interface BackendProjectPayload {
  name: string;
  description?: string;
  data: BackendProjectData;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = json?.detail ?? json?.error ?? "Sunucu istegi basarisiz.";
    throw new Error(String(detail));
  }
  return json as T;
}

export function listProjects() {
  return requestJson<BackendProject[]>("/wiring-projects");
}

export function getProject(id: string) {
  return requestJson<BackendProject>(`/wiring-projects/${encodeURIComponent(id)}`);
}

export function createProject(payload: BackendProjectPayload) {
  return requestJson<BackendProject>("/wiring-projects", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateProject(id: string, payload: BackendProjectPayload) {
  return requestJson<BackendProject>(`/wiring-projects/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteProject(id: string) {
  return requestJson<{ ok: boolean }>(`/wiring-projects/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ---------- Karavan ürün kataloğu (Ürünler sekmesi) ----------
export interface KaravanProduct {
  id: string;
  name: string;
  brand?: string;
  category_id?: string | null;
  specs?: string | null;
  description?: string | null;
  image_url?: string | null;
  is_favorite?: boolean;
}

// Karavan ürünlerini getir (şema kütüphanesine eklemek için). search opsiyonel.
export function listKaravanProducts(search?: string, limit = 60) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  params.set("limit", String(limit));
  params.set("page", "1");
  return requestJson<KaravanProduct[]>(`/products?${params.toString()}`);
}

// Ürün-bazlı kayıtlı port şablonları: {product_id: ports[]} haritası.
export function getAllProductPorts() {
  return requestJson<Record<string, Port[]>>("/wiring-product-ports");
}

// Bir ürünün port yerleşimini kaydet (tüm şemalarda geçerli).
export function saveProductPorts(productId: string, ports: Port[]) {
  return requestJson<{ ok: boolean }>(`/wiring-product-ports/${encodeURIComponent(productId)}`, {
    method: "PUT",
    body: JSON.stringify({ ports }),
  });
}
