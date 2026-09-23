import React, { useEffect, useMemo, useState } from "react";
import { Wrench, FileText, ScrollText, Clock, CheckCircle2, TrendingUp, Eye, EyeOff } from "lucide-react";
import http, { services as servicesApi, quotes as quotesApi } from "../api";
import { Header, SearchBar, Card, SkeletonList, RefreshScroll, OfflineBar, money, ago, todayISO, fmtDate } from "../ui";
import { useSession } from "../session";
import { cache } from "../cache";
import { serviceNet, collectedTRY } from "./Services";

const contractsApi = { list: () => http.get("/contracts").then((r) => r.data) };

const STATUS_LABEL = { received: "Geldi", in_progress: "İşlemde", delivered: "Teslim" };
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
  const [gq, setGq] = useState(""); // genel arama
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
    const today = todayISO();
    const overdue = services.filter((x) => x.status !== "delivered" && x.delivery_date && String(x.delivery_date).slice(0, 10) < today).length;
    const dueToday = services.filter((x) => x.status !== "delivered" && x.delivery_date && String(x.delivery_date).slice(0, 10) === today).length;
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
      const net = serviceNet(x);
      svcNet += net;
      svcCost += items.length ? items.reduce((a, it) => a + costLine(it), 0) : net; // kalemsiz eski kayıt → kâr bilinmiyor (0)
    });
    // Açık bakiye: net − tahsilat > 0 olan servisler (Services.jsx ile aynı kural)
    let openBal = 0, openCnt = 0;
    services.forEach((x) => { const left = serviceNet(x) - collectedTRY(x); if (serviceNet(x) > 0 && left > 0.5) { openBal += left; openCnt++; } });
    const agreed = contracts.filter((c) => c.stage === "agreed").length;
    // Son 6 ay teslim cirosu (servis net) — mini çubuk grafik
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { y: d.getFullYear(), m: d.getMonth(), label: d.toLocaleDateString("tr-TR", { month: "short" }), total: 0 };
    });
    services.forEach((x) => {
      if (x.status !== "delivered") return;
      const d = new Date(x.delivery_date || x.arrival_date || x.created_at);
      if (isNaN(d)) return;
      const b = months.find((mm) => mm.y === d.getFullYear() && mm.m === d.getMonth());
      if (b) b.total += serviceNet(x);
    });
    const recentQ = [...quotes].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))).slice(0, 3);
    const recent = [...services].sort((a, b) => String(b.arrival_date || b.created_at || "").localeCompare(String(a.arrival_date || a.created_at || ""))).slice(0, 4);
    return { active, delivered, overdue, dueToday, sTotal: services.length, qTotal: quotes.length, quotesMonth, quotesMonthSum, cTotal: contracts.length, agreed, recent, recentQ, months, svcDone: doneMonth.length, svcNet, svcProfit: svcNet - svcCost, openBal, openCnt };
  }, [data]);

  // Genel arama: teklif / servis / sözleşme (müşteri, başlık, plaka, telefon rakamı) — en fazla 5'er sonuç
  const results = useMemo(() => {
    const s = gq.trim().toLocaleLowerCase("tr");
    if (s.length < 2) return null;
    const digits = /^[\d\s+()-]+$/.test(s) ? s.replace(/\D/g, "").replace(/^0/, "") : "";
    const has = (...vals) => vals.some((v) => String(v || "").toLocaleLowerCase("tr").includes(s));
    const phoneHit = (p) => digits.length >= 4 && String(p || "").replace(/\D/g, "").includes(digits);
    const services = (data?.services || []).filter((x) => has(x.customer_name, x.plate, x.vehicle_brand, x.vehicle_model, x.order_no) || phoneHit(x.phone)).slice(0, 5);
    const quotes = (data?.quotes || []).filter((q) => has(q.name, q.customer_name)).slice(0, 5);
    const contracts = (data?.contracts || []).filter((c) => has(c.title, c.customer_name, c.data?.customer_name) || phoneHit(c.customer_phone || c.data?.customer_phone)).slice(0, 5);
    return { services, quotes, contracts };
  }, [gq, data]);
  const jump = (tab, key, val) => { cache.set(key, val); go?.(tab); };

  const hour = new Date().getHours();
  const greet = hour < 6 ? "İyi geceler" : hour < 12 ? "Günaydın" : hour < 18 ? "İyi günler" : "İyi akşamlar";

  return (
    <div className="flex h-full flex-col">
      <Header title="Özet" subtitle={`${greet}${s?.username ? ", " + s.username : ""}${data?.at ? " · güncellendi " + ago(data.at) : ""}`} />
      <SearchBar value={gq} onChange={setGq} placeholder="Her yerde ara: müşteri, plaka, teklif…" />
      <OfflineBar show={offline} cacheKey="dashboard" />
      <RefreshScroll onRefresh={load} className="flex-1 pb-[calc(var(--m-tabbar-h)+env(safe-area-inset-bottom)+8px)]">
        {results ? (
          <div className="space-y-3 px-4 pt-1">
            {[["Servisler", results.services, (x) => [x.customer_name || "İsimsiz", [x.plate, fmtDate(x.arrival_date)].filter(Boolean).join(" · ")], (x) => jump("service", "svc_open", x.id)],
              ["Teklifler", results.quotes, (q) => [q.name || "Teklif", `${q.customer_name || "—"} · ₺${money(q.total_net_price || 0)}`], (q) => jump("quotes", "quote_open", q.id)],
              ["Sözleşmeler", results.contracts, (c) => [c.customer_name || c.data?.customer_name || c.title || "Sözleşme", c.title || ""], (c) => jump("contracts", "contract_open", c.id)]]
              .filter(([, list]) => list.length)
              .map(([title, list, fmt, onOpen]) => (
                <div key={title}>
                  <div className="px-1 pb-1.5 text-[12px] font-bold uppercase tracking-wide text-slate-400">{title}</div>
                  <div className="space-y-2">
                    {list.map((x) => { const [a, b] = fmt(x); return (
                      <Card key={x.id} onClick={() => onOpen(x)} className="p-3">
                        <div className="truncate text-[14px] font-semibold">{a}</div>
                        {b && <div className="truncate text-[12px] text-slate-400">{b}</div>}
                      </Card>
                    ); })}
                  </div>
                </div>
              ))}
            {!results.services.length && !results.quotes.length && !results.contracts.length && (
              <div className="py-10 text-center text-[13px] text-slate-400">Sonuç yok</div>
            )}
          </div>
        ) : loading ? (
          <SkeletonList />
        ) : (
          <div className="px-4 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <Stat icon={Wrench} tint={{ bg: "#fef0e8", fg: "#e56a1f" }} value={stats.active} label="Aktif servis" sub={[stats.overdue > 0 ? `⚠ ${stats.overdue} gecikmiş` : null, stats.dueToday > 0 ? `${stats.dueToday} bugün teslim` : null].filter(Boolean).join(" · ") || `${stats.sTotal} kayıt · ${stats.delivered} teslim`} onClick={() => { if (stats.overdue > 0) cache.set("svc_filter", "overdue"); else if (stats.dueToday > 0) cache.set("svc_filter", "today"); go?.("service"); }} />
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

            {stats.months.some((mm) => mm.total > 0) && (() => {
              const max = Math.max(...stats.months.map((mm) => mm.total), 1);
              return (
                <Card className="mt-2 p-3.5">
                  <div className="text-[12.5px] font-semibold" style={{ color: "var(--m-ink-2)" }}>Son 6 ay teslim cirosu</div>
                  <div className="mt-3 flex h-24 items-end gap-2">
                    {stats.months.map((mm) => (
                      <div key={`${mm.y}-${mm.m}`} className="flex flex-1 flex-col items-center gap-1">
                        <div className="m-tnum text-[9px] text-slate-400">{mm.total > 0 ? `${Math.round(mm.total / 1000)}b` : ""}</div>
                        <div className="w-full rounded-t-md" style={{ height: `${Math.max(2, (mm.total / max) * 64)}px`, background: "var(--m-primary)", opacity: mm.total > 0 ? 0.85 : 0.15 }} />
                        <div className="text-[10px] text-slate-400">{mm.label}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })()}

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
            {stats.recentQ.length > 0 && (
              <>
                <div className="px-1 pb-1.5 pt-4 text-[12px] font-bold uppercase tracking-wide text-slate-400">Son Teklifler</div>
                <div className="space-y-2">
                  {stats.recentQ.map((q) => (
                    <Card key={q.id} onClick={() => { cache.set("quote_open", q.id); go?.("quotes"); }} className="flex items-center gap-3 p-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "#fff5e6" }}>
                        <FileText className="h-5 w-5" style={{ color: "#d9820a" }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-semibold">{q.name || "Teklif"}</div>
                        <div className="text-[12px] text-slate-400">{q.customer_name || "—"} · {fmtDate(q.created_at)}</div>
                      </div>
                      <span className="m-tnum shrink-0 text-[13px] font-extrabold" style={{ color: "var(--m-primary)" }}>₺{money(q.total_net_price || 0)}</span>
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
