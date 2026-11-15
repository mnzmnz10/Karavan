import { useEffect, useState } from "react";
import { rates as ratesApi } from "./api";
import { cache } from "./cache";

// Kur yanıtı state'e de yazılır; önbelleğin dolması tek başına ekranı yenilemez.
export function useRates(active = true) {
  const [rates, setRates] = useState(() => cache.get("rates") || {});
  useEffect(() => {
    if (!active) return;
    let mounted = true;
    ratesApi.get().then((next) => {
      if (!next || !(next.EUR > 0)) return;
      cache.set("rates", next);
      if (mounted) setRates(next);
    }).catch(() => {});
    return () => { mounted = false; };
  }, [active]);
  return rates;
}
