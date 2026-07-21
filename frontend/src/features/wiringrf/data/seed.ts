import type { ProjectSnapshot, SerializedNode, SerializedEdge, ProductNodeData, CableType } from "@/features/wiringrf/types";
import { CATALOG_MAP } from "./catalog";
import { CABLE_TYPES, layerForCableType } from "./cables";

function node(id: string, templateId: string, x: number, y: number, labelOverride?: string): SerializedNode {
  const tpl = CATALOG_MAP[templateId];
  const data: ProductNodeData = {
    templateId: tpl.id,
    label: labelOverride ?? tpl.name,
    brand: tpl.brand,
    model: tpl.model,
    category: tpl.category,
    voltage: tpl.voltage,
    acdc: tpl.acdc,
    icon: tpl.icon,
    accent: tpl.accent,
    ports: tpl.ports.map((p) => ({ ...p })),
    width: tpl.width,
    height: tpl.height,
    rotation: 0,
  };
  return { id, position: { x, y }, data };
}

let ec = 0;
function edge(
  source: string, sourceHandle: string,
  target: string, targetHandle: string,
  cableType: CableType, size: string, fuse?: string,
): SerializedEdge {
  const def = CABLE_TYPES[cableType];
  return {
    id: `seed_e${ec++}`,
    source, target, sourceHandle, targetHandle,
    data: {
      cableType,
      color: def.color,
      size,
      fuse,
      label: fuse ? `${size} / ${fuse}` : size,
      layer: layerForCableType(cableType),
    },
  };
}

export function buildSeedProject(): ProjectSnapshot {
  ec = 0;
  const nodes: SerializedNode[] = [
    // Solar row
    node("pv1", "solar_panel_455", 60, 40, "Panel 1 Â· 455W"),
    node("pv2", "solar_panel_455", 240, 40, "Panel 2 Â· 455W"),
    node("pv3", "solar_panel_455", 420, 40, "Panel 3 Â· 455W"),
    node("mppt", "mppt_250_100", 260, 240),
    // Battery bank
    node("bat1", "lifepo4_200", 60, 760, "AkÃ¼ 1 Â· 200Ah"),
    node("bat2", "lifepo4_200", 240, 760, "AkÃ¼ 2 Â· 200Ah"),
    node("bat3", "lifepo4_200", 420, 760, "AkÃ¼ 3 Â· 200Ah"),
    node("shunt", "smart_shunt_500", 240, 940),
    // Distribution
    node("lynx", "lynx_distributor", 640, 600),
    node("negbus", "busbar_neg", 640, 940, "Negatif Busbar"),
    // DC-DC
    node("dcdc", "orion_tr_1212_30", 640, 420),
    // Inverter
    node("multi", "multiplus_ii_12_3000", 980, 560),
    // 12V dist
    node("fbox", "fuse_box_12v", 980, 860, "12V Sigorta Kutusu"),
    node("load12", "consumer_12v", 1220, 880, "12V AydÄ±nlatma"),
    // AC side
    node("shore", "shore_power", 980, 200, "Shore Power"),
    node("rcd", "rcd_2p", 1240, 300),
    node("load230", "consumer_230v", 1240, 520, "230V Priz HattÄ±"),
    // Control
    node("cerbo", "cerbo_gx", 460, 560, "Cerbo GX"),
    // Ground
    node("gnd", "ground_point", 640, 1120),
  ];

  const edges: SerializedEdge[] = [
    // Solar -> MPPT (series-ish, simplified to MPPT inputs)
    edge("pv1", "pv_pos", "mppt", "pv_pos", "PV_POSITIVE", "6mmÂ²"),
    edge("pv3", "pv_neg", "mppt", "pv_neg", "PV_NEGATIVE", "6mmÂ²"),
    edge("pv1", "pv_neg", "pv2", "pv_pos", "PV_POSITIVE", "6mmÂ²"),
    edge("pv2", "pv_neg", "pv3", "pv_pos", "PV_POSITIVE", "6mmÂ²"),
    // MPPT -> Lynx
    edge("mppt", "bat_pos", "lynx", "pos_1", "DC_POSITIVE", "25mmÂ²", "125A"),
    edge("mppt", "bat_neg", "negbus", "t1", "DC_NEGATIVE", "25mmÂ²"),
    edge("mppt", "vedirect", "cerbo", "vedirect1", "VE_DIRECT", "data"),
    // Batteries -> Lynx + shunt
    edge("bat1", "pos", "lynx", "pos_in", "DC_POSITIVE", "70mmÂ²", "300A"),
    edge("bat1", "neg", "shunt", "bat_side", "DC_NEGATIVE", "70mmÂ²"),
    edge("bat2", "pos", "bat1", "pos", "DC_POSITIVE", "70mmÂ²"),
    edge("bat2", "neg", "bat1", "neg", "DC_NEGATIVE", "70mmÂ²"),
    edge("bat3", "pos", "bat2", "pos", "DC_POSITIVE", "70mmÂ²"),
    edge("bat3", "neg", "bat2", "neg", "DC_NEGATIVE", "70mmÂ²"),
    edge("shunt", "sys_side", "negbus", "t2", "DC_NEGATIVE", "70mmÂ²"),
    edge("shunt", "vedirect", "cerbo", "vedirect2", "VE_DIRECT", "data"),
    // Lynx -> DC-DC, Inverter, Fuse box
    edge("lynx", "pos_2", "dcdc", "out_pos", "DC_POSITIVE", "10mmÂ²", "40A"),
    edge("dcdc", "out_neg", "negbus", "t3", "DC_NEGATIVE", "10mmÂ²"),
    edge("lynx", "pos_3", "multi", "bat_pos", "DC_POSITIVE", "70mmÂ²", "400A"),
    edge("multi", "bat_neg", "negbus", "b1", "DC_NEGATIVE", "70mmÂ²"),
    edge("lynx", "neg_in", "negbus", "b2", "DC_NEGATIVE", "70mmÂ²"),
    edge("multi", "vebus", "cerbo", "vebus", "VE_BUS", "data"),
    // 12V fuse box
    edge("lynx", "neg_1", "fbox", "neg_in", "DC_NEGATIVE", "16mmÂ²"),
    edge("dcdc", "out_pos", "fbox", "pos_in", "DC_POSITIVE", "16mmÂ²", "60A"),
    edge("fbox", "out1", "load12", "pos", "DC_POSITIVE", "2.5mmÂ²", "10A"),
    edge("fbox", "neg_in", "load12", "neg", "DC_NEGATIVE", "2.5mmÂ²"),
    // AC: shore -> multi in -> out -> rcd -> load
    edge("shore", "l", "multi", "ac_in_l", "AC_PHASE", "2.5mmÂ²"),
    edge("shore", "n", "multi", "ac_in_n", "AC_NEUTRAL", "2.5mmÂ²"),
    edge("shore", "pe", "multi", "ac_in_pe", "AC_GROUND", "2.5mmÂ²"),
    edge("multi", "ac_out_l", "rcd", "l_in", "AC_PHASE", "2.5mmÂ²"),
    edge("multi", "ac_out_n", "rcd", "n_in", "AC_NEUTRAL", "2.5mmÂ²"),
    edge("rcd", "l_out", "load230", "l", "AC_PHASE", "2.5mmÂ²", "16A"),
    edge("rcd", "n_out", "load230", "n", "AC_NEUTRAL", "2.5mmÂ²"),
    edge("multi", "ac_out_pe", "load230", "pe", "AC_GROUND", "2.5mmÂ²"),
    // Ground
    edge("negbus", "b3", "gnd", "gnd", "CHASSIS_GROUND", "16mmÂ²"),
  ];

  return { nodes, edges };
}
