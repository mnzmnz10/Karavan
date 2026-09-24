// Servis araç tipi görselleri — masaüstü "Tür / Marka" seçimi (vehicle_brand) + is_trailer'a göre.
// Her tip kendi modeline benzeyen yan görünüş çizimi (SnapAI, A2 stili; public/vehicles/*.webp).
// PSA hacimleri (13/15/17M³) ortak; semi entegre = uygulama ikonundaki A2 karavan. Bilinmeyen/boş → anahtar.
import React from "react";
import { Wrench } from "lucide-react";

// Görsel değişince artır: Cloudflare/Safari önbelleğini (max-age 4 sa) atlatır
const ASSET_V = 2;

export const VEHICLE_KINDS = {
  psa: "PSA (Boxer/Jumper)",
  mercedes: "Mercedes Sprinter",
  iveco: "Iveco Daily",
  volkswagen: "Volkswagen Crafter",
  man: "MAN TGE",
  ford: "Ford Transit",
  renault: "Renault Master",
  semi: "Semi entegre",
  bus: "Otobüs",
  trailer: "Çekme karavan",
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

// Liste satırı görsel kutusu (56×44): araç çizimi ya da anahtar
export function VehicleIcon({ s }) {
  const k = vehicleKind(s);
  return (
    <div className="m-vehicle flex h-11 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl" title={k ? VEHICLE_KINDS[k] : undefined}>
      {k ? (
        <img src={`${process.env.PUBLIC_URL || ""}/vehicles/${k}.webp?v=${ASSET_V}`} alt={VEHICLE_KINDS[k]} loading="lazy" decoding="async" className="max-h-[36px] w-[52px] object-contain" />
      ) : (
        <Wrench className="h-5 w-5" style={{ color: "#e56a1f" }} />
      )}
    </div>
  );
}
