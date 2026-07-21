import type { ProductCategory } from "@/features/wiringrf/types";

export interface CategoryDef {
  id: ProductCategory;
  label: string;
  icon: string; // lucide icon name
  group: "Solar" | "DC GÃ¼Ã§" | "Ä°nverter/AC" | "Depolama" | "DaÄŸÄ±tÄ±m" | "Koruma" | "TÃ¼ketici" | "Kontrol";
}

export const CATEGORIES: CategoryDef[] = [
  { id: "solar_panel", label: "Solar Panel", icon: "Sun", group: "Solar" },
  { id: "mppt", label: "MPPT Åarj", icon: "SunMedium", group: "Solar" },
  { id: "dcdc", label: "DC-DC Åarj", icon: "ArrowLeftRight", group: "DC GÃ¼Ã§" },
  { id: "inverter", label: "Ä°nverter", icon: "Zap", group: "Ä°nverter/AC" },
  { id: "inverter_charger", label: "Ä°nverter/Charger", icon: "Plug", group: "Ä°nverter/AC" },
  { id: "battery", label: "AkÃ¼", icon: "BatteryFull", group: "Depolama" },
  { id: "shunt", label: "Shunt", icon: "Gauge", group: "Depolama" },
  { id: "busbar", label: "Busbar", icon: "Minus", group: "DaÄŸÄ±tÄ±m" },
  { id: "lynx_distributor", label: "Lynx Distributor", icon: "LayoutGrid", group: "DaÄŸÄ±tÄ±m" },
  { id: "fuse", label: "Sigorta", icon: "Shield", group: "Koruma" },
  { id: "fuse_box", label: "Sigorta Kutusu", icon: "ShieldCheck", group: "Koruma" },
  { id: "breaker", label: "Åalter", icon: "ToggleLeft", group: "Koruma" },
  { id: "rcd", label: "RCD KaÃ§ak AkÄ±m", icon: "ShieldAlert", group: "Koruma" },
  { id: "mcb", label: "MCB Otomat", icon: "ShieldHalf", group: "Koruma" },
  { id: "ats", label: "ATS Transfer", icon: "Shuffle", group: "Ä°nverter/AC" },
  { id: "consumer_12v", label: "12V TÃ¼ketici", icon: "Lightbulb", group: "TÃ¼ketici" },
  { id: "consumer_230v", label: "230V TÃ¼ketici", icon: "PlugZap", group: "TÃ¼ketici" },
  { id: "ground_point", label: "Topraklama", icon: "CircleDot", group: "Koruma" },
  { id: "shore_power", label: "Shore Power", icon: "PowerCircle", group: "Ä°nverter/AC" },
  { id: "control_panel", label: "Kontrol Paneli", icon: "MonitorSmartphone", group: "Kontrol" },
  { id: "gx_device", label: "GX CihazÄ±", icon: "Cpu", group: "Kontrol" },
  { id: "relay", label: "RÃ¶le", icon: "Square", group: "Kontrol" },
  { id: "contactor", label: "KontaktÃ¶r", icon: "SquareStack", group: "Kontrol" },
  { id: "terminal", label: "Klemens", icon: "GripVertical", group: "DaÄŸÄ±tÄ±m" },
  { id: "connector", label: "KonnektÃ¶r", icon: "Cable", group: "DaÄŸÄ±tÄ±m" },
];

export const CATEGORY_MAP: Record<ProductCategory, CategoryDef> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
) as Record<ProductCategory, CategoryDef>;
