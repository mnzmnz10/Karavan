import { useRef, useState } from "react";
import { Sparkles, X, Camera, Loader2 } from "lucide-react";
import { generateLocal, AI_SAMPLE } from "@/features/wiringrf/lib/ai";
import { useProjectStore } from "@/features/wiringrf/store/useProjectStore";
import { analyzeImages, devicesToText, imageFileToPayload, videoFileToPayloads, type ImagePayload } from "@/features/wiringrf/lib/vision";
import type { ProjectSnapshot } from "@/features/wiringrf/types";

export function AiModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState(AI_SAMPLE);
  const [preview, setPreview] = useState<{ snapshot: ProjectSnapshot; warnings: string[] } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [visionNotes, setVisionNotes] = useState<string[]>([]);
  const mediaRef = useRef<HTMLInputElement>(null);
  const loadSnapshot = useProjectStore((s) => s.loadSnapshot);

  if (!open) return null;

  const onGenerate = () => setPreview(generateLocal(text));

  // Photo/video -> device inventory -> fills the product list for the user to edit.
  const onMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setAnalyzing(true);
    setVisionNotes([]);
    try {
      const payloads: ImagePayload[] = [];
      for (const f of files) {
        if (f.type.startsWith("video/")) payloads.push(...(await videoFileToPayloads(f, 6)));
        else if (f.type.startsWith("image/")) payloads.push(await imageFileToPayload(f));
      }
      if (!payloads.length) throw new Error("Geçerli fotoğraf/video bulunamadı.");
      const result = await analyzeImages(payloads.slice(0, 10));
      const listed = devicesToText(result);
      setText((prev) => (prev === AI_SAMPLE || !prev.trim() ? listed : `${prev}\n${listed}`));
      setVisionNotes(result.notes ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Analiz başarısız.";
      setVisionNotes([message]);
    } finally {
      setAnalyzing(false);
    }
  };
  const onApply = () => {
    if (!preview) return;
    loadSnapshot(preview.snapshot, { name: "AI Otomatik Şema" }, { undoable: true });
    onClose();
    setPreview(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800"><Sparkles size={16} className="text-blue-600" /> AI ile Otomatik Şema</h2>
          <button onClick={onClose}><X size={18} className="text-slate-400 hover:text-slate-700" /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <p className="text-xs text-slate-500">Ürünleri satır satır yaz — ya da pano fotoğrafı/videosu yükle, cihazlar otomatik listelensin. Şemayı kurallı yerel üretici çizer.</p>

          <div className="flex items-center gap-2">
            <input ref={mediaRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={onMedia} />
            <button onClick={() => mediaRef.current?.click()} disabled={analyzing}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50">
              {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              {analyzing ? "Analiz ediliyor..." : "Fotoğraf / Video Yükle"}
            </button>
            <span className="text-[10px] text-slate-400">Cihaz envanteri çıkarılır; kablo bağlantıları tahmin edilmez.</span>
          </div>

          {visionNotes.length > 0 && (
            <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
              {visionNotes.map((n, i) => <li key={i}>• {n}</li>)}
            </ul>
          )}

          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9}
            className="w-full rounded-md border border-slate-300 p-2 font-mono text-xs outline-none focus:border-blue-400" />
          <button onClick={onGenerate} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">Şema Üret</button>

          {preview && (
            <div className="rounded-md border border-slate-200 p-3 text-xs">
              <div className="mb-2 font-semibold text-slate-700">
                Önizleme: {preview.snapshot.nodes.length} ürün · {preview.snapshot.edges.length} kablo
              </div>
              {preview.warnings.length > 0 && (
                <ul className="mb-2 space-y-1">
                  {preview.warnings.map((w, i) => (
                    <li key={i} className="text-amber-700">? {w}</li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-slate-400">Uygula’ya basınca mevcut şema bu çıktıyla değişir. Sonra elle düzenleyebilirsin.</p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button onClick={onClose} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs">İptal</button>
          <button onClick={onApply} disabled={!preview} className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-40">Uygula</button>
        </div>
      </div>
    </div>
  );
}

