import { useStore, type ReactFlowState } from "@xyflow/react";

const transformSelector = (s: ReactFlowState) => s.transform;

// Renders smart-alignment guide lines (in screen space) while a node is dragged.
export function HelperLines({ horizontal, vertical }: { horizontal?: number; vertical?: number }) {
  const [tx, ty, zoom] = useStore(transformSelector);
  if (horizontal === undefined && vertical === undefined) return null;

  return (
    <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full">
      {vertical !== undefined && (
        <line
          x1={vertical * zoom + tx} y1={0}
          x2={vertical * zoom + tx} y2="100%"
          stroke="#2563eb" strokeWidth={1} strokeDasharray="4 3"
        />
      )}
      {horizontal !== undefined && (
        <line
          x1={0} y1={horizontal * zoom + ty}
          x2="100%" y2={horizontal * zoom + ty}
          stroke="#2563eb" strokeWidth={1} strokeDasharray="4 3"
        />
      )}
    </svg>
  );
}
