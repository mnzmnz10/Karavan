import React, { useEffect, useMemo, useState } from "react";
import { Wrench, Car, Phone, Image as ImageIcon, Loader2, Plus, Pencil } from "lucide-react";
import { services as servicesApi } from "../api";
import { Header, SearchBar, Card, EmptyState, SkeletonList, Sheet, money, Pill } from "../ui";
import ServiceForm from "./ServiceForm";

const STATUS = {
  received: { label: "Geldi", color: "amber" },
  in_progress: { label: "İşlemde", color: "blue" },
  delivered: { label: "Teslim", color: "green" },
};
const fmtDate = (s) => {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleDateString("tr-TR");
};
const vehicleLine = (s) => [s.vehicle_brand, s.vehicle_model].filter(Boolean).join(" ") || (s.is_trailer ? "Çekme karavan" : "");

function Row({ s, onOpen }) {
  const st = STATUS[s.status] || STATUS.received;
  return (
    <Card onClick={() => onOpen(s)} className="p-3.5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: "#fef0e8" }}>
          <Wrench className="h-5 w-5" style={{ color: "#e56a1f" }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-[15px] font-semibold leading-tight">{s.customer_name || "İsimsiz"}</div>
            <span className="ml-auto shrink-0"><Pill color={st.color}>{st.label}</Pill></span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[12px]" style={{ color: "var(--m-ink-2)" }}>
            {vehicleLine(s) && <span className="truncate">{vehicleLine(s)}</span>}
            {s.plate && <><span>·</span><span className="shrink-0 font-semibold">{s.plate}</span></>}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[12px] text-slate-400">
            {s.order_no && <span className="font-bold">{s.order_no}</span>}
            <span>{fmtDate(s.arrival_date || s.created_at)}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Detail({ id, onClose, onEdit }) {
  const [s, setS] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    servicesApi.get(id).then(setS).catch(() => setS(null)).finally(() => setLoading(false));
  }, [id]);

  const total = useMemo(() => {
    if (!s) return 0;
    if (s.cost != null) return Number(s.cost) || 0;
    return (s.items || []).reduce((a, it) => {
      const q = parseFloat(it.qty) || 1;
      const up = parseFloat(it.unit_price) || 0;
      const rate = it.currency && it.currency !== "TRY" ? (parseFloat(it.rate) || 1) : 1;
      return a + up * q * rate;
    }, 0);
  }, [s]);

  const st = s ? STATUS[s.status] || STATUS.received : null;

  return (
    <Sheet open={!!id} onClose={onClose} title="Servis Kaydı" full>
      {loading || !s ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : (
        <>
          <button onClick={() => onEdit?.(s)} className="m-press mb-3 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-white py-2.5 text-[14px] font-bold" style={{ color: "var(--m-primary)" }}>
            <Pencil className="h-4 w-4" /> Düzenle
          </button>
          <div className="rounded-2xl bg-white p-4">
            <div className="flex items-center gap-2">
              <div className="text-[19px] font-bold">{s.customer_name || "İsimsiz"}</div>
              {st && <span className="ml-auto"><Pill color={st.color}>{st.label}</Pill></span>}
            </div>
            <div className="mt-2 space-y-1 text-[13px]" style={{ color: "var(--m-ink-2)" }}>
              {vehicleLine(s) && <div className="flex items-center gap-2"><Car className="h-4 w-4" /> {vehicleLine(s)}{s.plate ? ` · ${s.plate}` : ""}</div>}
              {s.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4" /> {s.phone}</div>}
            </div>
            <div className="mt-2 text-[12px] text-slate-400">
              {s.order_no ? `${s.order_no} · ` : ""}Geliş: {fmtDate(s.arrival_date)}{s.delivery_date ? ` · Teslim: ${fmtDate(s.delivery_date)}` : ""}
            </div>
          </div>

          {s.operations && (
            <div className="mt-3 rounded-2xl bg-white p-4">
              <div className="mb-1 text-[12px] font-bold uppercase tracking-wide text-slate-400">Yapılan İşlemler</div>
              <div className="whitespace-pre-wrap text-[14px] leading-relaxed">{s.operations}</div>
            </div>
          )}

          {(s.items || []).length > 0 && (
            <div className="mt-3 rounded-2xl bg-white p-2">
              <div className="px-2 pb-1 pt-1 text-[12px] font-bold uppercase tracking-wide text-slate-400">Parça / İşlem</div>
              {s.items.map((it, i) => {
                const q = parseFloat(it.qty) || 1;
                const up = parseFloat(it.unit_price) || 0;
                const rate = it.currency && it.currency !== "TRY" ? (parseFloat(it.rate) || 1) : 1;
                return (
                  <div key={i} className="flex items-center justify-between gap-2 border-b border-slate-50 px-2 py-2.5 last:border-0">
                    <div className="min-w-0"><div className="truncate text-[14px] font-medium">{it.name}</div>{q > 1 && <div className="text-[12px] text-slate-400">× {q}</div>}</div>
                    <div className="m-tnum shrink-0 text-[14px] font-semibold">₺{money(up * q * rate)}</div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between rounded-2xl bg-white px-4 py-3.5">
            <span className="text-[14px] font-semibold" style={{ color: "var(--m-ink-2)" }}>Toplam</span>
            <span className="m-tnum text-[20px] font-extrabold" style={{ color: "var(--m-primary)" }}>₺{money(total)}</span>
          </div>

          {(s.photos || []).length > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[12px] font-bold uppercase tracking-wide text-slate-400">
                <ImageIcon className="h-3.5 w-3.5" /> Fotoğraflar ({s.photos.length})
              </div>
              <div className="grid grid-cols-3 gap-2">
                {s.photos.map((src, i) => (
                  <div key={i} className="aspect-square overflow-hidden rounded-xl bg-slate-100">
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {s.notes && (
            <div className="mt-3 rounded-2xl bg-white p-4">
              <div className="mb-1 text-[12px] font-bold uppercase tracking-wide text-slate-400">Notlar</div>
              <div className="whitespace-pre-wrap text-[14px] leading-relaxed">{s.notes}</div>
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}

export default function Services() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [selId, setSelId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formInitial, setFormInitial] = useState(null);

  const reload = async () => {
    setLoading(true);
    try { setItems(await servicesApi.list()); } catch { setItems([]); } finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLocaleLowerCase("tr");
    if (!s) return items;
    return items.filter((x) =>
      [x.customer_name, x.plate, x.vehicle_brand, x.vehicle_model, x.order_no, x.phone]
        .filter(Boolean).some((v) => v.toLocaleLowerCase("tr").includes(s))
    );
  }, [items, q]);

  const openNew = () => { setFormInitial(null); setFormOpen(true); };
  const openEdit = (rec) => { setSelId(null); setFormInitial(rec); setFormOpen(true); };

  return (
    <div className="flex h-full flex-col">
      <Header
        title="Servis"
        subtitle={loading ? "Yükleniyor…" : `${items.length} kayıt`}
        right={
          <button onClick={openNew} className="m-press flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "var(--m-primary)" }}>
            <Plus className="h-5 w-5 text-white" strokeWidth={2.6} />
          </button>
        }
      />
      <SearchBar value={q} onChange={setQ} placeholder="Müşteri, plaka, araç" />
      <div className="m-scroll flex-1 pb-[calc(var(--m-tabbar-h)+env(safe-area-inset-bottom)+8px)]">
        {loading ? (
          <SkeletonList />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Wrench} title="Servis kaydı yok" hint={q ? "Aramayı değiştir" : "Sağ üstteki + ile ekle"} />
        ) : (
          <div className="space-y-2 px-4 pt-1">{filtered.map((x) => <Row key={x.id} s={x} onOpen={(r) => setSelId(r.id)} />)}</div>
        )}
      </div>
      <Detail id={selId} onClose={() => setSelId(null)} onEdit={openEdit} />
      <ServiceForm open={formOpen} initial={formInitial} onClose={() => setFormOpen(false)} onSaved={reload} />
    </div>
  );
}
