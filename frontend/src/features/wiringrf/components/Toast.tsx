import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

interface Toast {
  id: number;
  message: string;
  kind: "warn" | "error";
}

const EVENTS: { name: string; kind: Toast["kind"] }[] = [
  { name: "kablo:connect-rejected", kind: "warn" },
  { name: "kablo:save-error", kind: "error" },
  { name: "kablo:load-error", kind: "error" },
  { name: "kablo:info", kind: "warn" },
];

export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let counter = 0;
    const handlers = EVENTS.map(({ name, kind }) => {
      const h = (e: Event) => {
        const msg = (e as CustomEvent).detail;
        const id = ++counter;
        setToasts((t) => [...t, { id, message: String(msg ?? "Ä°ÅŸlem reddedildi"), kind }]);
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
      };
      window.addEventListener(name, h);
      return { name, h };
    });
    return () => handlers.forEach(({ name, h }) => window.removeEventListener(name, h));
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg ${
            t.kind === "error"
              ? "border-red-300 bg-red-50 text-red-700"
              : "border-amber-300 bg-amber-50 text-amber-800"
          }`}
        >
          <AlertTriangle size={15} className="shrink-0" />
          <span>{t.message}</span>
          <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
            <X size={14} className="opacity-60 hover:opacity-100" />
          </button>
        </div>
      ))}
    </div>
  );
}
