import React, { useState } from "react";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { auth } from "../api";
import { cache } from "../cache";

export default function Login({ onDone }) {
  const [u, setU] = useState(() => cache.get("last_user") || ""); // şifre saklanmaz, sadece kullanıcı adı
  const [p, setP] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
    if (!u.trim() || !p) return;
    setBusy(true);
    try {
      await auth.login(u.trim(), p, true);
      cache.set("last_user", u.trim());
      onDone();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Giriş başarısız");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="m-safe-top flex min-h-[100dvh] flex-col items-center justify-center px-7"
      style={{ background: "linear-gradient(160deg,#0f2a44 0%,#143a5c 45%,#1f6157 100%)" }}
    >
      <div className="mb-8 flex flex-col items-center">
        <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-[26px] bg-white/95 shadow-2xl">
          <img src="/logo.png" alt="MSZ Karavan" className="h-16 w-16 object-contain" />
        </div>
        <div className="text-[22px] font-extrabold tracking-tight text-white">MSZ KARAVAN</div>
        <div className="mt-0.5 text-[13px] text-white/70">Yönetim Uygulaması</div>
      </div>

      <form onSubmit={submit} className="w-full max-w-[380px] space-y-3">
        <input
          value={u}
          onChange={(e) => setU(e.target.value)}
          placeholder="Kullanıcı adı"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          className="w-full rounded-2xl bg-white/95 px-4 py-3.5 text-[16px] text-slate-800 placeholder:text-slate-400"
        />
        <div className="relative">
          <input
            value={p}
            onChange={(e) => setP(e.target.value)}
            type={show ? "text" : "password"}
            placeholder="Şifre"
            autoComplete="current-password"
            autoFocus={!!u}
            className="w-full rounded-2xl bg-white/95 px-4 py-3.5 pr-12 text-[16px] text-slate-800 placeholder:text-slate-400"
          />
          <button type="button" onClick={() => setShow((v) => !v)} className="m-press absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-label={show ? "Şifreyi gizle" : "Şifreyi göster"}>
            {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="m-press flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-[16px] font-bold text-[#143a5c] disabled:opacity-60"
        >
          {busy && <Loader2 className="h-5 w-5 animate-spin" />}
          {busy ? "Giriş yapılıyor…" : "Giriş Yap"}
        </button>
      </form>

      <div className="m-safe-bottom mt-8 text-[12px] text-white/45">Oturum açık kalır</div>
    </div>
  );
}
