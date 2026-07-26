// Client-side helpers for the photo/video → device-inventory flow.
// Images are downscaled in the browser before upload; the API key never leaves the server.

export interface VisionDevice {
  name: string;
  brand: string;
  model: string;
  category: string;
  quantity: number;
  confidence: "high" | "medium" | "low";
  note: string;
}

export interface VisionResult {
  devices: VisionDevice[];
  notes: string[];
}

export interface ImagePayload {
  media_type: "image/jpeg";
  data: string; // base64, no data-URL prefix
}

const MAX_DIM = 1600; // long edge; enough to read device labels without huge token cost
const API_BASE = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;

function drawToBase64(source: CanvasImageSource, w: number, h: number): string {
  const scale = Math.min(1, MAX_DIM / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas oluşturulamadı.");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}

/** Downscale an image file and return base64 JPEG. */
export async function imageFileToPayload(file: File): Promise<ImagePayload> {
  const bitmap = await createImageBitmap(file);
  try {
    return { media_type: "image/jpeg", data: drawToBase64(bitmap, bitmap.width, bitmap.height) };
  } finally {
    bitmap.close?.();
  }
}

/** Grab `count` evenly spaced frames from a video file, downscaled. */
export async function videoFileToPayloads(file: File, count = 6): Promise<ImagePayload[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Video okunamadı."));
    });

    const duration = video.duration;
    if (!isFinite(duration) || duration <= 0) throw new Error("Video süresi okunamadı.");

    const out: ImagePayload[] = [];
    for (let i = 0; i < count; i++) {
      const t = (duration * (i + 0.5)) / count;
      await new Promise<void>((resolve, reject) => {
        video.onseeked = () => resolve();
        video.onerror = () => reject(new Error("Video karesi alınamadı."));
        video.currentTime = t;
      });
      out.push({
        media_type: "image/jpeg",
        data: drawToBase64(video, video.videoWidth, video.videoHeight),
      });
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Send images to the server route for analysis. */
export async function analyzeImages(images: ImagePayload[]): Promise<VisionResult> {
  const res = await fetch(`${API_BASE}/wiring-vision`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ images }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.detail ?? json?.error ?? "Analiz basarisiz.");
  if (!json?.result) throw new Error("Modelden gecerli analiz sonucu alinamadi.");
  return json.result as VisionResult;
}

/** Turn the extracted inventory into the plain product-list text the schema generator parses. */
export function devicesToText(result: VisionResult): string {
  const lines = result.devices.map((d) => {
    const qty = d.quantity > 1 ? `${d.quantity} adet ` : "";
    const label = [d.brand, d.model].filter(Boolean).join(" ").trim();
    const name = label ? `${label} ${d.name}` : d.name;
    const flag = d.confidence === "low" ? "  (?)" : "";
    return `${qty}${name}${flag}`.replace(/\s+/g, " ").trim();
  });
  return lines.join("\n");
}
