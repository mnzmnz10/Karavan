import { jsPDF } from "jspdf";
import { toPng } from "html-to-image";
import { getNodesBounds } from "@xyflow/react";
import type { AppNode, AppEdge } from "@/features/wiringrf/store/useProjectStore";
import type { ProjectMeta } from "@/features/wiringrf/types";
import { buildBom, buildCableList } from "./bom";
import { PDF_FONT_BASE64, PDF_FONT_FILE, PDF_FONT_NAME } from "./pdfFont";

const FAM = PDF_FONT_NAME;

function ensureUnicodeFont(doc: jsPDF): void {
  // Turkce glyph'ler offline calissin diye font VFS'e yerel base64'ten gomulur.
  doc.addFileToVFS(PDF_FONT_FILE, PDF_FONT_BASE64);
  doc.addFont(PDF_FONT_FILE, FAM, "normal");
  doc.addFont(PDF_FONT_FILE, FAM, "bold");
}

function tr(s: string): string {
  return String(s ?? "");
}

async function captureDiagram(nodes: AppNode[]): Promise<{ dataUrl: string; w: number; h: number } | null> {
  const viewport = document.querySelector<HTMLElement>(".react-flow__viewport");
  if (!viewport || nodes.length === 0) return null;

  const bounds = getNodesBounds(nodes);
  const pad = 40; // px padding around the diagram in the captured image
  // Crop tightly to the diagram bounds at a high-res scale, so the PDF page is filled
  // by the schematic instead of a mostly-empty canvas.
  const scale = Math.max(0.5, Math.min(2.5, 3600 / (bounds.width + 1), 2600 / (bounds.height + 1)));
  const imgW = Math.ceil(bounds.width * scale + pad * 2);
  const imgH = Math.ceil(bounds.height * scale + pad * 2);
  const tx = pad - bounds.x * scale;
  const ty = pad - bounds.y * scale;

  const dataUrl = await toPng(viewport, {
    backgroundColor: "#ffffff",
    width: imgW,
    height: imgH,
    style: {
      width: `${imgW}px`,
      height: `${imgH}px`,
      transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
      transformOrigin: "0 0",
    },
  });
  return { dataUrl, w: imgW, h: imgH };
}

export async function exportProjectPdf(
  meta: ProjectMeta,
  nodes: AppNode[],
  edges: AppEdge[],
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  ensureUnicodeFont(doc);
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12;

  const header = (title: string) => {
    // Navy bar + emerald accent stripe + logo chip.
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, W, 17, "F");
    doc.setFillColor(16, 185, 129); // emerald-500
    doc.rect(0, 17, W, 1.1, "F");

    doc.setFillColor(16, 185, 129);
    doc.roundedRect(M, 4.5, 7, 7, 1.4, 1.4, "F");
    doc.setTextColor(15, 23, 42);
    doc.setFont(FAM, "bold");
    doc.setFontSize(11);
    doc.text("k", M + 2.5, 9.6);

    doc.setTextColor(255);
    doc.setFontSize(13);
    doc.setFont(FAM, "bold");
    doc.text(tr(meta.name || "Karavan Elektrik Şeması"), M + 11, 10.8);

    doc.setTextColor(226, 232, 240); // slate-200
    doc.setFontSize(10);
    doc.setFont(FAM, "bold");
    doc.text(tr(title), W - M, 10.8, { align: "right" });
    doc.setTextColor(0);
  };
  const footer = (page: number, total: number) => {
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(M, H - 8, W - M, H - 8);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.setFont(FAM, "normal");
    doc.text(`Sayfa ${page} / ${total}`, W - M, H - 4, { align: "right" });
    doc.setTextColor(0);
  };

  // --- Page 1: Diagram ---
  header("Ana Elektrik Şeması");
  const cap = await captureDiagram(nodes);
  if (cap) {
    const availW = W - 2 * M;
    const availH = H - 28 - M;
    const ratio = Math.min(availW / cap.w, availH / cap.h);
    const dw = cap.w * ratio;
    const dh = cap.h * ratio;
    doc.addImage(cap.dataUrl, "PNG", (W - dw) / 2, 24, dw, dh);
  } else {
    doc.setFontSize(10);
    doc.text("Şema boş.", M, 30);
  }
  // --- Page 2: Cable list ---
  doc.addPage();
  header("Kablo Listesi");
  let y = 24;
  const cables = buildCableList(nodes, edges);
  doc.setFontSize(8);
  doc.setFont(FAM, "bold");
  const cols = [M, M + 45, M + 80, M + 130, M + 160, M + 185];
  ["Tip", "Kesit / Sigorta", "Kaynak", "Hedef", "Renk", "Uzunluk"].forEach((h, i) =>
    doc.text(tr(h), cols[i], y));
  y += 2; doc.setDrawColor(200); doc.line(M, y, W - M, y); y += 5;
  doc.setFont(FAM, "normal");
  for (const c of cables) {
    if (y > H - 12) { doc.addPage(); header("Kablo Listesi (devam)"); y = 24; }
    doc.text(tr(c.type), cols[0], y);
    doc.text(tr(`${c.size}${c.fuse ? " / " + c.fuse : ""}`), cols[1], y);
    doc.text(tr(c.from).slice(0, 26), cols[2], y);
    doc.text(tr(c.to).slice(0, 18), cols[3], y);
    doc.setFillColor(c.color);
    doc.rect(cols[4], y - 3, 6, 3.5, "F");
    doc.text(c.length ? `${c.length} m` : "-", cols[5], y);
    y += 6;
  }
  // --- Page 3: BOM ---
  doc.addPage();
  header("Malzeme Listesi (BOM)");
  y = 24;
  const bom = buildBom(nodes);
  doc.setFontSize(8); doc.setFont(FAM, "bold");
  const bcols = [M, M + 90, M + 150, M + 230];
  ["Ürün", "Marka", "Model", "Adet"].forEach((h, i) => doc.text(tr(h), bcols[i], y));
  y += 2; doc.line(M, y, W - M, y); y += 5;
  doc.setFont(FAM, "normal");
  for (const b of bom) {
    if (y > H - 12) { doc.addPage(); header("Malzeme Listesi (devam)"); y = 24; }
    doc.text(tr(b.name).slice(0, 50), bcols[0], y);
    doc.text(tr(b.brand), bcols[1], y);
    doc.text(tr(b.model).slice(0, 40), bcols[2], y);
    doc.text(String(b.qty), bcols[3], y);
    y += 6;
  }
  // Toplam sayfa bilindikten sonra her sayfaya dogru X / Y footer basilir.
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    doc.setPage(page);
    footer(page, total);
  }

  doc.save(`${tr(meta.name || "kablo")}.pdf`);
}


