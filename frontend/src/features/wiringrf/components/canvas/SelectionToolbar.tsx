import { Panel } from "@xyflow/react";
import {
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
} from "lucide-react";
import { useProjectStore, type AlignMode } from "@/features/wiringrf/store/useProjectStore";

function AlignBtn({ mode, title, onAlign, children }: { mode: AlignMode; title: string; onAlign: (m: AlignMode) => void; children: React.ReactNode }) {
  return (
    <button onClick={() => onAlign(mode)} title={title}
      className="grid h-7 w-7 place-items-center rounded text-slate-600 hover:bg-slate-100">
      {children}
    </button>
  );
}

export function SelectionToolbar() {
  const count = useProjectStore((s) => s.nodes.filter((n) => n.selected).length);
  const alignNodes = useProjectStore((s) => s.alignNodes);
  const distributeNodes = useProjectStore((s) => s.distributeNodes);

  if (count < 2) return null;

  return (
    <Panel position="top-center">
      <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-1.5 py-1 shadow-md">
        <span className="px-1.5 text-[11px] font-medium text-slate-400">{count} seçili</span>
        <AlignBtn mode="left" title="Sola hizala" onAlign={alignNodes}><AlignStartVertical size={15} /></AlignBtn>
        <AlignBtn mode="hcenter" title="Yatay ortala" onAlign={alignNodes}><AlignCenterVertical size={15} /></AlignBtn>
        <AlignBtn mode="right" title="Sağa hizala" onAlign={alignNodes}><AlignEndVertical size={15} /></AlignBtn>
        <div className="mx-0.5 h-5 w-px bg-slate-200" />
        <AlignBtn mode="top" title="Üste hizala" onAlign={alignNodes}><AlignStartHorizontal size={15} /></AlignBtn>
        <AlignBtn mode="vcenter" title="Dikey ortala" onAlign={alignNodes}><AlignCenterHorizontal size={15} /></AlignBtn>
        <AlignBtn mode="bottom" title="Alta hizala" onAlign={alignNodes}><AlignEndHorizontal size={15} /></AlignBtn>
        <div className="mx-0.5 h-5 w-px bg-slate-200" />
        <button onClick={() => distributeNodes("h")} title="Yatay dağıt" disabled={count < 3}
          className="grid h-7 w-7 place-items-center rounded text-slate-600 hover:bg-slate-100 disabled:opacity-30">
          <AlignHorizontalDistributeCenter size={15} />
        </button>
        <button onClick={() => distributeNodes("v")} title="Dikey dağıt" disabled={count < 3}
          className="grid h-7 w-7 place-items-center rounded text-slate-600 hover:bg-slate-100 disabled:opacity-30">
          <AlignVerticalDistributeCenter size={15} />
        </button>
      </div>
    </Panel>
  );
}
