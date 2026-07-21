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

// Two role groups may join if identical, or DC-negative â†” chassis ground (bonding).
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
  if (sameNode) return { ok: false, reason: "AynÄ± cihaza baÄŸlantÄ± yapÄ±lamaz." };
  if (!source || !target) return { ok: true }; // unknown port -> let it pass

  // PV seri stringing: panel âˆ’ â†” sonraki panel + (ikisi de "out" portu) â€” direction
  // kuralÄ±ndan MUAF olmalÄ±; yoksa seri panel baÄŸlantÄ±sÄ± reddedilir. Bu yÃ¼zden yÃ¶n
  // kontrolÃ¼nden Ã–NCE ele alÄ±nÄ±r.
  const pvSeries =
    (source.role === "pv_positive" && target.role === "pv_negative") ||
    (source.role === "pv_negative" && target.role === "pv_positive");
  if (pvSeries) return { ok: true };

  // Yon kurali: kablo kaynakta cikistan baslar, hedefte giriste biter.
  if (source.direction !== "out" && source.direction !== "bi") {
    return { ok: false, reason: `Kaynak port "${source.name}" Ã§Ä±kÄ±ÅŸ yÃ¶nÃ¼nde deÄŸil.` };
  }
  if (target.direction !== "in" && target.direction !== "bi") {
    return { ok: false, reason: `Hedef port "${target.name}" giriÅŸ yÃ¶nÃ¼nde deÄŸil.` };
  }

  // Tek girisli port doluysa ikinci kabloyu hem UI hem store reddeder.
  if (target.direction === "in" && context.targetNodeId && context.targetHandle) {
    const occupied = context.existingEdges?.some(
      (e) => e.target === context.targetNodeId && e.targetHandle === context.targetHandle,
    );
    if (occupied) {
      return { ok: false, reason: `Hedef port "${target.name}" zaten baÄŸlÄ±.` };
    }
  }

  // Kind: DC/AC/DATA must match.
  if (source.kind !== target.kind) {
    return { ok: false, reason: `${kindLabel(source.kind)} ile ${kindLabel(target.kind)} baÄŸlanamaz.` };
  }

  // Role group must match (no +/- mix, no L/N mix, no power/data mix).
  const gs = roleGroup(source.role);
  const gt = roleGroup(target.role);
  if (!groupsCompatible(gs, gt)) {
    return { ok: false, reason: `${groupLabel(gs)} ile ${groupLabel(gt)} portu baÄŸlanamaz.` };
  }

  return { ok: true };
}

function kindLabel(k: CurrentKind): string {
  return k === "DC" ? "DC" : k === "AC" ? "AC" : "Data";
}

function groupLabel(g: RoleGroup): string {
  return { POS: "Pozitif", NEG: "Negatif", PHASE: "Faz (L)", NEUTRAL: "NÃ¶tr (N)", GND: "Toprak", DATA: "Data" }[g];
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

