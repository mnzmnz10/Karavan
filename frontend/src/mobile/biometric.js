// Face ID / Touch ID ile giriş — yalnız native uygulamada. Kimlik bilgisi iOS Anahtar Zinciri'nde,
// biyometri korumalı (BIOMETRY_ANY) saklanır; web'de tüm fonksiyonlar "yok" döner.
import { Capacitor } from "@capacitor/core";
import { NativeBiometric, AccessControl, BiometryType } from "@capgo/capacitor-native-biometric";

const SERVER = "corlukaravan.shop";
const native = () => { try { return Capacitor.isNativePlatform(); } catch { return false; } };

// Kullanılabilir biyometri etiketi ("Face ID" | "Touch ID") ya da null
export async function bioLabel() {
  if (!native()) return null;
  try {
    const r = await NativeBiometric.isAvailable();
    if (!r?.isAvailable) return null;
    return r.biometryType === BiometryType.TOUCH_ID || r.biometryType === BiometryType.FINGERPRINT ? "Touch ID" : "Face ID";
  } catch { return null; }
}

export async function bioSaved() {
  if (!native()) return false;
  try { return !!(await NativeBiometric.isCredentialsSaved({ server: SERVER }))?.isSaved; } catch { return false; }
}

export async function bioSave(username, password) {
  await NativeBiometric.setCredentials({ username, password, server: SERVER, accessControl: AccessControl.BIOMETRY_ANY });
}

// Biyometri istemi gösterir; iptal/başarısızlıkta hata fırlatır
export async function bioGet() {
  return NativeBiometric.getSecureCredentials({ server: SERVER, reason: "MSZ Karavan'a giriş" });
}

export async function bioDelete() {
  try { await NativeBiometric.deleteCredentials({ server: SERVER }); } catch {}
}
