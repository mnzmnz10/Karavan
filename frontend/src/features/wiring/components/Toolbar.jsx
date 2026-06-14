import React from 'react';
import {
  Save, FolderOpen, FilePlus2, Undo2, Redo2, ZoomIn, ZoomOut, Maximize2,
  Grid3x3, MoveDiagonal, FileDown, Cable, Hand, MousePointer2, Magnet, FileJson, Folders, AlertTriangle, ScanLine, Sparkles, Group,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useEditorStore, getPortAbsolute } from '@/features/wiring/store/editorStore';
import { createProject, updateProject, listProjects, getProject, exportPdf, fileUrl, aiGenerateDiagram } from '@/features/wiring/lib/api';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { aStarRoute, routeWire, pathToSvgD, findPathCrossings } from '@/features/wiring/lib/routing';
import { DEVICE_TEMPLATES } from '@/features/wiring/lib/devices';
import { getWirePreset } from '@/features/wiring/lib/wireTypes';
import { getDeviceIllustration } from '@/features/wiring/lib/deviceIllustrations';
import { checkWireSafety, computeNets, netlistToCsv } from '@/features/wiring/lib/electricalCheck';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

async function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
}

async function fetchImageAsDataUrl(id) {
  try {
    const r = await fetch(fileUrl(id));
    if (!r.ok) return null;
    const blob = await r.blob();
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
}

function getWireDisplayLabel(wire) {
  if (wire.label && wire.label.trim()) return wire.label;
  const preset = getWirePreset(wire.wirePresetId);
  return preset ? preset.name : '';
}

function ToolBtn({ icon: Icon, label, onClick, active, testid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`tool-btn ${active ? 'active' : ''}`}
      data-testid={testid}
    >
      <Icon size={16} strokeWidth={1.5} />
    </button>
  );
}

export default function Toolbar({ canvasSvgRef }) {
  const store = useEditorStore();
  const [openLoad, setOpenLoad] = React.useState(false);
  const [openBom, setOpenBom] = React.useState(false);
  // AI şema üretimi
  const [openAi, setOpenAi] = React.useState(false);
  const [aiParts, setAiParts] = React.useState('');
  const [aiNotes, setAiNotes] = React.useState('');
  const [aiBusy, setAiBusy] = React.useState(false);

  // AI planını (templateId + bağlantı listesi) editör formatına çevirip yükler.
  // Cihaz boyut/portları frontend template'lerinden gelir; kullanıcı sonra düzeltir.
  const applyAiPlan = (plan) => {
    const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
    const GRID = 20;
    const snap = (n) => Math.round(n / GRID) * GRID;
    const keyToId = {};
    const devices = [];
    for (const d of plan.devices || []) {
      const tpl = DEVICE_TEMPLATES.find((t) => t.id === d.templateId);
      if (!tpl) continue;
      const id = uid('d');
      keyToId[d.key] = id;
      devices.push({
        id, templateId: d.templateId, x: snap(d.x || 80), y: snap(d.y || 80), w: tpl.width, h: tpl.height,
        rotation: 0, name: d.name || tpl.name, brand: '', model: '', notes: '',
        ratingValue: '', ratingUnit: '', imageId: null, imageUrl: null, zone: d.zone || '',
        ports: (tpl.ports || []).map((p) => ({ ...p })),
      });
    }
    // Çakışma çözücü: üst üste/çok yakın gelen cihazları aşağı kaydır (AI bazen
    // koordinatları çakıştırıyor; pad=40 boşluk bırak)
    const PAD = 40;
    const overlaps = (a, b) =>
      a.x < b.x + b.w + PAD && a.x + a.w + PAD > b.x &&
      a.y < b.y + b.h + PAD && a.y + a.h + PAD > b.y;
    for (let i = 0; i < devices.length; i++) {
      let guard = 0;
      for (let j = 0; j < i; j++) {
        if (overlaps(devices[i], devices[j])) {
          devices[i].y = snap(devices[j].y + devices[j].h + PAD);
          j = -1; // baştan tara (yeni konum başkasıyla çakışabilir)
          if (guard++ > 200) break;
        }
      }
    }
    const wires = [];
    for (const w of plan.wires || []) {
      const fromId = keyToId[w.from_key];
      const toId = keyToId[w.to_key];
      if (!fromId || !toId) continue;
      // Port id'lerini gerçek cihaz portlarıyla doğrula (hayalet bağlantı olmasın)
      const fromDev = devices.find((d) => d.id === fromId);
      const toDev = devices.find((d) => d.id === toId);
      if (!fromDev?.ports.some((p) => p.id === w.from_port) || !toDev?.ports.some((p) => p.id === w.to_port)) continue;
      wires.push({
        id: uid('w'),
        from: { deviceId: fromId, portId: w.from_port },
        to: { deviceId: toId, portId: w.to_port },
        color: w.color || '#FF3B30', thickness: 2.4, style: 'solid',
        wirePresetId: 'nyaf_25', label: w.label || '', showLabel: true,
        manualPoints: null, lengthM: '',
      });
    }
    // Bölge kutuları: aynı zone'daki cihazların bounding box'ından üret (Victron tarzı)
    const ZONE_COLORS = ['#0A84FF', '#00C853', '#FF9500', '#AF52DE', '#FF3B30', '#5AC8FA', '#8E8E93'];
    const zoneMap = {};
    devices.forEach((d) => {
      const z = (d.zone || '').trim();
      if (!z) return;
      (zoneMap[z] = zoneMap[z] || []).push(d);
    });
    const groups = [];
    const GPAD = 28;
    Object.keys(zoneMap).forEach((z, i) => {
      const ds = zoneMap[z];
      const x0 = Math.min(...ds.map((d) => d.x)) - GPAD;
      const y0 = Math.min(...ds.map((d) => d.y)) - GPAD - 18; // başlık için ekstra
      const x1 = Math.max(...ds.map((d) => d.x + d.w)) + GPAD;
      const y1 = Math.max(...ds.map((d) => d.y + d.h)) + GPAD;
      groups.push({
        id: uid('g'), title: z.toUpperCase(),
        x: snap(x0), y: snap(y0), w: snap(x1 - x0), h: snap(y1 - y0),
        color: ZONE_COLORS[i % ZONE_COLORS.length],
      });
    });
    store.loadProject({
      id: null, name: 'AI Taslak Şema', vehicle_name: '', author: '', description: '',
      data: { devices, wires, groups, paper: store.paper, orientation: store.orientation },
    });
    // Şema sağda/geniş olabilir; render olunca ekrana sığdır (yoksa boş ekran gibi görünür)
    setTimeout(() => { try { canvasSvgRef?.current?.fitToContent?.(); } catch { /* yoksay */ } }, 120);
    return { deviceCount: devices.length, wireCount: wires.length, groupCount: groups.length };
  };

  const onAiGenerate = async () => {
    if (!aiParts.trim()) { toast.error('Parça listesini yazın'); return; }
    try {
      setAiBusy(true);
      const res = await aiGenerateDiagram(aiParts.trim(), aiNotes.trim());
      const { deviceCount, wireCount, groupCount } = applyAiPlan(res);
      setOpenAi(false);
      toast.success(`Taslak şema yüklendi: ${deviceCount} cihaz, ${wireCount} kablo, ${groupCount} bölge. Kontrol edip düzeltin, sonra kaydedin.`);
      (res.notlar || []).forEach((n) => toast.info(n, { duration: 8000 }));
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'AI şema üretilemedi');
    } finally {
      setAiBusy(false);
    }
  };

  const onSave = async () => {
    const payload = store.exportJson();
    try {
      let res;
      if (store.projectId) res = await updateProject(store.projectId, payload);
      else res = await createProject(payload);
      store.setProjectMeta({ projectId: res.id });
      toast.success('Proje kaydedildi');
    } catch (e) {
      toast.error('Kayıt başarısız');
    }
  };

  const onExportJson = () => {
    const data = store.exportJson();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.name || 'karavan-sema'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImportJson = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result);
        store.loadProject({
          id: null,
          name: json.name,
          vehicle_name: json.vehicle_name,
          author: json.author,
          description: json.description,
          data: json.data,
        });
        toast.success('Proje içe aktarıldı');
      } catch {
        toast.error('Geçersiz JSON');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const onExportPdf = async () => {
    try {
      const svgEl = canvasSvgRef?.current?.svgRef?.current;
      if (!svgEl) { toast.error('Canvas hazır değil'); return; }
      // Seçim tutamaçları PDF'e girmesin → seçimi kaldır ve re-render'ı bekle
      store.select(null, null);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      let logoDataUrl = null;
      if (store.logoId) {
        logoDataUrl = await fetchImageAsDataUrl(store.logoId);
      }
      // Pre-fetch all device images in parallel so they can be embedded in the SVG.
      const uniqueImageIds = [...new Set(store.devices.map((d) => d.imageId).filter(Boolean))];
      const imageEntries = await Promise.all(uniqueImageIds.map(async (id) => [id, await fetchImageAsDataUrl(id)]));
      const imageMap = Object.fromEntries(imageEntries.filter(([, url]) => url));

      const svg = serializeCanvasSvg(svgEl, store, logoDataUrl, imageMap);
      const blob = await exportPdf({
        svg,
        paper: store.paper,
        orientation: store.orientation,
        title: store.projectName,
        vehicle_name: store.vehicleName,
        author: store.author,
        date: new Date().toLocaleDateString('tr-TR'),
        description: store.description,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${store.projectName || 'karavan-sema'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF indirildi');
    } catch (e) {
      console.error('PDF export error:', e);
      toast.error(`PDF dışa aktarma başarısız: ${e?.message || e}`);
    }
  };

  const onFitToContent = () => {
    if (canvasSvgRef?.current?.fitToContent) {
      canvasSvgRef.current.fitToContent();
    } else {
      toast.error('Canvas hazır değil');
    }
  };

  const openIssues = () => {
    setOpenBom(true);
  };

  return (
    <div className="h-12 border-b border-[var(--border-structural)] bg-[var(--bg-panel)] flex items-center px-2 gap-1 select-none">
      <div className="font-display font-semibold text-sm text-[var(--text-primary)] pr-3 tracking-wider">
        KARAVAN<span className="text-[var(--accent-cyan)]">.</span>SCHEMA
      </div>
      <Separator orientation="vertical" className="h-6 bg-[var(--border-structural)] mx-1" />

      <ToolBtn icon={FilePlus2} label="Yeni" onClick={() => { if (confirm('Yeni proje? Mevcut kaydedilmedi ise kaybolur.')) store.newProject(); }} testid="toolbar-new" />
      <ToolBtn icon={Save} label="Kaydet" onClick={onSave} testid="toolbar-save" />
      <Dialog open={openLoad} onOpenChange={setOpenLoad}>
        <DialogTrigger asChild>
          <button className="tool-btn" title="Aç" data-testid="toolbar-open"><FolderOpen size={16} strokeWidth={1.5} /></button>
        </DialogTrigger>
        <LoadDialog onClose={() => setOpenLoad(false)} />
      </Dialog>
      <ToolBtn icon={FileDown} label="PDF İndir" onClick={onExportPdf} testid="toolbar-pdf" />
      <label className="tool-btn cursor-pointer" title="JSON İçe Aktar">
        <FileJson size={16} strokeWidth={1.5} />
        <input type="file" accept="application/json,.json" className="hidden" onChange={onImportJson} />
      </label>
      <ToolBtn icon={Folders} label="JSON Dışa Aktar" onClick={onExportJson} testid="toolbar-export-json" />
      <Dialog open={openAi} onOpenChange={setOpenAi}>
        <DialogTrigger asChild>
          <button className="tool-btn" title="AI ile Şema Üret" data-testid="toolbar-ai" style={{ color: '#34d399' }}>
            <Sparkles size={16} strokeWidth={1.5} />
          </button>
        </DialogTrigger>
        <DialogContent className="wiring-root max-w-lg">
          <DialogHeader>
            <DialogTitle>AI ile Taslak Şema</DialogTitle>
            <DialogDescription>
              Parça listesini yaz — ChatGPT bağlantıları kurup taslak şema üretir. Sonra editörde düzeltip kaydedersin (mevcut tuval değişir).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-[var(--text-primary)]">Parça Listesi</Label>
              <Textarea
                rows={6}
                value={aiParts}
                onChange={(e) => setAiParts(e.target.value)}
                placeholder={'2x 455W güneş paneli\nMPPT 100/30\n200Ah LiFePO4 akü\n2000W inverter\n12V sigorta kutusu\naydınlatma, su pompası, buzdolabı'}
                className="bg-white text-slate-900 placeholder:text-slate-400 border-slate-300"
              />
            </div>
            <div>
              <Label className="text-[var(--text-primary)]">Ek İstek (opsiyonel)</Label>
              <Input value={aiNotes} onChange={(e) => setAiNotes(e.target.value)} placeholder="örn. paneller paralel bağlansın, 220V priz hattı olsun"
                className="bg-white text-slate-900 placeholder:text-slate-400 border-slate-300" />
            </div>
            <Button onClick={onAiGenerate} disabled={aiBusy} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
              {aiBusy ? 'Şema üretiliyor... (15-30 sn)' : 'Şemayı Üret'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Separator orientation="vertical" className="h-6 bg-[var(--border-structural)] mx-1" />

      <ToolBtn icon={Undo2} label="Geri Al" onClick={() => store.undo()} testid="toolbar-undo" />
      <ToolBtn icon={Redo2} label="İleri Al" onClick={() => store.redo()} testid="toolbar-redo" />

      <Separator orientation="vertical" className="h-6 bg-[var(--border-structural)] mx-1" />

      <ToolBtn icon={MousePointer2} label="Seç" onClick={() => store.setTool('select')} active={store.tool === 'select'} testid="toolbar-select" />
      <ToolBtn icon={Cable} label="Kablo Çiz" onClick={() => store.setTool('wire')} active={store.tool === 'wire'} testid="toolbar-wire" />
      <ToolBtn icon={Hand} label="Pan" onClick={() => store.setTool('pan')} active={store.tool === 'pan'} testid="toolbar-pan" />

      <Separator orientation="vertical" className="h-6 bg-[var(--border-structural)] mx-1" />

      <ToolBtn icon={ZoomOut} label="Uzaklaştır" onClick={() => store.zoomOut()} testid="toolbar-zoom-out" />
      <div className="font-mono text-xs text-[var(--text-secondary)] w-12 text-center" data-testid="toolbar-zoom-value">{Math.round(store.zoom * 100)}%</div>
      <ToolBtn icon={ZoomIn} label="Yakınlaştır" onClick={() => store.zoomIn()} testid="toolbar-zoom-in" />
      <ToolBtn icon={Maximize2} label="Sıfırla" onClick={() => store.resetView()} testid="toolbar-reset-view" />
      <ToolBtn icon={ScanLine} label="İçeriğe Sığdır" onClick={onFitToContent} testid="toolbar-fit-content" />

      <Separator orientation="vertical" className="h-6 bg-[var(--border-structural)] mx-1" />

      <ToolBtn icon={Group} label="Bölge Ekle" onClick={() => store.addGroup(80, 80)} testid="toolbar-add-group" />
      <ToolBtn icon={Grid3x3} label="Grid" onClick={() => store.toggleGrid()} active={store.showGrid} testid="toolbar-grid" />
      <ToolBtn icon={Magnet} label="Snap" onClick={() => store.toggleSnap()} active={store.snapToGrid} testid="toolbar-snap" />
      <ToolBtn icon={MoveDiagonal} label="Otomatik Hizala" onClick={() => store.autoArrange()} testid="toolbar-auto-arrange" />

      <Separator orientation="vertical" className="h-6 bg-[var(--border-structural)] mx-1" />

      <Dialog open={openBom} onOpenChange={setOpenBom}>
        <DialogTrigger asChild>
          <button className="tool-btn" title="Liste / Kontrol" data-testid="toolbar-bom"><AlertTriangle size={16} strokeWidth={1.5} /></button>
        </DialogTrigger>
        <BomDialog onClose={() => setOpenBom(false)} />
      </Dialog>

      <div className="ml-auto text-[10px] text-[var(--text-secondary)] font-mono pr-2 tracking-widest" data-testid="project-title-bar">
        {store.projectName}{store.vehicleName ? ` / ${store.vehicleName}` : ''}
      </div>
    </div>
  );
}

function LoadDialog({ onClose }) {
  const store = useEditorStore();
  const [projects, setProjects] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    listProjects().then((p) => { setProjects(p); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  return (
    <DialogContent className="wiring-portal bg-[var(--bg-panel)] border-[var(--border-structural)] rounded-none max-w-2xl">
      <DialogHeader>
        <DialogTitle className="font-display tracking-wider">KAYITLI PROJELER</DialogTitle>
        <DialogDescription className="text-[var(--text-secondary)] text-xs font-mono">
          Açmak istediğiniz projeyi seçin.
        </DialogDescription>
      </DialogHeader>
      <ScrollArea className="h-80">
        {loading ? <div className="text-xs text-[var(--text-secondary)]">Yükleniyor...</div> : (
          projects.length === 0 ? <div className="text-xs text-[var(--text-secondary)]">Kayıtlı proje yok.</div> :
          <div className="space-y-1">
            {projects.map((p) => (
              <button key={p.id} type="button"
                      className="w-full text-left px-3 py-2 border border-[var(--border-structural)] hover:border-[var(--accent-cyan)] hover:bg-[var(--bg-hover)] flex items-center justify-between"
                      data-testid={`project-item-${p.id}`}
                      onClick={async () => {
                        const proj = await getProject(p.id);
                        store.loadProject(proj);
                        toast.success(`"${proj.name}" açıldı`);
                        onClose();
                      }}>
                <div>
                  <div className="text-xs text-[var(--text-primary)]">{p.name}</div>
                  <div className="text-[10px] text-[var(--text-secondary)] font-mono">{p.vehicle_name || 'araç yok'} · {(p.updated_at || '').slice(0, 16)}</div>
                </div>
                <FolderOpen size={14} className="text-[var(--accent-cyan)]" />
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </DialogContent>
  );
}

function BomDialog({ onClose }) {
  const { devices, wires } = useEditorStore();
  const portUsage = new Map();
  for (const d of devices) for (const p of d.ports) portUsage.set(`${d.id}:${p.id}`, 0);
  for (const w of wires) {
    portUsage.set(`${w.from.deviceId}:${w.from.portId}`, (portUsage.get(`${w.from.deviceId}:${w.from.portId}`) || 0) + 1);
    portUsage.set(`${w.to.deviceId}:${w.to.portId}`, (portUsage.get(`${w.to.deviceId}:${w.to.portId}`) || 0) + 1);
  }
  const unused = [];
  for (const d of devices) {
    for (const p of d.ports) {
      if ((portUsage.get(`${d.id}:${p.id}`) || 0) === 0) unused.push({ device: d.name, port: p.name });
    }
  }
  const wireSummary = new Map();
  for (const w of wires) {
    const key = `${w.wirePresetId || 'custom'}|${w.color}`;
    wireSummary.set(key, (wireSummary.get(key) || 0) + (parseFloat(w.lengthM) || 0));
  }
  const devSummary = new Map();
  for (const d of devices) devSummary.set(d.name, (devSummary.get(d.name) || 0) + 1);
  const safetyWarnings = [];
  for (const w of wires) {
    const r = checkWireSafety(w, devices);
    if (r) safetyWarnings.push(r);
  }
  const nets = computeNets(devices, wires);
  const polColor = (pol) => pol === 'positive' ? 'text-[var(--accent-danger)]'
    : pol === 'negative' ? 'text-[var(--text-secondary)]'
    : pol === 'ac_l' ? 'text-[#C68A4C]'
    : pol === 'ac_n' ? 'text-[#0A84FF]'
    : pol === 'pe' ? 'text-[var(--accent-success)]'
    : 'text-[var(--accent-warning)]';

  const downloadNetCsv = () => {
    const csv = netlistToCsv(nets);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'netlist.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DialogContent className="wiring-portal bg-[var(--bg-panel)] border-[var(--border-structural)] rounded-none max-w-4xl">
      <DialogHeader>
        <DialogTitle className="font-display tracking-wider">BAĞLANTI KONTROLÜ & LİSTE</DialogTitle>
        <DialogDescription className="text-[var(--text-secondary)] text-xs font-mono">
          Şema üzerindeki cihaz/kablo listesi, elektriksel uyarılar ve netlist.
        </DialogDescription>
      </DialogHeader>
      <Tabs defaultValue="bom" className="w-full">
        <TabsList className="grid grid-cols-3 h-9 rounded-none bg-[var(--bg-input)] border border-[var(--border-interactive)]">
          <TabsTrigger value="bom" className="text-[10px] tracking-widest rounded-none data-[state=active]:bg-[var(--bg-hover)] data-[state=active]:text-[var(--accent-cyan)]" data-testid="bom-tab-bom">BOM</TabsTrigger>
          <TabsTrigger value="safety" className="text-[10px] tracking-widest rounded-none data-[state=active]:bg-[var(--bg-hover)] data-[state=active]:text-[var(--accent-cyan)]" data-testid="bom-tab-safety">KONTROL</TabsTrigger>
          <TabsTrigger value="netlist" className="text-[10px] tracking-widest rounded-none data-[state=active]:bg-[var(--bg-hover)] data-[state=active]:text-[var(--accent-cyan)]" data-testid="bom-tab-netlist">NETLIST</TabsTrigger>
        </TabsList>

        <TabsContent value="bom" className="pt-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="panel-title pb-2">CIHAZ LISTESI ({devices.length})</div>
              <ScrollArea className="h-64 border border-[var(--border-structural)] p-2">
                {[...devSummary.entries()].map(([name, count]) => (
                  <div key={name} className="text-xs flex justify-between font-mono">
                    <span className="text-[var(--text-primary)]">{name}</span><span className="text-[var(--accent-cyan)]">×{count}</span>
                  </div>
                ))}
              </ScrollArea>
            </div>
            <div>
              <div className="panel-title pb-2">KABLO LISTESI ({wires.length})</div>
              <ScrollArea className="h-64 border border-[var(--border-structural)] p-2">
                {[...wireSummary.entries()].map(([k, totalM]) => (
                  <div key={k} className="text-xs flex justify-between font-mono">
                    <span className="text-[var(--text-primary)]">{k.split('|')[0]}</span>
                    <span className="text-[var(--accent-cyan)]">{totalM ? `${totalM} m` : '—'}</span>
                  </div>
                ))}
              </ScrollArea>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="safety" className="pt-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="panel-title pb-2">AÇIKTA KALAN PORTLAR ({unused.length})</div>
              <ScrollArea className="h-64 border border-[var(--border-structural)] p-2" data-testid="bom-unused-ports">
                {unused.length === 0 ? <div className="text-xs text-[var(--accent-success)] font-mono">Tüm portlar bağlı.</div> :
                unused.map((u, i) => (
                  <div key={i} className="text-xs flex justify-between font-mono">
                    <span className="text-[var(--accent-warning)]">{u.device}</span>
                    <span className="text-[var(--text-secondary)]">{u.port}</span>
                  </div>
                ))}
              </ScrollArea>
            </div>
            <div>
              <div className="panel-title pb-2">ELEKTRIKSEL UYARILAR ({safetyWarnings.length})</div>
              <ScrollArea className="h-64 border border-[var(--border-structural)] p-2" data-testid="bom-safety-warnings">
                {safetyWarnings.length === 0 ? <div className="text-xs text-[var(--accent-success)] font-mono">Polarite uyumlu.</div> :
                safetyWarnings.map((s, i) => (
                  <div key={i} className="text-[10px] text-[var(--accent-danger)] font-mono leading-tight pb-1">
                    ⚠ {s.message}
                  </div>
                ))}
              </ScrollArea>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="netlist" className="pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="panel-title">NET LISTESI ({nets.length} net) — Her elektriksel düğüm bir nettir</div>
            <Button variant="ghost" size="sm" className="h-7 px-2 rounded-none text-[var(--accent-cyan)] hover:bg-[var(--bg-hover)] text-[10px] tracking-widest"
                    onClick={downloadNetCsv} data-testid="netlist-download-btn">
              <FileDown className="w-3 h-3 mr-1" /> CSV İNDİR
            </Button>
          </div>
          <ScrollArea className="h-64 border border-[var(--border-structural)] p-2" data-testid="bom-netlist">
            {nets.length === 0 ? <div className="text-xs text-[var(--text-secondary)] font-mono">Henüz kablolanmış bağlantı yok.</div> :
            nets.map((net) => (
              <div key={net.id} className="border-b border-[var(--border-structural)] py-2 last:border-b-0">
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-mono text-xs ${polColor(net.dominantPolarity)} font-semibold`}>{net.suggestedName}</span>
                  <span className="font-mono text-[10px] text-[var(--text-secondary)]">{net.ports.length} port</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3">
                  {net.ports.map((p, i) => (
                    <div key={i} className="text-[10px] font-mono flex items-center gap-2">
                      <span className="w-2 h-2 inline-block" style={{ background: p.color }} />
                      <span className="text-[var(--text-primary)]">{p.deviceName}</span>
                      <span className="text-[var(--text-secondary)]">.{p.portName}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </DialogContent>
  );
}

// ====== Serialize current canvas into a clean SVG for PDF export ======
function getTpl(id) { return DEVICE_TEMPLATES.find(d => d.id === id); }

const PAPER_PT = {
  A4: { w: 1123, h: 794 },
  A3: { w: 1587, h: 1123 },
  A2: { w: 2245, h: 1587 },
};

// Ekran=PDF: canvas'ın GERÇEK DOM SVG'sini serialize eder (store'dan yeniden
// kurmaz). Böylece PDF ekranla birebir aynı olur. Transient süsler (grid, paper,
// arka plan, seçim tutamaçları) çıkarılır; cihaz görselleri data-URL gömülür;
// içerik identity transform'a alınıp beyaz zemin + başlık ile sarılır.
function serializeCanvasSvg(svgEl, store, logoDataUrl = null, imageMap = {}) {
  const { devices, groups, projectName } = store;

  // İçerik sınırları (store'dan — viewBox için)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const d of devices) {
    minX = Math.min(minX, d.x); minY = Math.min(minY, d.y);
    maxX = Math.max(maxX, d.x + d.w); maxY = Math.max(maxY, d.y + d.h);
  }
  for (const g of (groups || [])) {
    minX = Math.min(minX, g.x); minY = Math.min(minY, g.y);
    maxX = Math.max(maxX, g.x + g.w); maxY = Math.max(maxY, g.y + g.h);
  }
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 800; maxY = 600; }
  const headerH = 60, pad = 60;
  minX -= pad; maxX += pad; maxY += pad;
  minY -= (pad + headerH);
  const bw = maxX - minX, bh = maxY - minY;

  // Canlı SVG'yi klonla ve temizle
  const clone = svgEl.cloneNode(true);
  // Pan/zoom grubunu identity'ye al (dünya koordinatları kalsın)
  const contentG = clone.querySelector('g[transform]');
  if (contentG) contentG.removeAttribute('transform');
  // Arka plan / grid / paper / hizalama + seçim tutamaçlarını çıkar
  clone.querySelectorAll('[data-canvas-bg]').forEach((n) => n.remove());
  clone.querySelectorAll('[data-testid^="resize-handle-"]').forEach((n) => n.remove());
  // Port label halo'su (beyaz stroke + paint-order) svglib'de bozulur → sıyır
  clone.querySelectorAll('text.port-label').forEach((t) => {
    t.setAttribute('stroke', 'none');
    t.removeAttribute('stroke-width');
    if (t.style) t.style.paintOrder = '';
  });
  // Cihaz görselleri: backend URL href → gömülü data-URL
  const ids = Object.keys(imageMap);
  if (ids.length) {
    clone.querySelectorAll('image').forEach((img) => {
      const href = img.getAttribute('href')
        || img.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '';
      for (const id of ids) {
        if (imageMap[id] && href.includes(id)) {
          img.setAttribute('href', imageMap[id]);
          try { img.removeAttributeNS('http://www.w3.org/1999/xlink', 'href'); } catch (e) { /* yoksa geç */ }
          break;
        }
      }
    });
  }
  const innerXml = contentG ? new XMLSerializer().serializeToString(contentG) : '';

  const escape = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const titleX = minX + bw / 2;
  const titleY = minY + (headerH / 2) + 6;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${minX} ${minY} ${bw} ${bh}" width="${bw}" height="${bh}" font-family="Montserrat, sans-serif">`;
  svg += `<rect x="${minX}" y="${minY}" width="${bw}" height="${bh}" fill="#FFFFFF" />`;
  if (logoDataUrl) {
    svg += `<image x="${minX + 20}" y="${minY + 10}" width="${headerH - 20}" height="${headerH - 20}" preserveAspectRatio="xMidYMid meet" xlink:href="${logoDataUrl}" />`;
  }
  svg += `<text x="${titleX}" y="${titleY}" text-anchor="middle" font-size="22" font-weight="bold" font-family="Montserrat, sans-serif" fill="#1A2230">${escape(projectName || 'KARAVAN ŞEMA')}</text>`;
  svg += `<line x1="${minX + 40}" y1="${minY + headerH - 4}" x2="${maxX - 40}" y2="${minY + headerH - 4}" stroke="#1A2230" stroke-width="0.8" />`;
  svg += innerXml;
  svg += `</svg>`;
  return svg;
}
