import type { NodePositionChange } from "@xyflow/react";
import type { AppNode } from "@/features/wiringrf/store/useProjectStore";

export interface HelperLineResult {
  horizontal?: number;
  vertical?: number;
  snapPosition: { x?: number; y?: number };
}

const W = (n: AppNode) => n.data.width;
const H = (n: AppNode) => n.data.height;

// Compute alignment guides + snapped position for a node being dragged.
// Compares left/center/right and top/center/bottom against every other node.
export function getHelperLines(
  change: NodePositionChange,
  nodes: AppNode[],
  distance = 6,
): HelperLineResult {
  const dragged = nodes.find((n) => n.id === change.id);
  if (!change.position || !dragged) return { snapPosition: {} };

  const dw = W(dragged);
  const dh = H(dragged);
  const px = change.position.x;
  const py = change.position.y;

  const result: HelperLineResult = { snapPosition: {} };
  let minXdist = distance;
  let minYdist = distance;

  for (const n of nodes) {
    if (n.id === dragged.id) continue;
    const nx = n.position.x, ny = n.position.y;
    const nw = W(n), nh = H(n);

    // Vertical guides (align X): left-left, right-right, center-center, left-right, right-left.
    const xPairs: [number, number, number][] = [
      [px, nx, nx],                       // left edges
      [px + dw, nx + nw, nx + nw - dw],   // right edges
      [px + dw / 2, nx + nw / 2, nx + nw / 2 - dw / 2], // centers
      [px, nx + nw, nx + nw],             // dragged left to other right
      [px + dw, nx, nx - dw],             // dragged right to other left
    ];
    for (const [a, b, snapX] of xPairs) {
      const d = Math.abs(a - b);
      if (d < minXdist) {
        minXdist = d;
        result.vertical = b;
        result.snapPosition.x = snapX;
      }
    }

    // Horizontal guides (align Y).
    const yPairs: [number, number, number][] = [
      [py, ny, ny],
      [py + dh, ny + nh, ny + nh - dh],
      [py + dh / 2, ny + nh / 2, ny + nh / 2 - dh / 2],
      [py, ny + nh, ny + nh],
      [py + dh, ny, ny - dh],
    ];
    for (const [a, b, snapY] of yPairs) {
      const d = Math.abs(a - b);
      if (d < minYdist) {
        minYdist = d;
        result.horizontal = b;
        result.snapPosition.y = snapY;
      }
    }
  }

  return result;
}
