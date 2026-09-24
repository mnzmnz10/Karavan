import React, { useEffect, useState } from "react";
import { startOutbox } from "./outbox";
import { startTextSize } from "./textsize";
import { Toaster } from "sonner";
import { Wrench, Package, FileText, ScrollText, Home, Loader2 } from "lucide-react";
import "@fontsource/montserrat/latin-800.css"; // Özet selamı (MSZ logosuyla uyumlu)
import "@fontsource/montserrat/latin-ext-800.css"; // Türkçe harfler (ğ, ş, ı…)
import "./mobile.css";
import { auth } from "./api";
import Login from "./screens/Login";
import Dashboard from "./screens/Dashboard";
import Services from "./screens/Services";
import Products from "./screens/Products";
import Quotes from "./screens/Quotes";
import Contracts from "./screens/Contracts";
import { CartProvider, CartBar } from "./Cart";
import ErrorBoundary from "./ErrorBoundary";
import { SessionCtx } from "./session";
import { cache } from "./cache";
import { getThemePref, applyTheme, THEME_KEY } from "./theme";

const TABS = [
  { key: "dashboard", label: "Özet", icon: Home, Comp: Dashboard },
  { key: "products", label: "Ürünler", icon: Package, Comp: Products },
  { key: "quotes", label: "Teklifler", icon: FileText, Comp: Quotes },
  { key: "service", label: "Servis", icon: Wrench, Comp: Services },
  { key: "contracts", label: "Sözleşme", icon: ScrollText, Comp: Contracts },
];

function TabBar({ active, onChange }) {
  return (
    <div className="m-frost fixed inset-x-0 bottom-0 z-30 border-t border-black/5">
      <div className="mx-auto flex max-w-[560px] items-stretch" style={{ height: "var(--m-tabbar-h)" }}>
        {TABS.map((t) => {
          const on = active === t.key;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              className="m-press flex flex-1 flex-col items-center justify-center gap-0.5"
              style={{ color: on ? "var(--m-primary)" : "#8a94a0" }}
            >
              <span className="m-tab-pill" data-on={on}><Icon className="h-6 w-6" strokeWidth={on ? 2.4 : 2} /></span>
              <span className="text-[11px] font-semibold tracking-tight">{t.label}</span>
            </button>
          );
        })}
      </div>
      <div className="m-safe-bottom" />
    </div>
  );
}

export default function MobileApp() {
  const [authed, setAuthed] = useState(null); // null = kontrol ediliyor
  const [username, setUsername] = useState("");
  const [tab, setTab] = useState("dashboard");
  const [reloadKey, setReloadKey] = useState(0); // artınca aktif ekran remount olur (yenile)
  const [theme, setThemeState] = useState(getThemePref());

  // Tema uygula + kalıcı yap; 'system' iken OS değişimini dinle.
  useEffect(() => { applyTheme(theme); cache.set(THEME_KEY, theme); }, [theme, authed]);
  useEffect(() => {
    let mq;
    try {
      mq = window.matchMedia("(prefers-color-scheme: dark)");
      const on = () => { if (getThemePref() === "system") applyTheme("system"); };
      mq.addEventListener ? mq.addEventListener("change", on) : mq.addListener(on);
      return () => { mq.removeEventListener ? mq.removeEventListener("change", on) : mq.removeListener(on); };
    } catch {}
  }, []);
  const setTheme = (t) => setThemeState(t);

  // Aktif sekmeye tekrar dokununca yenile; farklı sekmeye geçince değiştir.
  const onTab = (key) => (key === tab ? setReloadKey((k) => k + 1) : setTab(key));

  // Native: uygulama öne gelince listeyi tazele.
  useEffect(() => {
    let sub;
    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        sub = await App.addListener("appStateChange", ({ isActive }) => { if (isActive) setReloadKey((k) => k + 1); });
      } catch {}
    })();
    return () => { try { sub?.remove?.(); } catch {} };
  }, []);

  // Çevrimdışı açılış: ağ hatasında (yanıt yok) son başarılı oturum hatırlanır → önbellekle çalışmaya devam.
  // Sunucu yanıtı (401 / authenticated:false) gelirse giriş ekranı. Çıkışta clearAll işareti de siler.
  const refreshAuth = () =>
    auth.check()
      .then((d) => {
        const ok = !!d?.authenticated;
        setAuthed(ok); setUsername(d?.username || "");
        cache.set("was_authed", ok ? { username: d?.username || "" } : null);
      })
      .catch((e) => {
        const prev = cache.get("was_authed");
        if (e?.response?.status === 0 && prev) { setAuthed(true); setUsername(prev.username || ""); }
        else setAuthed(false);
      });

  useEffect(() => { refreshAuth(); }, []);
  // iPhone Metin Boyutu (Dynamic Type) — giriş ekranı dahil tüm yazılara
  useEffect(() => { startTextSize(); }, []);
  // Çevrimdışı kuyruk: oturum açıkken bekleyen servis kayıtlarını gönder (bağlantı/öne gelme/30 sn)
  useEffect(() => { if (authed) startOutbox(); }, [authed]);

  const logout = async () => {
    try { await auth.logout(); } catch {}
    // Ortak cihazda iş verisi (müşteri, maliyet, sepet) kalmasın; tema tercihi korunur
    cache.clearAll([THEME_KEY, "last_user", "bio_declined"]);
    setAuthed(false);
    setTab("dashboard");
  };

  if (authed === null) {
    return (
      <div id="mobile-root" className="flex min-h-[100dvh] items-center justify-center" style={{ background: "#143a5c" }}>
        <Loader2 className="h-7 w-7 animate-spin text-white/80" />
      </div>
    );
  }

  if (!authed) {
    return (
      <div id="mobile-root">
        <Login onDone={() => { setAuthed(true); refreshAuth(); }} />
        <Toaster position="top-center" richColors />
      </div>
    );
  }

  const Active = TABS.find((t) => t.key === tab)?.Comp || Services;

  return (
    <SessionCtx.Provider value={{ username, logout, theme, setTheme }}>
      <div id="mobile-root" className="fixed inset-0 flex flex-col">
        <CartProvider>
          <div className="flex-1 overflow-hidden">
            <ErrorBoundary key={`${tab}:${reloadKey}`}>
              <div className="m-tab-enter h-full"><Active go={onTab} /></div>
            </ErrorBoundary>
          </div>
          <CartBar />
          <TabBar active={tab} onChange={onTab} />
          <Toaster position="top-center" richColors />
        </CartProvider>
      </div>
    </SessionCtx.Provider>
  );
}
