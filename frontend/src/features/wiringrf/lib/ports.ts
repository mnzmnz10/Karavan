import { Position } from "@xyflow/react";
import { nanoid } from "nanoid";
import type { Port, PortRole, PortSide } from "@/features/wiringrf/types";

// Normalized (0..1) point of a port over the node box.
export function portXY(p: Port, rotation = 0): { x: number; y: number } {
  let xy: { x: number; y: number };
  if (typeof p.nx === "number" && typeof p.ny === "number") {
    xy = { x: clamp01(p.nx), y: clamp01(p.ny) };
  } else {
    switch (p.side) {
      case "left": xy = { x: 0, y: p.offset }; break;
      case "right": xy = { x: 1, y: p.offset }; break;
      case "top": xy = { x: p.offset, y: 0 }; break;
      case "bottom": xy = { x: p.offset, y: 1 }; break;
    }
  }
  // DÃ¶nmÃ¼ÅŸ node'da router ve handle aynÄ± gÃ¶rsel port noktasÄ±nÄ± kullansÄ±n.
  return rotateNormPoint(xy, rotation);
}

function rotateNormPoint({ x, y }: { x: number; y: number }, rotation: number): { x: number; y: number } {
  const r = ((rotation % 360) + 360) % 360;
  const dx = x - 0.5;
  const dy = y - 0.5;
  if (r === 90) return { x: clamp01(0.5 - dy), y: clamp01(0.5 + dx) };
  if (r === 180) return { x: clamp01(0.5 - dx), y: clamp01(0.5 - dy) };
  if (r === 270) return { x: clamp01(0.5 + dy), y: clamp01(0.5 - dx) };
  return { x: clamp01(x), y: clamp01(y) };
}

// Which edge a handle should attach to (drives edge routing direction).
export function portPosition(p: Port, rotation = 0): Position {
  const { x, y } = portXY(p, rotation);
  const dl = x, dr = 1 - x, dt = y, db = 1 - y;
  const min = Math.min(dl, dr, dt, db);
  if (min === dl) return Position.Left;
  if (min === dr) return Position.Right;
  if (min === dt) return Position.Top;
  return Position.Bottom;
}

export function portSideFromXY(x: number, y: number): PortSide {
  const dl = x, dr = 1 - x, dt = y, db = 1 - y;
  const min = Math.min(dl, dr, dt, db);
  if (min === dl) return "left";
  if (min === dr) return "right";
  if (min === dt) return "top";
  return "bottom";
}

export function portColor(role: PortRole): string {
  switch (role) {
    case "positive": return "#e11d48";
    case "negative": return "#111827";
    case "ground": return "#16a34a";
    case "phase": return "#92400e";
    case "neutral": return "#2563eb";
    case "pv_positive": return "#f59e0b";
    case "pv_negative": return "#1f2937";
    case "data":
    case "signal": return "#7c3aed";
    default: return "#6b7280";
  }
}

export const PORT_ROLES: { value: PortRole; label: string }[] = [
  { value: "positive", label: "Pozitif (+)" },
  { value: "negative", label: "Negatif (âˆ’)" },
  { value: "ground", label: "Toprak / PE" },
  { value: "phase", label: "Faz (L)" },
  { value: "neutral", label: "NÃ¶tr (N)" },
  { value: "pv_positive", label: "PV +" },
  { value: "pv_negative", label: "PV âˆ’" },
  { value: "data", label: "Data (VE.Bus/Direct)" },
  { value: "signal", label: "Sinyal / RÃ¶le" },
];

export function defaultKindForRole(role: PortRole): Port["kind"] {
  if (role === "phase" || role === "neutral") return "AC";
  if (role === "data" || role === "signal") return "DATA";
  return "DC";
}

export function makePort(nx: number, ny: number, role: PortRole = "positive"): Port {
  return {
    id: `p_${nanoid(5)}`,
    name: "Port",
    role,
    kind: defaultKindForRole(role),
    direction: "bi",
    side: portSideFromXY(nx, ny),
    offset: 0.5,
    nx: clamp01(nx),
    ny: clamp01(ny),
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
