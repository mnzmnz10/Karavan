import type { Project } from "@/features/wiringrf/types";

const KEY = (id: string) => `kablo:project:${id}`;
const INDEX = "kablo:index";
export const STORAGE_VERSION = 1;

function emit(event: string, detail?: unknown) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(event, { detail }));
  }
}

// Minimal shape guard so corrupt/old/hand-edited localStorage can't crash the app.
function isValidProject(o: unknown): o is Project {
  if (!o || typeof o !== "object") return false;
  const p = o as Record<string, unknown>;
  const snap = p.snapshot as Record<string, unknown> | undefined;
  return (
    typeof p.id === "string" &&
    !!snap &&
    Array.isArray(snap.nodes) &&
    Array.isArray(snap.edges)
  );
}

export function saveProject(p: Project) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY(p.id), JSON.stringify({ ...p, _v: STORAGE_VERSION }));
    const idx = listProjectIds();
    if (!idx.includes(p.id)) {
      localStorage.setItem(INDEX, JSON.stringify([...idx, p.id]));
    }
  } catch (e) {
    // Quota exceeded or serialization error -> tell the user, don't fail silently.
    console.warn("saveProject failed", e);
    emit("kablo:save-error", e instanceof Error ? e.message : "KayÄ±t baÅŸarÄ±sÄ±z");
  }
}

export function loadProject(id: string): Project | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(KEY(id));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!isValidProject(parsed)) {
      emit("kablo:load-error", "KayÄ±tlÄ± proje bozuk veya eski formatta; yÃ¼klenmedi.");
      return null;
    }
    return parsed as Project;
  } catch {
    emit("kablo:load-error", "KayÄ±tlÄ± proje okunamadÄ± (bozuk JSON).");
    return null;
  }
}

export function listProjectIds(): string[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(INDEX);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

export function deleteProject(id: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY(id));
  localStorage.setItem(INDEX, JSON.stringify(listProjectIds().filter((x) => x !== id)));
}
