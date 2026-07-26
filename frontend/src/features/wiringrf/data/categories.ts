import type { ProductCategory } from "@/features/wiringrf/types";

export interface CategoryDef {
  id: ProductCategory;
  label: string;
  icon: string; // lucide icon name
  group: "Solar" | "DC Güç" | "İnverter/AC" | "Depolama" | "Dağıtım" | "Koruma" | "Tüketici" | "Kontrol";
}

export const CATEGORIES: CategoryDef[] = [
  { id: "solar_panel", label: "Solar Panel", icon: "Sun", group: "Solar" },
  { id: "mppt", label: "MPPT Şarj", icon: "SunMedium", group: "Solar" },
  { id: "dcdc", label: "DC-DC Şarj", icon: "ArrowLeftRight", group: "DC Güç" },
  { id: "inverter", label: "İnverter", icon: "Zap", group: "İnverter/AC" },
  { id: "inverter_charger", label: "İnverter/Charger", icon: "Plug", group: "İnverter/AC" },
  { id: "battery", label: "Akü", icon: "BatteryFull", group: "Depolama" },
  { id: "shunt", label: "Shunt", icon: "Gauge", group: "Depolama" },
  { id: "busbar", label: "Busbar", icon: "Minus", group: "Dağıtım" },
  { id: "lynx_distributor", label: "Lynx Distributor", icon: "LayoutGrid", group: "Dağıtım" },
  { id: "fuse", label: "Sigorta", icon: "Shield", group: "Koruma" },
  { id: "fuse_box", label: "Sigorta Kutusu", icon: "ShieldCheck", group: "Koruma" },
  { id: "breaker", label: "Şalter", icon: "ToggleLeft", group: "Koruma" },
  { id: "rcd", label: "RCD Kaçak Akım", icon: "ShieldAlert", group: "Koruma" },
  { id: "mcb", label: "MCB Otomat", icon: "ShieldHalf", group: "Koruma" },
  { id: "ats", label: "ATS Transfer", icon: "Shuffle", group: "İnverter/AC" },
  { id: "consumer_12v", label: "12V Tüketici", icon: "Lightbulb", group: "Tüketici" },
  { id: "consumer_230v", label: "230V Tüketici", icon: "PlugZap", group: "Tüketici" },
  { id: "ground_point", label: "Topraklama", icon: "CircleDot", group: "Koruma" },
  { id: "shore_power", label: "Shore Power", icon: "PowerCircle", group: "İnverter/AC" },
  { id: "control_panel", label: "Kontrol Paneli", icon: "MonitorSmartphone", group: "Kontrol" },
  { id: "gx_device", label: "GX Cihazı", icon: "Cpu", group: "Kontrol" },
  { id: "relay", label: "Röle", icon: "Square", group: "Kontrol" },
  { id: "contactor", label: "Kontaktör", icon: "SquareStack", group: "Kontrol" },
  { id: "terminal", label: "Klemens", icon: "GripVertical", group: "Dağıtım" },
  { id: "connector", label: "Konnektör", icon: "Cable", group: "Dağıtım" },
];

export const CATEGORY_MAP: Record<ProductCategory, CategoryDef> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
) as Record<ProductCategory, CategoryDef>;
