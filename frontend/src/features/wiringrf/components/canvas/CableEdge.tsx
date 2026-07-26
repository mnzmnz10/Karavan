import { useRef } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";
import type { CableEdgeData } from "@/features/wiringrf/types";
import { cableStrokeWidth } from "@/features/wiringrf/data/cables";
import { useProjectStore } from "@/features/wiringrf/store/useProjectStore";
import { useRoutes } from "./RouteContext";
import type { Pt } from "@/features/wiringrf/lib/router";

// Point at fraction t (0..1) along a polyline.
function pointAtFraction(pts: Pt[], t: number): Pt {
  let total = 0;
  const segLen: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    segLen.push(l); total += l;
  }
  let target = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < segLen.length; i++) {
    if (target <= segLen[i]) {
      const r = segLen[i] === 0 ? 0 : target / segLen[i];
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * r, y: pts[i].y + (pts[i + 1].y - pts[i].y) * r };
    }
    target -= segLen[i];
  }
  return pts[pts.length - 1];
}

// Nearest fraction t (0..1) on the polyline to point p.
function nearestFraction(pts: Pt[], p: Pt): number {
  let total = 0;
  const segLen: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    segLen.push(l); total += l;
  }
  if (total === 0) return 0.5;
  let acc = 0, best = Infinity, bestLen = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    let u = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    u = Math.max(0, Math.min(1, u));
    const px = a.x + dx * u, py = a.y + dy * u;
    const dist = Math.hypot(p.x - px, p.y - py);
    if (dist < best) { best = dist; bestLen = acc + u * segLen[i]; }
    acc += segLen[i];
  }
  return bestLen / total;
}

// Index of the polyline segment nearest to point p (0..pts.length-2).
function nearestSegmentIndex(pts: Pt[], p: Pt): number {
  let best = Infinity, bestI = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    let u = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    u = Math.max(0, Math.min(1, u));
    const px = a.x + dx * u, py = a.y + dy * u;
    const dist = Math.hypot(p.x - px, p.y - py);
    if (dist < best) { best = dist; bestI = i; }
  }
  return bestI;
}

const R = 7; // corner radius

// Rounded orthogonal path through the routed polyline.
function roundedPath(pts: Pt[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1], cur = pts[i], next = pts[i + 1];
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
    const r = Math.min(R, inLen / 2, outLen / 2);
    const p1 = { x: cur.x - Math.sign(cur.x - prev.x) * r, y: cur.y - Math.sign(cur.y - prev.y) * r };
    const p2 = { x: cur.x + Math.sign(next.x - cur.x) * r, y: cur.y + Math.sign(next.y - cur.y) * r };
    d += ` L ${p1.x},${p1.y} Q ${cur.x},${cur.y} ${p2.x},${p2.y}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x},${last.y}`;
  return d;
}

// Rounded path through arbitrary-angle points (elle eklenen kıvrım noktaları için).
function smoothPolyline(pts: Pt[], r = 9): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1], cur = pts[i], next = pts[i + 1];
    const v1x = cur.x - prev.x, v1y = cur.y - prev.y, l1 = Math.hypot(v1x, v1y) || 1;
    const v2x = next.x - cur.x, v2y = next.y - cur.y, l2 = Math.hypot(v2x, v2y) || 1;
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const p1 = { x: cur.x - (v1x / l1) * rr, y: cur.y - (v1y / l1) * rr };
    const p2 = { x: cur.x + (v2x / l2) * rr, y: cur.y + (v2y / l2) * rr };
    d += ` L ${p1.x},${p1.y} Q ${cur.x},${cur.y} ${p2.x},${p2.y}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x},${last.y}`;
  return d;
}

export function CableEdge(props: EdgeProps) {
  const {
    id, sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition, data, selected,
  } = props;
  const d = data as CableEdgeData;
  const layers = useProjectStore((s) => s.layers);
  const layerLocks = useProjectStore((s) => s.layerLocks);
  const updateEdgeData = useProjectStore((s) => s.updateEdgeData);
  const routes = useRoutes();
  const { screenToFlowPosition } = useReactFlow();
  const showLabels = layers.labels;
  const draggingLabel = useRef(false);
  const dragWp = useRef<number | null>(null);

  const wps = (d.waypoints ?? []) as Pt[];
  const hasWps = wps.length > 0;
  const routed = routes[id];

  const labelT = d.labelT ?? 0.5;
  let path: string;
  let labelX: number, labelY: number;
  let effPts: Pt[] | null = null; // etiket/waypoint hesabı için kullanılan polyline
  const [fallbackPath, fbX, fbY] = getSmoothStepPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 6,
  });

  if (hasWps) {
    // Elle kıvrım: kaynak → waypoint'ler → hedef.
    effPts = [{ x: sourceX, y: sourceY }, ...wps, { x: targetX, y: targetY }];
    const p = smoothPolyline(effPts);
    if (p && !p.includes("NaN")) {
      path = p;
      const m = pointAtFraction(effPts, labelT);
      labelX = Number.isFinite(m.x) ? m.x : fbX;
      labelY = Number.isFinite(m.y) ? m.y : fbY;
    } else {
      path = fallbackPath; labelX = fbX; labelY = fbY;
    }
  } else if (routed && routed.length >= 2) {
    const p = roundedPath(routed);
    if (p && !p.includes("NaN")) {
      path = p; effPts = routed;
      const m = pointAtFraction(routed, labelT);
      labelX = Number.isFinite(m.x) ? m.x : fbX;
      labelY = Number.isFinite(m.y) ? m.y : fbY;
    } else {
      path = fallbackPath; labelX = fbX; labelY = fbY;
    }
  } else {
    path = fallbackPath; labelX = fbX; labelY = fbY;
  }

  if (!layers[d.layer]) return null;
  const locked = layerLocks[d.layer];
  const width = cableStrokeWidth(d.size);

  // Çift tık → kabloya kıvrım noktası ekle.
  const onPathDoubleClick = (e: React.MouseEvent) => {
    if (locked) return;
    e.stopPropagation();
    const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    if (!hasWps) {
      updateEdgeData(id, { waypoints: [flow] });
      return;
    }
    const eff = [{ x: sourceX, y: sourceY }, ...wps, { x: targetX, y: targetY }];
    const k = nearestSegmentIndex(eff, flow); // 0..eff.length-2 → waypoints ekleme indexi
    const nw = wps.map((w) => ({ ...w }));
    nw.splice(k, 0, flow);
    updateEdgeData(id, { waypoints: nw });
  };

  // Waypoint sürükle.
  const onWpDown = (e: React.PointerEvent, i: number) => {
    if (locked) return;
    e.stopPropagation();
    dragWp.current = i;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onWpMove = (e: React.PointerEvent) => {
    if (dragWp.current === null) return;
    const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const nw = wps.map((w, j) => (j === dragWp.current ? flow : { ...w }));
    updateEdgeData(id, { waypoints: nw });
  };
  const onWpUp = (e: React.PointerEvent) => {
    dragWp.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };
  // Waypoint'e çift tık → sil.
  const removeWp = (i: number) => updateEdgeData(id, { waypoints: wps.filter((_, j) => j !== i) });

  // Etiket sürükle.
  const onLabelPointerDown = (e: React.PointerEvent) => {
    if (locked || !effPts || effPts.length < 2) return;
    e.stopPropagation();
    draggingLabel.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onLabelPointerMove = (e: React.PointerEvent) => {
    if (!draggingLabel.current || !effPts) return;
    const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    updateEdgeData(id, { labelT: nearestFraction(effPts, flow) });
  };
  const onLabelPointerUp = (e: React.PointerEvent) => {
    draggingLabel.current = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };
  const onLabelPointerCancel = () => { draggingLabel.current = false; };

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: d.color,
          strokeWidth: selected ? width + 1.5 : width,
          opacity: selected ? 1 : 0.92,
        }}
        markerEnd={d.arrow ? "url(#arrow)" : undefined}
      />
      {/* Şeffaf geniş vuruş: çift tık ile kıvrım noktası ekle. */}
      {!locked && (
        <path
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={Math.max(18, width + 12)}
          style={{ cursor: "copy", pointerEvents: "stroke" }}
          onDoubleClick={onPathDoubleClick}
        />
      )}
      {/* Kıvrım noktaları (seçiliyken): sürükle = taşı, çift tık = sil. */}
      {selected && !locked && wps.map((w, i) => (
        <circle
          key={`wp_${i}`}
          cx={w.x}
          cy={w.y}
          r={5}
          fill="#ffffff"
          stroke={d.color}
          strokeWidth={2}
          style={{ cursor: "move", pointerEvents: "all" }}
          onPointerDown={(e) => onWpDown(e, i)}
          onPointerMove={onWpMove}
          onPointerUp={onWpUp}
          onDoubleClick={(e) => { e.stopPropagation(); removeWp(i); }}
        >
          <title>Sürükle: taşı · Çift tık: sil</title>
        </circle>
      ))}
      {showLabels && (d.label || d.size) && (
        <EdgeLabelRenderer>
          <div
            className={`nodrag nopan absolute select-none rounded border bg-white/95 px-1.5 py-0.5 text-[9px] font-medium shadow-sm ${locked ? "cursor-default" : "cursor-move"} ${
              selected ? "border-blue-400 text-blue-700" : "border-slate-300 text-slate-700"
            }`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: locked ? "none" : "all",
            }}
            title="Sürükleyerek kablo üzerinde kaydır"
            onPointerDown={onLabelPointerDown}
            onPointerMove={onLabelPointerMove}
            onPointerUp={onLabelPointerUp}
            onPointerCancel={onLabelPointerCancel}
            onLostPointerCapture={onLabelPointerCancel}
          >
            {d.label || d.size}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
