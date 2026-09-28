// Müşterinin bilinen bilgileri (telefon, plaka, araç) — aynı adlı en yeni servis kaydından; telefon yoksa
// sözleşmeden. Tekliften servise aktarımda formu doldurmak için (teklif bu alanları saklamaz).
const norm = (v) => String(v || '').trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ');
const when = (x) => String(x?.arrival_date || x?.created_at || '');

export function customerProfile(name, services = [], contracts = []) {
  const n = norm(name);
  const out = { phone: '', plate: '', vehicle_brand: '', vehicle_model: '', is_trailer: false };
  if (!n) return out;
  const svcs = (services || []).filter((s) => norm(s.customer_name) === n).sort((a, b) => when(b).localeCompare(when(a)));
  const vehicle = svcs.find((s) => (s.plate || '').trim() || (s.vehicle_brand || '').trim() || s.is_trailer);
  if (vehicle) {
    out.plate = vehicle.is_trailer ? '' : (vehicle.plate || '');
    out.vehicle_brand = vehicle.vehicle_brand || '';
    out.vehicle_model = vehicle.vehicle_model || '';
    out.is_trailer = !!vehicle.is_trailer;
  }
  out.phone = svcs.find((s) => (s.phone || '').trim())?.phone || '';
  if (!out.phone) {
    const c = (contracts || [])
      .filter((x) => norm(x.customer_name || x.data?.customer_name) === n)
      .find((x) => (x.customer_phone || x.data?.customer_phone || '').trim());
    if (c) out.phone = c.customer_phone || c.data?.customer_phone || '';
  }
  return out;
}
