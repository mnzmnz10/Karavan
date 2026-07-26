import type { Port, PortRole, CurrentKind, CableType } from "@/features/wiringrf/types";

// Electrical role groups: connections are only meaningful within a group.
export type RoleGroup = "POS" | "NEG" | "PHASE" | "NEUTRAL" | "GND" | "DATA";

export function roleGroup(role: PortRole): RoleGroup {
  switch (role) {
    case "positive":
    case "pv_positive":
      return "POS";
    case "negative":
    case "pv_negative":
      return "NEG";
    case "phase":
      return "PHASE";
    case "neutral":
      return "NEUTRAL";
    case "ground":
      return "GND";
    case "data":
    case "signal":
      return "DATA";
  }
}

export interface ConnectCheck {
  ok: boolean;
  reason?: string;
}

export interface ExistingConnection {
  target: string;
  targetHandle?: string | null;
}

export interface ConnectContext {
  targetNodeId?: string | null;
  targetHandle?: string | null;
  existingEdges?: ExistingConnection[];
}

// Two role groups may join if identical, or DC-negative ↔ chassis ground (bonding).
export function groupsCompatible(a: RoleGroup, b: RoleGroup): boolean {
  if (a === b) return true;
  const pair = new Set([a, b]);
  return pair.has("NEG") && pair.has("GND");
}

/**
 * Hard rule used both by React Flow `isValidConnection` and the store guard.
 * Blocks only clear violations; softer advice lives in validation.ts.
 */
export function canConnect(
  source: Port | undefined,
  target: Port | undefined,
  sameNode: boolean,
  context: ConnectContext = {},
): ConnectCheck {
  if (sameNode) return { ok: false, reason: "Aynı cihaza bağlantı yapılamaz." };
  if (!source || !target) return { ok: true }; // unknown port -> let it pass

  // PV seri stringing: panel − ↔ sonraki panel + (ikisi de "out" portu) — direction
  // kuralından MUAF olmalı; yoksa seri panel bağlantısı reddedilir. Bu yüzden yön
  // kontrolünden ÖNCE ele alınır.
  const pvSeries =
    (source.role === "pv_positive" && target.role === "pv_negative") ||
    (source.role === "pv_negative" && target.role === "pv_positive");
  if (pvSeries) return { ok: true };

  // Yon kurali (drag yönünden BAĞIMSIZ): bir uç çıkış, diğer uç giriş olabilmeli.
  // Böylece porttan porta hangi yöne sürüklersen sürükle bağlanır; out→out ve
  // in→in engellenir. "bi" her iki rolü üstlenir.
  const sOut = source.direction === "out" || source.direction === "bi";
  const sIn = source.direction === "in" || source.direction === "bi";
  const tOut = target.direction === "out" || target.direction === "bi";
  const tIn = target.direction === "in" || target.direction === "bi";
  if (!((sOut && tIn) || (sIn && tOut))) {
    return { ok: false, reason: "Yön uyumsuz: bir uç çıkış, diğer uç giriş olmalı." };
  }

  // Tek girisli port doluysa ikinci kabloyu hem UI hem store reddeder.
  if (target.direction === "in" && context.targetNodeId && context.targetHandle) {
    const occupied = context.existingEdges?.some(
      (e) => e.target === context.targetNodeId && e.targetHandle === context.targetHandle,
    );
    if (occupied) {
      return { ok: false, reason: `Hedef port "${target.name}" zaten bağlı.` };
    }
  }

  // Kind: DC/AC/DATA must match.
  if (source.kind !== target.kind) {
    return { ok: false, reason: `${kindLabel(source.kind)} ile ${kindLabel(target.kind)} bağlanamaz.` };
  }

  // Role group must match (no +/- mix, no L/N mix, no power/data mix).
  const gs = roleGroup(source.role);
  const gt = roleGroup(target.role);
  if (!groupsCompatible(gs, gt)) {
    return { ok: false, reason: `${groupLabel(gs)} ile ${groupLabel(gt)} portu bağlanamaz.` };
  }

  return { ok: true };
}

function kindLabel(k: CurrentKind): string {
  return k === "DC" ? "DC" : k === "AC" ? "AC" : "Data";
}

function groupLabel(g: RoleGroup): string {
  return { POS: "Pozitif", NEG: "Negatif", PHASE: "Faz (L)", NEUTRAL: "Nötr (N)", GND: "Toprak", DATA: "Data" }[g];
}

// Which port role groups a given cable type is allowed to carry.
export const CABLE_ALLOWED_GROUPS: Record<CableType, RoleGroup[]> = {
  DC_POSITIVE: ["POS"],
  DC_NEGATIVE: ["NEG"],
  PV_POSITIVE: ["POS"],
  PV_NEGATIVE: ["NEG"],
  AC_PHASE: ["PHASE"],
  AC_NEUTRAL: ["NEUTRAL"],
  AC_GROUND: ["GND"],
  CHASSIS_GROUND: ["GND", "NEG"],
  VE_BUS: ["DATA"],
  VE_DIRECT: ["DATA"],
  ETHERNET: ["DATA"],
  CAN: ["DATA"],
  SENSOR: ["DATA"],
  SIGNAL: ["DATA"],
  CUSTOM: ["POS", "NEG", "PHASE", "NEUTRAL", "GND", "DATA"],
};

