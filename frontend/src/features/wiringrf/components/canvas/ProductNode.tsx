import { memo } from "react";
import { Handle, type NodeProps } from "@xyflow/react";
import * as Icons from "lucide-react";
import type { ProductNodeData, Port } from "@/features/wiringrf/types";
import type { AppNode } from "@/features/wiringrf/store/useProjectStore";
import { portXY, portPosition, portColor } from "@/features/wiringrf/lib/ports";

function handleStyle(p: Port, rotation: number): React.CSSProperties {
  const { x, y } = portXY(p, rotation);
  return {
    width: 15,
    height: 15,
    background: p.color || portColor(p.role),
    border: "2px solid #fff",
    boxShadow: "0 0 0 1px rgba(15,23,42,0.25)",
    zIndex: 10,
    cursor: "crosshair",
    left: `${x * 100}%`,
    top: `${y * 100}%`,
    transform: "translate(-50%, -50%)",
  };
}

function PortLabel({ p, rotation }: { p: Port; rotation: number }) {
  const { x, y } = portXY(p, rotation);
  return (
    <span
      style={{
        position: "absolute",
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: `translate(${x > 0.7 ? "-110%" : x < 0.3 ? "12%" : "-50%"}, ${y > 0.7 ? "-150%" : "55%"})`,
        fontSize: 8,
        lineHeight: 1,
        color: "#475569",
        pointerEvents: "none",
        whiteSpace: "nowrap",
      }}
    >
      {p.name}
    </span>
  );
}

function ProductNodeInner({ data, selected }: NodeProps<AppNode>) {
  const d = data as ProductNodeData;
  const Icon = (Icons as unknown as Record<string, React.ComponentType<{ size?: number; color?: string }>>)[d.icon] ?? Icons.Box;

  return (
    <div
      style={{
        width: d.width,
        height: d.height,
      }}
      className={`relative ${
        selected ? "ring-2 ring-blue-500" : ""
      }`}
    >
      <div
        className={`absolute inset-0 rounded-xl border bg-white shadow-sm transition-shadow ${
          selected ? "border-blue-400" : "border-slate-300"
        }`}
        style={{
          transform: d.rotation ? `rotate(${d.rotation}deg)` : undefined,
          transformOrigin: "center",
        }}
      >
        <div className="absolute inset-x-0 top-0 h-1.5 rounded-t-xl" style={{ background: d.accent }} />

        {d.imageUrl ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-2 pt-1.5 text-center">
            <img src={d.imageUrl} alt={d.label} className="max-h-[60%] max-w-[85%] object-contain" draggable={false} />
            <div className="text-[10px] font-semibold leading-tight text-slate-800">{d.label}</div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-3 text-center">
            <Icon size={22} color={d.accent} />
            <div className="text-[11px] font-semibold leading-tight text-slate-800">{d.label}</div>
            {d.voltage && <div className="text-[9px] text-slate-500">{d.voltage}</div>}
          </div>
        )}
      </div>

      {/* Port koordinati rotation-aware helper'dan gelir; router ile ayni noktaya oturur. */}
      {d.ports.map((p) => (
        <PortLabel key={`lbl_${p.id}`} p={p} rotation={d.rotation} />
      ))}

      {d.ports.map((p) => {
        const pos = portPosition(p, d.rotation);
        return (
          <span key={`h_${p.id}`}>
            <Handle id={p.id} type="target" position={pos} style={handleStyle(p, d.rotation)} isConnectableStart={false} />
            <Handle id={p.id} type="source" position={pos} style={handleStyle(p, d.rotation)} isConnectableEnd={false} />
          </span>
        );
      })}
    </div>
  );
}

export const ProductNode = memo(ProductNodeInner);
