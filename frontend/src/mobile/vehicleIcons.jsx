// Servis araç tipi ikonları — masaüstü "Tür / Marka" seçimi (vehicle_brand) + is_trailer'a göre.
// Her tip ayrı yan-görünüş silueti + kendi rengi; PSA hacimleri (13/15/17M³) ortak. Bilinmeyen/boş → anahtar.
import React from "react";
import { Wrench } from "lucide-react";

const W = <><circle cx="6.5" cy="16.5" r="1.8" /><circle cx="17" cy="16.5" r="1.8" /></>; // tekerlekler

// Panelvan gövdeleri: roof→ön cam→burun farkı + yan pencere
const VANS = {
  psa: <><path d="M2 16V6.5A1.5 1.5 0 0 1 3.5 5h12l3.5 5.5h1.5A1.5 1.5 0 0 1 22 12v4H2z" /><path d="M15.5 5v5.5H19" /><path d="M5 8h6v3.5H5z" />{W}</>,
  mercedes: <><path d="M2 16V6.5A1.5 1.5 0 0 1 3.5 5H14l3 4.5h3c.9 0 1.5.7 1.5 1.6V16H2z" /><path d="M14 5v4.5h3" /><path d="M17.5 11.5h3" /><path d="M5 8h6v3.5H5z" />{W}</>,
  iveco: <><path d="M2 16V5.5A1.5 1.5 0 0 1 3.5 4H17c.8 0 1.4.6 1.5 1.4L19.8 12H21.5v4H2z" /><path d="M16 4v6.5h3.5" /><path d="M4.5 7.5h6v3.5h-6z" />{W}</>,
  volkswagen: <><path d="M2 16V6.5A1.5 1.5 0 0 1 3.5 5h10c.6 0 1.1.3 1.4.8L19 11h1.5c.8 0 1.5.7 1.5 1.5V16H2z" /><path d="M13.5 5l1.6 6H19" /><path d="M5 8h6v3.5H5z" />{W}</>,
  man: <><path d="M2 16V6.5A1.5 1.5 0 0 1 3.5 5h10c.6 0 1.1.3 1.4.8L19 11h1.5c.8 0 1.5.7 1.5 1.5V16H2z" /><path d="M13.5 5l1.6 6H19" /><path d="M20 13v1.8M21.5 13v1.8" /><path d="M5 8h6v3.5H5z" />{W}</>,
  ford: <><path d="M2 16V7a2 2 0 0 1 2-2h10.5c.7 0 1.3.4 1.7 1l2.8 4.5c1.8.2 3 1.4 3 3V16H2z" /><path d="M14.5 5.2l1.5 5.3h3" /><path d="M5 8h6v3.5H5z" />{W}</>,
  renault: <><path d="M2 16V7a2 2 0 0 1 2-2h11c1 0 1.8.6 2.2 1.4L19 10c1.9.3 3 1.6 3 3.5V16H2z" /><path d="M15.5 5.3l.5 4.7h3" /><path d="M5 8h6v3.5H5z" />{W}</>,
};

export const VEHICLE_KINDS = {
  psa: { label: "PSA", fg: "#2e8b7a", bg: "#e7f3ee", svg: VANS.psa },
  mercedes: { label: "Mercedes", fg: "#475569", bg: "#eef1f5", svg: VANS.mercedes },
  iveco: { label: "Iveco", fg: "#1e73be", bg: "#e8f0fb", svg: VANS.iveco },
  volkswagen: { label: "Volkswagen", fg: "#4f46e5", bg: "#eceefe", svg: VANS.volkswagen },
  man: { label: "MAN", fg: "#b45309", bg: "#fff5e6", svg: VANS.man },
  ford: { label: "Ford", fg: "#0e7490", bg: "#e6f4fb", svg: VANS.ford },
  renault: { label: "Renault", fg: "#a16207", bg: "#fdf6d8", svg: VANS.renault },
  semi: { label: "Semi entegre", fg: "#e56a1f", bg: "#fef0e8",
    svg: <><path d="M2 16V7.5A1.5 1.5 0 0 1 3.5 6H15c.6 0 1 .4 1 1v1.5l2.6.9c.5.2.9.5 1.1 1L21.5 13v3H2z" /><path d="M5 9h5v3H5z" /><path d="M16.5 10.5h2.2" />{W}</> },
  bus: { label: "Otobüs", fg: "#be123c", bg: "#fdecef",
    svg: <><rect x="2" y="5" width="20" height="11" rx="2" /><path d="M2 10.5h20" /><path d="M8 5v5.5M14 5v5.5" /><circle cx="6.5" cy="16.5" r="1.8" /><circle cx="17.5" cy="16.5" r="1.8" /></> },
  trailer: { label: "Çekme karavan", fg: "#3b6d11", bg: "#eaf3de",
    svg: <><path d="M3 15V9a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v6H3z" /><path d="M6 9h4v3H6z" /><path d="M13.5 9h2v6" /><circle cx="8.5" cy="16.5" r="1.8" /><path d="M18 14h3.5" /></> },
};

// Kayıt → tip anahtarı (vehicle_brand serbest metin olabilir: "RENAULT", "15M³ PSA", "Mercedes"…)
export function vehicleKind(s) {
  const b = String(s?.vehicle_brand || "").toLocaleUpperCase("tr");
  if (s?.is_trailer || b.includes("ÇEKME")) return "trailer";
  if (b.includes("ENTEGRE")) return "semi";
  if (b.includes("OTOBÜS") || b.includes("OTOBUS")) return "bus";
  if (b.includes("PSA") || /M³|M3\b/.test(b) || /PEUGEOT|CITRO|FIAT|DUCATO|BOXER|JUMPER/.test(b)) return "psa";
  if (b.includes("MERCEDES")) return "mercedes";
  if (b.includes("IVECO")) return "iveco";
  if (b.includes("VOLKSWAGEN") || b === "VW") return "volkswagen";
  if (b === "MAN" || b.startsWith("MAN ")) return "man";
  if (b.includes("FORD")) return "ford";
  if (b.includes("RENAULT")) return "renault";
  return null;
}

// Liste satırı ikon kutusu (h-11 w-11)
export function VehicleIcon({ s, size = 44 }) {
  const k = VEHICLE_KINDS[vehicleKind(s)];
  const inner = Math.round(size * 0.52);
  return (
    <div className="flex shrink-0 items-center justify-center rounded-xl" style={{ width: size, height: size, background: k?.bg || "#fef0e8" }} title={k?.label} aria-label={k?.label}>
      {k ? (
        <svg width={inner} height={inner} viewBox="0 0 24 24" fill="none" stroke={k.fg} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{k.svg}</svg>
      ) : (
        <Wrench style={{ width: inner * 0.85, height: inner * 0.85, color: "#e56a1f" }} />
      )}
    </div>
  );
}
