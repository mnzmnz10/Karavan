import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { useEditorStore, getPortAbsolute } from '@/features/wiring/store/editorStore';
import { routeWire, aStarRoute, pathToSvgD, findPathCrossings, exitPoint } from '@/features/wiring/lib/routing';
import { getDeviceTemplate } from '@/features/wiring/lib/devices';
import { getWirePreset } from '@/features/wiring/lib/wireTypes';
import { fileUrl } from '@/features/wiring/lib/api';

function getWireDisplayLabel(wire) {
  if (wire.label && wire.label.trim()) return wire.label;
  const preset = getWirePreset(wire.wirePresetId);
  return preset ? preset.name : '';
}

const A4 = { w: 1123, h: 794 }; // approx at 96dpi landscape
const A3 = { w: 1587, h: 1123 };

function paperSize(paper, orientation) {
  const base = paper === 'A3' ? A3 : A4;
  return orientation === 'portrait' ? { w: base.h, h: base.w } : base;
}

const CanvasInner = React.forwardRef(function CanvasInner(_, ref) {
  const store = useEditorStore();
  const {
    devices, wires, zoom, panX, panY, showGrid, gridSize, snapToGrid,
    tool, wireDrawing, selectedId, selectedType, showLabels, showBridges,
    paper, orientation, multiSelect, routingMode,
  } = store;

  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [panState, setPanState] = useState(null);
  const [dragDevice, setDragDevice] = useState(null);
  const [draggingWirePoint, setDraggingWirePoint] = useState(null);
  const [alignGuides, setAlignGuides] = useState({ vx: null, hy: null });
  const [dragLabel, setDragLabel] = useState(null);
  const [selRect, setSelRect] = useState(null);
  const [dragMulti, setDragMulti] = useState(null);
  const [resizeDevice, setResizeDevice] = useState(null);

  React.useImperativeHandle(ref, () => ({
    svgRef,
    fitToContent: () => {
      if (!devices.length || !containerRef.current) return;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const d of devices) {
        minX = Math.min(minX, d.x); minY = Math.min(minY, d.y);
        maxX = Math.max(maxX, d.x + d.w); maxY = Math.max(maxY, d.y + d.h);
      }
      const pad = 80;
      minX -= pad; minY -= pad; maxX += pad; maxY += pad;
      const w = maxX - minX, h = maxY - minY;
      const rect = containerRef.current.getBoundingClientRect();
      const zx = rect.width / w;
      const zy = rect.height / h;
      const z = Math.max(0.2, Math.min(4, Math.min(zx, zy)));
      store.setZoom(z);
      store.setPan(-minX * z + (rect.width - w * z) / 2, -minY * z + (rect.height - h * z) / 2);
    },
  }));

  const ps = paperSize(paper, orientation);

  // Convert client (screen) coords to canvas coords (within transformed group)
  const screenToCanvas = useCallback((clientX, clientY) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - panX) / zoom,
      y: (clientY - rect.top - panY) / zoom,
    };
  }, [panX, panY, zoom]);

  // ====== Resolve absolute port positions ======
  const portMap = useMemo(() => {
    const m = new Map();
    for (const d of devices) {
      for (const p of d.ports) {
        m.set(`${d.id}:${p.id}`, { ...getPortAbsolute(d, p), deviceId: d.id, portId: p.id });
      }
    }
    return m;
  }, [devices]);

  // ====== Compute routed paths for each wire ======
  const wirePaths = useMemo(() => {
    const obstacles = devices.map((d) => ({ x: d.x, y: d.y, w: d.w, h: d.h, id: d.id }));
    const ctx = { usedHoriz: new Set(), usedVert: new Set() };
    return wires.map((w) => {
      const from = portMap.get(`${w.from.deviceId}:${w.from.portId}`);
      const to = portMap.get(`${w.to.deviceId}:${w.to.portId}`);
      if (!from || !to) return { ...w, points: [] };
      if (w.manualPoints && w.manualPoints.length) {
        return { ...w, points: w.manualPoints, from, to };
      }
      // Pass ALL devices as obstacles. A* uses port-exit corridors so the start
      // and end devices' bbox still gets respected for the rest of the path.
      const pts = routingMode === 'astar'
        ? aStarRoute(from, to, obstacles, ctx, { gridSize: 10, stub: 24 })
        : routeWire(from, to, obstacles, 24, ctx, 10);
      return { ...w, points: pts, from, to };
    });
  }, [wires, devices, portMap, routingMode]);

  // ====== Etiket konumları: en uzun segment + çakışma çözümü ======
  const labelAnchors = useMemo(() => {
    // 1) Her kablo için etiketi EN UZUN segmentin ortasına yerleştir
    //    (kısa çıkış stub'larında toplanıp üst üste binmesin).
    const raw = wirePaths.map((w) => {
      const pts = w.points || [];
      if (pts.length < 2) return { id: w.id, x: 0, y: 0 };
      let bestLen = -1, ax = 0, ay = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i], q = pts[i + 1];
        const len = Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
        if (len > bestLen) { bestLen = len; ax = (p.x + q.x) / 2; ay = (p.y + q.y) / 2; }
      }
      return { id: w.id, x: ax, y: ay };
    });
    // 2) Yakın etiketleri dikey kaydırarak çakışmayı önle.
    const placed = [];
    const minDX = 50, minDY = 12;
    for (const a of raw) {
      let y = a.y, moved = true, guard = 0;
      while (moved && guard++ < 30) {
        moved = false;
        for (const p of placed) {
          if (Math.abs(p.x - a.x) < minDX && Math.abs(p.y - y) < minDY) {
            y = p.y + minDY;
            moved = true;
          }
        }
      }
      placed.push({ id: a.id, x: a.x, y });
    }
    const map = new Map();
    for (const p of placed) map.set(p.id, { x: p.x, y: p.y });
    return map;
  }, [wirePaths]);

  // ====== Crossings for bridge effect ======
  const crossings = useMemo(() => {
    if (!showBridges) return [];
    const list = [];
    for (let i = 0; i < wirePaths.length; i++) {
      for (let j = i + 1; j < wirePaths.length; j++) {
        const cs = findPathCrossings(wirePaths[i].points, wirePaths[j].points);
        for (const c of cs) {
          list.push({ wireId: wirePaths[j].id, x: c.x, y: c.y, horizSegment: c.horizSegment });
        }
      }
    }
    return list;
  }, [wirePaths, showBridges]);

  // Publish computed paths so other panels can read them (segment editing).
  useEffect(() => {
    const map = {};
    for (const wp of wirePaths) map[wp.id] = wp.points;
    store.setComputedPaths(map);
  }, [wirePaths]);

  const bridgesByWire = useMemo(() => {
    const m = new Map();
    for (const c of crossings) {
      if (!m.has(c.wireId)) m.set(c.wireId, []);
      m.get(c.wireId).push(c);
    }
    return m;
  }, [crossings]);

  // ====== Mouse handling ======
  const handleMouseDown = (e) => {
    if (e.target === svgRef.current || e.target.dataset.canvasBg === '1') {
      const { x, y } = screenToCanvas(e.clientX, e.clientY);
      if (e.shiftKey) {
        setSelRect({ x0: x, y0: y, x: x, y: y, w: 0, h: 0 });
      } else {
        setPanState({ startX: e.clientX, startY: e.clientY, originPanX: panX, originPanY: panY });
        if (tool === 'wire') store.cancelWire();
        store.clearSelection();
      }
    }
  };

  const handleMouseMove = (e) => {
    const { x, y } = screenToCanvas(e.clientX, e.clientY);
    setMouse({ x, y });

    if (selRect) {
      const nx = Math.min(selRect.x0, x);
      const ny = Math.min(selRect.y0, y);
      const nw = Math.abs(x - selRect.x0);
      const nh = Math.abs(y - selRect.y0);
      setSelRect({ ...selRect, x: nx, y: ny, w: nw, h: nh });
      return;
    }
    if (panState) {
      const dx = e.clientX - panState.startX;
      const dy = e.clientY - panState.startY;
      store.setPan(panState.originPanX + dx, panState.originPanY + dy);
      return;
    }
    if (dragMulti) {
      let dx = x - dragMulti.lastX;
      let dy = y - dragMulti.lastY;
      if (snapToGrid) {
        dx = Math.round(dx / gridSize) * gridSize;
        dy = Math.round(dy / gridSize) * gridSize;
        if (dx === 0 && dy === 0) return;
      }
      store.moveMultiDevices({ x: dx, y: dy });
      setDragMulti({ ...dragMulti, lastX: dragMulti.lastX + dx, lastY: dragMulti.lastY + dy });
      return;
    }
    if (resizeDevice) {
      const r = resizeDevice;
      const minW = 40, minH = 30;
      let nx = r.origX, ny = r.origY, nw = r.origW, nh = r.origH;
      if (r.corner.includes('e')) nw = Math.max(minW, x - r.origX);
      if (r.corner.includes('s')) nh = Math.max(minH, y - r.origY);
      if (r.corner.includes('w')) {
        const newX = Math.min(x, r.origX + r.origW - minW);
        nw = r.origW + (r.origX - newX);
        nx = newX;
      }
      if (r.corner.includes('n')) {
        const newY = Math.min(y, r.origY + r.origH - minH);
        nh = r.origH + (r.origY - newY);
        ny = newY;
      }
      if (snapToGrid) {
        nx = Math.round(nx / gridSize) * gridSize;
        ny = Math.round(ny / gridSize) * gridSize;
        nw = Math.max(minW, Math.round(nw / gridSize) * gridSize);
        nh = Math.max(minH, Math.round(nh / gridSize) * gridSize);
      }
      store.updateDevice(r.id, { x: nx, y: ny, w: nw, h: nh });
      return;
    }
    if (dragDevice) {
      let nx = x - dragDevice.offsetX;
      let ny = y - dragDevice.offsetY;
      if (snapToGrid) {
        nx = Math.round(nx / gridSize) * gridSize;
        ny = Math.round(ny / gridSize) * gridSize;
      }
      let vx = null, hy = null;
      for (const d of devices) {
        if (d.id === dragDevice.id) continue;
        if (Math.abs(d.x - nx) < 4) { vx = d.x; nx = d.x; }
        else if (Math.abs((d.x + d.w) - (nx + dragDevice.w)) < 4) { vx = d.x + d.w; nx = d.x + d.w - dragDevice.w; }
        if (Math.abs(d.y - ny) < 4) { hy = d.y; ny = d.y; }
        else if (Math.abs((d.y + d.h) - (ny + dragDevice.h)) < 4) { hy = d.y + d.h; ny = d.y + d.h - dragDevice.h; }
      }
      setAlignGuides({ vx, hy });
      store.moveDevice(dragDevice.id, nx, ny);
      return;
    }
    if (draggingWirePoint) {
      const { wireId, idx } = draggingWirePoint;
      const w = store.wires.find(w => w.id === wireId);
      if (!w) return;
      const base = w.manualPoints && w.manualPoints.length ? w.manualPoints : wirePaths.find(p => p.id === wireId)?.points;
      if (!base) return;
      const pts = base.map((p, i) => i === idx ? {
        x: snapToGrid ? Math.round(x / gridSize) * gridSize : x,
        y: snapToGrid ? Math.round(y / gridSize) * gridSize : y,
      } : p);
      store.updateWire(wireId, { manualPoints: pts });
    }
    if (dragLabel) {
      const w = store.wires.find(w => w.id === dragLabel.wireId);
      if (!w) return;
      store.updateWire(dragLabel.wireId, { labelOffset: { x: x - dragLabel.anchorX, y: y - dragLabel.anchorY } });
    }
  };

  const handleMouseUp = () => {
    // Bir sürükleme/boyutlandırma bittiyse durumu history'e yaz (taşıma artık geri alınabilir).
    const wasManipulating = dragDevice || dragMulti || draggingWirePoint || dragLabel || resizeDevice;
    if (selRect) {
      // pick devices whose bbox intersects rect
      const ids = devices.filter((d) =>
        d.x + d.w >= selRect.x && d.x <= selRect.x + selRect.w &&
        d.y + d.h >= selRect.y && d.y <= selRect.y + selRect.h
      ).map((d) => d.id);
      if (ids.length) store.selectMulti(ids);
      setSelRect(null);
    }
    if (panState) setPanState(null);
    if (dragDevice) setDragDevice(null);
    if (dragMulti) setDragMulti(null);
    if (resizeDevice) setResizeDevice(null);
    if (draggingWirePoint) setDraggingWirePoint(null);
    if (dragLabel) setDragLabel(null);
    if (wasManipulating) store.pushHistory();
    setAlignGuides({ vx: null, hy: null });
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.2, Math.min(4, zoom * factor));
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) {
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const ratio = newZoom / zoom;
      store.setZoom(newZoom);
      store.setPan(cx - (cx - panX) * ratio, cy - (cy - panY) * ratio);
    } else {
      store.setZoom(newZoom);
    }
  };

  // ====== Keyboard ======
  useEffect(() => {
    const onKey = (e) => {
      const target = e.target;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); if (e.shiftKey) store.redo(); else store.undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); store.redo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === 'c') { store.copySelection(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === 'v') { store.paste(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedType === 'device') store.removeDevice(selectedId);
        else if (selectedType === 'wire') store.removeWire(selectedId);
      } else if (e.key === 'Escape') {
        store.cancelWire();
        store.clearSelection();
      } else if (e.key === '+' || e.key === '=') store.zoomIn();
      else if (e.key === '-' || e.key === '_') store.zoomOut();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, selectedType, store]);

  // ====== Drop devices from library ======
  const onDragOver = (e) => { e.preventDefault(); };
  const onDrop = (e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('device-template');
    if (!id) return;
    let { x, y } = screenToCanvas(e.clientX, e.clientY);
    if (snapToGrid) { x = Math.round(x / gridSize) * gridSize; y = Math.round(y / gridSize) * gridSize; }
    const tpl = getDeviceTemplate(id) || store.customTemplates.find((t) => t.id === id);
    if (tpl) {
      store.addDevice(id, x - tpl.width / 2, y - tpl.height / 2);
    }
  };

  // ====== Wire preview during drawing ======
  const previewWire = useMemo(() => {
    if (!wireDrawing) return null;
    const from = portMap.get(`${wireDrawing.fromDeviceId}:${wireDrawing.fromPortId}`);
    if (!from) return null;
    const to = { x: mouse.x, y: mouse.y, side: 'left' };
    // Use the same obstacle policy as committed wires so the preview matches reality
    const obstacles = devices.map((d) => ({ x: d.x, y: d.y, w: d.w, h: d.h, id: d.id }));
    const pts = routingMode === 'astar'
      ? aStarRoute(from, to, obstacles, null, { gridSize: 10, stub: 24, iterLimit: 30000 })
      : routeWire(from, to, obstacles.filter((o) => o.id !== wireDrawing.fromDeviceId), 24);
    return { points: pts, color: wireDrawing.color };
  }, [wireDrawing, mouse, portMap, devices, routingMode]);

  const sizeW = ps.w * 2;
  const sizeH = ps.h * 2;

  const onDeviceMouseDown = (e, device) => {
    if (tool === 'wire') return;
    e.stopPropagation();
    const { x, y } = screenToCanvas(e.clientX, e.clientY);
    if (multiSelect.includes(device.id)) {
      setDragMulti({ startX: x, startY: y, lastX: x, lastY: y });
      return;
    }
    if (e.shiftKey) {
      store.addToMulti(device.id);
      return;
    }
    setDragDevice({ id: device.id, offsetX: x - device.x, offsetY: y - device.y, w: device.w, h: device.h });
    store.select(device.id, 'device');
  };

  const onCornerMouseDown = (e, device, corner) => {
    e.stopPropagation();
    setResizeDevice({
      id: device.id,
      corner,
      origX: device.x, origY: device.y, origW: device.w, origH: device.h,
    });
    store.select(device.id, 'device');
  };

  const onPortMouseDown = (e, device, port) => {
    e.stopPropagation();
    e.preventDefault();
    if (wireDrawing) {
      store.finishWire(device.id, port.id);
    } else {
      store.startWire(device.id, port.id, port.color);
      if (tool !== 'wire') store.setTool('wire');
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-[var(--bg-canvas)]"
      onDragOver={onDragOver}
      onDrop={onDrop}
      data-testid="canvas-container"
    >
      <svg
        ref={svgRef}
        className="absolute inset-0 w-full h-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
        style={{ cursor: panState ? 'grabbing' : tool === 'wire' ? 'crosshair' : 'default' }}
        data-testid="canvas-svg"
      >
        <defs>
          <pattern id="smallGrid" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
            <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke="#14171F" strokeWidth="1" />
          </pattern>
          <pattern id="largeGrid" width={gridSize * 5} height={gridSize * 5} patternUnits="userSpaceOnUse">
            <rect width={gridSize * 5} height={gridSize * 5} fill="url(#smallGrid)" />
            <path d={`M ${gridSize * 5} 0 L 0 0 0 ${gridSize * 5}`} fill="none" stroke="#1C202B" strokeWidth="1.2" />
          </pattern>
        </defs>

        {/* Background */}
        <rect data-canvas-bg="1" x={-5000} y={-5000} width={10000} height={10000} fill="var(--bg-canvas)" />

        <g transform={`translate(${panX} ${panY}) scale(${zoom})`}>
          {showGrid && (
            <rect data-canvas-bg="1" x={-5000} y={-5000} width={10000} height={10000} fill="url(#largeGrid)" />
          )}

          {/* Paper boundaries */}
          <rect
            x={0} y={0} width={sizeW} height={sizeH}
            fill="none" stroke="#2D3548" strokeWidth={1 / zoom}
            strokeDasharray={`${6 / zoom} ${6 / zoom}`}
            data-canvas-bg="1"
            pointerEvents="none"
          />

          {/* Alignment guides */}
          {alignGuides.vx !== null && (
            <line x1={alignGuides.vx} y1={-5000} x2={alignGuides.vx} y2={5000} stroke="#FFD600" strokeWidth={1 / zoom} strokeDasharray={`${4 / zoom} ${4 / zoom}`} pointerEvents="none" />
          )}
          {alignGuides.hy !== null && (
            <line x1={-5000} y1={alignGuides.hy} x2={5000} y2={alignGuides.hy} stroke="#FFD600" strokeWidth={1 / zoom} strokeDasharray={`${4 / zoom} ${4 / zoom}`} pointerEvents="none" />
          )}

          {/* Wires */}
          <g>
            {wirePaths.map((w) => (
              <WireSvg
                key={w.id}
                wire={w}
                selected={selectedId === w.id && selectedType === 'wire'}
                showLabel={showLabels}
                labelAnchor={labelAnchors.get(w.id)}
                bridges={bridgesByWire.get(w.id) || []}
                onSelect={() => store.select(w.id, 'wire')}
                onAddPoint={(idx, p) => {
                  const base = w.manualPoints || w.points;
                  const newPts = [...base];
                  newPts.splice(idx + 1, 0, p);
                  store.updateWire(w.id, { manualPoints: newPts });
                }}
                onPointMouseDown={(idx, e) => {
                  e.stopPropagation();
                  if (!w.manualPoints) store.updateWire(w.id, { manualPoints: [...w.points] });
                  setDraggingWirePoint({ wireId: w.id, idx });
                }}
                onLabelMouseDown={(e) => {
                  e.stopPropagation();
                  const { x, y } = screenToCanvas(e.clientX, e.clientY);
                  setDragLabel({ wireId: w.id, anchorX: x - (w.labelOffset?.x || 0), anchorY: y - (w.labelOffset?.y || 0) });
                }}
              />
            ))}
          </g>

          {/* Wire preview */}
          {previewWire && previewWire.points.length > 1 && (
            <path
              d={pathToSvgD(previewWire.points, 4)}
              fill="none"
              stroke={previewWire.color}
              strokeWidth={2.4 / zoom * zoom}
              strokeDasharray="4 3"
              opacity={0.7}
              pointerEvents="none"
            />
          )}

          {/* Devices */}
          <g>
            {devices.map((d) => (
              <DeviceSvg
                key={d.id}
                device={d}
                selected={(selectedId === d.id && selectedType === 'device') || multiSelect.includes(d.id)}
                onMouseDown={(e) => onDeviceMouseDown(e, d)}
                onPortMouseDown={(e, port) => onPortMouseDown(e, d, port)}
                onCornerMouseDown={(e, corner) => onCornerMouseDown(e, d, corner)}
                wireDrawingActive={!!wireDrawing}
              />
            ))}
          </g>

          {/* Kablo etiketleri — en üst katman: kablo ve cihazların arkasında kalmaz */}
          <g>
            {wirePaths.map((w) => (
              <WireLabel
                key={`lbl-${w.id}`}
                wire={w}
                labelAnchor={labelAnchors.get(w.id)}
                showLabel={showLabels}
                onLabelMouseDown={(e) => {
                  e.stopPropagation();
                  const { x, y } = screenToCanvas(e.clientX, e.clientY);
                  setDragLabel({ wireId: w.id, anchorX: x - (w.labelOffset?.x || 0), anchorY: y - (w.labelOffset?.y || 0) });
                }}
              />
            ))}
          </g>

          {/* Selection rectangle */}
          {selRect && (
            <rect
              x={selRect.x} y={selRect.y} width={selRect.w} height={selRect.h}
              fill="rgba(0, 229, 255, 0.08)"
              stroke="#00E5FF"
              strokeWidth={1 / zoom}
              strokeDasharray={`${4 / zoom} ${3 / zoom}`}
              pointerEvents="none"
            />
          )}
        </g>
      </svg>

      {/* Bottom-right status */}
      <div className="absolute bottom-2 right-2 font-mono text-[10px] text-[var(--text-secondary)] flex items-center gap-3 bg-[var(--bg-panel)] border border-[var(--border-structural)] px-2 py-1">
        <span data-testid="status-zoom">ZOOM {Math.round(zoom * 100)}%</span>
        <span data-testid="status-coords">X {Math.round(mouse.x)} Y {Math.round(mouse.y)}</span>
        <span>{devices.length} DEVICE {wires.length} WIRE</span>
      </div>
    </div>
  );
});

function DeviceSvg({ device, selected, onMouseDown, onPortMouseDown, onCornerMouseDown, wireDrawingActive }) {
  const tpl = getDeviceTemplate(device.templateId);
  const Icon = tpl?.icon;
  const accent = tpl?.color || '#00E5FF';
  return (
    <g
      className={`device-node ${selected ? 'selected' : ''}`}
      transform={`translate(${device.x} ${device.y}) rotate(${device.rotation || 0} ${device.w / 2} ${device.h / 2})`}
      onMouseDown={onMouseDown}
      data-testid={`canvas-device-${device.id}`}
    >
      <rect
        className="device-frame"
        x={0} y={0} width={device.w} height={device.h}
        fill="#0D0F14" stroke="#2D3548" strokeWidth="1"
        rx="2"
      />
      <rect x={0} y={0} width={device.w} height={4} fill={accent} opacity={0.6} />

      {device.imageId || device.imageUrl ? (
        <image
          href={device.imageId ? fileUrl(device.imageId) : device.imageUrl}
          x={4} y={8}
          width={device.w - 8} height={device.h - 30}
          preserveAspectRatio="xMidYMid meet"
        />
      ) : Icon ? (
        <g transform={`translate(${device.w / 2 - 14} ${device.h / 2 - 22})`} pointerEvents="none">
          <foreignObject x={0} y={0} width={28} height={28}>
            <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B949E' }}>
              <Icon size={24} strokeWidth={1.5} />
            </div>
          </foreignObject>
        </g>
      ) : null}

      {/* Device name */}
      <text x={device.w / 2} y={device.h - 8} textAnchor="middle" fill="#F8F9FA" fontSize="10" fontFamily="JetBrains Mono, monospace">
        {device.name}
      </text>
      {device.brand || device.model ? (
        <text x={device.w / 2} y={device.h + 12} textAnchor="middle" fill="#8B949E" fontSize="9" fontFamily="JetBrains Mono, monospace">
          {[device.brand, device.model].filter(Boolean).join(' / ')}
        </text>
      ) : null}

      {/* Ports */}
      {device.ports.map((p) => {
        const abs = getPortAbsolute(device, p);
        const lx = abs.x - device.x;
        const ly = abs.y - device.y;
        return (
          <g key={p.id} transform={`translate(${lx} ${ly})`}>
            <rect
              x={-4} y={-4} width={8} height={8}
              fill={p.color}
              stroke="#F8F9FA"
              strokeWidth="1"
              className="port-handle"
              onMouseDown={(e) => onPortMouseDown(e, p)}
              data-testid={`port-${device.id}-${p.id}`}
            />
            <text
              x={p.side === 'right' ? 8 : p.side === 'left' ? -8 : 0}
              y={p.side === 'top' ? -8 : p.side === 'bottom' ? 16 : 2}
              textAnchor={p.side === 'right' ? 'start' : p.side === 'left' ? 'end' : 'middle'}
              fill="#8B949E"
              fontSize="8"
              fontFamily="JetBrains Mono, monospace"
              pointerEvents="none"
            >
              {p.name}
            </text>
          </g>
        );
      })}

      {/* Selection handles (interactive resize) */}
      {selected && (
        <>
          {[
            { hx: 0, hy: 0, corner: 'nw', cursor: 'nwse-resize' },
            { hx: device.w, hy: 0, corner: 'ne', cursor: 'nesw-resize' },
            { hx: 0, hy: device.h, corner: 'sw', cursor: 'nesw-resize' },
            { hx: device.w, hy: device.h, corner: 'se', cursor: 'nwse-resize' },
          ].map(({ hx, hy, corner, cursor }) => (
            <rect
              key={corner}
              x={hx - 4} y={hy - 4} width={8} height={8}
              fill="#00E5FF" stroke="#0D0F14" strokeWidth="1"
              style={{ cursor }}
              onMouseDown={(e) => onCornerMouseDown?.(e, corner)}
              data-testid={`resize-handle-${corner}`}
            />
          ))}
        </>
      )}
    </g>
  );
}

function WireSvg({ wire, selected, showLabel, labelAnchor, bridges, onSelect, onAddPoint, onPointMouseDown, onLabelMouseDown }) {
  const { points, color, thickness, style, segmentColors } = wire;
  const label = getWireDisplayLabel(wire);
  if (!points || points.length < 2) return null;

  const dashArray = style === 'dashed' ? '8 4' : style === 'dotted' ? '2 4' : 'none';
  const hasSegColors = segmentColors && Object.keys(segmentColors).length > 0;

  // Compose rendering: per-segment if overrides exist, else smooth path
  let mainPath;
  if (hasSegColors) {
    mainPath = (
      <g>
        {points.slice(0, -1).map((p, i) => {
          const q = points[i + 1];
          const segCol = segmentColors[i] || color;
          return (
            <line
              key={i}
              x1={p.x} y1={p.y} x2={q.x} y2={q.y}
              stroke={segCol}
              strokeWidth={thickness}
              strokeDasharray={dashArray}
              strokeLinecap="round"
            />
          );
        })}
      </g>
    );
  } else {
    const d = pathToSvgD(points, 4);
    mainPath = (
      <path
        className={`wire-path ${selected ? 'selected' : ''}`}
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={thickness}
        strokeDasharray={dashArray}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color }}
      />
    );
  }

  // Hit area (always present, transparent)
  const dHit = pathToSvgD(points, 4);
  const bridgeRadius = 6;
  const bridgeMarks = bridges.map((c, i) => (
    <circle key={i} cx={c.x} cy={c.y} r={bridgeRadius} fill="var(--bg-canvas)" stroke={color} strokeWidth={thickness} />
  ));

  // Not: Etiket (kablo kesit/tip yazısı) artık burada DEĞİL — tüm kablolardan ve
  // cihazlardan SONRA, ayrı bir üst katmanda (WireLabel) render edilir ki başka
  // kabloların/cihazların arkasında kalmasın.

  return (
    <g onClick={(e) => { e.stopPropagation(); onSelect(); }} data-testid={`wire-${wire.id}`}>
      <path
        d={dHit}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(12, thickness * 4)}
        style={{ cursor: 'pointer' }}
      />
      {mainPath}
      {bridgeMarks}

      {selected && points.map((p, i) => (
        <rect
          key={i}
          x={p.x - 4} y={p.y - 4} width={8} height={8}
          fill="#00E5FF" stroke="#0D0F14" strokeWidth="1"
          style={{ cursor: 'move' }}
          onMouseDown={(e) => onPointMouseDown(i, e)}
        />
      ))}
    </g>
  );
}

// Kablo etiketi (kesit/tip yazısı) — ayrı üst katman bileşeni. Tüm kablolar ve
// cihazlardan sonra render edilir ki hiçbir şeyin arkasında kalmasın.
function WireLabel({ wire, labelAnchor, showLabel, onLabelMouseDown }) {
  const label = getWireDisplayLabel(wire);
  if (!showLabel || wire.showLabel === false || !label) return null;
  let lx = labelAnchor ? labelAnchor.x : 0;
  let ly = labelAnchor ? labelAnchor.y : 0;
  if (wire.labelOffset) { lx += wire.labelOffset.x; ly += wire.labelOffset.y; }
  return (
    <g transform={`translate(${lx} ${ly})`} onMouseDown={onLabelMouseDown} style={{ cursor: 'move' }}>
      <rect x={-label.length * 2 - 3} y={-6} width={label.length * 4 + 6} height={10}
            fill="#0D0F14" stroke={wire.color} strokeWidth="0.6" rx="1" />
      <text x={0} y={0.5} textAnchor="middle" alignmentBaseline="middle" fill="#F8F9FA"
            fontSize="6.5" fontFamily="JetBrains Mono, monospace">
        {label}
      </text>
    </g>
  );
}

export default CanvasInner;
