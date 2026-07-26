import { useRef, useState } from "react";
import { X, Plus, Trash2, ImagePlus, ImageOff } from "lucide-react";
import { useProjectStore } from "@/features/wiringrf/store/useProjectStore";
import { portXY, portColor, portSideFromXY, makePort, PORT_ROLES, defaultKindForRole } from "@/features/wiringrf/lib/ports";
import { readImageFile } from "@/features/wiringrf/lib/image";
import type { Port, PortDirection, CurrentKind } from "@/features/wiringrf/types";

const BOX_W = 380;
const BOX_H = 280;
const inputCls = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400";

export function PortEditorModal({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const node = useProjectStore((s) => s.nodes.find((n) => n.id === nodeId));
  const addPort = useProjectStore((s) => s.addPort);
  const updatePort = useProjectStore((s) => s.updatePort);
  const deletePort = useProjectStore((s) => s.deletePort);
  const setNodeImage = useProjectStore((s) => s.setNodeImage);
  const boxRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selPort, setSelPort] = useState<string | null>(null);
  const [guides, setGuides] = useState<{ vx?: number; hy?: number }>({});
  const dragId = useRef<string | null>(null);

  if (!node) return null;
  const ports = node.data.ports;
  const sel = ports.find((p) => p.id === selPort);

  const pointToNorm = (clientX: number, clientY: number) => {
    const r = boxRef.current!.getBoundingClientRect();
    return {
      nx: Math.max(0, Math.min(1, (clientX - r.left) / r.width)),
      ny: Math.max(0, Math.min(1, (clientY - r.top) / r.height)),
    };
  };

  const onBoxClick = (e: React.MouseEvent) => {
    if (dragId.current) return;
    if ((e.target as HTMLElement).dataset.port) return; // clicked a port, not empty space
    const { nx, ny } = pointToNorm(e.clientX, e.clientY);
    const p = makePort(nx, ny);
    addPort(nodeId, p);
    setSelPort(p.id);
  };

  const onPortPointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    dragId.current = id;
    setSelPort(id);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPortPointerMove = (e: React.PointerEvent) => {
    if (!dragId.current) return;
    let { nx, ny } = pointToNorm(e.clientX, e.clientY);
    // Snap to other ports' x/y (and center/edges) for vertical & horizontal alignment.
    const SNAP_X = 7 / BOX_W, SNAP_Y = 7 / BOX_H;
    const xs = [0, 0.5, 1, ...ports.filter((p) => p.id !== dragId.current).map((p) => portXY(p).x)];
    const ys = [0, 0.5, 1, ...ports.filter((p) => p.id !== dragId.current).map((p) => portXY(p).y)];
    let vx: number | undefined, hy: number | undefined;
    for (const x of xs) if (Math.abs(nx - x) < SNAP_X) { nx = x; vx = x; break; }
    for (const y of ys) if (Math.abs(ny - y) < SNAP_Y) { ny = y; hy = y; break; }
    setGuides({ vx, hy });
    updatePort(nodeId, dragId.current, { nx, ny, side: portSideFromXY(nx, ny) });
  };
  const onPortPointerUp = () => { dragId.current = null; setGuides({}); };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const res = await readImageFile(file);
    if (res.ok && res.dataUrl) setNodeImage(nodeId, res.dataUrl);
    else window.dispatchEvent(new CustomEvent("kablo:save-error", { detail: res.error }));
    e.target.value = "";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-800">Port Konum Editörü — {node.data.label}</h2>
          <button onClick={onClose}><X size={18} className="text-slate-400 hover:text-slate-700" /></button>
        </div>

        <div className="flex flex-1 gap-4 overflow-y-auto p-4">
          {/* Visual editor */}
          <div className="flex flex-col items-center gap-2">
            <p className="text-[11px] text-slate-500">Boş alana tıkla → port ekle · portu sürükle → taşı</p>
            <div
              ref={boxRef}
              onClick={onBoxClick}
              onPointerMove={onPortPointerMove}
              onPointerUp={onPortPointerUp}
              className="relative rounded-xl border-2 border-slate-300 bg-slate-50"
              style={{ width: BOX_W, height: BOX_H }}
            >
              <div className="absolute inset-x-0 top-0 h-2 rounded-t-xl" style={{ background: node.data.accent }} />
              {node.data.imageUrl && (
                <img src={node.data.imageUrl} alt="" className="absolute left-1/2 top-1/2 max-h-[70%] max-w-[80%] -translate-x-1/2 -translate-y-1/2 object-contain" draggable={false} />
              )}
              {!node.data.imageUrl && (
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xs text-slate-400">{node.data.label}</span>
              )}
              {ports.map((p) => {
                const { x, y } = portXY(p);
                const isSel = p.id === selPort;
                return (
                  <div
                    key={p.id}
                    data-port="1"
                    onPointerDown={(e) => onPortPointerDown(e, p.id)}
                    title={p.name}
                    className={`absolute cursor-grab rounded-full active:cursor-grabbing ${isSel ? "ring-2 ring-blue-500" : ""}`}
                    style={{
                      left: `${x * 100}%`, top: `${y * 100}%`,
                      width: 14, height: 14, transform: "translate(-50%,-50%)",
                      background: p.color || portColor(p.role), border: "2px solid #fff",
                    }}
                  />
                );
              })}
              {guides.vx !== undefined && (
                <div className="pointer-events-none absolute top-0 bottom-0 border-l border-dashed border-blue-500" style={{ left: `${guides.vx * 100}%` }} />
              )}
              {guides.hy !== undefined && (
                <div className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-blue-500" style={{ top: `${guides.hy * 100}%` }} />
              )}
            </div>
            <div className="flex gap-2">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={onUpload} />
              <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50">
                <ImagePlus size={14} /> Görsel Yükle
              </button>
              {node.data.imageUrl && (
                <button onClick={() => setNodeImage(nodeId, undefined)} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50">
                  <ImageOff size={14} /> Görseli Kaldır
                </button>
              )}
            </div>
          </div>

          {/* Port list + editor */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Portlar ({ports.length})</span>
              <button onClick={() => { const i = ports.length; const p = makePort(0.5, 0.12 + (i % 6) * 0.15); addPort(nodeId, p); setSelPort(p.id); }}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                <Plus size={13} /> Port Ekle
              </button>
            </div>
            <div className="mb-3 max-h-28 space-y-1 overflow-y-auto">
              {ports.map((p) => (
                <button key={p.id} onClick={() => setSelPort(p.id)}
                  className={`flex w-full items-center justify-between rounded border px-2 py-1 text-xs ${p.id === selPort ? "border-blue-400 bg-blue-50" : "border-slate-200"}`}>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: portColor(p.role) }} />
                    {p.name}
                  </span>
                  <span className="text-[10px] text-slate-400">{p.role}</span>
                </button>
              ))}
              {ports.length === 0 && <p className="text-xs text-slate-400">Henüz port yok. Görsele tıkla veya “Port Ekle”.</p>}
            </div>

            {sel ? (
              <PortFields key={sel.id} port={sel} onChange={(patch) => updatePort(nodeId, sel.id, patch)} onDelete={() => { deletePort(nodeId, sel.id); setSelPort(null); }} />
            ) : (
              <p className="text-xs text-slate-400">Düzenlemek için bir port seç.</p>
            )}
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-200 px-4 py-3">
          <button onClick={onClose} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">Bitti</button>
        </div>
      </div>
    </div>
  );
}

function PortFields({ port, onChange, onDelete }: { port: Port; onChange: (p: Partial<Port>) => void; onDelete: () => void }) {
  return (
    <div className="space-y-2.5 rounded-md border border-slate-200 p-3">
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">Port Adı</span>
        <input className={inputCls} value={port.name} onChange={(e) => onChange({ name: e.target.value })} />
      </label>
      
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">Rol</span>
          <select className={inputCls} value={port.role}
            onChange={(e) => { const role = e.target.value as Port["role"]; onChange({ role, kind: defaultKindForRole(role) }); }}>
            {PORT_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">Akım Tipi</span>
          <select className={inputCls} value={port.kind} onChange={(e) => onChange({ kind: e.target.value as CurrentKind })}>
            <option value="DC">DC (Doğru Akım)</option>
            <option value="AC">AC (Alternatif Akım)</option>
            <option value="DATA">DATA (Veri / Sinyal)</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">Yön</span>
          <select className={inputCls} value={port.direction} onChange={(e) => onChange({ direction: e.target.value as PortDirection })}>
            <option value="in">Giriş</option>
            <option value="out">Çıkış</option>
            <option value="bi">Çift yönlü</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">Özel Renk (Hex)</span>
          <div className="flex gap-1.5">
            <input
              type="color"
              className="h-[30px] w-8 cursor-pointer rounded border border-slate-300 bg-transparent p-0.5"
              value={port.color || portColor(port.role)}
              onChange={(e) => onChange({ color: e.target.value })}
            />
            <input
              className={`${inputCls} flex-grow text-xs`}
              value={port.color ?? ""}
              placeholder="Varsayılan"
              onChange={(e) => onChange({ color: e.target.value || undefined })}
            />
          </div>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">Tavsiye Kesit</span>
          <input className={inputCls} value={port.recommendedCableSize ?? ""} placeholder="örn. 16mm²" onChange={(e) => onChange({ recommendedCableSize: e.target.value })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">Tavsiye Sigorta</span>
          <input className={inputCls} value={port.recommendedFuse ?? ""} placeholder="örn. 60A" onChange={(e) => onChange({ recommendedFuse: e.target.value })} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">Maks Akım (A)</span>
          <input type="number" className={inputCls} value={port.maxCurrent ?? ""} placeholder="örn. 45" onChange={(e) => onChange({ maxCurrent: e.target.value ? parseFloat(e.target.value) : undefined })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">Maks Voltaj (V)</span>
          <input type="number" className={inputCls} value={port.maxVoltage ?? ""} placeholder="örn. 250" onChange={(e) => onChange({ maxVoltage: e.target.value ? parseFloat(e.target.value) : undefined })} />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">Bağlantı Kısıtları</span>
        <input className={inputCls} value={port.connectionConstraints ?? ""} placeholder="örn. Sadece Victron MPPT için" onChange={(e) => onChange({ connectionConstraints: e.target.value || undefined })} />
      </label>

      <div className="pt-2">
        <button onClick={onDelete} className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-red-300 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50">
          <Trash2 size={13} /> Portu Sil
        </button>
      </div>
    </div>
  );
}
