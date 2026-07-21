import type {
  ProjectMeta,
  ProjectSnapshot,
  ProjectVersion,
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
