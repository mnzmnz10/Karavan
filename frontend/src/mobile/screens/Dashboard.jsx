import React, { useEffect, useMemo, useState } from "react";
import { Wrench, FileText, ScrollText, Clock, CheckCircle2, TrendingUp } from "lucide-react";
import http, { services as servicesApi, quotes as quotesApi } from "../api";
import { Header, Card, SkeletonList, RefreshScroll, OfflineBar, money } from "../ui";
import { useSession } from "../session";
import { cache } from "../cache";

const contractsApi = { list: () => http.get("/contracts").then((r) => r.data) };

const STATUS_LABEL = { received: "Geldi", in_progress: "İşlemde", delivered: "Teslim" };
const fmtDate = (s) => { if (!s) return ""; const d = new Date(s); return isNaN(d) ? "" : d.toLocaleDateString("tr-TR"); };
const sameMonth = (iso) => { if (!iso) return false; const d = new Date(iso); const n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth(); };

function Stat({ icon: Icon, tint, value, label, sub, onClick }) {
  return (
    <Card onClick={onClick} className="p-3.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: tint.bg }}>
        <Icon className="h-5 w-5" style={{ color: tint.fg }} />
      </div>
      <div className="mt-2 m-tnum text-[24px] font-extrabold leading-none" style={{ color: "var(--m-ink)" }}>{value}</div>
      <div className="mt-1 text-[12.5px] font-semibold" style={{ color: "var(--m-ink-2)" }}>{label}</div>
      {sub != null && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
    </Card>
  );
}

export default function Dashboard({ go }) {
  const s = useSession();
  const [data, setData] = useState(() => cache.get("dashboard") || null);
  const [loading, setLoading] = useState(() => !cache.get("dashboard"));
  const [offline, setOffline] = useState(false);

  const load = async () => {
    if (!cache.get("dashboard")) setLoading(true);
    try {
      const [services, quotes, contracts] = await Promise.all([
        servicesApi.list().catch(() => []),
        quotesApi.list().catch(() => []),
        contractsApi.list().catch(() => []),
      ]);
      const d = { services, quotes, contracts, at: Date.now() };
      setData(d); cache.set("dashboard", d); setOffline(false);
    } catch {
      const c = cache.get("dashboard");
      if (c) { setData(c); setOffline(true); }
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const services = data?.services || [], quotes = data?.quotes || [], contracts = data?.contracts || [];
    const active = services.filter((x) => (x.status || "received") !== "delivered").length;
    const delivered = services.filter((x) => x.status === "delivered").length;
    const today = new Date().toISOString().slice(0, 10);
    const overdue = services.filter((x) => x.status !== "delivered" && x.delivery_date && String(x.delivery_date).slice(0, 10) < today).length;
    const quotesMonth = quotes.filter((q) => sameMonth(q.created_at)).length;
    const quotesMonthSum = quotes.filter((q) => sameMonth(q.created_at)).reduce((a, q) => a + Number(q.total_net_price || q.total_discounted_price || 0), 0);
    const agreed = contracts.filter((c) => c.stage === "agreed").length;
    const recent = [...services].sort((a, b) => String(b.arrival_date || b.created_at || "").localeCompare(String(a.arrival_date || a.created_at || ""))).slice(0, 4);
    return { active, delivered, overdue, sTotal: services.length, qTotal: quotes.length, quotesMonth, quotesMonthSum, cTotal: contracts.length, agreed, recent };
  }, [data]);

  const hour = new Date().getHours();
  const greet = hour < 6 ? "İyi geceler" : hour < 12 ? "Günaydın" : hour < 18 ? "İyi günler" : "İyi akşamlar";

  return (
    <div className="flex h-full flex-col">
      <Header title="Özet" subtitle={`${greet}${s?.username ? ", " + s.username : ""}`} />
      <OfflineBar show={offline} />
      <RefreshScroll onRefresh={load} className="flex-1 pb-[calc(var(--m-tabbar-h)+env(safe-area-inset-bottom)+8px)]">
        {loading ? (
          <SkeletonList />
        ) : (
          <div className="px-4 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <Stat icon={Wrench} tint={{ bg: "#fef0e8", fg: "#e56a1f" }} value={stats.active} label="Aktif servis" sub={stats.overdue > 0 ? `⚠ ${stats.overdue} gecikmiş · ${stats.delivered} teslim` : `${stats.sTotal} kayıt · ${stats.delivered} teslim`} onClick={() => go?.("service")} />
              <Stat icon={FileText} tint={{ bg: "#fff5e6", fg: "#d9820a" }} value={stats.qTotal} label="Teklif" sub={`Bu ay ${stats.quotesMonth}`} onClick={() => go?.("quotes")} />
              <Stat icon={ScrollText} tint={{ bg: "#e8f0fb", fg: "#1e73be" }} value={stats.cTotal} label="Sözleşme" sub={`${stats.agreed} anlaşıldı`} onClick={() => go?.("contracts")} />
              <Stat icon={TrendingUp} tint={{ bg: "#e7f3ee", fg: "#2e8b7a" }} value={`₺${money(stats.quotesMonthSum)}`} label="Bu ay teklif" sub={`${stats.quotesMonth} teklif`} onClick={() => go?.("quotes")} />
            </div>

            {stats.recent.length > 0 && (
              <>
                <div className="px-1 pb-1.5 pt-4 text-[12px] font-bold uppercase tracking-wide text-slate-400">Son Servisler</div>
                <div className="space-y-2">
                  {stats.recent.map((x) => (
                    <Card key={x.id} onClick={() => go?.("service")} className="flex items-center gap-3 p-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: x.status === "delivered" ? "#e7f3ee" : "#fef0e8" }}>
                        {x.status === "delivered" ? <CheckCircle2 className="h-5 w-5" style={{ color: "#2e8b7a" }} /> : <Clock className="h-5 w-5" style={{ color: "#e56a1f" }} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-semibold">{x.customer_name || "İsimsiz"}</div>
                        <div className="text-[12px] text-slate-400">{STATUS_LABEL[x.status] || "Geldi"} · {fmtDate(x.arrival_date || x.created_at)}</div>
                      </div>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </RefreshScroll>
    </div>
  );
}
