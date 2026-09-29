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

// Kayıt var mı: yerel işaretten okunur. Anahtar Zinciri'ne sormak (isCredentialsSaved) kayıt biyometri
// korumalı olduğu için iOS'ta HER seferinde Face ID istiyordu (hesap panelini açınca). Anahtar Zinciri'ne
// yalnız işaret hiç yazılmamışsa (bu sürümden önce kaydedilmiş) bir kez sorulur ve sonuç işarete yazılır.
const FLAG = "karavan_bio_saved"; // "mz:" ön eki yok → önbellek temizliği silmez
const readFlag = () => { try { return localStorage.getItem(FLAG); } catch { return null; } };
const writeFlag = (v) => { try { if (v) localStorage.setItem(FLAG, "1"); else localStorage.setItem(FLAG, "0"); } catch {} };

export async function bioSaved() {
  if (!native()) return false;
  const f = readFlag();
  if (f === "1" || f === "0") return f === "1";
  let saved = false;
  try { saved = !!(await NativeBiometric.isCredentialsSaved({ server: SERVER }))?.isSaved; } catch { saved = false; }
  writeFlag(saved);
  return saved;
}

export async function bioSave(username, password) {
  await NativeBiometric.setCredentials({ username, password, server: SERVER, accessControl: AccessControl.BIOMETRY_ANY });
  writeFlag(true);
}

// Biyometri istemi gösterir; iptal/başarısızlıkta hata fırlatır
export async function bioGet() {
  return NativeBiometric.getSecureCredentials({ server: SERVER, reason: "MSZ Karavan'a giriş" });
}

export async function bioDelete() {
  try { await NativeBiometric.deleteCredentials({ server: SERVER }); } catch {}
  writeFlag(false);
}
