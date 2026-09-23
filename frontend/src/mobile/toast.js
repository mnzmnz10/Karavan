// sonner toast + dokunsal geri bildirim. Seçenek: { haptic: "light" | "success" | "warning" | "error" | false }
import { toast as base } from "sonner";
import { haptic } from "./haptics";

const wrap = (fn, kind) => (msg, opts) => {
  const { haptic: h, ...rest } = opts || {};
  if (h !== false) haptic(h || kind);
  return fn(msg, opts ? rest : undefined);
};

export const toast = Object.assign((...a) => base(...a), base, {
  success: wrap(base.success, "success"),
  error: wrap(base.error, "error"),
  warning: wrap(base.warning, "warning"),
});
