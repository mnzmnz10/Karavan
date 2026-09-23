// iOS/Android dokunsal geri bildirim — yalnız native uygulamada; web'de sessizce hiçbir şey yapmaz.
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

// kind: "light" (sık/küçük işlem) | "success" | "warning" | "error"
export function haptic(kind = "light") {
  try {
    if (!Capacitor.isNativePlatform()) return;
    if (kind === "light") Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    else Haptics.notification({ type: kind === "error" ? NotificationType.Error : kind === "warning" ? NotificationType.Warning : NotificationType.Success }).catch(() => {});
  } catch {}
}
