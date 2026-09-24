// Hesap düğmesi + paneli (tema, sürüm, önbellek, Face ID, çıkış) — tüm ana sekmelerin başlığında.
import React, { useEffect, useState } from "react";
import { User, LogOut } from "lucide-react";
import { toast } from "./toast";
import { Sheet } from "./ui";
import { cache } from "./cache";
import { useSession } from "./session";
import { bioLabel, bioSaved, bioDelete } from "./biometric";

// Yüklü bundle hash'i (main.<hash>.js) — "eski sürüm mü?" kontrolü için
function appVersion() {
  try {
    const src = Array.from(document.scripts).map((x) => x.src).find((u) => /\/main\.[a-z0-9]+\.js/.test(u));
    const m = src && /main\.([a-z0-9]+)\.js/.exec(src);
    return m ? m[1] : "geliştirme";
  } catch { return "?"; }
}

export function AccountButton() {
  const s = useSession();
  const [open, setOpen] = useState(false);
  const [bio, setBio] = useState(null); // hesap panelinde biyometri durumu: { label, saved }
  useEffect(() => {
    if (!open) return;
    (async () => { const label = await bioLabel(); setBio(label ? { label, saved: await bioSaved() } : null); })();
  }, [open]);
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Hesap" className="m-press flex h-9 w-9 items-center justify-center rounded-full bg-slate-200/70">
        <User className="h-5 w-5" style={{ color: "var(--m-ink-2)" }} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Hesap">
        <div className="rounded-2xl bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "var(--m-grad)" }}>
              <User className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="text-[15px] font-bold">{s?.username || "Kullanıcı"}</div>
              <div className="text-[12px]" style={{ color: "var(--m-ink-2)" }}>MSZ Karavan</div>
            </div>
          </div>
        </div>
        <div className="mt-3 rounded-2xl bg-white p-3">
          <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-slate-400">Tema</div>
          <div className="m-seg flex">
            {[["system", "Sistem"], ["light", "Açık"], ["dark", "Koyu"]].map(([key, label]) => (
              <button key={key} data-on={(s?.theme || "system") === key} onClick={() => s?.setTheme?.(key)}
                className="m-seg-item flex-1 py-1.5 text-[13px] font-semibold"
                style={{ color: (s?.theme || "system") === key ? "var(--m-primary)" : "var(--m-ink-2)" }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 rounded-2xl bg-white p-3">
          <div className="flex items-center justify-between text-[13px]">
            <span style={{ color: "var(--m-ink-2)" }}>Sürüm</span>
            <span className="m-tnum font-semibold">{appVersion()}</span>
          </div>
          <button
            onClick={() => {
              if (!window.confirm("Yerel önbellek (liste, sepet, taslaklar) silinip uygulama yenilensin mi? Oturum açık kalır.")) return;
              cache.clearAll(["theme", "theme_light_default", "was_authed"]);
              window.location.reload();
            }}
            className="m-press mt-2 w-full rounded-xl bg-slate-100 py-2.5 text-[14px] font-semibold"
            style={{ color: "var(--m-ink-2)" }}
          >
            Önbelleği temizle ve yenile
          </button>
        </div>
        {bio?.saved && (
          <button
            onClick={async () => {
              if (!window.confirm(`${bio.label} ile giriş kapatılsın mı? Kayıtlı şifre bu cihazdan silinir.`)) return;
              await bioDelete(); cache.set("bio_declined", true); setBio({ ...bio, saved: false });
              toast.success(`${bio.label} kapatıldı`);
            }}
            className="m-press mt-3 w-full rounded-2xl bg-white py-3 text-[14px] font-semibold"
            style={{ color: "var(--m-ink-2)" }}
          >
            {bio.label} ile girişi kapat
          </button>
        )}
        <button onClick={() => { if (window.confirm("Çıkış yapmak istediğinize emin misiniz?")) { setOpen(false); s?.logout?.(); } }} className="m-press mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-[15px] font-bold text-rose-500">
          <LogOut className="h-5 w-5" /> Çıkış Yap
        </button>
      </Sheet>
    </>
  );
}
