import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { FileText } from "lucide-react";
import { worklistItems, hasText, worklistUrl } from "../lib/worklist";

// Masaüstü: fiyatsız iş listesi PDF'inde hangi kalemler olsun (hepsi seçili gelir)
export default function WorklistPicker({ service, api, onClose }) {
  const [off, setOff] = useState(new Set());
  const [notes, setNotes] = useState(true);
  const [ops, setOps] = useState(true);
  useEffect(() => { setOff(new Set()); setNotes(true); setOps(true); }, [service?.id]);
  if (!service) return null;
  const items = worklistItems(service);
  const toggle = (i) => setOff((cur) => { const n = new Set(cur); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const open = () => { window.open(worklistUrl(api, service.id, { skip: [...off], notes, ops }), "_blank"); onClose(); };
  const Row = ({ checked, onChange, children }) => (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 accent-emerald-600" />
      <span className="flex-1 text-sm text-slate-700">{children}</span>
    </label>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Fiyatsız iş listesi</DialogTitle>
          <DialogDescription>Listeye girmesini istemediğin kalemlerin işaretini kaldır.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] space-y-0.5 overflow-y-auto">
          {items.map((x) => (
            <Row key={x.idx} checked={!off.has(x.idx)} onChange={() => toggle(x.idx)}>
              {x.name} <span className="text-slate-400">× {x.qty}</span>
            </Row>
          ))}
          {hasText(service.operations) && <Row checked={ops} onChange={() => setOps(!ops)}><b>Yapılacak işlemler</b> bölümü</Row>}
          {hasText(service.notes) && <Row checked={notes} onChange={() => setNotes(!notes)}><b>Notlar</b> bölümü</Row>}
          {!items.length && !hasText(service.operations) && !hasText(service.notes) && <div className="py-6 text-center text-sm text-slate-400">Listelenecek kalem yok.</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Vazgeç</Button>
          <Button onClick={open} className="bg-emerald-600 hover:bg-emerald-700"><FileText className="mr-2 h-4 w-4" /> PDF Oluştur</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
