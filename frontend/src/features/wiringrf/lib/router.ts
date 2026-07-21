import type { AppNode, AppEdge } from "@/features/wiringrf/store/useProjectStore";
import { portXY, portPosition } from "@/features/wiringrf/lib/ports";
import { Position } from "@xyflow/react";

export interface Pt { x: number; y: number }
interface Rect { x: number; y: number; w: number; h: number; id: string }

const CELL = 14;        // grid resolution (px)
const PAD = 16;         // obstacle inflation around products
const STUB = 18;        // how far a cable leaves a port before routing
const TURN = 30;        // A* turn penalty (prefer few, long straight runs)
const LANE_GAP = 8;     // separation between parallel cables sharing a track
const MIN_OVERLAP = 36; // only de-overlap runs longer than this (avoid tiny jogs)

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function dirOf(pos: Position): [number, number] {
  if (pos === Position.Left) return [-1, 0];
  if (pos === Position.Right) return [1, 0];
  if (pos === Position.Top) return [0, -1];
  return [0, 1];
}

function endpoint(node: AppNode, portId: string | null | undefined) {
  const p = node.data.ports.find((x) => x.id === portId) ?? node.data.ports[0];
  const w = node.data.width, h = node.data.height;
  if (!p) return { pt: { x: node.position.x + w / 2, y: node.position.y + h / 2 }, dir: [0, 1] as [number, number] };
  // Dondurulmus node'larda kablo ucu, ekrandaki handle ile ayni noktayi kullanir.
  const { x, y } = portXY(p, node.data.rotation);
  return {
    pt: { x: node.position.x + x * w, y: node.position.y + y * h },
    dir: dirOf(portPosition(p, node.data.rotation)),
  };
}

// Build obstacle-avoiding orthogonal polylines for every edge. A clean direct route
// is used when it clears all products; otherwise A* routes around them.
export function computeRoutes(nodes: AppNode[], edges: AppEdge[]): Record<string, Pt[]> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const rects: Rect[] = nodes.map((n) => ({
    x: n.position.x - PAD, y: n.position.y - PAD,
    w: n.data.width + 2 * PAD, h: n.data.height + 2 * PAD, id: n.id,
  }));

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
  }
  if (!isFinite(minX)) return {};
  const margin = 80;
  minX -= margin; minY -= margin; maxX += margin; maxY += margin;
  const cols = Math.ceil((maxX - minX) / CELL);
  const rows = Math.ceil((maxY - minY) / CELL);
  const toCol = (x: number) => Math.round((x - minX) / CELL);
  const toRow = (y: number) => Math.round((y - minY) / CELL);
  if (cols * rows > 400000 || cols < 2 || rows < 2) return {};

  const out: Record<string, Pt[]> = {};

  for (const e of edges) {
    const sn = byId.get(e.source), tn = byId.get(e.target);
    if (!sn || !tn) continue;
    const s = endpoint(sn, e.sourceHandle);
    const t = endpoint(tn, e.targetHandle);

    const sStub = { x: s.pt.x + s.dir[0] * STUB, y: s.pt.y + s.dir[1] * STUB };
    const tStub = { x: t.pt.x + t.dir[0] * STUB, y: t.pt.y + t.dir[1] * STUB };

    // Obstacles for THIS edge exclude its own endpoint nodes (so it can leave/enter).
    const others = rects.filter((r) => r.id !== sn.id && r.id !== tn.id);

    // 1) Prefer a clean simple orthogonal route (â‰¤3 bends) if it clears products.
    const simple = simpleOrtho(s.pt, s.dir, t.pt, t.dir, sStub, tStub);
    let pts: Pt[];
    if (!polylineHitsRects(simple, others)) {
      pts = simple;
    } else {
      // 2) Otherwise route around obstacles with A*.
      const blocked = (col: number, row: number) => {
        const wx = minX + col * CELL, wy = minY + row * CELL;
        for (const r of others) {
          if (wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.h) return true;
        }
        return false;
      };
      const path = aStar(toCol(sStub.x), toRow(sStub.y), toCol(tStub.x), toRow(tStub.y), cols, rows, blocked);
      pts = path
        ? [s.pt, sStub, ...path.map(([c, r]) => ({ x: minX + c * CELL, y: minY + r * CELL })), tStub, t.pt]
        : simple;
    }
    out[e.id] = simplify(pts);
  }

  separateOverlaps(out);
  return out;
}

// Clean orthogonal route (â‰¤3 bends) between two stub points, honoring exit directions.
function simpleOrtho(sPt: Pt, sDir: [number, number], tPt: Pt, tDir: [number, number], sStub: Pt, tStub: Pt): Pt[] {
  const sH = sDir[0] !== 0, tH = tDir[0] !== 0;
  let mid: Pt[];
  if (sH && tH) {
    const mx = (sStub.x + tStub.x) / 2;
    mid = [{ x: mx, y: sStub.y }, { x: mx, y: tStub.y }];
  } else if (!sH && !tH) {
    const my = (sStub.y + tStub.y) / 2;
    mid = [{ x: sStub.x, y: my }, { x: tStub.x, y: my }];
  } else if (sH && !tH) {
    mid = [{ x: tStub.x, y: sStub.y }];
  } else {
    mid = [{ x: sStub.x, y: tStub.y }];
  }
  return simplify([sPt, sStub, ...mid, tStub, tPt]);
}

function segHitsRect(a: Pt, b: Pt, r: Rect): boolean {
  if (Math.abs(a.y - b.y) < 0.5) {
    const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
    return a.y > r.y && a.y < r.y + r.h && hi > r.x && lo < r.x + r.w;
  }
  if (Math.abs(a.x - b.x) < 0.5) {
    const lo = Math.min(a.y, b.y), hi = Math.max(a.y, b.y);
    return a.x > r.x && a.x < r.x + r.w && hi > r.y && lo < r.y + r.h;
  }
  return false;
}

function polylineHitsRects(pts: Pt[], rects: Rect[]): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    for (const r of rects) if (segHitsRect(pts[i], pts[i + 1], r)) return true;
  }
  return false;
}

// A* on a 4-connected grid with a turn penalty; returns list of [col,row] or null.
function aStar(
  sc: number, sr: number, gc: number, gr: number,
  cols: number, rows: number, blocked: (c: number, r: number) => boolean,
): [number, number][] | null {
  const clampC = (v: number) => Math.max(0, Math.min(cols - 1, v));
  const clampR = (v: number) => Math.max(0, Math.min(rows - 1, v));
  sc = clampC(sc); sr = clampR(sr); gc = clampC(gc); gr = clampR(gr);
  const key = (c: number, r: number) => r * cols + c;
  const startK = key(sc, sr), goalK = key(gc, gr);
  const came = new Map<number, number>();
  const dirFrom = new Map<number, number>();
  const g = new Map<number, number>([[startK, 0]]);
  const open = new MinHeap();
  open.push(startK, heur(sc, sr, gc, gr));
  const seen = new Set<number>();

  while (!open.empty()) {
    const cur = open.pop();
    if (cur === goalK) return rebuild(came, cur, cols);
    if (seen.has(cur)) continue;
    seen.add(cur);
    const cc = cur % cols, cr = Math.floor(cur / cols);
    const prevDir = dirFrom.get(cur);
    for (let di = 0; di < 4; di++) {
      const [dx, dy] = DIRS[di];
      const nc = cc + dx, nr = cr + dy;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      if (blocked(nc, nr)) continue;
      const nk = key(nc, nr);
      const turn = prevDir !== undefined && prevDir !== di ? TURN : 0;
      const ng = (g.get(cur) ?? Infinity) + 1 + turn;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        came.set(nk, cur);
        dirFrom.set(nk, di);
        open.push(nk, ng + heur(nc, nr, gc, gr));
      }
    }
  }
  return null;
}

function heur(c: number, r: number, gc: number, gr: number) {
  return Math.abs(c - gc) + Math.abs(r - gr);
}

function rebuild(came: Map<number, number>, end: number, cols: number): [number, number][] {
  const out: [number, number][] = [];
  let cur: number | undefined = end;
  while (cur !== undefined) {
    out.push([cur % cols, Math.floor(cur / cols)]);
    cur = came.get(cur);
  }
  return out.reverse();
}

// Drop collinear interior points.
function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const n = out.length;
    if (n >= 2) {
      const a = out[n - 2], b = out[n - 1];
      const collinear = (a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y);
      if (collinear) { out[n - 1] = p; continue; }
    }
    if (n >= 1 && out[n - 1].x === p.x && out[n - 1].y === p.y) continue;
    out.push({ ...p });
  }
  return out;
}

// Separate parallel cables that share a track onto distinct lanes (keeps right angles).
function separateOverlaps(routes: Record<string, Pt[]>) {
  interface Seg { id: string; i: number; orient: "h" | "v"; fixed: number; lo: number; hi: number }
  const segs: Seg[] = [];
  for (const [id, pts] of Object.entries(routes)) {
    for (let i = 0; i < pts.length - 1; i++) {
      if (i === 0 || i + 1 === pts.length - 1) continue; // keep stub segments anchored
      const a = pts[i], b = pts[i + 1];
      if (a.y === b.y && Math.abs(a.x - b.x) >= MIN_OVERLAP) segs.push({ id, i, orient: "h", fixed: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) });
      else if (a.x === b.x && Math.abs(a.y - b.y) >= MIN_OVERLAP) segs.push({ id, i, orient: "v", fixed: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) });
    }
  }
  const groups = new Map<string, Seg[]>();
  for (const s of segs) {
    const k = `${s.orient}:${Math.round(s.fixed / LANE_GAP)}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(s);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.lo - b.lo || a.id.localeCompare(b.id));
    const lanes: { hi: number }[] = [];
    for (const s of group) {
      let lane = 0;
      while (lane < lanes.length && lanes[lane].hi > s.lo) lane++;
      if (lane === lanes.length) lanes.push({ hi: s.hi });
      else lanes[lane].hi = s.hi;
      if (lane === 0) continue;
      const delta = (lane % 2 === 1 ? 1 : -1) * Math.ceil(lane / 2) * LANE_GAP;
      const pts = routes[s.id];
      if (s.orient === "h") { pts[s.i].y += delta; pts[s.i + 1].y += delta; }
      else { pts[s.i].x += delta; pts[s.i + 1].x += delta; }
    }
  }
}

// Minimal binary heap keyed by priority.
class MinHeap {
  private h: { k: number; p: number }[] = [];
  empty() { return this.h.length === 0; }
  push(k: number, p: number) {
    this.h.push({ k, p });
    let i = this.h.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (this.h[par].p <= this.h[i].p) break;
      [this.h[par], this.h[i]] = [this.h[i], this.h[par]];
      i = par;
    }
  }
  pop(): number {
    const top = this.h[0];
    const last = this.h.pop()!;
    if (this.h.length) {
      this.h[0] = last;
      let i = 0;
      const n = this.h.length;
      for (;;) {
        const l = 2 * i + 1, r = 2 * i + 2;
        let m = i;
        if (l < n && this.h[l].p < this.h[m].p) m = l;
        if (r < n && this.h[r].p < this.h[m].p) m = r;
        if (m === i) break;
        [this.h[m], this.h[i]] = [this.h[i], this.h[m]];
        i = m;
      }
    }
    return top.k;
  }
}
