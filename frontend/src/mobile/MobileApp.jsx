import React, { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { Wrench, Package, FileText, ScrollText, Loader2 } from "lucide-react";
import "./mobile.css";
import { auth } from "./api";
import Login from "./screens/Login";
import Services from "./screens/Services";
import Products from "./screens/Products";
import Quotes from "./screens/Quotes";
import Contracts from "./screens/Contracts";
import { CartProvider, CartBar } from "./Cart";
import ErrorBoundary from "./ErrorBoundary";
import { SessionCtx } from "./session";

const TABS = [
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
              <Icon className="h-6 w-6" strokeWidth={on ? 2.5 : 2} />
              <span className="text-[10.5px] font-semibold tracking-tight">{t.label}</span>
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
  const [tab, setTab] = useState("products");

  const refreshAuth = () =>
    auth.check().then((d) => { setAuthed(!!d?.authenticated); setUsername(d?.username || ""); }).catch(() => setAuthed(false));

  useEffect(() => { refreshAuth(); }, []);

  const logout = async () => {
    try { await auth.logout(); } catch {}
    setAuthed(false);
    setTab("products");
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
        <Login onDone={() => setAuthed(true)} />
        <Toaster position="top-center" richColors />
      </div>
    );
  }

  const Active = TABS.find((t) => t.key === tab)?.Comp || Services;

  return (
    <SessionCtx.Provider value={{ username, logout }}>
      <div id="mobile-root" className="fixed inset-0 flex flex-col">
        <CartProvider>
          <div className="flex-1 overflow-hidden">
            <ErrorBoundary key={tab}>
              <Active />
            </ErrorBoundary>
          </div>
          <CartBar />
          <TabBar active={tab} onChange={setTab} />
          <Toaster position="top-center" richColors />
        </CartProvider>
      </div>
    </SessionCtx.Provider>
  );
}
