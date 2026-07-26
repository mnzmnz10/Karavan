import { useState } from "react";
import {
  Undo2, Redo2, Grid3x3, FileText, FilePlus2, Sparkles,
  ShieldCheck, Download, FolderOpen, History, Save, Trash2, Lock, Unlock, Waypoints,
} from "lucide-react";
import { useProjectStore } from "@/features/wiringrf/store/useProjectStore";
import { buildSeedProject } from "@/features/wiringrf/data/seed";
import { exportProjectPdf } from "@/features/wiringrf/lib/pdf";
import { buildCableList, exportBomExcel, toCsv } from "@/features/wiringrf/lib/bom";
import {
  deleteProject as deleteBackendProject,
  type BackendProject,
} from "@/features/wiringrf/lib/backendApi";
import type { LayerId } from "@/features/wiringrf/types";

const LAYERS: { id: LayerId; label: string }[] = [
  { id: "products", label: "Ürünler" },
  { id: "dc", label: "DC" },
  { id: "ac", label: "AC" },
  { id: "data", label: "Data" },
  { id: "ground", label: "Toprak" },
  { id: "labels", label: "Etiket" },
];

function Btn({ onClick, title, children, disabled }: { onClick?: () => void; title: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button onClick={onClick} title={title} disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
      {children}
    </button>
  );
}

export function TopBar({ onAi }: { onAi: () => void }) {
  const meta = useProjectStore((s) => s.meta);
  const setMeta = useProjectStore((s) => s.setMeta);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const snap = useProjectStore((s) => s.snapToGrid);
  const setSnap = useProjectStore((s) => s.setSnapToGrid);
  const autoRoute = useProjectStore((s) => s.autoRoute);
  const setAutoRoute = useProjectStore((s) => s.setAutoRoute);
  const layers = useProjectStore((s) => s.layers);
  const layerLocks = useProjectStore((s) => s.layerLocks);
  const toggleLayer = useProjectStore((s) => s.toggleLayer);
  const toggleLayerLock = useProjectStore((s) => s.toggleLayerLock);
  const loadSnapshot = useProjectStore((s) => s.loadSnapshot);
  const newProject = useProjectStore((s) => s.newProject);
  const versions = useProjectStore((s) => s.versions);
  const createVersion = useProjectStore((s) => s.createVersion);
  const restoreVersion = useProjectStore((s) => s.restoreVersion);
  const saveToBackend = useProjectStore((s) => s.saveToBackend);
  const loadFromBackend = useProjectStore((s) => s.loadFromBackend);
  const listBackendProjects = useProjectStore((s) => s.listBackendProjects);
  const [busy, setBusy] = useState(false);
  const [backendBusy, setBackendBusy] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [projects, setProjects] = useState<BackendProject[]>([]);

  const emit = (event: "kablo:info" | "kablo:save-error" | "kablo:load-error", detail: string) => {
    window.dispatchEvent(new CustomEvent(event, { detail }));
  };

  const onExportPdf = async () => {
    setBusy(true);
    try {
      const { nodes, edges } = useProjectStore.getState();
      await exportProjectPdf(meta, nodes, edges);
    } catch (e) {
      window.dispatchEvent(new CustomEvent("kablo:save-error", {
        detail: "PDF oluşturulamadı: " + (e instanceof Error ? e.message : "bilinmeyen hata"),
      }));
    } finally {
      setBusy(false);
    }
  };

  const onSaveVersion = () => {
    const label = window.prompt("Versiyon adı:", `Versiyon ${versions.length + 1}`);
    if (label !== null) createVersion(label);
  };

  const refreshProjects = async () => {
    const list = await listBackendProjects();
    setProjects(list);
    return list;
  };

  const onBackendSave = async () => {
    setBackendBusy(true);
    try {
      const project = await saveToBackend();
      emit("kablo:info", `Proje kaydedildi: ${project.name}`);
      if (showProjects) await refreshProjects();
    } catch (e) {
      emit("kablo:save-error", e instanceof Error ? e.message : "Sunucu kaydi basarisiz.");
    } finally {
      setBackendBusy(false);
    }
  };

  const onOpenProjects = async () => {
    const next = !showProjects;
    setShowProjects(next);
    if (!next) return;
    setBackendBusy(true);
    try {
      await refreshProjects();
    } catch (e) {
      emit("kablo:save-error", e instanceof Error ? e.message : "Proje listesi alinamadi.");
    } finally {
      setBackendBusy(false);
    }
  };

  const onLoadProject = async (id: string) => {
    setBackendBusy(true);
    try {
      const project = await loadFromBackend(id);
      emit("kablo:info", `Proje acildi: ${project.name}`);
      setShowProjects(false);
    } catch (e) {
      emit("kablo:load-error", e instanceof Error ? e.message : "Proje acilamadi.");
    } finally {
      setBackendBusy(false);
    }
  };

  const onDeleteProject = async (project: BackendProject) => {
    if (!window.confirm(`"${project.name}" projesi silinsin mi?`)) return;
    setBackendBusy(true);
    try {
      await deleteBackendProject(project.id);
      emit("kablo:info", "Proje silindi.");
      await refreshProjects();
    } catch (e) {
      emit("kablo:save-error", e instanceof Error ? e.message : "Proje silinemedi.");
    } finally {
      setBackendBusy(false);
    }
  };

  const onExportCsv = () => {
    const { nodes, edges } = useProjectStore.getState();
    const cables = buildCableList(nodes, edges);
    const csv = toCsv(cables as unknown as Record<string, unknown>[], ["type", "size", "fuse", "from", "to", "length"]);
    const blob = new Blob(["?" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${meta.name || "kablo"}-kablolar.csv`;
    a.click();
  };

  const onExportExcel = () => {
    const { nodes, edges } = useProjectStore.getState();
    exportBomExcel(nodes, edges, `${meta.name || "kablo"}-bom.xlsx`);
  };

  return (
    <header className="flex flex-col gap-2 border-b border-slate-200 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={meta.name}
          onChange={(e) => setMeta({ name: e.target.value })}
          className="w-56 rounded-md border border-slate-300 px-2 py-1.5 text-sm font-medium outline-none focus:border-blue-400"
        />
        <input
          value={meta.customer ?? ""}
          onChange={(e) => setMeta({ customer: e.target.value })}
          placeholder="Müşteri"
          className="w-36 rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-blue-400"
        />

        <div className="mx-1 h-6 w-px bg-slate-200" />
        <Btn onClick={undo} title="Geri al"><Undo2 size={14} /></Btn>
        <Btn onClick={redo} title="İleri al"><Redo2 size={14} /></Btn>
        <Btn onClick={() => setSnap(!snap)} title="Snap-to-grid">
          <Grid3x3 size={14} className={snap ? "text-blue-600" : ""} /> Snap
        </Btn>
        <Btn
          onClick={() => setAutoRoute(!autoRoute)}
          title="Kablo yönlendirme: Otomatik (yoğun/karmaşık şema, engel-kaçınan) ↔ Basit (düz kablo)"
        >
          <Waypoints size={14} className={autoRoute ? "text-blue-600" : ""} /> {autoRoute ? "Oto Kablo" : "Basit Kablo"}
        </Btn>

        <div className="mx-1 h-6 w-px bg-slate-200" />
        <Btn onClick={newProject} title="Yeni proje"><FilePlus2 size={14} /> Yeni</Btn>
        <Btn onClick={() => loadSnapshot(buildSeedProject(), { name: "Örnek Victron Sistemi", customer: "Demo", systemVoltage: "12V", vanType: "Panel Van" }, { undoable: true })} title="Örnek proje yükle">
          <FolderOpen size={14} /> Örnek
        </Btn>

        <Btn onClick={onBackendSave} disabled={backendBusy} title="Sunucuya kaydet"><Save size={14} /> Kaydet</Btn>
        <div className="relative">
          <Btn onClick={onOpenProjects} disabled={backendBusy} title="Sunucu projeleri">
            <FolderOpen size={14} /> Projeler
          </Btn>
          {showProjects && (
            <div className="absolute left-0 top-9 z-50 max-h-80 w-80 overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-lg">
              {backendBusy && <p className="p-2 text-xs text-slate-400">Yukleniyor...</p>}
              {!backendBusy && projects.length === 0 && <p className="p-2 text-xs text-slate-400">Kayitli proje yok.</p>}
              {projects.map((p) => (
                <div key={p.id} className="flex items-center gap-1 rounded px-2 py-1.5 hover:bg-blue-50">
                  <button
                    onClick={() => onLoadProject(p.id)}
                    className="min-w-0 flex-1 text-left text-xs"
                  >
                    <span className="block truncate font-medium text-slate-700">{p.name}</span>
                    <span className="block text-[10px] text-slate-400">{new Date(p.updated_at).toLocaleString("tr-TR")}</span>
                  </button>
                  <button
                    onClick={() => onDeleteProject(p)}
                    title="Projeyi sil"
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mx-1 h-6 w-px bg-slate-200" />
        <Btn onClick={onSaveVersion} title="Mevcut durumu versiyon olarak kaydet"><Save size={14} /> Versiyon</Btn>
        <div className="relative">
          <Btn onClick={() => setShowVersions((v) => !v)} title="Versiyon geçmişi">
            <History size={14} /> Geçmiş ({versions.length})
          </Btn>
          {showVersions && (
            <div className="absolute left-0 top-9 z-50 max-h-72 w-64 overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-lg">
              {versions.length === 0 && <p className="p-2 text-xs text-slate-400">Henüz versiyon yok.</p>}
              {versions.map((v) => (
                <button key={v.id}
                  onClick={() => { restoreVersion(v.id); setShowVersions(false); }}
                  className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-blue-50">
                  <span className="font-medium text-slate-700">{v.label}</span>
                  <span className="block text-[10px] text-slate-400">{new Date(v.createdAt).toLocaleString("tr-TR")}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Btn onClick={onAi} title="AI ile otomatik şema"><Sparkles size={14} /> AI Oluştur</Btn>
          <Btn onClick={onExportExcel} title="BOM Excel indir"><Download size={14} /> BOM Excel</Btn>
          <Btn onClick={onExportCsv} title="Kablo listesi CSV"><Download size={14} /> CSV</Btn>
          <button onClick={onExportPdf} disabled={busy} title="PDF export"
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            <FileText size={14} /> {busy ? "Hazırlanıyor..." : "PDF Export"}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <span className="mr-1 text-[10px] font-semibold uppercase text-slate-400">Katmanlar:</span>
        {LAYERS.map((l) => (
          <span key={l.id} className="inline-flex overflow-hidden rounded border border-slate-200">
            <button onClick={() => toggleLayer(l.id)}
              className={`px-2 py-0.5 text-[11px] ${layers[l.id] ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-400 line-through"}`}>
              {l.label}
            </button>
            <button
              onClick={() => toggleLayerLock(l.id)}
              title={layerLocks[l.id] ? "Katman kilidini ac" : "Katmani kilitle"}
              className={`border-l border-slate-200 px-1 ${layerLocks[l.id] ? "bg-amber-100 text-amber-700" : "bg-white text-slate-400 hover:text-slate-700"}`}
            >
              {layerLocks[l.id] ? <Lock size={11} /> : <Unlock size={11} />}
            </button>
          </span>
        ))}
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-slate-400">
          <ShieldCheck size={12} /> Otomatik kayıt açık · localStorage
        </span>
      </div>
    </header>
  );
}

