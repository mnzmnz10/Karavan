import { create } from 'zustand';
import { getDeviceTemplate } from '@/features/wiring/lib/devices';

const uid = (prefix = 'id') => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;

const initialState = () => ({
  projectId: null,
  projectName: 'Adsız Proje',
  vehicleName: '',
  author: '',
  description: '',
  paper: 'A4',
  orientation: 'landscape',

  devices: [],
  wires: [],

  zoom: 1,
  panX: 0,
  panY: 0,

  selectedId: null,
  selectedType: null,
  multiSelect: [],
  logoId: null,
  routingMode: 'astar', // 'astar' or 'fast'
  computedPaths: {},
  customTemplates: [], // user-saved device library entries (persisted in MongoDB)

  tool: 'select',
  wireDrawing: null,
  pendingWireDefaults: { wirePresetId: 'nyaf_25', color: '#FF3B30', thickness: 2.4, style: 'solid' },

  gridSize: 20,
  showGrid: true,
  snapToGrid: true,
  showLabels: true,
  showBridges: true,

  clipboard: null,
});

export const useEditorStore = create((set, get) => ({
  ...initialState(),
  history: [],
  historyIndex: -1,

  // ===== History =====
  pushHistory: () => set((s) => {
    const snap = JSON.parse(JSON.stringify({ devices: s.devices, wires: s.wires }));
    // Değişiklik yoksa (örn. taşımadan tıklama) tekrar kaydetme — history şişmesin.
    const last = s.history[s.historyIndex];
    if (last && JSON.stringify(last) === JSON.stringify(snap)) return {};
    const trimmed = s.history.slice(0, s.historyIndex + 1);
    trimmed.push(snap);
    const trimmed2 = trimmed.slice(-60);
    return { history: trimmed2, historyIndex: trimmed2.length - 1 };
  }),
  undo: () => set((s) => {
    if (s.historyIndex <= 0) return {};
    const idx = s.historyIndex - 1;
    const snap = s.history[idx];
    return { devices: JSON.parse(JSON.stringify(snap.devices)), wires: JSON.parse(JSON.stringify(snap.wires)), historyIndex: idx, selectedId: null, selectedType: null };
  }),
  redo: () => set((s) => {
    if (s.historyIndex >= s.history.length - 1) return {};
    const idx = s.historyIndex + 1;
    const snap = s.history[idx];
    return { devices: JSON.parse(JSON.stringify(snap.devices)), wires: JSON.parse(JSON.stringify(snap.wires)), historyIndex: idx, selectedId: null, selectedType: null };
  }),

  // ===== Project =====
  setProjectMeta: (meta) => set((s) => ({ ...s, ...meta })),
  loadProject: (proj) => set(() => {
    const data = proj.data || {};
    return {
      ...initialState(),
      projectId: proj.id,
      projectName: proj.name || 'Adsız Proje',
      vehicleName: proj.vehicle_name || '',
      author: proj.author || '',
      description: proj.description || '',
      devices: data.devices || [],
      wires: data.wires || [],
      paper: data.paper || 'A4',
      orientation: data.orientation || 'landscape',
      logoId: data.logoId || null,
      routingMode: data.routingMode || 'astar',
      history: [{ devices: data.devices || [], wires: data.wires || [] }],
      historyIndex: 0,
    };
  }),
  exportJson: () => {
    const s = get();
    return {
      name: s.projectName,
      vehicle_name: s.vehicleName,
      author: s.author,
      description: s.description,
      data: { devices: s.devices, wires: s.wires, paper: s.paper, orientation: s.orientation, logoId: s.logoId, routingMode: s.routingMode },
    };
  },
  newProject: () => set(() => ({ ...initialState(), history: [{ devices: [], wires: [] }], historyIndex: 0 })),

  // ===== Devices =====
  addDevice: (templateId, x, y) => {
    const tpl = getDeviceTemplate(templateId) || get().customTemplates.find((t) => t.id === templateId);
    if (!tpl) return;
    get().pushHistory();
    const device = {
      id: uid('d'),
      templateId,
      x,
      y,
      w: tpl.width,
      h: tpl.height,
      rotation: 0,
      name: tpl.name,
      brand: tpl.brand || '',
      model: tpl.model || '',
      notes: tpl.notes || '',
      ratingValue: tpl.rating_value || tpl.ratingValue || '',
      ratingUnit: tpl.rating_unit || tpl.ratingUnit || '',
      imageId: tpl.image_id || tpl.imageId || null,
      ports: (tpl.ports || []).map((p) => ({ ...p })),
    };
    set((s) => ({ devices: [...s.devices, device], selectedId: device.id, selectedType: 'device' }));
  },
  addCustomDevice: (name, w = 120, h = 80) => {
    get().pushHistory();
    const device = {
      id: uid('d'),
      templateId: 'custom',
      x: 200,
      y: 200,
      w,
      h,
      rotation: 0,
      name: name || 'Özel Cihaz',
      brand: '',
      model: '',
      notes: '',
      imageId: null,
      ports: [
        { id: uid('p'), name: '+', side: 'left', offset: 0.3, color: '#FF3B30' },
        { id: uid('p'), name: '-', side: 'left', offset: 0.7, color: '#1C1C1E' },
      ],
    };
    set((s) => ({ devices: [...s.devices, device], selectedId: device.id, selectedType: 'device' }));
  },
  updateDevice: (id, patch) => set((s) => ({
    devices: s.devices.map((d) => (d.id === id ? { ...d, ...patch } : d)),
  })),
  moveDevice: (id, x, y) => set((s) => ({
    devices: s.devices.map((d) => (d.id === id ? { ...d, x, y } : d)),
  })),
  removeDevice: (id) => {
    get().pushHistory();
    set((s) => ({
      devices: s.devices.filter((d) => d.id !== id),
      wires: s.wires.filter((w) => w.from.deviceId !== id && w.to.deviceId !== id),
      selectedId: null,
      selectedType: null,
    }));
  },
  bringForward: (id) => set((s) => {
    const idx = s.devices.findIndex((d) => d.id === id);
    if (idx < 0 || idx === s.devices.length - 1) return {};
    const arr = [...s.devices];
    [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
    return { devices: arr };
  }),
  sendBackward: (id) => set((s) => {
    const idx = s.devices.findIndex((d) => d.id === id);
    if (idx <= 0) return {};
    const arr = [...s.devices];
    [arr[idx], arr[idx - 1]] = [arr[idx - 1], arr[idx]];
    return { devices: arr };
  }),

  // ===== Ports =====
  addPort: (deviceId, port) => {
    get().pushHistory();
    set((s) => ({
      devices: s.devices.map((d) =>
        d.id === deviceId
          ? { ...d, ports: [...d.ports, { id: uid('p'), name: 'N', side: 'right', offset: 0.5, color: '#F8F9FA', ...port }] }
          : d
      ),
    }));
  },
  updatePort: (deviceId, portId, patch) => set((s) => ({
    devices: s.devices.map((d) =>
      d.id === deviceId
        ? { ...d, ports: d.ports.map((p) => (p.id === portId ? { ...p, ...patch } : p)) }
        : d
    ),
  })),
  removePort: (deviceId, portId) => {
    get().pushHistory();
    set((s) => ({
      devices: s.devices.map((d) =>
        d.id === deviceId ? { ...d, ports: d.ports.filter((p) => p.id !== portId) } : d
      ),
      wires: s.wires.filter(
        (w) => !((w.from.deviceId === deviceId && w.from.portId === portId) || (w.to.deviceId === deviceId && w.to.portId === portId))
      ),
    }));
  },

  // ===== Wires =====
  startWire: (deviceId, portId, color) => set({
    wireDrawing: { fromDeviceId: deviceId, fromPortId: portId, color: color || '#F8F9FA' },
  }),
  cancelWire: () => set({ wireDrawing: null }),
  finishWire: (toDeviceId, toPortId) => {
    const s = get();
    if (!s.wireDrawing) return;
    if (s.wireDrawing.fromDeviceId === toDeviceId && s.wireDrawing.fromPortId === toPortId) {
      set({ wireDrawing: null });
      return;
    }
    get().pushHistory();
    const wire = {
      id: uid('w'),
      from: { deviceId: s.wireDrawing.fromDeviceId, portId: s.wireDrawing.fromPortId },
      to: { deviceId: toDeviceId, portId: toPortId },
      color: s.wireDrawing.color || s.pendingWireDefaults.color,
      thickness: s.pendingWireDefaults.thickness,
      style: s.pendingWireDefaults.style,
      wirePresetId: s.pendingWireDefaults.wirePresetId,
      label: '',
      showLabel: true,
      manualPoints: null,
      lengthM: '',
    };
    set((st) => ({ wires: [...st.wires, wire], wireDrawing: null, selectedId: wire.id, selectedType: 'wire' }));
  },
  updateWire: (id, patch) => set((s) => ({
    wires: s.wires.map((w) => (w.id === id ? { ...w, ...patch } : w)),
  })),
  removeWire: (id) => {
    get().pushHistory();
    set((s) => ({ wires: s.wires.filter((w) => w.id !== id), selectedId: null, selectedType: null }));
  },

  // ===== Selection / view =====
  select: (id, type) => set({ selectedId: id, selectedType: type, multiSelect: [] }),
  selectMulti: (ids) => set({ multiSelect: ids, selectedId: null, selectedType: null }),
  addToMulti: (id) => set((s) => ({ multiSelect: s.multiSelect.includes(id) ? s.multiSelect : [...s.multiSelect, id] })),
  removeFromMulti: (id) => set((s) => ({ multiSelect: s.multiSelect.filter((x) => x !== id) })),
  moveMultiDevices: (delta) => set((s) => ({
    devices: s.devices.map((d) => (s.multiSelect.includes(d.id) ? { ...d, x: d.x + delta.x, y: d.y + delta.y } : d)),
  })),
  clearSelection: () => set({ selectedId: null, selectedType: null, multiSelect: [] }),
  setTool: (tool) => set((s) => ({ tool, wireDrawing: tool === 'wire' ? s.wireDrawing : null })),
  setZoom: (zoom) => set({ zoom: Math.max(0.2, Math.min(4, zoom)) }),
  setPan: (panX, panY) => set({ panX, panY }),
  zoomIn: () => set((s) => ({ zoom: Math.min(4, s.zoom * 1.2) })),
  zoomOut: () => set((s) => ({ zoom: Math.max(0.2, s.zoom / 1.2) })),
  resetView: () => set({ zoom: 1, panX: 0, panY: 0 }),

  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleSnap: () => set((s) => ({ snapToGrid: !s.snapToGrid })),
  toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),
  setGridSize: (size) => set({ gridSize: size }),

  // ===== Auto-arrange =====
  autoArrange: () => {
    const s = get();
    s.pushHistory();
    const grid = s.gridSize * 4;
    set((st) => ({
      devices: st.devices.map((d) => ({
        ...d,
        x: Math.round(d.x / grid) * grid,
        y: Math.round(d.y / grid) * grid,
      })),
    }));
  },

  // ===== Clipboard =====
  copySelection: () => {
    const s = get();
    if (s.selectedType === 'device') {
      const d = s.devices.find((x) => x.id === s.selectedId);
      if (d) set({ clipboard: { kind: 'device', payload: d } });
    }
  },
  paste: () => {
    const s = get();
    if (!s.clipboard) return;
    if (s.clipboard.kind === 'device') {
      s.pushHistory();
      const d = s.clipboard.payload;
      const newDev = { ...d, id: uid('d'), x: d.x + 30, y: d.y + 30, ports: d.ports.map((p) => ({ ...p, id: uid('p') })) };
      set((st) => ({ devices: [...st.devices, newDev], selectedId: newDev.id, selectedType: 'device' }));
    }
  },

  setWireDefaults: (patch) => set((s) => ({ pendingWireDefaults: { ...s.pendingWireDefaults, ...patch } })),
  setComputedPaths: (map) => set({ computedPaths: map }),
  setCustomTemplates: (items) => set({ customTemplates: Array.isArray(items) ? items : [] }),
}));

// Helper selectors
export function getPortAbsolute(device, port) {
  const { x, y, w, h } = device;
  if (port.side === 'top')    return { x: x + port.offset * w, y, side: 'top', color: port.color, name: port.name };
  if (port.side === 'bottom') return { x: x + port.offset * w, y: y + h, side: 'bottom', color: port.color, name: port.name };
  if (port.side === 'left')   return { x, y: y + port.offset * h, side: 'left', color: port.color, name: port.name };
  return { x: x + w, y: y + port.offset * h, side: 'right', color: port.color, name: port.name };
}
