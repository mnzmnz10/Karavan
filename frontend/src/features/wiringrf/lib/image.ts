const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export interface ImageResult {
  ok: boolean;
  dataUrl?: string;
  error?: string;
}

// Strip scripts/handlers/external refs from SVG to prevent stored XSS.
function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/(href|xlink:href)\s*=\s*"(?!#)[^"]*"/gi, "")
    .replace(/javascript:/gi, "");
}

export async function readImageFile(file: File): Promise<ImageResult> {
  if (!ALLOWED.includes(file.type)) {
    return { ok: false, error: "Desteklenmeyen tÃ¼r. PNG/JPEG/WebP/SVG kullanÄ±n." };
  }

  if (file.type === "image/svg+xml") {
    const text = await file.text();
    const clean = sanitizeSvg(text);
    const dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(clean)))}`;
    return { ok: true, dataUrl };
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ ok: true, dataUrl: String(reader.result) });
    reader.onerror = () => resolve({ ok: false, error: "Dosya okunamadÄ±." });
    reader.readAsDataURL(file);
  });
}
