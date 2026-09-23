// Çevrimdışı kayıt kuyruğu (giden kutusu) — servis oluştur/güncelle ağ hatasında kaybolmaz:
// localStorage'a yazılır, bağlantı gelince sırayla gönderilir. Ekranlar bekleyen değişiklikleri
// `applyPending` ile hemen görür (`_pending: true`). Sunucu reddederse (4xx) kayıt düşürülür, kullanıcı uyarılır.
import { toast } from "./toast";

const KEY = "mz:outbox";
const EVT = "mz-outbox";
const runners = {}; // op → async (id, payload) => sunucu yanıtı (api.js kaydeder)
let flushing = null;

const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const write = (list) => {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { return false; }
  window.dispatchEvent(new CustomEvent(EVT, { detail: { count: list.length } }));
  return true;
};

export const isTmpId = (id) => typeof id === "string" && id.startsWith("tmp-");
export const pendingCount = () => read().length;
export const onOutbox = (fn) => { window.addEventListener(EVT, fn); return () => window.removeEventListener(EVT, fn); };
export function registerRunner(op, fn) { runners[op] = fn; }

// Kuyruğa ekle. Aynı kayda ait bekleyen işlemle birleştirir (oluşturma + sonraki güncelleme → tek oluşturma).
export function enqueue(op, id, payload) {
  const list = read();
  const rid = id || `tmp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const kind = op.split(":")[0]; // "svc"
  const prev = list.find((x) => x.id === rid && x.op.startsWith(kind + ":"));
  if (prev) prev.payload = { ...prev.payload, ...payload };
  else list.push({ op, id: rid, payload, ts: Date.now() });
  if (!write(list)) {
    const err = new Error("outbox full");
    err.response = { status: 0, data: { detail: "Çevrimdışı saklanamadı (fotoğraflar çok büyük olabilir)" } };
    throw err;
  }
  toast.warning("Çevrimdışı: kaydedildi, bağlantı gelince gönderilecek", { duration: 2500 });
  return { ...(prev ? prev.payload : payload), id: rid, _pending: true };
}

// Bekleyen değişiklikleri bir listeye uygula (kind: "svc")
export function applyPending(kind, items) {
  const list = read().filter((x) => x.op.startsWith(kind + ":"));
  if (!list.length) return items || [];
  const out = (items || []).map((it) => {
    const p = list.find((x) => x.op === `${kind}:update` && x.id === it.id);
    return p ? { ...it, ...p.payload, _pending: true } : it;
  });
  list.filter((x) => x.op === `${kind}:create`).forEach((x) => {
    const rec = { created_at: new Date(x.ts).toISOString(), ...x.payload, id: x.id, _pending: true };
    const i = out.findIndex((it) => it.id === x.id); // önbellekten gelen liste zaten içeriyorsa tekrar ekleme
    if (i >= 0) out[i] = rec; else out.unshift(rec);
  });
  return out;
}
export const applyPendingOne = (kind, rec) => (rec ? applyPending(kind, [rec])[0] : rec);
export const pendingRecord = (kind, id) => applyPending(kind, []).find((x) => x.id === id) || null;

// Geçici kimlik → sunucu kimliği (oluşturma gönderildikten sonra açık ekranlar tmp id ile çağırabilir)
const IDS = "mz:outbox_ids";
export const realId = (id) => { if (!isTmpId(id)) return id; try { return JSON.parse(localStorage.getItem(IDS) || "{}")[id] || id; } catch { return id; } };
const mapId = (tmp, real) => { try { const m = JSON.parse(localStorage.getItem(IDS) || "{}"); m[tmp] = real; localStorage.setItem(IDS, JSON.stringify(m)); } catch {} };

// Sırayla gönder. Ağ hatasında durur (sonra tekrar denenir); sunucu reddi (yanıtlı hata) → düşür + uyar.
// Gönderim sürerken aynı kayda yeni değişiklik birleşmişse kaybolmaz: oluşturma → gerçek id'li güncellemeye döner.
export function flush() {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    for (;;) {
      const list = read();
      if (!list.length) break;
      const job = list[0];
      const run = runners[job.op];
      if (!run) break;
      const same = (x) => x.op === job.op && x.id === job.id && x.ts === job.ts;
      let res, dropped = false;
      try {
        res = await run(isTmpId(job.id) ? null : job.id, job.payload);
        sent++;
        if (isTmpId(job.id) && res?.id) mapId(job.id, res.id);
      } catch (e) {
        if (!e?.response?.status) break; // hâlâ çevrimdışı
        dropped = true;
        toast.error(`Bekleyen kayıt gönderilemedi: ${e?.response?.data?.detail || "sunucu reddetti"}`);
      }
      const now = read();
      const i = now.findIndex(same);
      if (i >= 0) {
        const changed = JSON.stringify(now[i].payload) !== JSON.stringify(job.payload);
        if (dropped || !changed) now.splice(i, 1);
        else if (isTmpId(job.id) && res?.id) now[i] = { ...now[i], op: job.op.replace(":create", ":update"), id: res.id };
        // güncelleme sırasında değiştiyse: kalır, tamamı tekrar gönderilir
      }
      write(now);
    }
    if (sent) toast.success(sent === 1 ? "Bekleyen kayıt gönderildi" : `${sent} bekleyen kayıt gönderildi`);
    return sent;
  })().finally(() => { flushing = null; });
  return flushing;
}

// Otomatik gönderim: bağlantı gelince, uygulama öne gelince, bekleyen varsa 30 sn'de bir
let started = false;
export function startOutbox() {
  if (started) return;
  started = true;
  const kick = () => { if (pendingCount()) flush(); };
  window.addEventListener("online", kick);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") kick(); });
  setInterval(kick, 30000);
  kick();
}
