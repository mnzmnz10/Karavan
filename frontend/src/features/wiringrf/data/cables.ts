import type { CableType, CableTypeDef, PortRole } from "@/features/wiringrf/types";

// Standard cable colors per type (caravan / Victron convention).
export const CABLE_TYPES: Record<CableType, CableTypeDef> = {
  DC_POSITIVE: { type: "DC_POSITIVE", label: "DC +", color: "#e11d48", kind: "DC" },
  DC_NEGATIVE: { type: "DC_NEGATIVE", label: "DC −", color: "#111827", kind: "DC" },
  AC_PHASE: { type: "AC_PHASE", label: "AC Faz (L)", color: "#92400e", kind: "AC" },
  AC_NEUTRAL: { type: "AC_NEUTRAL", label: "AC Nötr (N)", color: "#2563eb", kind: "AC" },
  AC_GROUND: { type: "AC_GROUND", label: "AC Toprak (PE)", color: "#16a34a", kind: "AC" },
  PV_POSITIVE: { type: "PV_POSITIVE", label: "PV +", color: "#f59e0b", kind: "DC" },
  PV_NEGATIVE: { type: "PV_NEGATIVE", label: "PV −", color: "#1f2937", kind: "DC" },
  VE_BUS: { type: "VE_BUS", label: "VE.Bus", color: "#7c3aed", kind: "DATA" },
  VE_DIRECT: { type: "VE_DIRECT", label: "VE.Direct", color: "#9333ea", kind: "DATA" },
  ETHERNET: { type: "ETHERNET", label: "Ethernet", color: "#0891b2", kind: "DATA" },
  CAN: { type: "CAN", label: "CAN bus", color: "#0d9488", kind: "DATA" },
  SENSOR: { type: "SENSOR", label: "Sensör", color: "#64748b", kind: "DATA" },
  SIGNAL: { type: "SIGNAL", label: "Sinyal/Röle", color: "#a16207", kind: "DATA" },
  CHASSIS_GROUND: { type: "CHASSIS_GROUND", label: "Şase/Topraklama", color: "#15803d", kind: "DC" },
  CUSTOM: { type: "CUSTOM", label: "Özel", color: "#6b7280", kind: "DC" },
};

export const CABLE_TYPE_LIST = Object.values(CABLE_TYPES);

// Cross-section options shown in the UI.
export const CABLE_SIZES = [
  "0.75mm²", "1mm²", "1.5mm²", "2.5mm²", "4mm²", "6mm²",
  "10mm²", "16mm²", "25mm²", "35mm²", "50mm²", "70mm²", "95mm²", "120mm²",
];

// Visual stroke width by cross-section (px).
export function cableStrokeWidth(size: string): number {
  const mm = parseFloat(size);
  if (isNaN(mm)) return 2;
  if (mm <= 1.5) return 1.6;
  if (mm <= 6) return 2.4;
  if (mm <= 16) return 3.2;
  if (mm <= 35) return 4.2;
  if (mm <= 70) return 5.4;
  return 6.8;
}

// Map a port role to the natural cable type when starting a connection.
export function defaultCableTypeForRole(role: PortRole): CableType {
  switch (role) {
    case "positive": return "DC_POSITIVE";
    case "negative": return "DC_NEGATIVE";
    case "ground": return "CHASSIS_GROUND";
    case "phase": return "AC_PHASE";
    case "neutral": return "AC_NEUTRAL";
    case "pv_positive": return "PV_POSITIVE";
    case "pv_negative": return "PV_NEGATIVE";
    case "data": return "VE_DIRECT";
    case "signal": return "SIGNAL";
    default: return "CUSTOM";
  }
}

export function layerForCableType(t: CableType) {
  const def = CABLE_TYPES[t];
  if (t === "CHASSIS_GROUND" || t === "AC_GROUND") return "ground" as const;
  if (def.kind === "DATA") return "data" as const;
  if (def.kind === "AC") return "ac" as const;
  return "dc" as const;
}
