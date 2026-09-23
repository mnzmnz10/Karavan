import React, { useEffect, useMemo, useState } from "react";
import { Wrench, FileText, ScrollText, Clock, CheckCircle2, TrendingUp, Eye, EyeOff } from "lucide-react";
import http, { services as servicesApi, quotes as quotesApi } from "../api";
import { Header, Card, SkeletonList, RefreshScroll, OfflineBar, money } from "../ui";
import { useSession } from "../session";
import { cache } from "../cache";
import { serviceNet, collectedTRY } from "./Services";

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
  const [showProfit, setShowProfit] = useState(() => cache.get("svc_profit") === true);
  useEffect(() => { cache.set("svc_profit", showProfit); }, [showProfit]);

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
    // Bu ay teslim edilen servisler: net ciro (kalemler − iskonto) ve kâr (net − geliş; Services.jsx ile aynı kural)
    const prodCost = cache.get("prodcost") || {};
    const lineTRY = (it, field) => (parseFloat(it[field]) || 0) * (parseFloat(it.qty) || 1) * (it.currency && it.currency !== "TRY" ? (parseFloat(it.rate) || 1) : 1);
    const costLine = (it) => {
      if (it.unit_cost !== "" && it.unit_cost != null) return lineTRY(it, "unit_cost");
      const pc = prodCost[String(it.name || "").trim().toLocaleLowerCase("tr")];
      return pc != null ? pc * (parseFloat(it.qty) || 1) : lineTRY(it, "unit_price");
    };
    const doneMonth = services.filter((x) => x.status === "delivered" && sameMonth(x.delivery_date || x.arrival_date || x.created_at));
    let svcNet = 0, svcCost = 0;
    doneMonth.forEach((x) => {
      const items = x.items || [];
      const gross = items.length === 0 && x.cost != null ? Number(x.cost) || 0 : items.reduce((a, it) => a + lineTRY(it, "unit_price"), 0);
      const net = gross - Math.min(Math.max(0, parseFloat(x.discount_amount) || 0), gross);
      svcNet += net;
      svcCost += items.length ? items.reduce((a, it) => a + costLine(it), 0) : net; // kalemsiz eski kayıt → kâr bilinmiyor (0)
    });
    // Açık bakiye: net − tahsilat > 0 olan servisler (Services.jsx ile aynı kural)
    let openBal = 0, openCnt = 0;
    services.forEach((x) => { const left = serviceNet(x) - collectedTRY(x); if (serviceNet(x) > 0 && left > 0.5) { openBal += left; openCnt++; } });
    const agreed = contracts.filter((c) => c.stage === "agreed").length;
    const recent = [...services].sort((a, b) => String(b.arrival_date || b.created_at || "").localeCompare(String(a.arrival_date || a.created_at || ""))).slice(0, 4);
    return { active, delivered, overdue, sTotal: services.length, qTotal: quotes.length, quotesMonth, quotesMonthSum, cTotal: contracts.length, agreed, recent, svcDone: doneMonth.length, svcNet, svcProfit: svcNet - svcCost, openBal, openCnt };
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
              <Stat icon={Wrench} tint={{ bg: "#fef0e8", fg: "#e56a1f" }} value={stats.active} label="Aktif servis" sub={stats.overdue > 0 ? `⚠ ${stats.overdue} gecikmiş · ${stats.delivered} teslim` : `${stats.sTotal} kayıt · ${stats.delivered} teslim`} onClick={() => { if (stats.overdue > 0) cache.set("svc_filter", "overdue"); go?.("service"); }} />
              <Stat icon={FileText} tint={{ bg: "#fff5e6", fg: "#d9820a" }} value={stats.qTotal} label="Teklif" sub={`Bu ay ${stats.quotesMonth}`} onClick={() => go?.("quotes")} />
              <Stat icon={ScrollText} tint={{ bg: "#e8f0fb", fg: "#1e73be" }} value={stats.cTotal} label="Sözleşme" sub={`${stats.agreed} anlaşıldı`} onClick={() => go?.("contracts")} />
              <Stat icon={TrendingUp} tint={{ bg: "#e7f3ee", fg: "#2e8b7a" }} value={`₺${money(stats.quotesMonthSum)}`} label="Bu ay teklif" sub={`${stats.quotesMonth} teklif`} onClick={() => go?.("quotes")} />
            </div>

            <Card className="mt-2 p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[12.5px] font-semibold" style={{ color: "var(--m-ink-2)" }}>Bu ay teslim edilen servis</span>
                  <button onClick={() => setShowProfit((v) => !v)} aria-label="Göster/Gizle" className="m-press flex h-5 w-5 items-center justify-center" style={{ opacity: showProfit ? 0.9 : 0.28 }}>
                    {showProfit ? <EyeOff className="h-3.5 w-3.5" style={{ color: "var(--m-primary-2)" }} /> : <Eye className="h-3.5 w-3.5" style={{ color: "var(--m-ink-2)" }} />}
                  </button>
                </div>
                <span className="text-[11px] text-slate-400">{stats.svcDone} kayıt</span>
              </div>
              <div className="mt-1 m-tnum text-[22px] font-extrabold" style={{ color: "var(--m-ink)" }}>₺{money(stats.svcNet)}</div>
              {showProfit && (
                <div className="m-tnum mt-0.5 text-[13px] font-bold" style={{ color: stats.svcProfit >= 0 ? "var(--m-primary-2)" : "#e11d48" }}>
                  ₺{money(stats.svcProfit)}{stats.svcNet > 0 ? ` · %${Math.round((stats.svcProfit / stats.svcNet) * 100)}` : ""}
                </div>
              )}
            </Card>

            {stats.openCnt > 0 && (
              <Card onClick={() => { cache.set("svc_filter", "unpaid"); go?.("service"); }} className="mt-2 flex items-center justify-between p-3.5">
                <div>
                  <div className="text-[12.5px] font-semibold" style={{ color: "var(--m-ink-2)" }}>Tahsil edilmemiş</div>
                  <div className="text-[11px] text-slate-400">{stats.openCnt} servis kaydı</div>
                </div>
                <span className="m-tnum text-[20px] font-extrabold" style={{ color: "#e11d48" }}>₺{money(stats.openBal)}</span>
              </Card>
            )}

            {stats.recent.length > 0 && (
              <>
                <div className="px-1 pb-1.5 pt-4 text-[12px] font-bold uppercase tracking-wide text-slate-400">Son Servisler</div>
                <div className="space-y-2">
                  {stats.recent.map((x) => (
                    <Card key={x.id} onClick={() => { cache.set("svc_open", x.id); go?.("service"); }} className="flex items-center gap-3 p-3">
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
