// Orthogonal wire routing — Manhattan style with obstacle avoidance.
// Two strategies:
//   (a) routeWire(...)        — fast L/Z/detour candidate scoring (cheap path).
//   (b) aStarRoute(...)       — grid-based A* with bend + overlap penalties,
//                                used to fully eliminate wire-wire overlap on
//                                dense schematics.
//
// Public API:
//   exitPoint(port, dist)
//   routeWire(start, end, obstacles, stub=20)             -> [{x,y}, ...]
//   aStarRoute(start, end, obstacles, ctx, opts)          -> [{x,y}, ...]
//   pathToSvgD(points, cornerRadius=4)                     -> SVG `d` attribute
//   findPathCrossings(pathA, pathB)                        -> crossings list
//   markPathUsed(points, ctx, gridSize)                    -> updates ctx sets

const SIDE_OFFSETS = {
  top:    [0, -1],
  bottom: [0,  1],
  left:   [-1, 0],
  right:  [ 1, 0],
};

export function exitPoint(p, dist = 20) {
  const [dx, dy] = SIDE_OFFSETS[p.side] || [0, 0];
  return { x: p.x + dx * dist, y: p.y + dy * dist };
}

// ====== Geometry helpers ======
function segIntersectsRect(p1, p2, rect, pad = 2) {
  const rx1 = rect.x - pad;
  const ry1 = rect.y - pad;
  const rx2 = rect.x + rect.w + pad;
  const ry2 = rect.y + rect.h + pad;
  if (p1.y === p2.y) {
    const y = p1.y;
    if (y < ry1 || y > ry2) return false;
    const xmin = Math.min(p1.x, p2.x);
    const xmax = Math.max(p1.x, p2.x);
    return !(xmax < rx1 || xmin > rx2);
  }
  if (p1.x === p2.x) {
    const x = p1.x;
    if (x < rx1 || x > rx2) return false;
    const ymin = Math.min(p1.y, p2.y);
    const ymax = Math.max(p1.y, p2.y);
    return !(ymax < ry1 || ymin > ry2);
  }
  return false;
}

function countObstacleCrossings(path, obstacles, skipEnds = false) {
  let n = 0;
  // skipEnds: ilk ve son segment port çıkış stub'larıdır; kendi cihazlarının
  // kenarıyla teknik olarak "kesişir" ama bu normaldir — sayma. Ortadaki
  // segmentler bir cihazı keserse (içinden/arkasından geçme) ağır cezalanır.
  const start = skipEnds ? 1 : 0;
  const stop = skipEnds ? Math.max(1, path.length - 2) : path.length - 1;
  for (let i = start; i < stop; i++) {
    for (const obs of obstacles) {
      if (segIntersectsRect(path[i], path[i + 1], obs)) n++;
    }
  }
  return n;
}

function pathLength(path) {
  let len = 0;
  for (let i = 0; i < path.length - 1; i++) {
    len += Math.abs(path[i + 1].x - path[i].x) + Math.abs(path[i + 1].y - path[i].y);
  }
  return len;
}

function simplify(path) {
  const out = [];
  for (const pt of path) {
    if (out.length === 0) { out.push(pt); continue; }
    const last = out[out.length - 1];
    if (last.x === pt.x && last.y === pt.y) continue;
    out.push(pt);
  }
  for (let i = 1; i < out.length - 1; ) {
    const a = out[i - 1], b = out[i], c = out[i + 1];
    if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) out.splice(i, 1);
    else i++;
  }
  return out;
}

// Bir yolun, daha önce kullanılmış (ctx) kablo segmentleriyle ne kadar üst üste
// bindiğini grid bazında sayar — fast mod kablo-kablo örtüşmesini cezalandırmak için.
function countPathOverlap(points, ctx, gridSize = 10) {
  if (!ctx || (!ctx.usedHoriz && !ctx.usedVert)) return 0;
  let n = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (a.y === b.y) {
      const min = Math.min(a.x, b.x), max = Math.max(a.x, b.x);
      const gy = Math.round(a.y / gridSize) * gridSize;
      for (let x = Math.round(min / gridSize) * gridSize; x < max; x += gridSize) {
        if (ctx.usedHoriz && ctx.usedHoriz.has(`H:${gy}:${x}`)) n++;
      }
    } else if (a.x === b.x) {
      const min = Math.min(a.y, b.y), max = Math.max(a.y, b.y);
      const gx = Math.round(a.x / gridSize) * gridSize;
      for (let y = Math.round(min / gridSize) * gridSize; y < max; y += gridSize) {
        if (ctx.usedVert && ctx.usedVert.has(`V:${gx}:${y}`)) n++;
      }
    }
  }
  return n;
}

// ====== Fast L/Z routing (initial / fallback) ======
function tryRoute(start, end, obstacles, stub, ctx = null, gridSize = 10) {
  const ea = exitPoint(start, stub);
  const eb = exitPoint(end, stub);
  const a = { x: start.x, y: start.y };
  const b = { x: end.x, y: end.y };

  const candidates = [];
  candidates.push([a, ea, { x: eb.x, y: ea.y }, eb, b]);
  candidates.push([a, ea, { x: ea.x, y: eb.y }, eb, b]);
  const mx = (ea.x + eb.x) / 2;
  const my = (ea.y + eb.y) / 2;
  candidates.push([a, ea, { x: mx, y: ea.y }, { x: mx, y: eb.y }, eb, b]);
  candidates.push([a, ea, { x: ea.x, y: my }, { x: eb.x, y: my }, eb, b]);

  // Örtüşmeden kaçınmak için kademeli sapma — küçük adımlarla başla ki kablolar
  // büyük kavis yerine birbirine yakın paralel kanallara otursun ("alt alta").
  for (const detour of [14, 26, 40, 56, 76, 100, 140]) {
    candidates.push([a, ea, { x: ea.x, y: Math.min(ea.y, eb.y) - detour }, { x: eb.x, y: Math.min(ea.y, eb.y) - detour }, eb, b]);
    candidates.push([a, ea, { x: ea.x, y: Math.max(ea.y, eb.y) + detour }, { x: eb.x, y: Math.max(ea.y, eb.y) + detour }, eb, b]);
    candidates.push([a, ea, { x: Math.min(ea.x, eb.x) - detour, y: ea.y }, { x: Math.min(ea.x, eb.x) - detour, y: eb.y }, eb, b]);
    candidates.push([a, ea, { x: Math.max(ea.x, eb.x) + detour, y: ea.y }, { x: Math.max(ea.x, eb.x) + detour, y: eb.y }, eb, b]);
  }

  let best = null;
  let bestScore = Infinity;
  for (const raw of candidates) {
    const path = simplify(raw);
    const crossings = countObstacleCrossings(path, obstacles, true);
    const overlap = countPathOverlap(path, ctx, gridSize);
    const len = pathLength(path);
    const bends = path.length - 2;
    // Kablo-kablo örtüşmesi (overlap) ağır cezalı: önce cihazdan kaç, sonra
    // diğer kablolarla üst üste binme, sonra kıvrım/uzunluk.
    const score = crossings * 100000 + overlap * 4000 + bends * 80 + len;
    if (score < bestScore) { bestScore = score; best = path; }
  }
  return best;
}

export function routeWire(start, end, obstacles = [], stub = 20, ctx = null, gridSize = 10) {
  const path = tryRoute(start, end, obstacles, stub, ctx, gridSize);
  // Bu kablonun segmentlerini ctx'e işle ki sonraki kablolar üstünden geçmesin.
  if (ctx && path) markPathUsed(path, ctx, gridSize);
  return path;
}

// ====== Min-heap for A* ======
class MinHeap {
  constructor() { this.arr = []; }
  push(node) {
    this.arr.push(node);
    let i = this.arr.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.arr[p].f <= this.arr[i].f) break;
      const t = this.arr[p]; this.arr[p] = this.arr[i]; this.arr[i] = t;
      i = p;
    }
  }
  pop() {
    if (!this.arr.length) return null;
    const top = this.arr[0];
    const last = this.arr.pop();
    if (this.arr.length) {
      this.arr[0] = last;
      let i = 0; const n = this.arr.length;
      while (true) {
        const l = i * 2 + 1, r = i * 2 + 2;
        let s = i;
        if (l < n && this.arr[l].f < this.arr[s].f) s = l;
        if (r < n && this.arr[r].f < this.arr[s].f) s = r;
        if (s === i) break;
        const t = this.arr[s]; this.arr[s] = this.arr[i]; this.arr[i] = t;
        i = s;
      }
    }
    return top;
  }
  get size() { return this.arr.length; }
}

// ====== A* over grid (with overlap context) ======
// ctx: { usedHoriz: Set, usedVert: Set }   shared mutable context for sequential routing
export function aStarRoute(start, end, obstacles = [], ctx = null, opts = {}) {
  const {
    gridSize = 10,
    stub = 24,
    bendPenalty = 14,
    overlapPenalty = 600,
    obstaclePad = 8,
    boundsPad = 400,
    iterLimit = 200000,
  } = opts;

  const ea = exitPoint(start, stub);
  const eb = exitPoint(end, stub);
  const snap = (n) => Math.round(n / gridSize) * gridSize;
  const sx = snap(ea.x), sy = snap(ea.y);
  const tx = snap(eb.x), ty = snap(eb.y);

  let minX = Math.min(sx, tx) - boundsPad;
  let maxX = Math.max(sx, tx) + boundsPad;
  let minY = Math.min(sy, ty) - boundsPad;
  let maxY = Math.max(sy, ty) + boundsPad;
  for (const obs of obstacles) {
    minX = Math.min(minX, obs.x - 80);
    maxX = Math.max(maxX, obs.x + obs.w + 80);
    minY = Math.min(minY, obs.y - 80);
    maxY = Math.max(maxY, obs.y + obs.h + 80);
  }

  // Build the per-port "exit corridor": small carve-outs at the start and end stubs
  // so the wire can leave/enter the port without the start/end device blocking it.
  const corridorPad = stub + gridSize;
  const isInCorridor = (x, y) => {
    // Inside a tight rectangle from port to its stub (perpendicular axis)
    const inRect = (p, halfW) => {
      if (p.side === 'top' || p.side === 'bottom') {
        return x >= p.x - halfW && x <= p.x + halfW &&
               (p.side === 'top' ? y >= p.y - corridorPad && y <= p.y : y >= p.y && y <= p.y + corridorPad);
      }
      return y >= p.y - halfW && y <= p.y + halfW &&
             (p.side === 'left' ? x >= p.x - corridorPad && x <= p.x : x >= p.x && x <= p.x + corridorPad);
    };
    return inRect(start, gridSize) || inRect(end, gridSize);
  };

  const isObstacle = (x, y) => {
    if (isInCorridor(x, y)) return false;
    for (const obs of obstacles) {
      if (x >= obs.x - obstaclePad && x <= obs.x + obs.w + obstaclePad &&
          y >= obs.y - obstaclePad && y <= obs.y + obs.h + obstaclePad) return true;
    }
    return false;
  };

  const usedHoriz = ctx?.usedHoriz || new Set();
  const usedVert  = ctx?.usedVert  || new Set();

  const DIRS = [
    { dx: gridSize,  dy: 0,         name: 'R' },
    { dx: -gridSize, dy: 0,         name: 'L' },
    { dx: 0,         dy: gridSize,  name: 'D' },
    { dx: 0,         dy: -gridSize, name: 'U' },
  ];
  const h = (x, y) => Math.abs(x - tx) + Math.abs(y - ty);

  const heap = new MinHeap();
  const seen = new Map();
  heap.push({ x: sx, y: sy, dir: null, g: 0, f: h(sx, sy), parent: null });

  let goal = null;
  let iter = 0;
  while (heap.size > 0 && iter++ < iterLimit) {
    const node = heap.pop();
    if (node.x === tx && node.y === ty) { goal = node; break; }
    const key = `${node.x},${node.y},${node.dir || 'X'}`;
    const prev = seen.get(key);
    if (prev !== undefined && prev <= node.g) continue;
    seen.set(key, node.g);

    for (const d of DIRS) {
      // No 180° reversals
      if (node.dir === 'R' && d.name === 'L') continue;
      if (node.dir === 'L' && d.name === 'R') continue;
      if (node.dir === 'U' && d.name === 'D') continue;
      if (node.dir === 'D' && d.name === 'U') continue;
      const nx = node.x + d.dx;
      const ny = node.y + d.dy;
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
      if (isObstacle(nx, ny)) continue;

      let cost = gridSize;
      if (node.dir && node.dir !== d.name) cost += bendPenalty;
      const horiz = d.name === 'R' || d.name === 'L';
      const segKey = horiz
        ? `H:${ny}:${Math.min(node.x, nx)}`
        : `V:${nx}:${Math.min(node.y, ny)}`;
      const set = horiz ? usedHoriz : usedVert;
      if (set.has(segKey)) cost += overlapPenalty;

      heap.push({
        x: nx, y: ny, dir: d.name,
        g: node.g + cost,
        f: node.g + cost + h(nx, ny),
        parent: node,
      });
    }
  }

  if (!goal) {
    // Fall back to fast L/Z route if A* failed
    return tryRoute(start, end, obstacles, stub);
  }

  const pts = [];
  let cur = goal;
  while (cur) { pts.unshift({ x: cur.x, y: cur.y }); cur = cur.parent; }
  const full = simplify([{ x: start.x, y: start.y }, ...pts, { x: end.x, y: end.y }]);

  if (ctx) markPathUsed(full, ctx, gridSize);
  return full;
}

export function markPathUsed(points, ctx, gridSize = 10) {
  if (!ctx) return;
  if (!ctx.usedHoriz) ctx.usedHoriz = new Set();
  if (!ctx.usedVert) ctx.usedVert = new Set();
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (a.y === b.y) {
      const min = Math.min(a.x, b.x), max = Math.max(a.x, b.x);
      for (let x = Math.round(min / gridSize) * gridSize; x < max; x += gridSize) {
        ctx.usedHoriz.add(`H:${Math.round(a.y / gridSize) * gridSize}:${x}`);
      }
    } else if (a.x === b.x) {
      const min = Math.min(a.y, b.y), max = Math.max(a.y, b.y);
      for (let y = Math.round(min / gridSize) * gridSize; y < max; y += gridSize) {
        ctx.usedVert.add(`V:${Math.round(a.x / gridSize) * gridSize}:${y}`);
      }
    }
  }
}

// ====== SVG path with rounded corners ======
export function pathToSvgD(points, cornerRadius = 4) {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    const inDx = Math.sign(cur.x - prev.x);
    const inDy = Math.sign(cur.y - prev.y);
    const outDx = Math.sign(next.x - cur.x);
    const outDy = Math.sign(next.y - cur.y);
    const inLen = Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y);
    const outLen = Math.abs(next.x - cur.x) + Math.abs(next.y - cur.y);
    const r = Math.min(cornerRadius, inLen / 2, outLen / 2);
    const lineEndX = cur.x - inDx * r;
    const lineEndY = cur.y - inDy * r;
    d += ` L ${lineEndX} ${lineEndY}`;
    const arcEndX = cur.x + outDx * r;
    const arcEndY = cur.y + outDy * r;
    d += ` Q ${cur.x} ${cur.y} ${arcEndX} ${arcEndY}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

// ====== Segment-only path (no corner smoothing) ======
export function segmentToSvgD(a, b) {
  return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
}

// ====== Crossings (for bridge effect) ======
export function findPathCrossings(pathA, pathB) {
  const crossings = [];
  for (let i = 0; i < pathA.length - 1; i++) {
    const a1 = pathA[i], a2 = pathA[i + 1];
    const aHoriz = a1.y === a2.y;
    for (let j = 0; j < pathB.length - 1; j++) {
      const b1 = pathB[j], b2 = pathB[j + 1];
      const bHoriz = b1.y === b2.y;
      if (aHoriz === bHoriz) continue;
      if (aHoriz) {
        const y = a1.y, x = b1.x;
        const aMinX = Math.min(a1.x, a2.x), aMaxX = Math.max(a1.x, a2.x);
        const bMinY = Math.min(b1.y, b2.y), bMaxY = Math.max(b1.y, b2.y);
        if (x >= aMinX && x <= aMaxX && y >= bMinY && y <= bMaxY) {
          crossings.push({ x, y, horizSegment: 'A' });
        }
      } else {
        const x = a1.x, y = b1.y;
        const aMinY = Math.min(a1.y, a2.y), aMaxY = Math.max(a1.y, a2.y);
        const bMinX = Math.min(b1.x, b2.x), bMaxX = Math.max(b1.x, b2.x);
        if (y >= aMinY && y <= aMaxY && x >= bMinX && x <= bMaxX) {
          crossings.push({ x, y, horizSegment: 'B' });
        }
      }
    }
  }
  return crossings;
}
