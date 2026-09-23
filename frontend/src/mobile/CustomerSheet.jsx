// Müşteri özeti: aynı adlı teklif / servis / sözleşme kayıtları (önbellekten, ağ isteği yok).
// Kayda dokununca ilgili sekmeye tek seferlik deep-link anahtarıyla geçer.
import React, { useMemo } from "react";
import { FileText, Wrench, ScrollText, Phone } from "lucide-react";
import { Sheet, Card, Pill, money, fmtDate } from "./ui";
import { cache, phoneForCustomer } from "./cache";
import { serviceNet, collectedTRY } from "./screens/Services";

const norm = (v) => String(v || "").trim().toLocaleLowerCase("tr");
const contractName = (c) => c?.customer_name || c?.data?.customer_name || "";

export function customerRecords(name) {
  const n = norm(name);
  if (!n) return { quotes: [], services: [], contracts: [] };
  const byDate = (k) => (a, b) => String(b[k] || "").localeCompare(String(a[k] || ""));
  const quotes = (cache.get("quotes") || cache.get("dashboard")?.quotes || []).filter((q) => norm(q.customer_name) === n).sort(byDate("created_at"));
  const services = (cache.get("services") || cache.get("dashboard")?.services || []).filter((x) => norm(x.customer_name) === n).sort(byDate("arrival_date"));
  const contracts = (cache.get("contracts") || cache.get("dashboard")?.contracts || []).filter((c) => norm(contractName(c)) === n).sort(byDate("created_at"));
  return { quotes, services, contracts };
}

function Section({ icon: Icon, title, children, count }) {
  if (!count) return null;
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[12px] font-bold uppercase tracking-wide text-slate-400">
        <Icon className="h-3.5 w-3.5" /> {title} ({count})
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export default function CustomerSheet({ name, open, onClose, go }) {
  const rec = useMemo(() => (open ? customerRecords(name) : { quotes: [], services: [], contracts: [] }), [open, name]);
  const phone = useMemo(() => (open ? phoneForCustomer(name) : ""), [open, name]);
  const svcTotal = rec.services.reduce((a, x) => a + serviceNet(x), 0);
  const svcOpen = rec.services.reduce((a, x) => { const l = serviceNet(x) - collectedTRY(x); return a + (l > 0.5 ? l : 0); }, 0);
  const jump = (tab, key, val) => { cache.set(key, val); onClose(); go?.(tab); };
  const empty = !rec.quotes.length && !rec.services.length && !rec.contracts.length;

  return (
    <Sheet open={open} onClose={onClose} title="Müşteri" full>
      <div className="rounded-2xl bg-white p-4">
        <div className="text-[19px] font-bold">{name || "—"}</div>
        {phone && (
          <a href={`tel:${phone}`} className="mt-1 inline-flex items-center gap-1.5 text-[14px] font-semibold" style={{ color: "var(--m-primary)" }}>
            <Phone className="h-4 w-4" /> {phone}
          </a>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div><div className="m-tnum text-[18px] font-extrabold">{rec.quotes.length}</div><div className="text-[11px] text-slate-400">teklif</div></div>
          <div><div className="m-tnum text-[18px] font-extrabold">{rec.services.length}</div><div className="text-[11px] text-slate-400">servis</div></div>
          <div><div className="m-tnum text-[18px] font-extrabold">{rec.contracts.length}</div><div className="text-[11px] text-slate-400">sözleşme</div></div>
        </div>
        {rec.services.length > 0 && (
          <div className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-[13px]">
            <div className="flex justify-between"><span style={{ color: "var(--m-ink-2)" }}>Servis toplamı</span><span className="m-tnum font-semibold">₺{money(svcTotal)}</span></div>
            {svcOpen > 0 && <div className="flex justify-between"><span style={{ color: "var(--m-ink-2)" }}>Açık bakiye</span><span className="m-tnum font-bold" style={{ color: "#e11d48" }}>₺{money(svcOpen)}</span></div>}
          </div>
        )}
      </div>

      {empty && <div className="mt-6 text-center text-[13px] text-slate-400">Bu adla kayıt bulunamadı (listeler bir kez açılınca önbelleğe alınır)</div>}

      <Section icon={Wrench} title="Servisler" count={rec.services.length}>
        {rec.services.map((x) => (
          <Card key={x.id} onClick={() => jump("service", "svc_open", x.id)} className="flex items-center justify-between gap-2 p-3">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold">{[x.vehicle_brand, x.vehicle_model].filter(Boolean).join(" ") || x.plate || "Servis"}</div>
              <div className="text-[12px] text-slate-400">{fmtDate(x.arrival_date || x.created_at)}{x.plate ? ` · ${x.plate}` : ""}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="m-tnum text-[14px] font-bold" style={{ color: "var(--m-primary)" }}>₺{money(serviceNet(x))}</div>
              {serviceNet(x) - collectedTRY(x) > 0.5 && <Pill color="red">Kalan ₺{money(serviceNet(x) - collectedTRY(x))}</Pill>}
            </div>
          </Card>
        ))}
      </Section>

      <Section icon={FileText} title="Teklifler" count={rec.quotes.length}>
        {rec.quotes.map((q) => (
          <Card key={q.id} onClick={() => jump("quotes", "quote_open", q.id)} className="flex items-center justify-between gap-2 p-3">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold">{q.name || "Teklif"}</div>
              <div className="text-[12px] text-slate-400">{fmtDate(q.created_at)} · {(q.products || []).length} kalem</div>
            </div>
            <span className="m-tnum shrink-0 text-[14px] font-bold" style={{ color: "var(--m-primary)" }}>₺{money(q.total_net_price || 0)}</span>
          </Card>
        ))}
      </Section>

      <Section icon={ScrollText} title="Sözleşmeler" count={rec.contracts.length}>
        {rec.contracts.map((c) => (
          <Card key={c.id} onClick={() => jump("contracts", "contract_open", c.id)} className="flex items-center justify-between gap-2 p-3">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold">{c.title || "Sözleşme"}</div>
              <div className="text-[12px] text-slate-400">{fmtDate(c.created_at)}</div>
            </div>
            <Pill color={c.stage === "agreed" ? "green" : "amber"}>{c.stage === "agreed" ? "Anlaşıldı" : "Teklif"}</Pill>
          </Card>
        ))}
      </Section>
    </Sheet>
  );
}
