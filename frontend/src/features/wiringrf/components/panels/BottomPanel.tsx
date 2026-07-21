import { useMemo, useState } from "react";
import { AlertTriangle, AlertCircle, Info, Cable, Package } from "lucide-react";
import { useProjectStore } from "@/features/wiringrf/store/useProjectStore";
import { validate } from "@/features/wiringrf/lib/validation";
import { buildBom, buildCableList } from "@/features/wiringrf/lib/bom";

type Tab = "warnings" | "cables" | "bom";

export function BottomPanel() {
  const [tab, setTab] = useState<Tab>("warnings");
  const nodes = useProjectStore((s) => s.nodes);
  const edges = useProjectStore((s) => s.edges);

  const warnings = useMemo(() => validate(nodes, edges), [nodes, edges]);
  const cables = useMemo(() => buildCableList(nodes, edges), [nodes, edges]);
  const bom = useMemo(() => buildBom(nodes), [nodes]);

  const errs = warnings.filter((w) => w.severity === "error").length;
  const warns = warnings.filter((w) => w.severity === "warning").length;

  const tabCls = (t: Tab) =>
    `inline-flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-xs font-medium ${
      tab === t ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"
    }`;

  return (
    <div className="flex h-48 shrink-0 flex-col border-t border-slate-200 bg-white">
      <div className="flex items-center gap-1 border-b border-slate-100 px-2">
        <button className={tabCls("warnings")} onClick={() => setTab("warnings")}>
          <AlertTriangle size={13} /> UyarÄ±lar
          {errs > 0 && <span className="rounded-full bg-red-100 px-1.5 text-[10px] text-red-700">{errs}</span>}
          {warns > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-700">{warns}</span>}
        </button>
        <button className={tabCls("cables")} onClick={() => setTab("cables")}>
          <Cable size={13} /> Kablo Listesi ({cables.length})
        </button>
        <button className={tabCls("bom")} onClick={() => setTab("bom")}>
          <Package size={13} /> Malzeme ({bom.reduce((a, b) => a + b.qty, 0)})
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 text-xs">
        {tab === "warnings" && (
          <ul className="space-y-1">
            {warnings.map((w) => (
              <li key={w.id} className="flex items-start gap-2 rounded px-2 py-1 hover:bg-slate-50">
                {w.severity === "error" ? <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-600" />
                  : w.severity === "warning" ? <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
                  : <Info size={14} className="mt-0.5 shrink-0 text-slate-400" />}
                <span className="text-slate-700">{w.message}</span>
              </li>
            ))}
          </ul>
        )}

        {tab === "cables" && (
          <table className="w-full text-left">
            <thead className="text-[10px] uppercase text-slate-400">
              <tr><th className="px-2 py-1">Tip</th><th>Kesit</th><th>Sigorta</th><th>Kaynak</th><th>Hedef</th><th>Uzunluk</th></tr>
            </thead>
            <tbody>
              {cables.map((c, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-2 py-1"><span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: c.color }} /> {c.type}</td>
                  <td>{c.size}</td><td>{c.fuse ?? "-"}</td><td>{c.from}</td><td>{c.to}</td><td>{c.length ? `${c.length} m` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "bom" && (
          <table className="w-full text-left">
            <thead className="text-[10px] uppercase text-slate-400">
              <tr><th className="px-2 py-1">ÃœrÃ¼n</th><th>Marka</th><th>Model</th><th>Adet</th></tr>
            </thead>
            <tbody>
              {bom.map((b, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-2 py-1 font-medium text-slate-700">{b.name}</td>
                  <td>{b.brand}</td><td>{b.model}</td><td>{b.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
