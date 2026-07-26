// Domain types for the caravan electrical cable-diagram editor.

// ---------- Ports ----------

export type PortRole =
  | "positive"
  | "negative"
  | "ground" // chassis / earth (DC) or PE (AC)
  | "phase" // AC L
  | "neutral" // AC N
  | "pv_positive"
  | "pv_negative"
  | "data" // VE.Direct / VE.Bus / CAN / Ethernet / signal
  | "signal";

export type CurrentKind = "DC" | "AC" | "DATA";
export type PortDirection = "in" | "out" | "bi";
export type PortSide = "left" | "right" | "top" | "bottom";

export interface Port {
  id: string; // unique within a product
  name: string; // e.g. "PV+", "Battery+", "AC Output L"
  role: PortRole;
  kind: CurrentKind;
  direction: PortDirection;
  side: PortSide; // which edge of the node card the handle sits on (legacy/default placement)
  offset: number; // 0..1 position along that side (legacy/default placement)
  // Free normalized placement over the node box (0..1). When set, overrides side/offset.
  // This is the port's X/Y coordinate on the product image.
  nx?: number;
  ny?: number;
  maxCurrent?: number; // A
  maxVoltage?: number; // V
  recommendedCableSize?: string; // e.g. "70mm²"
  recommendedFuse?: string; // e.g. "300A"
  color?: string; // override handle color
  connectionConstraints?: string; // e.g. "Only connects to inverter"
}

// ---------- Product catalog ----------

export type ProductCategory =
  | "solar_panel"
  | "mppt"
  | "dcdc"
  | "inverter"
  | "inverter_charger"
  | "battery"
  | "shunt"
  | "busbar"
  | "lynx_distributor"
  | "fuse"
  | "fuse_box"
  | "breaker"
  | "rcd"
  | "mcb"
  | "ats"
  | "consumer_12v"
  | "consumer_230v"
  | "ground_point"
  | "shore_power"
  | "control_panel"
  | "gx_device"
  | "relay"
  | "contactor"
  | "terminal"
  | "connector";

export interface ProductTemplate {
  id: string; // catalog id
  name: string;
  brand: string;
  model: string;
  category: ProductCategory;
  voltage?: string; // working voltage, e.g. "12V"
  currentCapacity?: number; // A
  power?: number; // W
  acdc: CurrentKind;
  icon: string; // lucide icon name
  ports: Port[];
  width: number; // canvas size
  height: number;
  accent: string; // card accent color
  description?: string;
}

// ---------- Cables ----------

export type CableType =
  | "DC_POSITIVE"
  | "DC_NEGATIVE"
  | "AC_PHASE"
  | "AC_NEUTRAL"
  | "AC_GROUND"
  | "PV_POSITIVE"
  | "PV_NEGATIVE"
  | "VE_BUS"
  | "VE_DIRECT"
  | "ETHERNET"
  | "CAN"
  | "SENSOR"
  | "SIGNAL"
  | "CHASSIS_GROUND"
  | "CUSTOM";

export interface CableTypeDef {
  type: CableType;
  label: string;
  color: string;
  kind: CurrentKind;
}

// ---------- Diagram (React Flow) data payloads ----------

export interface ProductNodeData extends Record<string, unknown> {
  templateId: string;
  label: string;
  brand: string;
  model: string;
  category: ProductCategory;
  voltage?: string;
  acdc: CurrentKind;
  icon: string;
  accent: string;
  ports: Port[];
  width: number;
  height: number;
  rotation: number; // 0/90/180/270
  notes?: string;
  imageUrl?: string; // uploaded product image (data URL)
}

export interface CableEdgeData extends Record<string, unknown> {
  name?: string;
  cableType: CableType;
  color: string;
  size: string; // cross-section label, e.g. "70mm²"
  length?: number; // meters
  material?: "copper" | "aluminium" | "tinned_copper";
  insulation?: string;
  maxCurrent?: number;
  voltageClass?: string;
  fuse?: string;
  label?: string; // override; defaults to size [/ fuse]
  labelT?: number; // 0..1 position of the label along the cable (default 0.5)
  arrow?: boolean;
  notes?: string;
  layer: LayerId;
}

// ---------- Layers ----------

export type LayerId =
  | "products"
  | "dc"
  | "ac"
  | "data"
  | "ground"
  | "labels"
  | "notes";

// ---------- Validation ----------

export type WarningSeverity = "error" | "warning" | "info";

export interface ValidationWarning {
  id: string;
  severity: WarningSeverity;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

// ---------- Project ----------

export interface ProjectMeta {
  name: string;
  customer?: string;
  date?: string;
  notes?: string;
  systemVoltage?: string;
  vanType?: string;
  revision?: string;
  preparedBy?: string;
}

export interface SerializedNode {
  id: string;
  position: { x: number; y: number };
  data: ProductNodeData;
}

export interface SerializedEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  data: CableEdgeData;
}

export interface ProjectSnapshot {
  nodes: SerializedNode[];
  edges: SerializedEdge[];
}

export interface ProjectVersion {
  id: string;
  createdAt: string;
  label: string;
  snapshot: ProjectSnapshot;
}

export interface Project {
  id: string;
  meta: ProjectMeta;
  snapshot: ProjectSnapshot;
  versions: ProjectVersion[];
  createdAt: string;
  updatedAt: string;
}
