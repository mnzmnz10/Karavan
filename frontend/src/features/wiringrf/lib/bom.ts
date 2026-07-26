import type { AppNode, AppEdge } from "@/features/wiringrf/store/useProjectStore";
import { CABLE_TYPES } from "@/features/wiringrf/data/cables";

export interface BomRow {
  name: string;
  brand: string;
  model: string;
  qty: number;
}

export interface CableRow {
  type: string;
  color: string;
  size: string;
  fuse?: string;
  from: string;
  to: string;
  length?: number;
}

export interface FuseRow {
  fuse: string;
  cableType: string;
  cableSize: string;
  from: string;
  to: string;
  qty: number;
}

export function buildBom(nodes: AppNode[]): BomRow[] {
  const map = new Map<string, BomRow>();
  for (const n of nodes) {
    const key = `${n.data.brand}|${n.data.model}`;
    const ex = map.get(key);
    if (ex) ex.qty += 1;
    else map.set(key, { name: n.data.label.replace(/\s·.*$/, ""), brand: n.data.brand, model: n.data.model, qty: 1 });
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

export function buildCableList(nodes: AppNode[], edges: AppEdge[]): CableRow[] {
  const labelById = new Map(nodes.map((n) => [n.id, n.data.label]));
  return edges.map((e) => ({
    type: CABLE_TYPES[e.data!.cableType].label,
    color: e.data!.color,
    size: e.data!.size,
    fuse: e.data!.fuse,
    from: labelById.get(e.source) ?? e.source,
    to: labelById.get(e.target) ?? e.target,
    length: e.data!.length,
  }));
}

export function buildFuseList(cables: CableRow[]): FuseRow[] {
  const map = new Map<string, FuseRow>();
  for (const c of cables) {
    if (!c.fuse) continue;
    const key = `${c.fuse}|${c.type}|${c.size}|${c.from}|${c.to}`;
    const existing = map.get(key);
    if (existing) existing.qty += 1;
    else map.set(key, {
      fuse: c.fuse,
      cableType: c.type,
      cableSize: c.size,
      from: c.from,
      to: c.to,
      qty: 1,
    });
  }
  return [...map.values()];
}

export function buildCableTotals(cables: CableRow[]) {
  const map = new Map<string, { type: string; size: string; color: string; qty: number; totalLength: number }>();
  for (const c of cables) {
    const key = `${c.type}|${c.size}|${c.color}`;
    const existing = map.get(key) ?? { type: c.type, size: c.size, color: c.color, qty: 0, totalLength: 0 };
    existing.qty += 1;
    existing.totalLength += Number(c.length ?? 0);
    map.set(key, existing);
  }
  return [...map.values()];
}

export function toCsv(rows: Record<string, unknown>[], headers: string[]): string {
  const esc = (v: unknown) => {
    let s = String(v ?? "");
    // Neutralize spreadsheet formula injection (cells starting with = + - @).
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const head = headers.map(esc).join(",");
  const body = rows.map((r) => headers.map((h) => esc(r[h])).join(",")).join("\n");
  return `${head}\n${body}`;
}

type SheetRow = Array<string | number | undefined>;

function xmlEsc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function colName(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function sheetXml(rows: SheetRow[]): string {
  const body = rows.map((row, r) => {
    const cells = row.map((value, c) => {
      const ref = `${colName(c)}${r + 1}`;
      if (typeof value === "number" && Number.isFinite(value)) {
        return `<c r="${ref}"><v>${value}</v></c>`;
      }
      return `<c r="${ref}" t="inlineStr"><is><t>${xmlEsc(value)}</t></is></c>`;
    }).join("");
    return `<row r="${r + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function crc32(bytes: Uint8Array): number {
  let crc = -1;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}

function u16(n: number) { return [n & 255, (n >>> 8) & 255]; }
function u32(n: number) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; }

function zip(files: { name: string; content: string }[]): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = enc.encode(f.content);
    const crc = crc32(data);
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0),
      ...name, ...data,
    ]);
    chunks.push(local);
    central.push(new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name,
    ]));
    offset += local.length;
  }
  const centralSize = central.reduce((sum, c) => sum + c.length, 0);
  const end = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
    ...u32(centralSize), ...u32(offset), ...u16(0),
  ]);
  const parts = [...chunks, ...central, end].map((part) =>
    part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength) as ArrayBuffer,
  );
  return new Blob(parts, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function exportBomExcel(nodes: AppNode[], edges: AppEdge[], fileName: string) {
  const devices = buildBom(nodes);
  const cables = buildCableList(nodes, edges);
  const fuses = buildFuseList(cables);
  const totals = buildCableTotals(cables);
  const sheets = [
    { name: "Cihazlar", rows: [["Marka", "Model", "Cihaz", "Adet"], ...devices.map((r) => [r.brand, r.model, r.name, r.qty])] },
    { name: "Kablolar", rows: [["Tip", "Kesit", "Renk", "Uzunluk (m)", "Kaynak", "Hedef", "Sigorta"], ...cables.map((r) => [r.type, r.size, r.color, r.length ?? "", r.from, r.to, r.fuse ?? ""])] },
    { name: "Sigortalar", rows: [["Sigorta", "Kablo Tipi", "Kesit", "Kaynak", "Hedef", "Adet"], ...fuses.map((r) => [r.fuse, r.cableType, r.cableSize, r.from, r.to, r.qty])] },
    { name: "Toplamlar", rows: [["Kablo Tipi", "Kesit", "Renk", "Kablo Adedi", "Toplam Uzunluk (m)"], ...totals.map((r) => [r.type, r.size, r.color, r.qty, Number(r.totalLength.toFixed(2))])] },
  ];
  const workbookSheets = sheets.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("");
  const rels = sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("");
  const contentTypes = sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  const blob = zip([
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${contentTypes}</Types>` },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>` },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, content: sheetXml(s.rows) })),
  ]);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}
