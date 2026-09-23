// Tahsilat raporu: seçilen ayda servis + sözleşme tahsilatları (TL), ödeme türü kırılımı, gün gün liste.
import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Wrench, ScrollText } from "lucide-react";
import { Sheet, Card, money, fmtDate } from "./ui";
import { cache } from "./cache";

// Açıklamadan ödeme türü (serbest metin: "Nakit", "EFT", "Kart", "KAPORA HAVALE"…)
export const payType = (desc) => {
  const d = String(desc || "").toLocaleLowerCase("tr");
  if (/nakit|elden/.test(d)) return "Nakit";
  if (/eft|havale|banka|iban|enpara|hesab/.test(d)) return "EFT/Havale";
  if (/kart|kredi|pos/.test(d)) return "Kart";
  return "Diğer";
};
const TYPES = ["Nakit", "EFT/Havale", "Kart", "Diğer"];
const COLORS = { Nakit: "#2e8b7a", "EFT/Havale": "#1e73be", Kart: "#d9820a", Diğer: "#94a3b8" };
const tl = (x) => (parseFloat(x.amount) || 0) * (x.currency && x.currency !== "TRY" ? (parseFloat(x.rate) || 1) : 1);

// Tüm tahsilat girişleri (servis: collections ya da eski avans; sözleşme: data.collections)
export function collectionEntries(services = [], contracts = []) {
  const out = [];
  services.forEach((s) => {
    const colls = Array.isArray(s.collections) && s.collections.length ? s.collections
      : parseFloat(s.advance_amount) > 0 ? [{ id: "avans", date: s.arrival_date, description: "Avans", amount: s.advance_amount, currency: "TRY" }] : [];
    colls.forEach((c, i) => out.push({ key: `s-${s.id}-${c.id || i}`, date: String(c.date || "").slice(0, 10), amount: tl(c), desc: c.description || "Tahsilat", type: payType(c.description), who: s.customer_name || "İsimsiz", kind: "service", id: s.id }));
  });
  contracts.forEach((k) => {
    (k.data?.collections || []).forEach((c, i) => out.push({ key: `k-${k.id}-${c.id || i}`, date: String(c.date || "").slice(0, 10), amount: tl(c), desc: c.description || "Tahsilat", type: payType(c.description), who: k.customer_name || k.data?.customer_name || k.title || "Sözleşme", kind: "contract", id: k.id }));
  });
  return out.filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.amount > 0);
}

export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export default function CollectionsReport({ open, onClose, services, contracts, go }) {
  const [month, setMonth] = useState(() => monthKey());
  const all = useMemo(() => (open ? collectionEntries(services, contracts) : []), [open, services, contracts]);
  const rows = all.filter((e) => e.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date));
  const total = rows.reduce((a, e) => a + e.amount, 0);
  const byType = TYPES.map((t) => [t, rows.filter((e) => e.type === t).reduce((a, e) => a + e.amount, 0)]).filter(([, v]) => v > 0);
  const days = [];
  rows.forEach((e) => { const d = days[days.length - 1]; if (d && d.date === e.date) d.items.push(e); else days.push({ date: e.date, items: [e] }); });
  const [y, m] = month.split("-").map(Number);
  const shift = (n) => setMonth(monthKey(new Date(y, m - 1 + n, 1)));
  const label = new Date(y, m - 1, 1).toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
  const isNow = month === monthKey();
  const jump = (e) => { cache.set(e.kind === "service" ? "svc_open" : "contract_open", e.id); onClose(); go?.(e.kind === "service" ? "service" : "contracts"); };

  return (
    <Sheet open={open} onClose={onClose} title="Tahsilat Raporu" full>
      <div className="flex items-center justify-between rounded-2xl bg-white px-2 py-2">
        <button onClick={() => shift(-1)} aria-label="Önceki ay" className="m-press flex h-9 w-9 items-center justify-center rounded-full"><ChevronLeft className="h-5 w-5" /></button>
        <div className="text-[15px] font-bold capitalize">{label}</div>
        <button onClick={() => !isNow && shift(1)} disabled={isNow} aria-label="Sonraki ay" className="m-press flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-30"><ChevronRight className="h-5 w-5" /></button>
      </div>

      <div className="mt-3 rounded-2xl bg-white p-4">
        <div className="text-[12px] font-bold uppercase tracking-wide text-slate-400">Tahsil edilen</div>
        <div className="m-tnum mt-1 text-[28px] font-extrabold" style={{ color: "var(--m-primary-2)" }}>₺{money(total)}</div>
        <div className="text-[12px] text-slate-400">{rows.length} tahsilat</div>
        {total > 0 && (
          <>
            <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
              {byType.map(([t, v]) => <div key={t} style={{ width: `${(v / total) * 100}%`, background: COLORS[t] }} />)}
            </div>
            <div className="mt-2 space-y-1">
              {byType.map(([t, v]) => (
                <div key={t} className="flex items-center justify-between text-[13px]">
                  <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[t] }} />{t}</span>
                  <span className="m-tnum font-semibold">₺{money(v)} <span className="text-slate-400">· %{Math.round((v / total) * 100)}</span></span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {days.length === 0 ? (
        <div className="mt-8 text-center text-[13px] text-slate-400">Bu ay tahsilat yok</div>
      ) : days.map((d) => (
        <div key={d.date} className="mt-3">
          <div className="flex justify-between px-1 pb-1.5 text-[12px] font-bold uppercase tracking-wide text-slate-400">
            <span>{fmtDate(d.date)}</span>
            <span className="m-tnum normal-case">₺{money(d.items.reduce((a, e) => a + e.amount, 0))}</span>
          </div>
          <div className="space-y-2">
            {d.items.map((e) => (
              <Card key={e.key} onClick={() => jump(e)} className="flex items-center gap-3 p-3">
                {e.kind === "service" ? <Wrench className="h-4 w-4 shrink-0 text-slate-400" /> : <ScrollText className="h-4 w-4 shrink-0 text-slate-400" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold">{e.who}</div>
                  <div className="truncate text-[12px] text-slate-400">{e.desc} · {e.type}</div>
                </div>
                <span className="m-tnum shrink-0 text-[14px] font-bold" style={{ color: "var(--m-primary-2)" }}>₺{money(e.amount)}</span>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </Sheet>
  );
}
