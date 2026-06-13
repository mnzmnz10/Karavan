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
      let logoDataUrl = null;
      if (store.logoId) {
        logoDataUrl = await fetchImageAsDataUrl(store.logoId);
      }
      // Pre-fetch all device images in parallel so they can be embedded in the SVG.
      const uniqueImageIds = [...new Set(store.devices.map((d) => d.imageId).filter(Boolean))];
      const imageEntries = await Promise.all(uniqueImageIds.map(async (id) => [id, await fetchImageAsDataUrl(id)]));
      const imageMap = Object.fromEntries(imageEntries.filter(([, url]) => url));

      const svg = serializeCanvasSvg(store, logoDataUrl, imageMap);
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
      <div className="font-display font-semibold text-sm text-white pr-3 tracking-wider">
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
              <Label className="text-slate-200">Parça Listesi</Label>
              <Textarea
                rows={6}
                value={aiParts}
                onChange={(e) => setAiParts(e.target.value)}
                placeholder={'2x 455W güneş paneli\nMPPT 100/30\n200Ah LiFePO4 akü\n2000W inverter\n12V sigorta kutusu\naydınlatma, su pompası, buzdolabı'}
                className="bg-white text-slate-900 placeholder:text-slate-400 border-slate-300"
              />
            </div>
            <div>
              <Label className="text-slate-200">Ek İstek (opsiyonel)</Label>
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
                  <div className="text-xs text-white">{p.name}</div>
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
                    <span className="text-white">{name}</span><span className="text-[var(--accent-cyan)]">×{count}</span>
                  </div>
                ))}
              </ScrollArea>
            </div>
            <div>
              <div className="panel-title pb-2">KABLO LISTESI ({wires.length})</div>
              <ScrollArea className="h-64 border border-[var(--border-structural)] p-2">
                {[...wireSummary.entries()].map(([k, totalM]) => (
                  <div key={k} className="text-xs flex justify-between font-mono">
                    <span className="text-white">{k.split('|')[0]}</span>
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
                      <span className="text-white">{p.deviceName}</span>
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

function serializeCanvasSvg(store, logoDataUrl = null, imageMap = {}) {
  const { devices, wires, groups, paper, orientation, projectName, routingMode } = store;
  let p = PAPER_PT[paper] || PAPER_PT.A4;
  if (orientation === 'portrait') p = { w: p.h, h: p.w };
  const W = p.w * 2, H = p.h * 2;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const d of devices) {
    minX = Math.min(minX, d.x); minY = Math.min(minY, d.y);
    maxX = Math.max(maxX, d.x + d.w); maxY = Math.max(maxY, d.y + d.h);
  }
  // Bölge kutuları da sınırlara dahil (cihazdan taşabilir)
  for (const g of (groups || [])) {
    minX = Math.min(minX, g.x); minY = Math.min(minY, g.y);
    maxX = Math.max(maxX, g.x + g.w); maxY = Math.max(maxY, g.y + g.h);
  }
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = W; maxY = H; }
  // Reserve space at the top for the project-name header
  const headerH = 60;
  const pad = 60;
  minX -= pad; maxX += pad; maxY += pad;
  minY -= (pad + headerH);
  const bw = maxX - minX, bh = maxY - minY;

  const obstacles = devices.map((d) => ({ x: d.x, y: d.y, w: d.w, h: d.h, id: d.id }));
  const routeCtx = { usedHoriz: new Set(), usedVert: new Set() };
  const wirePaths = wires.map((w) => {
    const fromDev = devices.find((d) => d.id === w.from.deviceId);
    const toDev = devices.find((d) => d.id === w.to.deviceId);
    if (!fromDev || !toDev) return null;
    const fromPort = fromDev.ports.find((p) => p.id === w.from.portId);
    const toPort = toDev.ports.find((p) => p.id === w.to.portId);
    if (!fromPort || !toPort) return null;
    const from = getPortAbsolute(fromDev, fromPort);
    const to = getPortAbsolute(toDev, toPort);
    if (w.manualPoints && w.manualPoints.length) return { wire: w, points: w.manualPoints };
    const pts = routingMode === 'astar'
      ? aStarRoute(from, to, obstacles, routeCtx, { gridSize: 10, stub: 24 })
      : routeWire(from, to, obstacles.filter((o) => o.id !== w.from.deviceId && o.id !== w.to.deviceId), 24);
    return { wire: w, points: pts };
  }).filter(Boolean);

  const bridges = new Map();
  for (let i = 0; i < wirePaths.length; i++) {
    for (let j = i + 1; j < wirePaths.length; j++) {
      const cs = findPathCrossings(wirePaths[i].points, wirePaths[j].points);
      for (const c of cs) {
        const key = wirePaths[j].wire.id;
        if (!bridges.has(key)) bridges.set(key, []);
        bridges.get(key).push(c);
      }
    }
  }

  const escape = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Use Liberation Mono/Sans which are present on the cairosvg server and support
  // the full Turkish glyph set (ı, ş, ğ, ç, ü, ö, İ ...). Fallback chain still
  // includes the generic monospace family if substitutions are needed.
  const monoFamily = 'Liberation Mono, DejaVu Sans Mono, monospace';
  const sansFamily = 'Liberation Sans, DejaVu Sans, sans-serif';

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${minX} ${minY} ${bw} ${bh}" width="${bw}" height="${bh}">`;
  svg += `<rect x="${minX}" y="${minY}" width="${bw}" height="${bh}" fill="#FFFFFF" />`;

  // ===== Top header: ONLY the project name, ~16pt =====
  const titleY = minY + (headerH / 2) + 6;     // baseline near vertical center
  const titleX = minX + bw / 2;                 // centered horizontally
  if (logoDataUrl) {
    svg += `<image x="${minX + 20}" y="${minY + 10}" width="${headerH - 20}" height="${headerH - 20}" preserveAspectRatio="xMidYMid meet" xlink:href="${logoDataUrl}" />`;
  }
  svg += `<text x="${titleX}" y="${titleY}" text-anchor="middle" font-size="22" font-weight="bold" font-family="${sansFamily}" fill="#000">${escape(projectName || 'KARAVAN ŞEMA')}</text>`;
  svg += `<line x1="${minX + 40}" y1="${minY + headerH - 4}" x2="${maxX - 40}" y2="${minY + headerH - 4}" stroke="#000" stroke-width="0.8" />`;

  // Bölge kutuları (en arkada — cihaz/kabloların altında)
  for (const g of (groups || [])) {
    svg += `<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="10" fill="${g.color}" fill-opacity="0.06" stroke="${g.color}" stroke-opacity="0.5" stroke-width="1.5" />`;
    svg += `<text x="${g.x + 12}" y="${g.y + 22}" font-size="15" font-weight="bold" font-family="${sansFamily}" fill="${g.color}" letter-spacing="1.2">${escape((g.title || '').toUpperCase())}</text>`;
  }

  // Wires
  for (const wp of wirePaths) {
    const w = wp.wire;
    const dash = w.style === 'dashed' ? '8 4' : w.style === 'dotted' ? '2 4' : 'none';
    const segCols = w.segmentColors && Object.keys(w.segmentColors).length > 0 ? w.segmentColors : null;
    if (segCols) {
      for (let i = 0; i < wp.points.length - 1; i++) {
        const a = wp.points[i], b = wp.points[i + 1];
        const col = segCols[i] || w.color;
        svg += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${col}" stroke-width="${w.thickness}" stroke-dasharray="${dash}" stroke-linecap="round" />`;
      }
    } else {
      const dStr = pathToSvgD(wp.points, 4);
      svg += `<path d="${dStr}" fill="none" stroke="${w.color}" stroke-width="${w.thickness}" stroke-dasharray="${dash}" stroke-linecap="round" stroke-linejoin="round" />`;
    }
    const bs = bridges.get(w.id) || [];
    for (const b of bs) {
      svg += `<circle cx="${b.x}" cy="${b.y}" r="6" fill="#FFFFFF" stroke="${w.color}" stroke-width="${w.thickness}" />`;
    }
    if (w.showLabel !== false && wp.points.length >= 2) {
      const labelText = getWireDisplayLabel(w);
      if (labelText) {
        const mid = Math.floor(wp.points.length / 2);
        const a = wp.points[Math.max(0, mid - 1)];
        const b = wp.points[mid] || a;
        let lx = (a.x + b.x) / 2;
        let ly = (a.y + b.y) / 2;
        if (w.labelOffset) { lx += w.labelOffset.x; ly += w.labelOffset.y; }
        const padX = labelText.length * 3 + 4;
        svg += `<rect x="${lx - padX}" y="${ly - 9}" width="${padX * 2}" height="14" fill="#FFFFFF" stroke="${w.color}" stroke-width="0.8" />`;
        svg += `<text x="${lx}" y="${ly + 3}" text-anchor="middle" font-size="9" font-family="${monoFamily}" fill="#000">${escape(labelText)}</text>`;
      }
    }
  }

  // Devices
  for (const d of devices) {
    const tpl = getTpl(d.templateId);
    const accent = tpl?.color || '#00E5FF';
    const imgUrl = d.imageId ? imageMap[d.imageId] : null;
    svg += `<g transform="translate(${d.x} ${d.y}) rotate(${d.rotation || 0} ${d.w / 2} ${d.h / 2})">`;
    svg += `<rect x="0" y="0" width="${d.w}" height="${d.h}" fill="#FFFFFF" stroke="#333" stroke-width="1" />`;
    svg += `<rect x="0" y="0" width="${d.w}" height="3" fill="${accent}" />`;
    // Embed uploaded device photo (if any)
    if (imgUrl) {
      const imgX = 4, imgY = 8;
      const imgW = d.w - 8;
      const imgH = d.h - 30;
      svg += `<image x="${imgX}" y="${imgY}" width="${imgW}" height="${imgH}" preserveAspectRatio="xMidYMid meet" xlink:href="${imgUrl}" />`;
    }
    svg += `<text x="${d.w / 2}" y="${d.h - 8}" text-anchor="middle" font-size="11" font-family="${monoFamily}" fill="#000">${escape(d.name)}</text>`;
    if (d.brand || d.model) {
      svg += `<text x="${d.w / 2}" y="${d.h / 2 + 4}" text-anchor="middle" font-size="9" font-family="${monoFamily}" fill="#555">${escape([d.brand, d.model].filter(Boolean).join(' / '))}</text>`;
    }
    if (d.ratingValue) {
      svg += `<text x="${d.w / 2}" y="${d.h / 2 - 8}" text-anchor="middle" font-size="10" font-family="${monoFamily}" fill="#000" font-weight="bold">${escape(d.ratingValue)} ${escape(d.ratingUnit || '')}</text>`;
    }
    for (const port of d.ports) {
      const abs = getPortAbsolute(d, port);
      const lx = abs.x - d.x;
      const ly = abs.y - d.y;
      svg += `<rect x="${lx - 4}" y="${ly - 4}" width="8" height="8" fill="${port.color}" stroke="#000" stroke-width="0.5" />`;
      const tx = port.side === 'right' ? lx + 8 : port.side === 'left' ? lx - 8 : lx;
      const ty = port.side === 'top' ? ly - 8 : port.side === 'bottom' ? ly + 16 : ly + 2;
      const anchor = port.side === 'right' ? 'start' : port.side === 'left' ? 'end' : 'middle';
      svg += `<text x="${tx}" y="${ty}" text-anchor="${anchor}" font-size="8" font-family="${monoFamily}" fill="#000">${escape(port.name)}</text>`;
    }
    svg += `</g>`;
  }

  svg += `</svg>`;
  return svg;
}
