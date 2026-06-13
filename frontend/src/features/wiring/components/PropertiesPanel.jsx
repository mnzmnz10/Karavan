import React from 'react';
import { useEditorStore } from '@/features/wiring/store/editorStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { WIRE_PRESETS, COLOR_PALETTE, getWirePreset, getAllWirePresets, saveCustomWirePreset, deleteCustomWirePreset, getCustomWirePresets } from '@/features/wiring/lib/wireTypes';
import { Trash2, Upload, ArrowUp, ArrowDown, Plus, RotateCw } from 'lucide-react';
import { uploadImage, fileUrl, removeBackground } from '@/features/wiring/lib/api';
import { toast } from 'sonner';
import { getPortAbsolute } from '@/features/wiring/store/editorStore';
import { aStarRoute, routeWire } from '@/features/wiring/lib/routing';

export function getWireDisplayLabel(wire) {
  if (wire.label && wire.label.trim()) return wire.label;
  const preset = getWirePreset(wire.wirePresetId);
  return preset ? preset.name : '';
}

function Field({ label, children, testid }) {
  return (
    <div className="space-y-1" data-testid={testid}>
      <Label className="panel-title block">{label}</Label>
      {children}
    </div>
  );
}

export default function PropertiesPanel() {
  const store = useEditorStore();
  const { selectedId, selectedType, devices, wires, groups, pendingWireDefaults } = store;

  let body = null;
  if (selectedType === 'device' && selectedId) {
    const device = devices.find((d) => d.id === selectedId);
    if (device) body = <DeviceForm device={device} />;
  } else if (selectedType === 'wire' && selectedId) {
    const wire = wires.find((w) => w.id === selectedId);
    if (wire) body = <WireForm wire={wire} />;
  } else if (selectedType === 'group' && selectedId) {
    const group = (groups || []).find((g) => g.id === selectedId);
    if (group) body = <GroupForm group={group} />;
  } else {
    body = <ProjectForm defaults={pendingWireDefaults} />;
  }

  return (
    <aside
      className="w-80 shrink-0 h-full border-l border-[var(--border-structural)] bg-[var(--bg-panel)] flex flex-col"
      data-testid="properties-panel"
    >
      <div className="px-3 py-2 border-b border-[var(--border-structural)] flex items-center justify-between">
        <div className="panel-title">
          {selectedType === 'device' ? 'CIHAZ ÖZELLIKLERI' : selectedType === 'wire' ? 'KABLO ÖZELLIKLERI' : selectedType === 'group' ? 'BÖLGE ÖZELLIKLERI' : 'PROJE BILGILERI'}
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">{body}</div>
      </ScrollArea>
    </aside>
  );
}

function ProjectForm({ defaults }) {
  const store = useEditorStore();
  const { projectName, vehicleName, author, description, paper, orientation, snapToGrid, showLabels, showBridges, showGrid, gridSize, logoId, routingMode } = store;
  const onLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await uploadImage(file);
      store.setProjectMeta({ logoId: data.id });
      toast.success('Logo yüklendi');
    } catch {
      toast.error('Logo yükleme başarısız');
    }
  };
  return (
    <div className="space-y-4">
      <Field label="Proje Adı">
        <Input value={projectName} onChange={(e) => store.setProjectMeta({ projectName: e.target.value })}
               className="tech-input" data-testid="project-name-input" />
      </Field>
      <Field label="Araç">
        <Input value={vehicleName} onChange={(e) => store.setProjectMeta({ vehicleName: e.target.value })}
               className="tech-input" data-testid="vehicle-name-input" />
      </Field>
      <Field label="Hazırlayan">
        <Input value={author} onChange={(e) => store.setProjectMeta({ author: e.target.value })}
               className="tech-input" data-testid="author-input" />
      </Field>
      <Field label="Açıklama">
        <Textarea value={description} onChange={(e) => store.setProjectMeta({ description: e.target.value })}
                  className="tech-input min-h-[60px]" data-testid="description-input" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Kağıt">
          <Select value={paper} onValueChange={(v) => store.setProjectMeta({ paper: v })}>
            <SelectTrigger className="tech-input"><SelectValue /></SelectTrigger>
            <SelectContent className="wiring-portal">
              <SelectItem value="A4">A4</SelectItem>
              <SelectItem value="A3">A3</SelectItem>
              <SelectItem value="A2">A2</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Yön">
          <Select value={orientation} onValueChange={(v) => store.setProjectMeta({ orientation: v })}>
            <SelectTrigger className="tech-input"><SelectValue /></SelectTrigger>
            <SelectContent className="wiring-portal">
              <SelectItem value="landscape">Yatay</SelectItem>
              <SelectItem value="portrait">Dikey</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field label="Şirket / Proje Logosu">
        <div className="flex items-center gap-2">
          <label className="flex-1 inline-flex items-center justify-center h-8 border border-[var(--border-interactive)] bg-[var(--bg-input)] text-xs cursor-pointer hover:border-[var(--accent-cyan)] gap-2">
            <Upload className="w-3 h-3" />
            <span>{logoId ? 'DEĞİŞTİR' : 'YÜKLE'}</span>
            <input type="file" accept="image/*" className="hidden" onChange={onLogoUpload} data-testid="logo-upload-input" />
          </label>
          {logoId && (
            <>
              <div className="w-8 h-8 border border-[var(--border-interactive)] bg-white flex items-center justify-center overflow-hidden">
                <img src={fileUrl(logoId)} alt="logo" className="max-w-full max-h-full" />
              </div>
              <Button variant="ghost" size="sm" className="h-8 rounded-none text-[var(--accent-danger)] hover:bg-[var(--bg-hover)]"
                      onClick={() => store.setProjectMeta({ logoId: null })}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </>
          )}
        </div>
      </Field>

      <div className="border-t border-[var(--border-structural)] pt-3 space-y-3">
        <div className="panel-title">GÖRÜNÜM & ROUTING</div>
        <Field label="Kablo Routing Modu">
          <Select value={routingMode} onValueChange={(v) => store.setProjectMeta({ routingMode: v })}>
            <SelectTrigger className="tech-input" data-testid="routing-mode-select"><SelectValue /></SelectTrigger>
            <SelectContent className="wiring-portal">
              <SelectItem value="astar">A* (Çakışmasız, yoğun şema için)</SelectItem>
              <SelectItem value="fast">Hızlı L/Z (basit şema)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="flex items-center justify-between">
          <Label className="text-xs">Grid Göster</Label>
          <Switch checked={showGrid} onCheckedChange={() => store.toggleGrid()} />
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">Grid'e Yapış</Label>
          <Switch checked={snapToGrid} onCheckedChange={() => store.toggleSnap()} />
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">Kablo Etiketleri</Label>
          <Switch checked={showLabels} onCheckedChange={() => store.toggleLabels()} />
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">Köprü Geçişleri</Label>
          <Switch checked={showBridges} onCheckedChange={() => store.setProjectMeta({ showBridges: !showBridges })} />
        </div>
        <Field label={`Grid Boyutu: ${gridSize}px`}>
          <input type="range" min="10" max="50" step="2" value={gridSize}
                 onChange={(e) => store.setGridSize(parseInt(e.target.value))} className="w-full" />
        </Field>
      </div>

      <div className="border-t border-[var(--border-structural)] pt-3 space-y-3">
        <div className="panel-title">VARSAYILAN KABLO</div>
        <WirePresetField
          value={defaults.wirePresetId}
          onChange={(p) => store.setWireDefaults({ wirePresetId: p.id, color: p.color, thickness: p.thickness, style: p.style })}
        />
        <Field label="Renk">
          <ColorPicker value={defaults.color} onChange={(c) => store.setWireDefaults({ color: c })} />
        </Field>
      </div>

      <div className="text-[10px] text-[var(--text-tertiary)] font-mono pt-2">
        İPUCU: Boş alandan Shift+sürükle ile çoklu seçim. Çoklu cihazları birlikte taşıyabilirsin.
      </div>
    </div>
  );
}

function DeviceForm({ device }) {
  const store = useEditorStore();
  const [removingBg, setRemovingBg] = React.useState(false);
  const update = (patch) => store.updateDevice(device.id, patch);
  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await uploadImage(file);
      update({ imageId: data.id, imageUrl: null });
      toast.success('Görsel yüklendi');
    } catch (err) {
      toast.error('Yükleme başarısız');
    }
  };
  const onRemoveBg = async () => {
    if (!device.imageId && !device.imageUrl) return;
    setRemovingBg(true);
    try {
      const payload = device.imageId ? { image_id: device.imageId } : { image_url: device.imageUrl };
      const data = await removeBackground(payload);
      update({ imageId: data.id, imageUrl: null });
      toast.success('Arka plan kaldırıldı');
    } catch (err) {
      toast.error('Arka plan kaldırılamadı');
    } finally {
      setRemovingBg(false);
    }
  };
  return (
    <Tabs defaultValue="general" className="w-full">
      <TabsList className="grid grid-cols-3 h-8 rounded-none bg-[var(--bg-input)] border border-[var(--border-interactive)]">
        <TabsTrigger value="general" className="text-[10px] tracking-widest rounded-none data-[state=active]:bg-[var(--bg-hover)] data-[state=active]:text-[var(--accent-cyan)]">GENEL</TabsTrigger>
        <TabsTrigger value="ports" className="text-[10px] tracking-widest rounded-none data-[state=active]:bg-[var(--bg-hover)] data-[state=active]:text-[var(--accent-cyan)]">PORT</TabsTrigger>
        <TabsTrigger value="meta" className="text-[10px] tracking-widest rounded-none data-[state=active]:bg-[var(--bg-hover)] data-[state=active]:text-[var(--accent-cyan)]">TEKNIK</TabsTrigger>
      </TabsList>

      <TabsContent value="general" className="space-y-3 pt-3">
        <Field label="Cihaz Adı">
          <Input value={device.name} onChange={(e) => update({ name: e.target.value })} className="tech-input" data-testid="device-name-input" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Genişlik">
            <Input type="number" value={device.w} onChange={(e) => update({ w: Math.max(40, parseInt(e.target.value) || 40) })} className="tech-input" />
          </Field>
          <Field label="Yükseklik">
            <Input type="number" value={device.h} onChange={(e) => update({ h: Math.max(30, parseInt(e.target.value) || 30) })} className="tech-input" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="X">
            <Input type="number" value={Math.round(device.x)} onChange={(e) => update({ x: parseFloat(e.target.value) || 0 })} className="tech-input" />
          </Field>
          <Field label="Y">
            <Input type="number" value={Math.round(device.y)} onChange={(e) => update({ y: parseFloat(e.target.value) || 0 })} className="tech-input" />
          </Field>
        </div>
        <Field label="Dönüş">
          <div className="flex items-center gap-2">
            <input type="range" min="0" max="270" step="90" value={device.rotation || 0}
                   onChange={(e) => update({ rotation: parseInt(e.target.value) })} className="flex-1" />
            <span className="font-mono text-xs">{device.rotation || 0}°</span>
            <Button variant="ghost" size="sm" className="h-7 px-2 rounded-none hover:bg-[var(--bg-hover)]"
                    onClick={() => update({ rotation: ((device.rotation || 0) + 90) % 360 })}>
              <RotateCw className="w-3 h-3" />
            </Button>
          </div>
        </Field>

        <Field label="Marka">
          <Input value={device.brand} onChange={(e) => update({ brand: e.target.value })} className="tech-input" />
        </Field>
        <Field label="Model">
          <Input value={device.model} onChange={(e) => update({ model: e.target.value })} className="tech-input" />
        </Field>

        <Field label="Görsel (PNG/JPG)">
          <div className="flex items-center gap-2">
            <label className="flex-1 inline-flex items-center justify-center h-8 border border-[var(--border-interactive)] bg-[var(--bg-input)] text-xs cursor-pointer hover:border-[var(--accent-cyan)] gap-2">
              <Upload className="w-3 h-3" />
              <span>YÜKLE</span>
              <input type="file" accept="image/*" className="hidden" onChange={onUpload} data-testid="device-image-input" />
            </label>
            {(device.imageId || device.imageUrl) && (
              <Button variant="ghost" size="sm" className="h-8 rounded-none text-[var(--accent-danger)] hover:bg-[var(--bg-hover)]"
                      onClick={() => update({ imageId: null, imageUrl: null })}>
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
          </div>
        </Field>

        {(device.imageId || device.imageUrl) && (
          <div className="space-y-2 border border-[var(--border-structural)] p-2">
            <div className="panel-title">GÖRSEL AYARLA (KIRP / YAKINLAŞTIR)</div>
            <Field label={`Yakınlaştırma — ${(device.imageScale || 1).toFixed(2)}x`}>
              <input type="range" min="0.3" max="3" step="0.05"
                     value={device.imageScale || 1}
                     onChange={(e) => update({ imageScale: parseFloat(e.target.value) })}
                     className="w-full" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Yatay konum">
                <input type="range" min={-Math.round(device.w / 2)} max={Math.round(device.w / 2)} step="1"
                       value={device.imageOffsetX || 0}
                       onChange={(e) => update({ imageOffsetX: parseFloat(e.target.value) })}
                       className="w-full" />
              </Field>
              <Field label="Dikey konum">
                <input type="range" min={-Math.round(device.h / 2)} max={Math.round(device.h / 2)} step="1"
                       value={device.imageOffsetY || 0}
                       onChange={(e) => update({ imageOffsetY: parseFloat(e.target.value) })}
                       className="w-full" />
              </Field>
            </div>
            <div className="flex gap-1">
              <button type="button"
                      onClick={() => update({ imageFit: 'contain' })}
                      className={`flex-1 h-7 text-[10px] border ${(!device.imageFit || device.imageFit === 'contain') ? 'border-[var(--accent-cyan)] text-[var(--accent-cyan)]' : 'border-[var(--border-interactive)] text-[var(--text-secondary)]'} hover:border-[var(--accent-cyan)]`}>
                SIĞDIR
              </button>
              <button type="button"
                      onClick={() => update({ imageFit: 'cover' })}
                      className={`flex-1 h-7 text-[10px] border ${device.imageFit === 'cover' ? 'border-[var(--accent-cyan)] text-[var(--accent-cyan)]' : 'border-[var(--border-interactive)] text-[var(--text-secondary)]'} hover:border-[var(--accent-cyan)]`}>
                DOLDUR (KIRP)
              </button>
              <button type="button"
                      onClick={() => update({ imageScale: 1, imageOffsetX: 0, imageOffsetY: 0, imageFit: 'contain' })}
                      className="flex-1 h-7 text-[10px] border border-[var(--border-interactive)] text-[var(--text-secondary)] hover:border-[var(--accent-cyan)]">
                SIFIRLA
              </button>
            </div>
            <button type="button" onClick={onRemoveBg} disabled={removingBg}
                    className="w-full h-7 text-[10px] border border-[var(--border-interactive)] text-[var(--accent-cyan)] hover:border-[var(--accent-cyan)] hover:bg-[var(--bg-hover)] disabled:opacity-50">
              {removingBg ? 'KALDIRILIYOR…' : '✂ ARKA PLANI KALDIR'}
            </button>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="ghost" size="sm" className="flex-1 h-8 rounded-none hover:bg-[var(--bg-hover)]"
                  onClick={() => store.bringForward(device.id)}>
            <ArrowUp className="w-3 h-3 mr-1" /> Öne
          </Button>
          <Button variant="ghost" size="sm" className="flex-1 h-8 rounded-none hover:bg-[var(--bg-hover)]"
                  onClick={() => store.sendBackward(device.id)}>
            <ArrowDown className="w-3 h-3 mr-1" /> Arkaya
          </Button>
        </div>
        <Button variant="ghost" size="sm" className="w-full h-8 rounded-none text-[var(--accent-danger)] hover:bg-[var(--bg-hover)]"
                onClick={() => store.removeDevice(device.id)} data-testid="delete-device-btn">
          <Trash2 className="w-3 h-3 mr-1" /> CIHAZI SIL
        </Button>
      </TabsContent>

      <TabsContent value="ports" className="space-y-2 pt-3">
        <div className="flex items-center justify-between">
          <div className="panel-title">PORTLAR ({device.ports.length})</div>
          <Button variant="ghost" size="sm" className="h-7 px-2 rounded-none text-[var(--accent-cyan)] hover:bg-[var(--bg-hover)]"
                  onClick={() => store.addPort(device.id, {})} data-testid="add-port-btn">
            <Plus className="w-3 h-3 mr-1" /> Ekle
          </Button>
        </div>
        {device.ports.map((p) => (
          <div key={p.id} className="border border-[var(--border-structural)] p-2 space-y-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <Input value={p.name} onChange={(e) => store.updatePort(device.id, p.id, { name: e.target.value })} className="tech-input" placeholder="Ad" />
              <Select value={p.side} onValueChange={(v) => store.updatePort(device.id, p.id, { side: v })}>
                <SelectTrigger className="tech-input"><SelectValue /></SelectTrigger>
                <SelectContent className="wiring-portal">
                  <SelectItem value="top">Üst</SelectItem>
                  <SelectItem value="right">Sağ</SelectItem>
                  <SelectItem value="bottom">Alt</SelectItem>
                  <SelectItem value="left">Sol</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1.5">
              <input type="range" min="0" max="1" step="0.05" value={p.offset}
                     onChange={(e) => store.updatePort(device.id, p.id, { offset: parseFloat(e.target.value) })} className="flex-1" />
              <span className="font-mono text-[10px] w-8 text-right">{Math.round(p.offset * 100)}%</span>
              <input type="color" value={p.color} onChange={(e) => store.updatePort(device.id, p.id, { color: e.target.value })}
                     className="w-6 h-6 bg-transparent cursor-pointer border-0" />
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-none text-[var(--accent-danger)] hover:bg-[var(--bg-hover)]"
                      onClick={() => store.removePort(device.id, p.id)}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
      </TabsContent>

      <TabsContent value="meta" className="space-y-3 pt-3">
        <Field label="Teknik Değer (örn. 100A, 200Ah, 1500W)">
          <Input value={device.ratingValue} onChange={(e) => update({ ratingValue: e.target.value })} className="tech-input" />
        </Field>
        <Field label="Birim">
          <Input value={device.ratingUnit} onChange={(e) => update({ ratingUnit: e.target.value })} className="tech-input" />
        </Field>
        <Field label="Notlar">
          <Textarea value={device.notes} onChange={(e) => update({ notes: e.target.value })}
                    className="tech-input min-h-[80px]" />
        </Field>
      </TabsContent>
    </Tabs>
  );
}

function WireForm({ wire }) {
  const store = useEditorStore();
  const update = (patch) => store.updateWire(wire.id, patch);
  // Compute fallback path if computedPaths[wire.id] not yet published by Canvas
  const segmentPoints = React.useMemo(() => {
    if (wire.manualPoints && wire.manualPoints.length) return wire.manualPoints;
    const cached = store.computedPaths[wire.id];
    if (cached && cached.length) return cached;
    const fromDev = store.devices.find((d) => d.id === wire.from.deviceId);
    const toDev = store.devices.find((d) => d.id === wire.to.deviceId);
    if (!fromDev || !toDev) return [];
    const fp = fromDev.ports.find((p) => p.id === wire.from.portId);
    const tp = toDev.ports.find((p) => p.id === wire.to.portId);
    if (!fp || !tp) return [];
    const from = getPortAbsolute(fromDev, fp);
    const to = getPortAbsolute(toDev, tp);
    const obs = store.devices.filter((d) => d.id !== fromDev.id && d.id !== toDev.id)
      .map((d) => ({ x: d.x, y: d.y, w: d.w, h: d.h, id: d.id }));
    const allObs = store.devices.map((d) => ({ x: d.x, y: d.y, w: d.w, h: d.h, id: d.id }));
    try {
      return store.routingMode === 'astar'
        ? aStarRoute(from, to, allObs, null, { gridSize: 10, stub: 24 })
        : routeWire(from, to, obs, 24);
    } catch { return []; }
  }, [wire, store.computedPaths, store.devices, store.routingMode]);
  const segmentCount = Math.max(0, segmentPoints.length - 1);
  const segColors = wire.segmentColors || {};
  return (
    <div className="space-y-3">
      <WirePresetField
        value={wire.wirePresetId || ''}
        onChange={(p) => update({ wirePresetId: p.id, thickness: p.thickness, style: p.style, color: p.color })}
      />
      <Field label="Renk (Tüm Kablo)">
        <ColorPicker value={wire.color} onChange={(c) => update({ color: c })} />
      </Field>
      <Field label={`Kalınlık: ${wire.thickness.toFixed(1)}px`}>
        <input type="range" min="1" max="12" step="0.2" value={wire.thickness}
               onChange={(e) => update({ thickness: parseFloat(e.target.value) })} className="w-full" />
      </Field>
      <Field label="Çizgi Tipi">
        <Select value={wire.style} onValueChange={(v) => update({ style: v })}>
          <SelectTrigger className="tech-input"><SelectValue /></SelectTrigger>
          <SelectContent className="wiring-portal">
            <SelectItem value="solid">Düz</SelectItem>
            <SelectItem value="dashed">Kesikli</SelectItem>
            <SelectItem value="dotted">Noktalı</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Etiket">
        <Input value={wire.label} onChange={(e) => update({ label: e.target.value })} className="tech-input"
               placeholder="örn. 50mm² NYAF +" data-testid="wire-label-input" />
      </Field>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Etiket Göster</Label>
        <Switch checked={wire.showLabel !== false} onCheckedChange={(v) => update({ showLabel: v })} />
      </div>
      <Field label="Yaklaşık Uzunluk (m)">
        <Input type="number" value={wire.lengthM} onChange={(e) => update({ lengthM: e.target.value })} className="tech-input" />
      </Field>

      {segmentCount >= 2 && (
        <div className="border-t border-[var(--border-structural)] pt-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="panel-title">SEGMENT RENKLERI ({segmentCount})</div>
            {Object.keys(segColors).length > 0 && (
              <Button variant="ghost" size="sm" className="h-6 px-2 rounded-none text-[var(--accent-danger)] hover:bg-[var(--bg-hover)]"
                      onClick={() => update({ segmentColors: {} })}>
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] font-mono">Boş = ana kablo rengi</div>
          {Array.from({ length: segmentCount }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 border border-[var(--border-structural)] p-1.5">
              <span className="font-mono text-[10px] w-8 text-[var(--text-secondary)]">{i + 1}</span>
              <input type="color" value={segColors[i] || wire.color}
                     onChange={(e) => update({ segmentColors: { ...segColors, [i]: e.target.value } })}
                     className="w-6 h-6 bg-transparent cursor-pointer border-0"
                     data-testid={`wire-segment-color-${i}`} />
              <Button variant="ghost" size="sm" className="h-6 px-2 rounded-none text-[10px] hover:bg-[var(--bg-hover)] ml-auto"
                      onClick={() => { const { [i]: _, ...rest } = segColors; update({ segmentColors: rest }); }}>
                SIFIRLA
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button variant="ghost" size="sm" className="w-full h-8 rounded-none hover:bg-[var(--bg-hover)]"
              onClick={() => update({ manualPoints: null })}>
        Yolu Otomatik Hesapla
      </Button>
      <Button variant="ghost" size="sm" className="w-full h-8 rounded-none text-[var(--accent-danger)] hover:bg-[var(--bg-hover)]"
              onClick={() => store.removeWire(wire.id)} data-testid="delete-wire-btn">
        <Trash2 className="w-3 h-3 mr-1" /> KABLOYU SIL
      </Button>
    </div>
  );
}

function GroupForm({ group }) {
  const store = useEditorStore();
  const GROUP_COLORS = ['#0A84FF', '#00C853', '#FF9500', '#FF3B30', '#AF52DE', '#5AC8FA', '#8E8E93', '#FFD600'];
  return (
    <div className="space-y-3">
      <Field label="Bölge Başlığı">
        <Input className="tech-input" value={group.title}
               onChange={(e) => store.updateGroup(group.id, { title: e.target.value })}
               placeholder="örn. SOLAR SİSTEM" />
      </Field>
      <Field label="Renk">
        <div className="grid grid-cols-8 gap-1">
          {GROUP_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => store.updateGroup(group.id, { color: c })}
                    className="h-6 border" style={{ background: c, borderColor: group.color === c ? '#FFF' : 'transparent' }} />
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Genişlik"><Input className="tech-input" type="number" value={Math.round(group.w)}
          onChange={(e) => store.updateGroup(group.id, { w: Math.max(120, parseInt(e.target.value) || 120) })} /></Field>
        <Field label="Yükseklik"><Input className="tech-input" type="number" value={Math.round(group.h)}
          onChange={(e) => store.updateGroup(group.id, { h: Math.max(90, parseInt(e.target.value) || 90) })} /></Field>
      </div>
      <div className="text-[10px] text-[var(--text-tertiary)] font-mono">
        Başlık şeridinden sürükle, köşelerden boyutlandır. Cihazlar bölgenin üstüne serbestçe yerleştirilir.
      </div>
      <Button variant="destructive" size="sm" className="w-full h-8 text-xs" onClick={() => store.removeGroup(group.id)}>
        <Trash2 className="w-3 h-3 mr-1" /> BÖLGEYİ SİL
      </Button>
    </div>
  );
}

// Kablo tipi seçici + "Yeni Kablo Tipi" ekleme (yerleşik + kullanıcı özel kablolar)
function WirePresetField({ value, onChange }) {
  const [version, setVersion] = React.useState(0);
  const [adding, setAdding] = React.useState(false);
  const [form, setForm] = React.useState({ name: '', section: '', thickness: '2.4', style: 'solid', color: '#FF3B30' });
  const all = React.useMemo(() => getAllWirePresets(), [version]);
  const customIds = React.useMemo(() => new Set(getCustomWirePresets().map((w) => w.id)), [version]);

  const save = () => {
    if (!form.name.trim()) { toast.error('Kablo adı girin'); return; }
    const p = saveCustomWirePreset(form);
    setVersion((v) => v + 1);
    setAdding(false);
    setForm({ name: '', section: '', thickness: '2.4', style: 'solid', color: '#FF3B30' });
    onChange(p); // yeni eklenen otomatik seçilsin
    toast.success(`"${p.name}" kablo tipi eklendi`);
  };
  const removeCustom = (id, e) => {
    e.stopPropagation();
    deleteCustomWirePreset(id);
    setVersion((v) => v + 1);
    toast.success('Kablo tipi silindi');
  };

  return (
    <Field label="Kablo Tipi">
      <Select value={value} onValueChange={(v) => {
        const p = getWirePreset(v);
        if (p) onChange(p);
      }}>
        <SelectTrigger className="tech-input"><SelectValue placeholder="Tip seç" /></SelectTrigger>
        <SelectContent className="wiring-portal">
          {all.map((w) => (
            <SelectItem key={w.id} value={w.id}>
              <span className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-sm border border-black/20" style={{ background: w.color }} />
                {w.name}{customIds.has(w.id) ? ' ★' : ''}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!adding ? (
        <button type="button" onClick={() => setAdding(true)}
                className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-[var(--accent-cyan)] hover:underline">
          <Plus className="w-3 h-3" /> Yeni Kablo Tipi
        </button>
      ) : (
        <div className="mt-2 p-2 rounded border border-[var(--border-structural)] bg-black/10 space-y-2">
          <Input className="tech-input h-7 text-xs" placeholder="Ad (örn. 6 mm² Solar)" value={form.name}
                 onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input className="tech-input h-7 text-xs" type="number" step="0.5" placeholder="Kesit mm²" value={form.section}
                   onChange={(e) => setForm({ ...form, section: e.target.value })} />
            <Input className="tech-input h-7 text-xs" type="number" step="0.2" min="1" max="12" placeholder="Kalınlık px" value={form.thickness}
                   onChange={(e) => setForm({ ...form, thickness: e.target.value })} />
          </div>
          <ColorPicker value={form.color} onChange={(c) => setForm({ ...form, color: c })} />
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs flex-1" onClick={save}>Ekle</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAdding(false)}>Vazgeç</Button>
          </div>
        </div>
      )}

      {getCustomWirePresets().length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {getCustomWirePresets().map((w) => (
            <span key={w.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-black/15 border border-[var(--border-structural)]">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ background: w.color }} />
              {w.name}
              <button type="button" onClick={(e) => removeCustom(w.id, e)} className="text-red-400 hover:text-red-300" title="Sil">×</button>
            </span>
          ))}
        </div>
      )}
    </Field>
  );
}

function ColorPicker({ value, onChange }) {
  return (
    <div>
      <div className="grid grid-cols-5 gap-1 mb-1">
        {COLOR_PALETTE.map((c) => (
          <button
            key={c.value}
            type="button"
            title={c.name}
            onClick={() => onChange(c.value)}
            className="h-6 border border-[var(--border-interactive)] hover:border-[var(--accent-cyan)]"
            style={{ background: c.value }}
            data-testid={`color-${c.value}`}
          />
        ))}
      </div>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
             className="w-full h-7 bg-transparent cursor-pointer" />
    </div>
  );
}
