import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, Upload, Plus } from 'lucide-react';
import { DEVICE_CATEGORIES } from '@/features/wiring/lib/devices';
import { uploadImage, fileUrl, createTemplate, updateTemplate } from '@/features/wiring/lib/api';
import { toast } from 'sonner';

function defaultPorts() {
  return [
    { name: '+', side: 'left', offset: 0.3, color: '#FF3B30' },
    { name: '-', side: 'left', offset: 0.7, color: '#1C1C1E' },
  ];
}

function fromTemplate(tpl) {
  return tpl ? {
    id: tpl.id,
    name: tpl.name || '',
    category: tpl.category || 'load',
    width: tpl.width || 120,
    height: tpl.height || 90,
    brand: tpl.brand || '',
    model: tpl.model || '',
    rating_value: tpl.rating_value || '',
    rating_unit: tpl.rating_unit || '',
    notes: tpl.notes || '',
    image_id: tpl.image_id || null,
    ports: (tpl.ports || []).map((p) => ({ name: p.name, side: p.side, offset: p.offset, color: p.color })),
  } : {
    name: '',
    category: 'load',
    width: 120,
    height: 90,
    brand: '',
    model: '',
    rating_value: '',
    rating_unit: '',
    notes: '',
    image_id: null,
    ports: defaultPorts(),
  };
}

export default function TemplateEditor({ open, onOpenChange, template, onSaved }) {
  const [form, setForm] = React.useState(() => fromTemplate(template));
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => { setForm(fromTemplate(template)); }, [template, open]);

  const set = (patch) => setForm((s) => ({ ...s, ...patch }));
  const updatePort = (i, patch) => setForm((s) => ({ ...s, ports: s.ports.map((p, idx) => idx === i ? { ...p, ...patch } : p) }));
  const addPort = () => set({ ports: [...form.ports, { name: 'P', side: 'right', offset: 0.5, color: '#F8F9FA' }] });
  const removePort = (i) => set({ ports: form.ports.filter((_, idx) => idx !== i) });

  const onImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await uploadImage(file);
      set({ image_id: data.id });
      toast.success('Görsel yüklendi');
    } catch {
      toast.error('Görsel yüklenemedi');
    }
  };

  const onSave = async () => {
    if (!form.name.trim()) { toast.error('Cihaz adı gerekli'); return; }
    if (!form.ports.length) { toast.error('En az 1 port gerekli'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        category: form.category,
        width: parseInt(form.width) || 120,
        height: parseInt(form.height) || 90,
        brand: form.brand,
        model: form.model,
        rating_value: form.rating_value,
        rating_unit: form.rating_unit,
        notes: form.notes,
        image_id: form.image_id,
        ports: form.ports,
      };
      const saved = template?.id
        ? await updateTemplate(template.id, payload)
        : await createTemplate(payload);
      toast.success(template?.id ? 'Cihaz güncellendi' : 'Cihaz kütüphaneye eklendi');
      onSaved?.(saved);
      onOpenChange(false);
    } catch (e) {
      toast.error(`Kayıt başarısız: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="wiring-portal bg-[var(--bg-panel)] border-[var(--border-structural)] rounded-none max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wider">
            {template?.id ? 'CIHAZ DÜZENLE' : 'YENİ CIHAZ EKLE'}
          </DialogTitle>
          <DialogDescription className="text-[var(--text-secondary)] text-xs font-mono">
            Bu cihaz kütüphaneye kalıcı olarak kaydedilecek ve istediğin zaman sürükle-bırak ile kullanabileceksin.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          {/* Left column: general info */}
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="panel-title">Cihaz Adı</Label>
              <Input value={form.name} onChange={(e) => set({ name: e.target.value })}
                     placeholder="Örn. Victron MPPT 75/15"
                     className="tech-input" data-testid="tpl-name-input" />
            </div>
            <div className="space-y-1">
              <Label className="panel-title">Kategori</Label>
              <Select value={form.category} onValueChange={(v) => set({ category: v })}>
                <SelectTrigger className="tech-input" data-testid="tpl-category-select"><SelectValue /></SelectTrigger>
                <SelectContent className="wiring-portal">
                  {DEVICE_CATEGORIES.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="panel-title">Genişlik</Label>
                <Input type="number" min="40" value={form.width} onChange={(e) => set({ width: e.target.value })} className="tech-input" />
              </div>
              <div className="space-y-1">
                <Label className="panel-title">Yükseklik</Label>
                <Input type="number" min="30" value={form.height} onChange={(e) => set({ height: e.target.value })} className="tech-input" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="panel-title">Marka</Label>
                <Input value={form.brand} onChange={(e) => set({ brand: e.target.value })} className="tech-input" />
              </div>
              <div className="space-y-1">
                <Label className="panel-title">Model</Label>
                <Input value={form.model} onChange={(e) => set({ model: e.target.value })} className="tech-input" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="panel-title">Teknik Değer</Label>
                <Input value={form.rating_value} onChange={(e) => set({ rating_value: e.target.value })}
                       placeholder="100" className="tech-input" />
              </div>
              <div className="space-y-1">
                <Label className="panel-title">Birim</Label>
                <Input value={form.rating_unit} onChange={(e) => set({ rating_unit: e.target.value })}
                       placeholder="Ah / A / W" className="tech-input" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="panel-title">Notlar</Label>
              <Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })}
                        className="tech-input min-h-[60px]" />
            </div>
            <div className="space-y-1">
              <Label className="panel-title">Cihaz Görseli</Label>
              <div className="flex items-center gap-2">
                <label className="flex-1 inline-flex items-center justify-center h-9 border border-[var(--border-interactive)] bg-[var(--bg-input)] text-xs cursor-pointer hover:border-[var(--accent-cyan)] gap-2">
                  <Upload className="w-3 h-3" />
                  <span>{form.image_id ? 'DEĞİŞTİR' : 'YÜKLE'}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={onImage} data-testid="tpl-image-input" />
                </label>
                {form.image_id && (
                  <>
                    <div className="w-12 h-12 border border-[var(--border-interactive)] bg-white flex items-center justify-center overflow-hidden">
                      <img src={fileUrl(form.image_id)} alt="preview" className="max-w-full max-h-full" />
                    </div>
                    <Button variant="ghost" size="sm" className="h-9 rounded-none text-[var(--accent-danger)] hover:bg-[var(--bg-hover)]"
                            onClick={() => set({ image_id: null })}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right column: ports */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="panel-title">PORTLAR ({form.ports.length})</div>
              <Button variant="ghost" size="sm" className="h-7 px-2 rounded-none text-[var(--accent-cyan)] hover:bg-[var(--bg-hover)]"
                      onClick={addPort} data-testid="tpl-add-port-btn">
                <Plus className="w-3 h-3 mr-1" /> Ekle
              </Button>
            </div>
            <ScrollArea className="h-[440px] border border-[var(--border-structural)] p-2">
              {form.ports.map((p, i) => (
                <div key={i} className="border border-[var(--border-structural)] p-2 mb-1.5 space-y-1.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    <Input value={p.name} onChange={(e) => updatePort(i, { name: e.target.value })}
                           className="tech-input" placeholder="Ad" />
                    <Select value={p.side} onValueChange={(v) => updatePort(i, { side: v })}>
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
                           onChange={(e) => updatePort(i, { offset: parseFloat(e.target.value) })} className="flex-1" />
                    <span className="font-mono text-[10px] w-8 text-right">{Math.round(p.offset * 100)}%</span>
                    <input type="color" value={p.color}
                           onChange={(e) => updatePort(i, { color: e.target.value })}
                           className="w-6 h-6 bg-transparent cursor-pointer border-0" />
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-none text-[var(--accent-danger)] hover:bg-[var(--bg-hover)]"
                            onClick={() => removePort(i)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </ScrollArea>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-structural)]">
          <Button variant="ghost" className="rounded-none h-9 hover:bg-[var(--bg-hover)]"
                  onClick={() => onOpenChange(false)}>
            İPTAL
          </Button>
          <Button className="rounded-none h-9 bg-[var(--accent-cyan)] text-black hover:bg-[var(--accent-cyan)]/90"
                  disabled={saving} onClick={onSave} data-testid="tpl-save-btn">
            {saving ? 'KAYDEDİLİYOR...' : (template?.id ? 'GÜNCELLE' : 'KÜTÜPHANEYE EKLE')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
