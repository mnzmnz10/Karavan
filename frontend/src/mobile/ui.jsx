// Mobil UI primitifleri — iOS-native his (büyük başlık, kart, sheet, arama, tab bar).
import React, { useEffect, useState } from "react";
import { ChevronLeft, Search, X } from "lucide-react";

export const money = (n) =>
  (Number(n) || 0).toLocaleString("tr-TR", { maximumFractionDigits: 0 });

// Sabit büyük-başlık header (opsiyonel geri butonu + sağ aksiyon)
export function Header({ title, subtitle, onBack, right, large = true }) {
  return (
    <div className="m-frost m-safe-top sticky top-0 z-20 border-b border-black/5">
      <div className="flex items-center gap-2 px-4" style={{ height: 48 }}>
        {onBack && (
          <button onClick={onBack} className="m-press -ml-2 flex h-9 items-center gap-0.5 rounded-full pr-2 pl-1 text-[17px] font-medium" style={{ color: "var(--m-accent)" }}>
            <ChevronLeft className="h-6 w-6" strokeWidth={2.4} /> Geri
          </button>
        )}
        {!large && <div className="flex-1 text-center text-[17px] font-semibold">{title}</div>}
        <div className="ml-auto flex items-center gap-1">{right}</div>
      </div>
      {large && (
        <div className="px-4 pb-2 pt-0.5">
          <h1 className="m-largetitle">{title}</h1>
          {subtitle && <p className="mt-0.5 text-[13px]" style={{ color: "var(--m-ink-2)" }}>{subtitle}</p>}
        </div>
      )}
    </div>
  );
}

// iOS arama alanı
export function SearchBar({ value, onChange, placeholder = "Ara" }) {
  return (
    <div className="px-4 pb-2 pt-1">
      <div className="flex items-center gap-2 rounded-xl px-3" style={{ background: "#e9e9ee", height: 36 }}>
        <Search className="h-4 w-4 shrink-0" style={{ color: "var(--m-ink-2)" }} />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-[16px] placeholder:text-slate-400"
          style={{ color: "var(--m-ink)" }}
        />
        {value && (
          <button onClick={() => onChange("")} className="m-press shrink-0">
            <X className="h-4 w-4" style={{ color: "var(--m-ink-2)" }} />
          </button>
        )}
      </div>
    </div>
  );
}

// Kart (basılabilir)
export function Card({ children, onClick, className = "" }) {
  return (
    <div
      onClick={onClick}
      className={`m-press rounded-2xl bg-white ${onClick ? "cursor-pointer" : ""} ${className}`}
      style={{ boxShadow: "0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.05)" }}
    >
      {children}
    </div>
  );
}

// Bölüm başlığı (gri, uppercase)
export function SectionLabel({ children }) {
  return (
    <div className="px-5 pb-1.5 pt-4 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--m-ink-2)" }}>
      {children}
    </div>
  );
}

// Boş durum
export function EmptyState({ icon: Icon, title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-20 text-center">
      {Icon && <Icon className="mb-3 h-12 w-12" style={{ color: "#c4ccd6" }} strokeWidth={1.5} />}
      <div className="text-[16px] font-semibold" style={{ color: "var(--m-ink)" }}>{title}</div>
      {hint && <div className="mt-1 text-[13px]" style={{ color: "var(--m-ink-2)" }}>{hint}</div>}
    </div>
  );
}

// Skeleton liste
export function SkeletonList({ rows = 6 }) {
  return (
    <div className="space-y-2 px-4 pt-1">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-white p-3">
          <div className="flex items-center gap-3">
            <div className="m-skel h-12 w-12 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="m-skel h-3.5 w-2/3" />
              <div className="m-skel h-3 w-1/3" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Alttan açılan sheet (detay/form)
export function Sheet({ open, onClose, title, children, full = false }) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);
  if (!mounted && !open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="m-backdrop-enter absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={`m-sheet-enter relative w-full max-w-[560px] rounded-t-3xl bg-[var(--m-bg)] ${full ? "h-[92dvh]" : "max-h-[88dvh]"} flex flex-col`}
        onAnimationEnd={() => { if (!open) setMounted(false); }}
      >
        <div className="flex items-center justify-center pt-2.5">
          <div className="h-1.5 w-10 rounded-full bg-slate-300" />
        </div>
        <div className="flex items-center px-4 py-2">
          <div className="text-[17px] font-bold">{title}</div>
          <button onClick={onClose} className="m-press ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-slate-200/70">
            <X className="h-4 w-4" style={{ color: "var(--m-ink-2)" }} />
          </button>
        </div>
        <div className="m-scroll m-safe-bottom flex-1 px-4 pb-4">{children}</div>
      </div>
    </div>
  );
}

// Küçük etiket/rozet
export function Pill({ children, color = "slate" }) {
  const map = {
    slate: "bg-slate-100 text-slate-600",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
    red: "bg-rose-50 text-rose-700",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${map[color] || map.slate}`}>{children}</span>;
}
