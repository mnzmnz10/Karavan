import { useRef, useState } from "react";
import { Settings2, ImagePlus } from "lucide-react";
import { useProjectStore } from "@/features/wiringrf/store/useProjectStore";
import { CABLE_TYPE_LIST, CABLE_SIZES, CABLE_TYPES, layerForCableType } from "@/features/wiringrf/data/cables";
import { portColor } from "@/features/wiringrf/lib/ports";
import { readImageFile } from "@/features/wiringrf/lib/image";
import { PortEditorModal } from "./PortEditorModal";
import type { CableType } from "@/features/wiringrf/types";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}

const inputCls = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400";

export function PropertiesPanel() {
  const nodes = useProjectStore((s) => s.nodes);
  const edges = useProjectStore((s) => s.edges);
  const selNode = useProjectStore((s) => s.selectedNodeId);
  const selEdge = useProjectStore((s) => s.selectedEdgeId);
  const updateNodeData = useProjectStore((s) => s.updateNodeData);
  const updateEdgeData = useProjectStore((s) => s.updateEdgeData);
  const updatePort = useProjectStore((s) => s.updatePort);
  const setNodeImage = useProjectStore((s) => s.setNodeImage);
  const rotateNode = useProjectStore((s) => s.rotateNode);
  const deleteSelection = useProjectStore((s) => s.deleteSelection);
  const [editorOpen, setEditorOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const node = nodes.find((n) => n.id === selNode);
  const edge = edges.find((e) => e.id === selEdge);

  const onQuickUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !node) return;
    const res = await readImageFile(file);
    if (res.ok && res.dataUrl) setNodeImage(node.id, res.dataUrl);
    else window.dispatchEvent(new CustomEvent("kablo:save-error", { detail: res.error }));
    e.target.value = "";
  };

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Ã–zellikler</h2>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {!node && !edge && (
          <p className="text-sm text-slate-400">Bir Ã¼rÃ¼n veya kablo seÃ§.</p>
        )}

        {node && (
          <>
            <Field label="ÃœrÃ¼n AdÄ±">
              <input className={inputCls} value={node.data.label}
                onChange={(e) => updateNodeData(node.id, { label: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Marka">
                <input className={inputCls} value={node.data.brand}
                  onChange={(e) => updateNodeData(node.id, { brand: e.target.value })} />
              </Field>
              <Field label="Model">
                <input className={inputCls} value={node.data.model}
                  onChange={(e) => updateNodeData(node.id, { model: e.target.value })} />
              </Field>
            </div>
            <Field label="Voltaj">
              <input className={inputCls} value={node.data.voltage ?? ""}
                onChange={(e) => updateNodeData(node.id, { voltage: e.target.value })} />
            </Field>
            <Field label="Notlar">
              <textarea className={inputCls} rows={2} value={node.data.notes ?? ""}
                onChange={(e) => updateNodeData(node.id, { notes: e.target.value })} />
            </Field>
            <div>
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">GÃ¶rsel</span>
              <div className="flex items-center gap-2">
                {node.data.imageUrl ? (
                  <img src={node.data.imageUrl} alt="" className="h-12 w-12 rounded border border-slate-200 object-contain" />
                ) : (
                  <div className="grid h-12 w-12 place-items-center rounded border border-dashed border-slate-300 text-slate-300"><ImagePlus size={16} /></div>
                )}
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={onQuickUpload} />
                <button onClick={() => fileRef.current?.click()} className="rounded-md border border-slate-300 px-2 py-1.5 text-xs hover:bg-slate-50">YÃ¼kle</button>
                {node.data.imageUrl && <button onClick={() => setNodeImage(node.id, undefined)} className="rounded-md border border-slate-300 px-2 py-1.5 text-xs hover:bg-slate-50">KaldÄ±r</button>}
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Portlar ({node.data.ports.length})</span>
                <button onClick={() => setEditorOpen(true)} className="inline-flex items-center gap-1 rounded-md border border-blue-300 px-2 py-1 text-[11px] text-blue-700 hover:bg-blue-50">
                  <Settings2 size={12} /> Port EditÃ¶rÃ¼
                </button>
              </div>
              <div className="space-y-1">
                {node.data.ports.map((p) => (
                  <div key={p.id} className="flex items-center gap-1.5 rounded border border-slate-200 px-2 py-1 text-xs">
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: portColor(p.role) }} />
                    <input
                      className="min-w-0 flex-1 bg-transparent font-medium text-slate-700 outline-none focus:bg-blue-50"
                      value={p.name}
                      onChange={(e) => updatePort(node.id, p.id, { name: e.target.value })}
                    />
                    <span className="shrink-0 text-[10px] text-slate-400">{p.role}</span>
                  </div>
                ))}
                {node.data.ports.length === 0 && <p className="text-[11px] text-slate-400">Port yok â€” editÃ¶rden ekle.</p>}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => rotateNode(node.id)} className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs hover:bg-slate-50">DÃ¶ndÃ¼r 90Â°</button>
              <button onClick={deleteSelection} className="flex-1 rounded-md border border-red-300 px-2 py-1.5 text-xs text-red-600 hover:bg-red-50">Sil</button>
            </div>

            {editorOpen && <PortEditorModal nodeId={node.id} onClose={() => setEditorOpen(false)} />}
          </>
        )}

        {edge && (
          <>
            <Field label="Kablo Tipi">
              <select className={inputCls} value={edge.data!.cableType}
                onChange={(e) => {
                  const ct = e.target.value as CableType;
                  updateEdgeData(edge.id, { cableType: ct, color: CABLE_TYPES[ct].color, layer: layerForCableType(ct) });
                }}>
                {CABLE_TYPE_LIST.map((c) => <option key={c.type} value={c.type}>{c.label}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Kesit">
                <select className={inputCls} value={edge.data!.size}
                  onChange={(e) => {
                    const size = e.target.value;
                    updateEdgeData(edge.id, { size, label: edge.data!.fuse ? `${size} / ${edge.data!.fuse}` : size });
                  }}>
                  {CABLE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Renk">
                <input type="color" className="h-9 w-full rounded-md border border-slate-300" value={edge.data!.color}
                  onChange={(e) => updateEdgeData(edge.id, { color: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Sigorta">
                <input className={inputCls} value={edge.data!.fuse ?? ""} placeholder="Ã¶rn. 300A"
                  onChange={(e) => {
                    const fuse = e.target.value;
                    updateEdgeData(edge.id, { fuse, label: fuse ? `${edge.data!.size} / ${fuse}` : edge.data!.size });
                  }} />
              </Field>
              <Field label="Uzunluk (m)">
                <input type="number" className={inputCls} value={edge.data!.length ?? ""}
                  onChange={(e) => updateEdgeData(edge.id, { length: e.target.value ? Number(e.target.value) : undefined })} />
              </Field>
            </div>
            <Field label="Etiket">
              <input className={inputCls} value={edge.data!.label ?? ""}
                onChange={(e) => updateEdgeData(edge.id, { label: e.target.value })} />
            </Field>
            <Field label="Not">
              <textarea className={inputCls} rows={2} value={edge.data!.notes ?? ""}
                onChange={(e) => updateEdgeData(edge.id, { notes: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={!!edge.data!.arrow}
                onChange={(e) => updateEdgeData(edge.id, { arrow: e.target.checked })} />
              YÃ¶n oku gÃ¶ster
            </label>
            <button onClick={deleteSelection} className="w-full rounded-md border border-red-300 px-2 py-1.5 text-xs text-red-600 hover:bg-red-50">Kabloyu Sil</button>
          </>
        )}
      </div>
    </aside>
  );
}
