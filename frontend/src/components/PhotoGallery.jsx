import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

// Tam ekran fotoğraf görüntüleyici: ok düğmeleri, klavye (←/→/Esc), kaydırma (dokunmatik), "3 / 7" sayacı.
// photos: string[] (data: veya url); index: açık foto (null = kapalı); onIndex(i|null)
export default function PhotoGallery({ photos = [], index, onIndex }) {
  const open = index != null && photos.length > 0;
  const n = photos.length;
  const go = (d) => onIndex(((index + d) % n + n) % n);
  const touchX = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onIndex(null);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!open) return null;
  const btn = "absolute top-1/2 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow-lg hover:bg-white";
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-4" onClick={() => onIndex(null)}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      }}>
      <img src={photos[index]} alt={`Fotoğraf ${index + 1}`} onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
      {n > 1 && (
        <>
          <button type="button" aria-label="Önceki fotoğraf" onClick={(e) => { e.stopPropagation(); go(-1); }} className={`${btn} left-4`}><ChevronLeft className="h-7 w-7" /></button>
          <button type="button" aria-label="Sonraki fotoğraf" onClick={(e) => { e.stopPropagation(); go(1); }} className={`${btn} right-4`}><ChevronRight className="h-7 w-7" /></button>
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-sm font-semibold tabular-nums text-white">{index + 1} / {n}</div>
        </>
      )}
      <button type="button" aria-label="Kapat" onClick={(e) => { e.stopPropagation(); onIndex(null); }}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-800 hover:bg-white"><X className="h-5 w-5" /></button>
    </div>,
    document.body
  );
}
