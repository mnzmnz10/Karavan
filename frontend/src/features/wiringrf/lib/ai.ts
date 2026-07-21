import type { ProjectSnapshot, SerializedNode, SerializedEdge, ProductNodeData, CableType, ProductCategory } from "@/features/wiringrf/types";
import { CATALOG, CATALOG_MAP } from "@/features/wiringrf/data/catalog";
import { CABLE_TYPES, layerForCableType } from "@/features/wiringrf/data/cables";

// ---------------------------------------------------------------------------
// Text normalization (Turkish-aware) — so "ŞALTER", "LNYX", "buzdolabı" all match.
// ---------------------------------------------------------------------------
// Character-for-character fold (same length) so match indices map back to the raw text.
function fold(s: string): string {
  return s
    .replace(/İ/g, "i").replace(/I/g, "ı")
    .toLowerCase()
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c");
}

function norm(s: string): string {
  return fold(s).replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Device patterns (non-consumer). More specific patterns must come first so a
// line like "BLUESMART 250/100 MPPT PANEL KABLOLARI" resolves MPPT, not panel.
// ---------------------------------------------------------------------------
const DEVICES: { re: RegExp; id: string }[] = [
  { re: /mppt|smartsolar|smart solar|bluesolar|blue solar|bluesmart|sarj kontrol/, id: "mppt_250_100" },
  { re: /dc ?-? ?dc|orion|bi ?direction|dcdc/, id: "orion_tr_1212_30" },
  { re: /multiplus|multi ?plus|quattro|inverter ?\/ ?charger/, id: "multiplus_ii_12_3000" },
  { re: /inverter|invertor|inverter/, id: "phoenix_inverter_12_1200" },
  { re: /smartshunt|smart shunt|shunt|sant\b|santla/, id: "smart_shunt_500" },
  { re: /lifepo4|life po4|aku|batarya|battery|megacell|lityum/, id: "lifepo4_200" },
  { re: /lynx|lnyx|linx|distribut|distribit|power ?in/, id: "lynx_distributor" },
  { re: /negatif bus|negative bus|eksi bara|negatif bara/, id: "busbar_neg" },
  { re: /busbar|bara\b/, id: "busbar_pos" },
  { re: /salter|ana kesici|main switch|ayirici/, id: "dc_breaker" },
  { re: /kacak akim|rcd|kacak/, id: "rcd_2p" },
  { re: /sigorta kutu|fuse box|blade fuse/, id: "fuse_box_12v" },
  { re: /mcb|otomat sigorta|w-?otomat/, id: "mcb_1p" },
  { re: /mega fuse|ana sigorta|anl fuse|midi fuse|sigorta(?! ?kutu)/, id: "mega_fuse" },
  { re: /shore|kara baglanti|sehir cereyan/, id: "shore_power" },
  { re: /cerbo|venus gx|gx cihaz/, id: "cerbo_gx" },
  { re: /bmv|multi ?control|kontrol panel|ekran/, id: "control_panel" },
  { re: /panel|solar|monokristal|mono kristal|pv modul|fotovoltaik/, id: "solar_panel_455" },
  { re: /toprak|sase|ground/, id: "ground_point" },
];

// Consumer loads — only matched from split tokens, never from a whole line.
const LOADS_12V = /buzdolabi|dolap|hidrofor|macerator|maceratr|truma|ses sistem|basamak|aydinlatma|isik|lamba|uydu|dvr|fan\b|pompa|usb|anahat|ana hat/;
const LOADS_230V = /camasir makine|bulasik makine|klima|priz|mikrodalga|firin|su isitici|kettle|tv\b|kombi|elektrik ocag/;

interface ParsedItem {
  templateId: string;
  qty: number;
  label?: string;   // user-provided name (loads keep their own name)
  explicit: boolean; // true when the line stated an explicit quantity
}

function quantityOf(seg: string): number | null {
  const m = seg.match(/(?:^|\s)(\d{1,2})\s*(?:adet|tane|pcs|stk|x)\b/) || seg.match(/(?:^|\s)x\s*(\d{1,2})\b/);
  return m ? Math.min(24, Math.max(1, parseInt(m[1], 10))) : null;
}

// Build a display label for a load: take the raw text from where the keyword matched,
// so "…sırayla 1.kutuda buzdolabı" becomes "Buzdolabı".
function labelFromMatch(raw: string, re: RegExp): string {
  const m = fold(raw).match(re);
  let start = m && m.index !== undefined ? m.index : 0;
  // Keep a short leading qualifier ("iç", "dış", "ön", "arka") attached to the name,
  // but only when it is a whole short word (never a slice of a longer one).
  const before = raw.slice(0, start).match(/(\p{L}+)\s*$/u);
  if (before && before[1].length >= 2 && before[1].length <= 5) start -= before[0].length;
  let s = raw.slice(start)
    .replace(/^[\s\-–:.]+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  if (!s) s = raw.trim();
  return s.charAt(0).toLocaleUpperCase("tr") + s.slice(1);
}

/**
 * Parse a free-text product list. Never executes user text — only keyword matching,
 * so injected instructions inside the list cannot influence behavior.
 */
export function parseProductList(text: string): { items: ParsedItem[]; unknown: string[] } {
  const items: ParsedItem[] = [];
  const unknown: string[] = [];

  for (const rawLine of text.split(/\n|;/)) {
    const line = rawLine.trim();
    if (!line) continue;

    // Sentence split (". " but not "1.kutuda") so a quantity binds to its own device.
    for (const rawSeg of line.split(/,|\.(?=\s)/)) {
      const seg = rawSeg.trim();
      if (!seg) continue;
      const nseg = norm(seg);
      let matchedAnything = false;

      // 1) Every non-consumer device mentioned in this segment.
      const qty = quantityOf(nseg);
      for (const d of DEVICES) {
        if (d.re.test(nseg)) {
          items.push({ templateId: d.id, qty: qty ?? 1, explicit: qty !== null });
          matchedAnything = true;
        }
      }

      // 2) Consumer loads from "-" separated tokens (e.g. "buzdolabı-hidrofor-fan").
      //    "2.kutuda" style markers also act as separators between loads.
      const tokenSource = seg.replace(/\d+\s*\.\s*kutu(da|su)?/gi, " - ");
      for (const rawTok of tokenSource.split(/-|–/)) {
        const tok = rawTok.trim();
        if (!tok) continue;
        const ntok = norm(tok);
        if (LOADS_230V.test(ntok)) {
          items.push({ templateId: "consumer_230v", qty: 1, label: labelFromMatch(tok, LOADS_230V), explicit: true });
          matchedAnything = true;
        } else if (LOADS_12V.test(ntok)) {
          items.push({ templateId: "consumer_12v", qty: 1, label: labelFromMatch(tok, LOADS_12V), explicit: true });
          matchedAnything = true;
        }
      }

      if (!matchedAnything && nseg.length > 3) unknown.push(seg);
    }
  }

  // Declarations (explicit "N adet") set the count; bare mentions only ensure one.
  const counts = new Map<string, ParsedItem[]>();
  for (const it of items) {
    const list = counts.get(it.templateId) ?? [];
    counts.set(it.templateId, list);
    if (it.label) { list.push(it); continue; }             // named loads always accumulate
    if (it.explicit) {
      // Explicit declaration wins: reset unnamed entries to the declared quantity.
      const named = list.filter((x) => x.label);
      counts.set(it.templateId, [...named, ...Array.from({ length: it.qty }, () => ({ ...it, qty: 1 }))]);
    } else if (list.filter((x) => !x.label).length === 0) {
      list.push({ ...it, qty: 1 });
    }
  }

  const flat: ParsedItem[] = [];
  for (const list of counts.values()) flat.push(...list);
  return { items: flat, unknown };
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
// Left-to-right stages following the power flow. Everything is placed automatically
// (no fixed coordinates), so columns never collide and tall groups wrap.
const COLUMNS: ProductCategory[][] = [
  ["solar_panel"],
  ["mppt"],
  ["battery", "shunt", "breaker"],
  ["lynx_distributor", "busbar", "fuse", "ground_point"],
  ["dcdc", "gx_device", "control_panel"],
  ["inverter_charger", "inverter", "shore_power"],
  ["fuse_box", "rcd", "mcb"],
  ["consumer_12v", "consumer_230v"],
];

const COL_GAP = 190;   // horizontal gap between stages
const ROW_GAP = 46;    // vertical gap inside a stage
const SUB_GAP = 70;    // gap between wrapped sub-columns
const MAX_COL_H = 900; // wrap a stage into another sub-column beyond this height

let nid = 0, eid = 0;

function mkNode(templateId: string, x: number, y: number, label?: string): SerializedNode {
  const tpl = CATALOG_MAP[templateId];
  const data: ProductNodeData = {
    templateId: tpl.id,
    label: label ?? tpl.name,
    brand: tpl.brand, model: tpl.model, category: tpl.category,
    voltage: tpl.voltage, acdc: tpl.acdc, icon: tpl.icon, accent: tpl.accent,
    ports: tpl.ports.map((p) => ({ ...p })),
    width: tpl.width, height: tpl.height, rotation: 0,
  };
  return { id: `ai_n${nid++}`, position: { x, y }, data };
}

function mkEdge(s: string, sh: string, t: string, th: string, ct: CableType, size: string, fuse?: string): SerializedEdge {
  const def = CABLE_TYPES[ct];
  return {
    id: `ai_e${eid++}`, source: s, target: t, sourceHandle: sh, targetHandle: th,
    data: { cableType: ct, color: def.color, size, fuse, label: fuse ? `${size} / ${fuse}` : size, layer: layerForCableType(ct) },
  };
}

export interface AiResult { snapshot: ProjectSnapshot; warnings: string[] }

/** Local rule-based generator. Mirrors the JSON contract a real LLM provider would return. */
export function generateLocal(text: string): AiResult {
  nid = 0; eid = 0;
  const { items, unknown } = parseProductList(text);
  const warnings: string[] = [];
  const nodes: SerializedNode[] = [];
  const byCat: Partial<Record<ProductCategory, string[]>> = {};
  const byTpl: Record<string, string[]> = {};

  // ---- Auto layout: bucket by category, then place stage by stage ----
  const buckets = new Map<ProductCategory, typeof items>();
  for (const it of items) {
    const tpl = CATALOG_MAP[it.templateId];
    if (!tpl) continue;
    const list = buckets.get(tpl.category) ?? [];
    buckets.set(tpl.category, list);
    list.push(it);
  }
  const placedCats = new Set(COLUMNS.flat());
  const leftovers = [...buckets.keys()].filter((c) => !placedCats.has(c));
  const stages = leftovers.length ? [...COLUMNS, leftovers] : COLUMNS;

  let cursorX = 0;
  const columnNodes: SerializedNode[][] = [];
  for (const stage of stages) {
    const stageItems = stage.flatMap((cat) => (buckets.get(cat) ?? []).map((it) => ({ it, tpl: CATALOG_MAP[it.templateId] })));
    if (!stageItems.length) continue;

    const mine: SerializedNode[] = [];
    let subX = cursorX, y = 0, subW = 0, usedW = 0;
    for (const { it, tpl } of stageItems) {
      if (y > 0 && y + tpl.height > MAX_COL_H) {
        usedW = subX - cursorX + subW;
        subX = cursorX + usedW + SUB_GAP;
        y = 0; subW = 0;
      }
      const node = mkNode(it.templateId, subX, y, it.label);
      nodes.push(node);
      mine.push(node);
      (byCat[tpl.category] ??= []).push(node.id);
      (byTpl[it.templateId] ??= []).push(node.id);
      y += tpl.height + ROW_GAP;
      subW = Math.max(subW, tpl.width);
    }
    usedW = subX - cursorX + subW;
    cursorX += usedW + COL_GAP;
    columnNodes.push(mine);
  }

  // Vertically centre every stage against the tallest one.
  const heightOf = (col: SerializedNode[]) =>
    Math.max(...col.map((n) => n.position.y + n.data.height));
  const tallest = columnNodes.length ? Math.max(...columnNodes.map(heightOf)) : 0;
  for (const col of columnNodes) {
    const shift = (tallest - heightOf(col)) / 2;
    for (const n of col) n.position.y += shift;
  }

  const first = (c: ProductCategory) => byCat[c]?.[0];
  const all = (c: ProductCategory) => byCat[c] ?? [];
  const firstTpl = (t: string) => byTpl[t]?.[0];
  const edges: SerializedEdge[] = [];

  // ---- Solar string -> MPPT ----
  const panels = all("solar_panel");
  const mppt = first("mppt");
  if (panels.length && mppt) {
    for (let i = 0; i < panels.length - 1; i++)
      edges.push(mkEdge(panels[i], "pv_neg", panels[i + 1], "pv_pos", "PV_POSITIVE", "6mm²"));
    edges.push(mkEdge(panels[0], "pv_pos", mppt, "pv_pos", "PV_POSITIVE", "6mm²"));
    edges.push(mkEdge(panels[panels.length - 1], "pv_neg", mppt, "pv_neg", "PV_NEGATIVE", "6mm²"));
  } else if (panels.length && !mppt) {
    warnings.push("Solar panel var ama MPPT yok — şarj kontrol cihazı ekleyin.");
  }

  // ---- Battery bank ----
  const batteries = all("battery");
  const shunt = first("shunt");
  const breaker = firstTpl("dc_breaker");
  const lynx = first("lynx_distributor");
  const negbus = firstTpl("busbar_neg");
  if (!batteries.length) warnings.push("Akü tanımlanmadı.");
  for (let i = 0; i < batteries.length - 1; i++) {
    edges.push(mkEdge(batteries[i + 1], "pos", batteries[i], "pos", "DC_POSITIVE", "70mm²"));
    edges.push(mkEdge(batteries[i + 1], "neg", batteries[i], "neg", "DC_NEGATIVE", "70mm²"));
  }

  // Battery + -> (breaker) -> Lynx ; Battery - -> shunt -> negative bar/Lynx
  const posBusIn = lynx ? { id: lynx, port: "pos_in" } : null;
  if (batteries[0]) {
    if (breaker) {
      edges.push(mkEdge(batteries[0], "pos", breaker, "in", "DC_POSITIVE", "70mm²", "300A"));
      if (posBusIn) edges.push(mkEdge(breaker, "out", posBusIn.id, posBusIn.port, "DC_POSITIVE", "70mm²"));
    } else if (posBusIn) {
      edges.push(mkEdge(batteries[0], "pos", posBusIn.id, posBusIn.port, "DC_POSITIVE", "70mm²", "300A"));
    } else {
      warnings.push("Dağıtım (Lynx/busbar) yok — akü pozitifine ana sigorta + dağıtım önerilir.");
    }
    const last = batteries[batteries.length - 1];
    if (shunt) {
      edges.push(mkEdge(last, "neg", shunt, "bat_side", "DC_NEGATIVE", "70mm²"));
      if (negbus) edges.push(mkEdge(shunt, "sys_side", negbus, "t1", "DC_NEGATIVE", "70mm²"));
      else if (lynx) edges.push(mkEdge(shunt, "sys_side", lynx, "neg_in", "DC_NEGATIVE", "70mm²"));
    } else if (negbus) {
      edges.push(mkEdge(last, "neg", negbus, "t1", "DC_NEGATIVE", "70mm²"));
    } else if (lynx) {
      edges.push(mkEdge(last, "neg", lynx, "neg_in", "DC_NEGATIVE", "70mm²"));
    }
  }
  const negHub = negbus ? { id: negbus, ports: ["t2", "t3", "b1", "b2", "b3"] } : lynx ? { id: lynx, ports: ["neg_1", "neg_2", "neg_3"] } : null;
  let negIdx = 0;
  const nextNeg = () => {
    if (!negHub) return null;
    const p = negHub.ports[Math.min(negIdx++, negHub.ports.length - 1)];
    return { id: negHub.id, port: p };
  };

  // ---- MPPT -> distribution ----
  if (mppt && lynx) edges.push(mkEdge(mppt, "bat_pos", lynx, "pos_1", "DC_POSITIVE", "25mm²", "125A"));
  if (mppt) { const n = nextNeg(); if (n) edges.push(mkEdge(mppt, "bat_neg", n.id, n.port, "DC_NEGATIVE", "25mm²")); }

  // ---- DC-DC ----
  const dcdc = first("dcdc");
  if (dcdc && lynx) {
    edges.push(mkEdge(lynx, "pos_2", dcdc, "in_pos", "DC_POSITIVE", "10mm²", "40A"));
    const n = nextNeg(); if (n) edges.push(mkEdge(n.id, n.port, dcdc, "in_neg", "DC_NEGATIVE", "10mm²"));
  }

  // ---- Inverter ----
  const inv = first("inverter_charger") ?? first("inverter");
  const invIsCharger = !!first("inverter_charger");
  if (inv) {
    if (lynx) edges.push(mkEdge(lynx, "pos_3", inv, "bat_pos", "DC_POSITIVE", "70mm²", "400A"));
    const n = nextNeg(); if (n) edges.push(mkEdge(n.id, n.port, inv, "bat_neg", "DC_NEGATIVE", "70mm²"));
  } else {
    warnings.push("İnverter tanımlanmadı.");
  }

  // ---- AC: shore -> inverter/charger in ----
  const shore = first("shore_power");
  if (shore && inv && invIsCharger) {
    edges.push(mkEdge(shore, "l", inv, "ac_in_l", "AC_PHASE", "2.5mm²"));
    edges.push(mkEdge(shore, "n", inv, "ac_in_n", "AC_NEUTRAL", "2.5mm²"));
    edges.push(mkEdge(shore, "pe", inv, "ac_in_pe", "AC_GROUND", "2.5mm²"));
  }

  // ---- AC: inverter out -> RCD -> 230V loads ----
  const rcd = first("rcd") ?? first("mcb");
  const loads230 = all("consumer_230v");
  if (inv && rcd) {
    edges.push(mkEdge(inv, "ac_out_l", rcd, "l_in", "AC_PHASE", "2.5mm²"));
    edges.push(mkEdge(inv, "ac_out_n", rcd, "n_in", "AC_NEUTRAL", "2.5mm²"));
  }
  for (const load of loads230) {
    if (rcd) {
      edges.push(mkEdge(rcd, "l_out", load, "l", "AC_PHASE", "2.5mm²", "16A"));
      edges.push(mkEdge(rcd, "n_out", load, "n", "AC_NEUTRAL", "2.5mm²"));
    }
    if (inv) edges.push(mkEdge(inv, "ac_out_pe", load, "pe", "AC_GROUND", "2.5mm²"));
  }
  if (loads230.length && !rcd) warnings.push("230V tüketici var ama RCD/MCB yok — koruma ekleyin.");

  // ---- 12V fuse boxes + loads ----
  const boxes = all("fuse_box");
  const loads12 = all("consumer_12v");
  for (const box of boxes) {
    const src = dcdc ? { id: dcdc, port: "out_pos" } : lynx ? { id: lynx, port: "pos_2" } : null;
    if (src) edges.push(mkEdge(src.id, src.port, box, "pos_in", "DC_POSITIVE", "16mm²", "60A"));
    const n = nextNeg(); if (n) edges.push(mkEdge(n.id, n.port, box, "neg_in", "DC_NEGATIVE", "16mm²"));
  }
  if (loads12.length && !boxes.length) warnings.push("12V tüketici var ama sigorta kutusu yok.");
  const OUTS = ["out1", "out2", "out3", "out4", "out5", "out6", "out7", "out8"];
  loads12.forEach((load, i) => {
    if (!boxes.length) return;
    const box = boxes[Math.floor(i / OUTS.length) % boxes.length];
    const out = OUTS[i % OUTS.length];
    edges.push(mkEdge(box, out, load, "pos", "DC_POSITIVE", "2.5mm²", "10A"));
    const n = nextNeg(); if (n) edges.push(mkEdge(n.id, n.port, load, "neg", "DC_NEGATIVE", "2.5mm²"));
  });
  if (loads12.length > boxes.length * OUTS.length) {
    warnings.push(`12V yük sayısı (${loads12.length}) sigorta kutusu kapasitesini (${boxes.length * OUTS.length}) aşıyor.`);
  }

  // ---- Data / control ----
  const gx = first("gx_device");
  const panelsCtl = all("control_panel");
  if (mppt && gx) edges.push(mkEdge(mppt, "vedirect", gx, "vedirect1", "VE_DIRECT", "data"));
  if (shunt && gx) edges.push(mkEdge(shunt, "vedirect", gx, "vedirect2", "VE_DIRECT", "data"));
  if (inv && gx && invIsCharger) edges.push(mkEdge(inv, "vebus", gx, "vebus", "VE_BUS", "data"));
  panelsCtl.forEach((cp, i) => {
    if (i === 0 && shunt) edges.push(mkEdge(shunt, "vedirect", cp, "data", "VE_DIRECT", "data"));
    else if (inv && invIsCharger) edges.push(mkEdge(inv, "vebus", cp, "data", "VE_BUS", "data"));
  });

  // ---- Ground ----
  const gnd = first("ground_point");
  if (gnd) {
    const n = nextNeg();
    if (n) edges.push(mkEdge(n.id, n.port, gnd, "gnd", "CHASSIS_GROUND", "16mm²"));
  }

  if (!negbus && !lynx && batteries.length) {
    warnings.push("Negatif dönüş barası yok — negatif busbar veya Lynx ekleyin.");
  }
  if (nodes.length === 0) warnings.push("Listeden tanınan ürün çıkmadı.");
  for (const u of unknown.slice(0, 8)) warnings.push(`Tanınmadı, şemaya eklenmedi: “${u.slice(0, 60)}”`);

  return { snapshot: { nodes, edges }, warnings };
}

export const AI_SAMPLE = `MEGACELL 210Ah LiFePO4 akü 3 adet paralel
Victron Smart Shunt
Şalter (DC ana kesici)
Victron MultiPlus-II 12/3000
Victron SmartSolar MPPT 250/100
550W monokristal panel 3 adet seri
Havensis 40A DC-DC
Lynx Distributor
Negatif busbar
12V sigorta kutusu 2 adet
25A/30mA kaçak akım rölesi
buzdolabı-hidrofor-maceratör-truma-ses sistemi-basamak
iç aydınlatma-uydu-dvr-dış aydınlatma-fan
çamaşır makinesi-bulaşık makinesi-klima-prizler
BMV-712 ekran, Multi Control ekran`;

export { CATALOG };

