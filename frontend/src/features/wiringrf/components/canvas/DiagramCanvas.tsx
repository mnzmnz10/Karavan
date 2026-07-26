import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  useReactFlow,
  type NodeTypes,
  type EdgeTypes,
  type NodeChange,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Connection, Edge } from "@xyflow/react";
import { ProductNode } from "./ProductNode";
import { CableEdge } from "./CableEdge";
import { HelperLines } from "./HelperLines";
import { SelectionToolbar } from "./SelectionToolbar";
import { RouteContext } from "./RouteContext";
import { useProjectStore, type AppEdge, type AppNode } from "@/features/wiringrf/store/useProjectStore";
import { canConnect } from "@/features/wiringrf/lib/rules";
import { getHelperLines } from "@/features/wiringrf/lib/helperLines";
import { computeRoutes } from "@/features/wiringrf/lib/router";

const nodeTypes: NodeTypes = { product: ProductNode };
const edgeTypes: EdgeTypes = { cable: CableEdge };

const GRID = 20;

export function DiagramCanvas() {
  const ref = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const nodes = useProjectStore((s) => s.nodes);
  const edges = useProjectStore((s) => s.edges);
  const layers = useProjectStore((s) => s.layers);
  const layerLocks = useProjectStore((s) => s.layerLocks);
  const snapToGrid = useProjectStore((s) => s.snapToGrid);
  const onNodesChange = useProjectStore((s) => s.onNodesChange);
  const onEdgesChange = useProjectStore((s) => s.onEdgesChange);
  const onConnect = useProjectStore((s) => s.onConnect);
  const addNodeFromTemplate = useProjectStore((s) => s.addNodeFromTemplate);
  const addProductNode = useProjectStore((s) => s.addProductNode);
  const selectNode = useProjectStore((s) => s.selectNode);
  const selectEdge = useProjectStore((s) => s.selectEdge);
  const clearSelection = useProjectStore((s) => s.clearSelection);
  const [helper, setHelper] = useState<{ horizontal?: number; vertical?: number }>({});

  const visibleNodes = useMemo(
    () => layers.products
      ? nodes.map((n): AppNode => ({
        ...n,
        draggable: !layerLocks.products,
        selectable: !layerLocks.products,
      }))
      : [],
    [nodes, layers.products, layerLocks.products],
  );
  const interactiveEdges = useMemo(
    () => edges.map((e): AppEdge => ({
      ...e,
      selectable: !layerLocks[e.data?.layer ?? "dc"],
    })),
    [edges, layerLocks],
  );

  // Obstacle-avoiding orthogonal routes, recomputed in real-time as geometry changes.
  const routeSig = nodes
    .map((n) => `${n.id}:${Math.round(n.position.x)},${Math.round(n.position.y)},${n.data.width},${n.data.height},${n.data.rotation},`
      + n.data.ports.map((p) => `${p.id}@${p.nx ?? p.side}:${p.ny ?? p.offset}`).join(","))
    .join("|") + "#" + edges.map((e) => `${e.id}:${e.source}.${e.sourceHandle}>${e.target}.${e.targetHandle}`).join("|");
  const routes = useMemo(
    () => {
      try {
        return computeRoutes(nodes, edges);
      } catch {
        return {}; // never let a routing error blank the diagram; edges fall back to smoothstep
      }
    },
    // routeSig is a derived digest of the exact node/edge geometry used by computeRoutes.
    [routeSig], // eslint-disable-line
  );
  useEffect(() => {
    (window as unknown as { __kabloRoutes?: unknown }).__kabloRoutes = routes;
  }, [routes]);

  // Draw cables above products (never hidden behind a card). Set inline on the React Flow
  // edge layers so it holds even if the CSS rule fails to hot-reload.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const apply = () => {
      const e = root.querySelector<HTMLElement>(".react-flow__edges");
      const l = root.querySelector<HTMLElement>(".react-flow__edgelabel-renderer");
      if (e) e.style.zIndex = "1001";
      if (l) l.style.zIndex = "1002";
    };
    apply();
    const t = setTimeout(apply, 120);
    return () => clearTimeout(t);
  }, []);

  // Intercept a single-node drag to compute alignment guides and snap to them.
  const handleNodesChange = useCallback(
    (changes: NodeChange<AppNode>[]) => {
      const drag = changes.find(
        (c): c is Extract<NodeChange<AppNode>, { type: "position" }> =>
          c.type === "position" && c.dragging === true && !!c.position,
      );
      if (drag) {
        const lines = getHelperLines(drag, useProjectStore.getState().nodes);
        if (lines.snapPosition.x !== undefined) drag.position!.x = lines.snapPosition.x;
        if (lines.snapPosition.y !== undefined) drag.position!.y = lines.snapPosition.y;
        setHelper({ horizontal: lines.horizontal, vertical: lines.vertical });
      } else if (changes.some((c) => c.type === "position" && c.dragging === false)) {
        setHelper({});
      }
      onNodesChange(changes);
    },
    [onNodesChange],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const productRaw = e.dataTransfer.getData("application/karavan-product");
      if (productRaw) {
        try {
          const product = JSON.parse(productRaw);
          addProductNode(product, pos.x - 70, pos.y - 52);
        } catch {
          /* geçersiz veri, yoksay */
        }
        return;
      }
      const templateId = e.dataTransfer.getData("application/kablo-template");
      if (!templateId) return;
      addNodeFromTemplate(templateId, pos.x - 75, pos.y - 50);
    },
    [screenToFlowPosition, addNodeFromTemplate, addProductNode],
  );

  const onSelectionChange = useCallback(
    ({ nodes: ns, edges: es }: OnSelectionChangeParams) => {
      if (ns[0]) selectNode(ns[0].id);
      else if (es[0]) selectEdge(es[0].id);
      else clearSelection();
    },
    [selectNode, selectEdge, clearSelection],
  );

  // Reject electrically invalid connections live, before they are created.
  const isValidConnection = useCallback(
    (c: Connection | Edge) => {
      const sn = nodes.find((n) => n.id === c.source);
      const tn = nodes.find((n) => n.id === c.target);
      const sp = sn?.data.ports.find((p) => p.id === c.sourceHandle);
      const tp = tn?.data.ports.find((p) => p.id === c.targetHandle);
      return canConnect(sp, tp, c.source === c.target, {
        targetNodeId: c.target,
        targetHandle: c.targetHandle,
        existingEdges: edges,
      }).ok;
    },
    [nodes, edges],
  );

  return (
    <div ref={ref} className="h-full w-full" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L8,3 z" fill="#334155" />
          </marker>
        </defs>
      </svg>
      <RouteContext.Provider value={routes}>
      <ReactFlow
        nodes={visibleNodes}
        edges={interactiveEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onSelectionChange={onSelectionChange}
        onPaneClick={() => { clearSelection(); }}
        // Silmeyi tek noktadan yönet: page.tsx keydown → deleteSelection (undo'lu,
        // panel seçimini de kapsar). React Flow'un dahili Backspace silmesi (undo'suz,
        // sadece .selected) çift-silme/tutarsız undo yapıyordu → kapat.
        deleteKeyCode={null}
        snapToGrid={snapToGrid}
        snapGrid={[GRID, GRID]}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={28}
        minZoom={0.15}
        maxZoom={3}
        panOnDrag
        selectionKeyCode="Shift"
        fitView
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: "cable" }}
      >
        <Background variant={BackgroundVariant.Dots} gap={GRID} size={1} color="#cbd5e1" />
        <Controls />
        <MiniMap pannable zoomable nodeColor={(n) => (n.data as { accent?: string })?.accent ?? "#94a3b8"} />
        <SelectionToolbar />
        <HelperLines horizontal={helper.horizontal} vertical={helper.vertical} />
      </ReactFlow>
      </RouteContext.Provider>
    </div>
  );
}
