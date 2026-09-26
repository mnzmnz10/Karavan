// Araçlar (mobil): Akü Testi ve MPPT Hesaplama — Özet'teki "Araçlar" kartlarından tam ekran sheet olarak açılır.
import React, { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Plus, RotateCw, X, Download, Sun, Search, Check } from "lucide-react";
import { toast } from "../toast";
import { battery as batteryApi, mppt as mpptApi, products as productsApi, openDoc } from "../api";
import { Sheet, money } from "../ui";
import { FIELDS, STATUS_STYLE, toNum, lineFor, rotateB64 } from "../../lib/battery";
import { keepCaret } from "../../lib/caret";

const MAX_IMAGES = 5;
const newBatt = (id) => ({ id, label: "", files: [], images: [], values: null, assess: null, loading: false, error: null });
const card = "rounded-2xl bg-white p-4";
const sectionTitle = "mb-1.5 px-1 text-[12px] font-bold uppercase tracking-wide text-slate-400";
const inp = "w-full rounded-xl bg-slate-100 px-3 py-2.5 text-[15px] placeholder:text-slate-400";

// ============================ AKÜ TESTİ ============================
export function BatterySheet({ open, onClose }) {
  const [list, setList] = useState([newBatt(1)]);
  const [customer, setCustomer] = useState("");
  const [plate, setPlate] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const ref = useRef(list);
  const timers = useRef({});
  useEffect(() => { ref.current = list; }, [list]);
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  const patch = (id, p) => setList((prev) => prev.map((b) => (b.id === id ? { ...b, ...(typeof p === "function" ? p(b) : p) } : b)));

  const analyze = async (id, files) => {
    patch(id, { loading: true, error: null });
    try {
      const d = await batteryApi.extract(files);
      patch(id, { values: d.values || {}, assess: d.assessment || null, images: d.images_base64 || [], loading: false });
      toast.success("Değerler okundu", { haptic: "success" });
    } catch (e) {
      const msg = e?.response?.data?.detail || "Değerler okunamadı";
      patch(id, { loading: false, error: msg });
      toast.error(msg);
    }
  };
  const addFiles = (id, fl) => {
    const b = ref.current.find((x) => x.id === id);
    const imgs = Array.from(fl || []).filter((f) => (f.type || "").startsWith("image/"));
    if (!b || !imgs.length) return;
    const files = [...b.files, ...imgs].slice(0, MAX_IMAGES);
    patch(id, { files });
    analyze(id, files);
  };
  const removeImg = (id, i) => patch(id, (b) => {
    const files = b.files.filter((_, j) => j !== i);
    return { files, images: b.images.filter((_, j) => j !== i), ...(files.length ? {} : { values: null, assess: null }) };
  });
  const rotate = async (id, i) => {
    const b = ref.current.find((x) => x.id === id);
    try { const r = await rotateB64(b.images[i]); patch(id, (cur) => ({ images: cur.images.map((x, j) => (j === i ? r : x)) })); } catch {}
  };
  const setVal = (id, key, raw) => {
    patch(id, (b) => ({ values: { ...(b.values || {}), [key]: raw } }));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(async () => {
      const b = ref.current.find((x) => x.id === id);
      if (!b) return;
      try { patch(id, { assess: await batteryApi.assess(Object.fromEntries(FIELDS.map((f) => [f.key, toNum(b.values?.[f.key])]))) }); } catch {}
    }, 350);
  };

  const ready = list.filter((b) => b.values && b.assess && b.assess.status !== "unknown");
  const pdf = async () => {
    if (!ready.length) return;
    setPdfBusy(true);
    try {
      const blob = await batteryApi.pdf({
        customer_name: customer.trim() || null,
        vehicle_plate: plate.trim() || null,
        report_date: new Date().toLocaleDateString("tr-TR"),
        batteries: ready.map((b, i) => ({
          battery_number: i + 1, label: b.label.trim() || null, images_base64: b.images,
          values: Object.fromEntries(FIELDS.map((f) => [f.key, toNum(b.values[f.key])])),
        })),
      });
      openDoc(URL.createObjectURL(blob));
    } catch (e) {
      toast.error(e?.response?.data?.detail || "PDF oluşturulamadı");
    } finally { setPdfBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Akü Testi" full>
      <div className={card + " space-y-2"}>
        <input className={inp} value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Müşteri adı (isteğe bağlı)" />
        <input className={inp} value={plate} onChange={(e) => { keepCaret(e); setPlate(e.target.value.toLocaleUpperCase("tr")); }} placeholder="Plaka (isteğe bağlı)" />
      </div>

      {list.map((b, idx) => {
        const ss = b.assess ? STATUS_STYLE[b.assess.status] : null;
        const srcs = b.images.length ? b.images.map((x) => `data:image/jpeg;base64,${x}`) : [];
        return (
          <div key={b.id} className="mt-3">
            <div className={sectionTitle + " flex items-center"}>
              <span>{idx + 1}. Akü</span>
              {list.length > 1 && <button onClick={() => setList((p) => p.filter((x) => x.id !== b.id))} className="ml-auto normal-case text-slate-400">Kaldır</button>}
            </div>
            <div className={card}>
              <input className={inp} value={b.label} onChange={(e) => patch(b.id, { label: e.target.value })} placeholder="Ad: ör. Servis aküsü (isteğe bağlı)" />
              {ss && (
                <div className="mt-3 flex items-center justify-center rounded-xl py-2.5 text-[15px] font-extrabold text-white" style={{ background: ss.accent }}>
                  {b.assess.label}{b.assess.charge && b.assess.status !== "replace" ? " · ŞARJ EDİLMELİ" : ""}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {srcs.map((src, i) => (
                  <div key={i} className="relative h-24 w-24 overflow-hidden rounded-xl bg-slate-100">
                    <img src={src} alt="" className="h-full w-full object-contain" />
                    <button onClick={() => rotate(b.id, i)} aria-label="Döndür" className="absolute bottom-1 left-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white"><RotateCw className="h-3.5 w-3.5" /></button>
                    <button onClick={() => removeImg(b.id, i)} aria-label="Fotoğrafı kaldır" className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
                {b.files.length < MAX_IMAGES && (
                  <label className={`m-press flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-[12px] font-bold text-slate-500 ${b.loading ? "opacity-60" : ""}`}>
                    {b.loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                    {b.loading ? "Okunuyor…" : srcs.length ? "Foto ekle" : "Fotoğraf çek"}
                    <input type="file" accept="image/*" multiple className="hidden" disabled={b.loading} onChange={(e) => { addFiles(b.id, e.target.files); e.target.value = ""; }} />
                  </label>
                )}
              </div>
              {b.error && <div className="mt-2 text-[13px] font-semibold text-rose-600">{b.error}</div>}
              {b.values && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {FIELDS.map((f) => {
                    const line = lineFor(b.assess, f.label);
                    return (
                      <div key={f.key} className="rounded-xl bg-slate-50 p-2.5">
                        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{f.label}</div>
                        <div className="flex items-baseline gap-1">
                          <input value={b.values[f.key] ?? ""} onChange={(e) => setVal(b.id, f.key, e.target.value)} inputMode="decimal" placeholder="—"
                            aria-label={f.label} className="m-tnum w-full min-w-0 bg-transparent text-[22px] font-extrabold" style={{ color: "var(--m-primary)" }} />
                          <span className="text-[13px] font-semibold text-slate-400">{f.unit}</span>
                        </div>
                        <div className="text-[12px] text-slate-500">{line ? line[2] : " "}</div>
                      </div>
                    );
                  })}
                </div>
              )}
              {b.assess && ss && (
                <div className="mt-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold" style={{ background: ss.bg, color: ss.fg, borderLeft: `4px solid ${ss.accent}` }}>{b.assess.advice}</div>
              )}
            </div>
          </div>
        );
      })}

      <button onClick={() => setList((p) => [...p, newBatt((p[p.length - 1]?.id || 0) + 1)])} className="m-press mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 py-3 text-[14px] font-bold text-slate-500">
        <Plus className="h-4 w-4" /> Akü ekle
      </button>
      <button onClick={pdf} disabled={!ready.length || pdfBusy} className="m-press mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-bold text-white disabled:opacity-50" style={{ background: "var(--m-grad)" }}>
        {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} PDF rapor{ready.length ? ` (${ready.length} akü)` : ""}
      </button>
    </Sheet>
  );
}

// ============================ MPPT ============================
const numOrNull = (v) => toNum(v);

export function MpptSheet({ open, onClose }) {
  const [q, setQ] = useState("");
  const [panels, setPanels] = useState([]);
  const [searching, setSearching] = useState(false);
  const [f, setF] = useState({ productId: "", name: "", watt: "", voc: "", vmp: "", isc: "", imp: "", adet: "1" });
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [sys, setSys] = useState([]);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  // Panel arama (katalogdan güneş panelleri)
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const d = await productsApi.list({ search: q.trim() || "güneş panel", limit: 30 });
        const arr = Array.isArray(d) ? d : d?.items || d?.products || [];
        setPanels(arr.filter((p) => /panel/i.test(p.name || "") && !/çıkma/i.test(p.name || "")).slice(0, 12));
      } catch { setPanels([]); } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q, open]);

  const pick = async (p) => {
    const w = (p.name || "").match(/(\d{2,4})\s*W/i);
    setF((prev) => ({ ...prev, productId: p.id, name: p.name, watt: w ? w[1] : "", voc: "", vmp: "", isc: "", imp: "" }));
    setRes(null);
    try {
      const s = await mpptApi.specs(p.id);
      if (s?.exists) setF((prev) => ({ ...prev, watt: s.watt ?? prev.watt, voc: s.voc ?? "", vmp: s.vmp ?? "", isc: s.isc ?? "", imp: s.imp ?? "" }));
    } catch {}
  };

  const calc = async () => {
    const watt = toNum(f.watt);
    if (!watt) { toast.error("Panel gücünü (W) girin"); return; }
    setBusy(true); setRes(null); setSys([]);
    try {
      const r = await mpptApi.recommend({
        panel: { name: f.name || null, watt, voc: numOrNull(f.voc), vmp: numOrNull(f.vmp), isc: numOrNull(f.isc), imp: numOrNull(f.imp) },
        series: 1, parallel: parseInt(f.adet, 10) || 1, battery_voltage: 12,
      });
      setRes(r);
      const m = r.recommendation?.onerilen_mppt || {};
      const stdV = m.secilen_voltaj_v || 0, stdA = m.standart_akim_a || r.computed?.onerilen_standart_akim_a || 0;
      const d = await productsApi.list({ search: "mppt", limit: 60 });
      const arr = Array.isArray(d) ? d : d?.items || d?.products || [];
      setSys(arr.filter((p) => /mppt/i.test(p.name || "") && !/çıkma/i.test(p.name || "")).map((p) => {
        const n = p.name || ""; const vM = n.match(/(\d+)\s*V/i); const aM = n.match(/(\d+)\s*A/i);
        return { id: p.id, name: n, v: vM ? +vM[1] : null, a: aM ? +aM[1] : null, price: Number(p.list_price_try) || 0 };
      }).filter((x) => x.a && x.a >= stdA && (x.v == null || x.v >= stdV)).sort((a, b) => (a.a - b.a) || ((a.v || 999) - (b.v || 999))).slice(0, 5));
    } catch (e) {
      toast.error(e?.response?.data?.detail || "MPPT önerisi alınamadı");
    } finally { setBusy(false); }
  };

  const c = res?.computed || {}; const r = res?.recommendation || {}; const m = r.onerilen_mppt || {};
  return (
    <Sheet open={open} onClose={onClose} title="MPPT Hesaplama" full>
      <div className={sectionTitle}>Panel</div>
      <div className={card}>
        <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input className="w-full bg-transparent py-2.5 text-[15px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Panel ara (ör. 450W)" />
          {searching && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        </div>
        <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
          {panels.map((p) => (
            <button key={p.id} onClick={() => pick(p)} className={`m-press flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[14px] ${f.productId === p.id ? "bg-emerald-50 font-bold" : ""}`}>
              <Sun className="h-4 w-4 shrink-0" style={{ color: "#d9820a" }} />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              {f.productId === p.id && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
            </button>
          ))}
          {!searching && !panels.length && <div className="py-3 text-center text-[13px] text-slate-400">Panel bulunamadı — değerleri elle girebilirsin</div>}
        </div>
      </div>

      <div className={sectionTitle + " mt-4"}>Değerler</div>
      <div className={card + " grid grid-cols-2 gap-2"}>
        {[["watt", "Güç (W)"], ["adet", "Panel adedi"], ["voc", "Voc (V)"], ["vmp", "Vmp (V)"], ["isc", "Isc (A)"], ["imp", "Imp (A)"]].map(([k, l]) => (
          <label key={k} className="rounded-xl bg-slate-50 px-3 py-2">
            <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-400">{l}</span>
            <input value={f[k]} onChange={(e) => set(k, e.target.value)} inputMode="decimal" placeholder="—" className="m-tnum w-full bg-transparent text-[18px] font-bold" />
          </label>
        ))}
        <p className="col-span-2 text-[12px] text-slate-400">Sistem 12 V. Voc girilirse voltaj sınıfı kesin hesaplanır; boşsa tahmin edilir.</p>
      </div>

      <button onClick={calc} disabled={busy || !toNum(f.watt)} className="m-press mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-bold text-white disabled:opacity-50" style={{ background: "var(--m-grad)" }}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sun className="h-4 w-4" />} {busy ? "Hesaplanıyor…" : "MPPT Öner"}
      </button>

      {res && (
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl p-4 text-white" style={{ background: "linear-gradient(135deg,#1B3A5C,#15293f)" }}>
            <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#6ee7b7" }}>Önerilen MPPT</div>
            <div className="m-tnum mt-0.5 text-[30px] font-extrabold">{m.etiket || `${m.standart_akim_a || "—"} A`}</div>
            <div className="text-[13px] text-white/75">Şarj akımı <b className="m-tnum">{c.hesaplanan_sarj_akimi_a} A</b>{m.secilen_voltaj_v ? <> · Max PV <b className="m-tnum">{m.secilen_voltaj_v} V</b></> : null}</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[13px]">
              <div className="rounded-xl bg-white/10 px-3 py-2"><div className="text-[11px] text-white/60">Toplam güç</div><b className="m-tnum">{c.toplam_watt} W</b></div>
              <div className="rounded-xl bg-white/10 px-3 py-2"><div className="text-[11px] text-white/60">Panel</div><b className="m-tnum">{c.adet} × {c.panel_watt} W</b></div>
            </div>
          </div>
          {r.ozet && <div className={card + " text-[14px] leading-relaxed"} style={{ color: "var(--m-ink-2)" }}>{r.ozet}</div>}
          {(r.uyarilar || []).length > 0 && (
            <div className="space-y-1.5">{r.uyarilar.map((w, i) => <div key={i} className="rounded-xl bg-amber-50 px-3 py-2 text-[13px] text-amber-900">{w}</div>)}</div>
          )}
          <div>
            <div className={sectionTitle}>Sistemdeki uygun MPPT'ler</div>
            <div className={card + " space-y-2"}>
              {sys.length ? sys.map((x) => (
                <div key={x.id} className="flex items-center justify-between gap-2 text-[14px]">
                  <span className="min-w-0 flex-1 truncate font-semibold">{x.name}</span>
                  <span className="shrink-0 text-right">
                    <span className="m-tnum block text-[12px] text-slate-400">{x.a}A{x.v ? ` · ${x.v}V` : ""}</span>
                    {x.price > 0 && <span className="m-tnum font-bold" style={{ color: "var(--m-primary-2)" }}>₺{money(x.price)}</span>}
                  </span>
                </div>
              )) : <div className="text-[13px] text-slate-400">Sistemde {m.etiket || ""} değerini karşılayan kayıtlı MPPT yok.</div>}
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}
