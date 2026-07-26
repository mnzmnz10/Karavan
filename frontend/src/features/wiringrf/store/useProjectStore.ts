import { create } from "zustand";
import { nanoid } from "nanoid";
import {
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from "@xyflow/react";
import type {
  ProductNodeData,
  CableEdgeData,
  ProjectMeta,
  LayerId,
  ProjectSnapshot,
  ProjectVersion,
  Port,
} from "@/features/wiringrf/types";
import { canConnect } from "@/features/wiringrf/lib/rules";
import { CATALOG_MAP } from "@/features/wiringrf/data/catalog";
import {
  defaultCableTypeForRole,
  CABLE_TYPES,
  layerForCableType,
} from "@/features/wiringrf/data/cables";
import { loadProject, saveProject } from "@/features/wiringrf/lib/storage";
import {
  createProject,
  getProject,
  listProjects,
  updateProject,
  type BackendProject,
} from "@/features/wiringrf/lib/backendApi";

export type AppNode = Node<ProductNodeData>;
export type AppEdge = Edge<CableEdgeData>;

export type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

const LAYER_DEFAULT: Record<LayerId, boolean> = {
  products: true,
  dc: true,
  ac: true,
  data: true,
  ground: true,
  labels: true,
  notes: true,
};

const LAYER_LOCK_DEFAULT: Record<LayerId, boolean> = {
  products: false,
  dc: false,
  ac: false,
  data: false,
  ground: false,
  labels: false,
  notes: false,
};

interface HistoryEntry {
  nodes: AppNode[];
  edges: AppEdge[];
}

interface ProjectState {
  projectId: string;
  meta: ProjectMeta;
  nodes: AppNode[];
  edges: AppEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  layers: Record<LayerId, boolean>;
  layerLocks: Record<LayerId, boolean>;
  snapToGrid: boolean;
  past: HistoryEntry[];
  future: HistoryEntry[];
  versions: ProjectVersion[];
  _dragging: boolean;

  // setters
  setMeta: (patch: Partial<ProjectMeta>) => void;
  onNodesChange: (changes: NodeChange<AppNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<AppEdge>[]) => void;
  onConnect: (c: Connection) => void;
  addNodeFromTemplate: (templateId: string, x: number, y: number) => void;
  updateNodeData: (id: string, patch: Partial<ProductNodeData>) => void;
  updateEdgeData: (id: string, patch: Partial<CableEdgeData>) => void;
  addPort: (nodeId: string, port: Port) => void;
  updatePort: (nodeId: string, portId: string, patch: Partial<Port>) => void;
  deletePort: (nodeId: string, portId: string) => void;
  setNodeImage: (nodeId: string, imageUrl: string | undefined) => void;
  rotateNode: (id: string) => void;
  deleteSelection: () => void;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  clearSelection: () => void;
  alignNodes: (mode: AlignMode) => void;
  distributeNodes: (axis: "h" | "v") => void;
  createVersion: (label: string) => void;
  restoreVersion: (id: string) => void;
  toggleLayer: (id: LayerId) => void;
  toggleLayerLock: (id: LayerId) => void;
  setSnapToGrid: (v: boolean) => void;
  undo: () => void;
  redo: () => void;
  loadSnapshot: (snapshot: ProjectSnapshot, meta?: Partial<ProjectMeta>, opts?: { undoable?: boolean }) => void;
  exportSnapshot: () => ProjectSnapshot;
  saveToBackend: () => Promise<BackendProject>;
  loadFromBackend: (id: string) => Promise<BackendProject>;
  listBackendProjects: () => Promise<BackendProject[]>;
  newProject: () => void;
  commit: () => void; // push current state to history
}

const LOCAL_DRAFT_ID = "default";

function findPort(node: AppNode | undefined, portId?: string | null): Port | undefined {
  if (!node || !portId) return undefined;
  return node.data.ports.find((p) => p.id === portId);
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useProjectStore = create<ProjectState>((set, get) => {
  const persist = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const s = get();
      saveProject({
        id: LOCAL_DRAFT_ID,
        meta: s.meta,
        snapshot: s.exportSnapshot(),
        versions: s.versions,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }, 600);
  };

  // Capture the CURRENT (pre-mutation) state into history. Call BEFORE mutating.
  // `key` coalesces bursts: repeated same-key checkpoints within 800ms collapse to one
  // undo step (e.g. typing in a field). Pass a unique key for discrete actions.
  let lastKey = "";
  let lastAt = 0;
  // Reset coalescing so the next mutation always starts a fresh undo branch.
  const resetCoalesce = () => { lastKey = ""; lastAt = 0; };
  const checkpoint = (key: string) => {
    const now = Date.now();
    if (key && key === lastKey && now - lastAt < 800) {
      lastAt = now;
      // A new mutation (even if coalesced into the same undo step) invalidates redo.
      if (get().future.length) set({ future: [] });
      return;
    }
    lastKey = key;
    lastAt = now;
    const { nodes, edges, past } = get();
    set({ past: [...past.slice(-49), { nodes, edges }], future: [] });
  };

  return {
    projectId: LOCAL_DRAFT_ID,
    meta: { name: "Yeni Proje", systemVoltage: "12V", date: new Date().toISOString().slice(0, 10), revision: "0" },
    nodes: [],
    edges: [],
    selectedNodeId: null,
    selectedEdgeId: null,
    layers: { ...LAYER_DEFAULT },
    layerLocks: { ...LAYER_LOCK_DEFAULT },
    snapToGrid: true,
    past: [],
    future: [],
    versions: [],
    _dragging: false,

    setMeta: (patch) => {
      set((s) => ({ meta: { ...s.meta, ...patch } }));
      persist();
    },

    onNodesChange: (changes) => {
      // Capture pre-drag state once, at drag start, so undo restores the old position.
      const dragStart = changes.some((c) => c.type === "position" && c.dragging === true);
      if (dragStart && !get()._dragging) {
        checkpoint(`drag_${nanoid(4)}`);
        set({ _dragging: true });
      }
      set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) }));
      if (changes.some((c) => c.type === "position" && c.dragging === false)) {
        set({ _dragging: false });
        persist();
      }
    },

    onEdgesChange: (changes) => {
      // Data mutations (remove/add/reconnect) are undoable; pure selection changes are not.
      if (changes.some((c) => c.type === "remove" || c.type === "add")) {
        checkpoint(`edgechange_${nanoid(4)}`);
      }
      set((s) => ({ edges: applyEdgeChanges(changes, s.edges) }));
      persist();
    },

    onConnect: (c) => {
      const { nodes, edges } = get();
      const sourceNode = nodes.find((n) => n.id === c.source);
      const targetNode = nodes.find((n) => n.id === c.target);
      const sp = findPort(sourceNode, c.sourceHandle);
      const tp = findPort(targetNode, c.targetHandle);
      // Hard guard: reject electrically invalid connections before they hit the canvas.
      const check = canConnect(sp, tp, c.source === c.target, {
        targetNodeId: c.target,
        targetHandle: c.targetHandle,
        existingEdges: edges,
      });
      if (!check.ok) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("kablo:connect-rejected", { detail: check.reason }));
        }
        return;
      }
      const role = sp?.role ?? tp?.role ?? "positive";
      const cableType = defaultCableTypeForRole(role);
      const def = CABLE_TYPES[cableType];
      const size =
        sp?.recommendedCableSize ?? tp?.recommendedCableSize ?? "6mm²";
      const fuse = sp?.recommendedFuse ?? tp?.recommendedFuse;
      checkpoint(`connect_${nanoid(4)}`);
      const edge: AppEdge = {
        id: `e_${nanoid(6)}`,
        source: c.source!,
        target: c.target!,
        sourceHandle: c.sourceHandle,
        targetHandle: c.targetHandle,
        type: "cable",
        data: {
          cableType,
          color: def.color,
          size,
          fuse,
          label: fuse ? `${size} / ${fuse}` : size,
          arrow: false,
          layer: layerForCableType(cableType),
        },
      };
      set((s) => ({ edges: [...s.edges, edge], selectedEdgeId: edge.id, selectedNodeId: null }));
      persist();
    },

    addNodeFromTemplate: (templateId, x, y) => {
      const tpl = CATALOG_MAP[templateId];
      if (!tpl) return;
      checkpoint(`add_${nanoid(4)}`);
      const node: AppNode = {
        id: `n_${nanoid(6)}`,
        type: "product",
        position: { x, y },
        data: {
          templateId: tpl.id,
          label: tpl.name,
          brand: tpl.brand,
          model: tpl.model,
          category: tpl.category,
          voltage: tpl.voltage,
          acdc: tpl.acdc,
          icon: tpl.icon,
          accent: tpl.accent,
          ports: tpl.ports.map((p) => ({ ...p })),
          width: tpl.width,
          height: tpl.height,
          rotation: 0,
        },
      };
      set((s) => ({ nodes: [...s.nodes, node], selectedNodeId: node.id, selectedEdgeId: null }));
      persist();
    },

    updateNodeData: (id, patch) => {
      // Coalesce per node+field so a burst of typing collapses to one undo step.
      checkpoint(`node_${id}_${Object.keys(patch).join(",")}`);
      set((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
        ),
      }));
      persist();
    },

    updateEdgeData: (id, patch) => {
      checkpoint(`edge_${id}_${Object.keys(patch).join(",")}`);
      set((s) => ({
        edges: s.edges.map((e) =>
          e.id === id ? { ...e, data: { ...e.data!, ...patch } } : e,
        ),
      }));
      persist();
    },

    addPort: (nodeId, port) => {
      checkpoint(`addport_${nanoid(4)}`);
      set((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ports: [...n.data.ports, port] } } : n,
        ),
      }));
      persist();
    },

    updatePort: (nodeId, portId, patch) => {
      checkpoint(`port_${nodeId}_${portId}_${Object.keys(patch).join(",")}`);
      set((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, ports: n.data.ports.map((p) => (p.id === portId ? { ...p, ...patch } : p)) } }
            : n,
        ),
      }));
      persist();
    },

    deletePort: (nodeId, portId) => {
      checkpoint(`delport_${nanoid(4)}`);
      set((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ports: n.data.ports.filter((p) => p.id !== portId) } } : n,
        ),
        // Drop any cables attached to the removed port.
        edges: s.edges.filter(
          (e) => !((e.source === nodeId && e.sourceHandle === portId) || (e.target === nodeId && e.targetHandle === portId)),
        ),
      }));
      persist();
    },

    setNodeImage: (nodeId, imageUrl) => {
      checkpoint(`img_${nanoid(4)}`);
      set((s) => ({
        nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, imageUrl } } : n)),
      }));
      persist();
    },

    rotateNode: (id) => {
      checkpoint(`rotate_${nanoid(4)}`);
      set((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === id
            ? { ...n, data: { ...n.data, rotation: ((n.data.rotation + 90) % 360) as number } }
            : n,
        ),
      }));
      persist();
    },

    deleteSelection: () => {
      const { selectedNodeId, selectedEdgeId, nodes, edges } = get();
      // Collect everything selected (React Flow multi-select flags + panel selection).
      const delNodes = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
      if (selectedNodeId) delNodes.add(selectedNodeId);
      const delEdges = new Set(edges.filter((e) => e.selected).map((e) => e.id));
      if (selectedEdgeId) delEdges.add(selectedEdgeId);
      if (delNodes.size === 0 && delEdges.size === 0) return;
      checkpoint(`delete_${nanoid(4)}`);
      set((s) => ({
        nodes: s.nodes.filter((n) => !delNodes.has(n.id)),
        edges: s.edges.filter(
          (e) => !delEdges.has(e.id) && !delNodes.has(e.source) && !delNodes.has(e.target),
        ),
        selectedNodeId: null,
        selectedEdgeId: null,
      }));
      persist();
    },

    selectNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),
    selectEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),
    clearSelection: () => set({ selectedNodeId: null, selectedEdgeId: null }),

    alignNodes: (mode) => {
      const sel = get().nodes.filter((n) => n.selected);
      if (sel.length < 2) return;
      checkpoint(`align_${nanoid(4)}`);
      const w = (n: AppNode) => n.data.width;
      const h = (n: AppNode) => n.data.height;
      const lefts = sel.map((n) => n.position.x);
      const rights = sel.map((n) => n.position.x + w(n));
      const tops = sel.map((n) => n.position.y);
      const bottoms = sel.map((n) => n.position.y + h(n));
      const minL = Math.min(...lefts), maxR = Math.max(...rights);
      const minT = Math.min(...tops), maxB = Math.max(...bottoms);
      const cx = (minL + maxR) / 2, cy = (minT + maxB) / 2;
      const ids = new Set(sel.map((n) => n.id));
      set((s) => ({
        nodes: s.nodes.map((n) => {
          if (!ids.has(n.id)) return n;
          let { x, y } = n.position;
          switch (mode) {
            case "left": x = minL; break;
            case "right": x = maxR - w(n); break;
            case "hcenter": x = cx - w(n) / 2; break;
            case "top": y = minT; break;
            case "bottom": y = maxB - h(n); break;
            case "vcenter": y = cy - h(n) / 2; break;
          }
          return { ...n, position: { x, y } };
        }),
      }));
      persist();
    },

    distributeNodes: (axis) => {
      const sel = get().nodes.filter((n) => n.selected);
      if (sel.length < 3) return;
      checkpoint(`dist_${nanoid(4)}`);
      const sizeOf = (n: AppNode) => (axis === "h" ? n.data.width : n.data.height);
      const posOf = (n: AppNode) => (axis === "h" ? n.position.x : n.position.y);
      const sorted = [...sel].sort((a, b) => posOf(a) - posOf(b));
      const first = sorted[0], last = sorted[sorted.length - 1];
      // Free space = from first's trailing edge to last's leading edge, minus interior sizes.
      const interiorSize = sorted.slice(1, -1).reduce((sum, n) => sum + sizeOf(n), 0);
      const free = posOf(last) - (posOf(first) + sizeOf(first)) - interiorSize;
      const gap = Math.max(8, free / (sorted.length - 1)); // never overlap
      let cursor = posOf(first) + sizeOf(first) + gap;
      const newPos = new Map<string, number>();
      for (let i = 1; i < sorted.length - 1; i++) {
        newPos.set(sorted[i].id, cursor);
        cursor += sizeOf(sorted[i]) + gap;
      }
      set((s) => ({
        nodes: s.nodes.map((n) => {
          if (!newPos.has(n.id)) return n;
          const v = newPos.get(n.id)!;
          return { ...n, position: axis === "h" ? { ...n.position, x: v } : { ...n.position, y: v } };
        }),
      }));
      persist();
    },

    createVersion: (label) => {
      const { exportSnapshot, versions } = get();
      const v: ProjectVersion = {
        id: `v_${nanoid(6)}`,
        createdAt: new Date().toISOString(),
        label: label || `Versiyon ${versions.length + 1}`,
        snapshot: exportSnapshot(),
      };
      set({ versions: [v, ...versions].slice(0, 50) });
      persist();
    },

    restoreVersion: (id) => {
      const { versions, loadSnapshot } = get();
      const v = versions.find((x) => x.id === id);
      if (v) loadSnapshot(v.snapshot);
    },

    toggleLayer: (id) =>
      set((s) => ({ layers: { ...s.layers, [id]: !s.layers[id] } })),

    toggleLayerLock: (id) =>
      set((s) => ({ layerLocks: { ...s.layerLocks, [id]: !s.layerLocks[id] } })),

    setSnapToGrid: (v) => set({ snapToGrid: v }),

    undo: () => {
      resetCoalesce();
      const { past, nodes, edges, future } = get();
      if (past.length === 0) return;
      const prev = past[past.length - 1];
      set({
        past: past.slice(0, -1),
        future: [{ nodes, edges }, ...future].slice(0, 50),
        nodes: prev.nodes,
        edges: prev.edges,
      });
      persist();
    },

    redo: () => {
      resetCoalesce();
      const { future, nodes, edges, past } = get();
      if (future.length === 0) return;
      const next = future[0];
      set({
        future: future.slice(1),
        past: [...past, { nodes, edges }],
        nodes: next.nodes,
        edges: next.edges,
      });
      persist();
    },

    loadSnapshot: (snapshot, meta, opts) => {
      resetCoalesce();
      // Kullanici kaynakli toplu yuklemeler tek undo adimi olarak geri alinabilir.
      if (opts?.undoable) {
        checkpoint(`snapshot_${nanoid(4)}`);
      }
      const nodes: AppNode[] = snapshot.nodes.map((n) => ({
        id: n.id,
        type: "product",
        position: n.position,
        data: n.data,
      }));
      const edges: AppEdge[] = snapshot.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        type: "cable",
        data: e.data,
      }));
      set((s) => ({
        nodes,
        edges,
        meta: meta ? { ...s.meta, ...meta } : s.meta,
        past: opts?.undoable ? s.past : [],
        future: [],
        selectedNodeId: null,
        selectedEdgeId: null,
      }));
      persist();
    },

    exportSnapshot: () => {
      const { nodes, edges } = get();
      return {
        nodes: nodes.map((n) => ({ id: n.id, position: n.position, data: n.data })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
          data: e.data!,
        })),
      };
    },

    saveToBackend: async () => {
      const s = get();
      const payload = {
        name: s.meta.name?.trim() || "Yeni Proje",
        description: s.meta.notes ?? "",
        data: {
          snapshot: s.exportSnapshot(),
          meta: s.meta,
          versions: s.versions,
        },
      };
      const currentId = s.projectId && s.projectId !== LOCAL_DRAFT_ID ? s.projectId : "";
      const project = currentId
        ? await updateProject(currentId, payload)
        : await createProject(payload);
      set({ projectId: project.id });
      persist();
      return project;
    },

    loadFromBackend: async (id) => {
      const project = await getProject(id);
      const snapshot = project.data?.snapshot;
      if (!snapshot || !Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.edges)) {
        throw new Error("Proje verisi eksik veya eski formatta.");
      }
      const backendMeta: Partial<ProjectMeta> = project.data?.meta ?? {};
      get().loadSnapshot(
        snapshot,
        {
          ...backendMeta,
          name: backendMeta.name || project.name,
          notes: backendMeta.notes ?? project.description,
        },
      );
      set({
        projectId: project.id,
        versions: Array.isArray(project.data?.versions) ? project.data.versions : [],
      });
      persist();
      return project;
    },

    listBackendProjects: () => listProjects(),

    newProject: () => {
      resetCoalesce();
      set({
        projectId: LOCAL_DRAFT_ID,
        nodes: [],
        edges: [],
        meta: { name: "Yeni Proje", systemVoltage: "12V", date: new Date().toISOString().slice(0, 10), revision: "0" },
        past: [],
        future: [],
        versions: [], // new project starts with no version history
        layerLocks: { ...LAYER_LOCK_DEFAULT },
        selectedNodeId: null,
        selectedEdgeId: null,
      });
      persist();
    },

    commit: () => checkpoint(`commit_${nanoid(4)}`),
  };
});

// Expose the store for debugging/automation in the browser console.
if (typeof window !== "undefined") {
  (window as unknown as { __kabloStore?: typeof useProjectStore }).__kabloStore = useProjectStore;
}

// Hydrate from localStorage on first client load.
export function hydrateFromStorage() {
  const saved = loadProject(LOCAL_DRAFT_ID);
  if (saved) {
    useProjectStore.getState().loadSnapshot(saved.snapshot, saved.meta);
    useProjectStore.setState({ versions: saved.versions ?? [] });
  }
}
