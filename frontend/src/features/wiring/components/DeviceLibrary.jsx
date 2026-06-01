import React from 'react';
import { DEVICE_TEMPLATES, DEVICE_CATEGORIES } from '@/features/wiring/lib/devices';
import { useEditorStore } from '@/features/wiring/store/editorStore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Search, Pencil, Trash2, Package } from 'lucide-react';
import { toast } from 'sonner';
import { listTemplates, deleteTemplate, fileUrl } from '@/features/wiring/lib/api';
import TemplateEditor from '@/features/wiring/components/TemplateEditor';

export default function DeviceLibrary() {
  const [query, setQuery] = React.useState('');
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingTpl, setEditingTpl] = React.useState(null);
  const customTemplates = useEditorStore((s) => s.customTemplates);
  const setCustomTemplates = useEditorStore((s) => s.setCustomTemplates);

  const refresh = React.useCallback(async () => {
    try {
      const items = await listTemplates();
      setCustomTemplates(items || []);
    } catch (e) {
      console.warn('Template load failed:', e);
    }
  }, [setCustomTemplates]);

  React.useEffect(() => { refresh(); }, [refresh]);

  const onSaved = async () => { await refresh(); };

  const onDeleteCustom = async (tpl) => {
    if (!window.confirm(`"${tpl.name}" kütüphaneden silinsin mi?`)) return;
    try {
      await deleteTemplate(tpl.id);
      toast.success('Cihaz silindi');
      refresh();
    } catch {
      toast.error('Silinemedi');
    }
  };

  // Group both built-in and custom by category, filtered by query
  const grouped = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = {};
    for (const cat of DEVICE_CATEGORIES) out[cat.id] = { builtins: [], customs: [] };
    for (const d of DEVICE_TEMPLATES) {
      if (q && !d.name.toLowerCase().includes(q)) continue;
      if (out[d.category]) out[d.category].builtins.push(d);
    }
    for (const c of customTemplates) {
      const cat = c.category || 'load';
      if (q && !c.name.toLowerCase().includes(q)) continue;
      if (!out[cat]) out[cat] = { builtins: [], customs: [] };
      out[cat].customs.push(c);
    }
    return out;
  }, [query, customTemplates]);

  const onDragStart = (e, id) => {
    e.dataTransfer.setData('device-template', id);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <aside
      className="w-72 shrink-0 h-full border-r border-[var(--border-structural)] bg-[var(--bg-panel)] flex flex-col"
      data-testid="device-library"
    >
      <div className="px-3 py-2 border-b border-[var(--border-structural)] flex items-center justify-between">
        <div className="panel-title">CIHAZ KÜTÜPHANESI</div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[10px] tracking-widest uppercase text-[var(--accent-cyan)] hover:bg-[var(--bg-hover)] rounded-none"
          onClick={() => { setEditingTpl(null); setEditorOpen(true); }}
          data-testid="add-custom-device-btn"
        >
          <Plus className="w-3 h-3 mr-1" /> Yeni
        </Button>
      </div>
      <div className="px-3 py-2 border-b border-[var(--border-structural)] relative">
        <Search className="w-3 h-3 absolute left-5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cihaz ara..."
          className="h-8 pl-7 bg-[var(--bg-input)] border-[var(--border-interactive)] text-xs rounded-none focus:border-[var(--accent-cyan)] focus:ring-0 font-mono"
          data-testid="library-search-input"
        />
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-3">
          {DEVICE_CATEGORIES.map((cat) => {
            const bucket = grouped[cat.id] || { builtins: [], customs: [] };
            if (!bucket.builtins.length && !bucket.customs.length) return null;
            return (
              <div key={cat.id}>
                <div className="panel-title px-1 pb-1">{cat.label}</div>
                <div className="space-y-1">
                  {bucket.builtins.map((d) => {
                    const Icon = d.icon;
                    return (
                      <div
                        key={d.id}
                        className="lib-item"
                        draggable
                        onDragStart={(e) => onDragStart(e, d.id)}
                        data-testid={`library-item-${d.id}`}
                      >
                        <div className="w-6 h-6 flex items-center justify-center text-[var(--accent-cyan)]">
                          <Icon size={16} strokeWidth={1.5} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-white truncate">{d.name}</div>
                          <div className="text-[10px] text-[var(--text-secondary)] font-mono">
                            {d.ports.length} port
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {bucket.customs.map((d) => (
                    <div
                      key={d.id}
                      className="lib-item group"
                      draggable
                      onDragStart={(e) => onDragStart(e, d.id)}
                      data-testid={`library-item-${d.id}`}
                    >
                      <div className="w-6 h-6 border border-[var(--border-interactive)] bg-white flex items-center justify-center overflow-hidden shrink-0">
                        {d.image_id ? (
                          <img src={fileUrl(d.image_id)} alt={d.name} className="max-w-full max-h-full" />
                        ) : (
                          <Package size={12} className="text-[var(--text-tertiary)]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-[var(--accent-yellow)] truncate">{d.name}</div>
                        <div className="text-[10px] text-[var(--text-secondary)] font-mono truncate">
                          {[d.brand, d.model].filter(Boolean).join(' ') || `${(d.ports || []).length} port`}
                        </div>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                        <button
                          type="button"
                          className="h-6 w-6 inline-flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--accent-cyan)]"
                          onClick={(e) => { e.stopPropagation(); setEditingTpl(d); setEditorOpen(true); }}
                          data-testid={`tpl-edit-${d.id}`}
                          title="Düzenle"
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          type="button"
                          className="h-6 w-6 inline-flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--accent-danger)]"
                          onClick={(e) => { e.stopPropagation(); onDeleteCustom(d); }}
                          data-testid={`tpl-delete-${d.id}`}
                          title="Sil"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
      <div className="px-3 py-2 border-t border-[var(--border-structural)] text-[10px] text-[var(--text-tertiary)] font-mono">
        Sürükleyip bırakın · Sarı = özel cihaz
      </div>
      <TemplateEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        template={editingTpl}
        onSaved={onSaved}
      />
    </aside>
  );
}
