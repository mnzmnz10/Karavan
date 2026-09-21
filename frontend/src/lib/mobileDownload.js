// Native (Capacitor) dosya indirme/açma köprüsü.
// App.js'de 15+ yerde `window.open(${API}/.../pdf,'_blank')` ve `<a download>`
// blob indirmesi var. WebView'de bunlar KOPAR (yeni sekme yok, native indirme
// tetiklenmez, üstelik auth cookie sistem tarayıcısına taşınmaz).
//
// Çözüm: App.js'e DOKUNMADAN, native'de global olarak
//   1) window.open(http-url) -> CapacitorHttp ile (cookie'li) indir + Share ile aç
//   2) <a download> tıklaması (blob:/data:/http) -> yakala + indir + Share
// böylece tüm export butonları çalışır.

import { Capacitor, CapacitorHttp } from '@capacitor/core';

function isNative() {
  return Capacitor?.isNativePlatform?.() === true;
}

// URL / Content-Disposition'dan dosya adı çıkar
function deriveName(url, contentDisposition) {
  if (contentDisposition) {
    const m = /filename\*?=(?:UTF-8'')?["']?([^"';\n]+)/i.exec(contentDisposition);
    if (m) return decodeURIComponent(m[1].trim());
  }
  try {
    const path = new URL(url, window.location.href).pathname.replace(/\/+$/, '');
    const last = path.split('/').filter(Boolean).pop() || 'dosya';
    // /quotes/{id}/pdf -> pdf endpoint'i: uzantı yoksa endpoint'ten tahmin
    if (/pdf$/i.test(last)) return `belge_${Date.now()}.pdf`;
    if (/download$/i.test(last)) return `belge_${Date.now()}.xlsx`;
    return last.includes('.') ? last : `${last}_${Date.now()}`;
  } catch {
    return `dosya_${Date.now()}`;
  }
}

function guessMime(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return {
    pdf: 'application/pdf',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    csv: 'text/csv', json: 'application/json',
  }[ext] || 'application/octet-stream';
}

async function toBase64FromBlobUrl(url) {
  const resp = await fetch(url); // blob:/data: WebView'de yerel, CORS yok
  const blob = await resp.blob();
  return await new Promise((res, rej) => {
    const r = new FileReader();
    r.onloadend = () => res(String(r.result).split(',')[1] || '');
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

// Dosyayı Cache'e yaz, Share sheet ile aç (PDF viewer / kaydet / paylaş)
async function saveAndOpen(base64, filename) {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');
  const safe = filename.replace(/[^\w.\-]+/g, '_');
  const written = await Filesystem.writeFile({
    path: safe,
    data: base64,
    directory: Directory.Cache,
    recursive: true,
  });
  try {
    await Share.share({ title: safe, url: written.uri, dialogTitle: 'Aç / Paylaş' });
  } catch (e) {
    // kullanıcı iptal ederse sorun değil; dosya Cache'te kaldı
  }
  return written.uri;
}

// http(s) URL'i cookie ile indir (CapacitorHttp -> native cookie jar)
async function downloadHttp(url) {
  const abs = new URL(url, window.location.href).toString();
  const res = await CapacitorHttp.get({ url: abs, responseType: 'blob' });
  // responseType 'blob' -> res.data base64 string
  const cd = res.headers?.['content-disposition'] || res.headers?.['Content-Disposition'];
  const name = deriveName(abs, cd);
  const base64 = typeof res.data === 'string' ? res.data : '';
  if (!base64) throw new Error('boş yanıt');
  return await saveAndOpen(base64, name);
}

let installed = false;

export function installMobileDownload() {
  if (installed || !isNative()) return;
  installed = true;

  // 1) window.open(url,'_blank') -> native indir/aç
  const origOpen = window.open.bind(window);
  window.open = function (url, target, features) {
    try {
      if (url && /^https?:/i.test(String(url))) {
        downloadHttp(String(url)).catch((e) => console.warn('[mobileDownload] http', e));
        return null;
      }
      if (url && /^(blob:|data:)/i.test(String(url))) {
        toBase64FromBlobUrl(String(url))
          .then((b64) => saveAndOpen(b64, deriveName(String(url))))
          .catch((e) => console.warn('[mobileDownload] blob', e));
        return null;
      }
    } catch (e) { /* düş -> orijinal */ }
    return origOpen(url, target, features);
  };

  // 2) <a download> tıklamaları (capture) -> yakala
  document.addEventListener(
    'click',
    (ev) => {
      const a = ev.target?.closest?.('a[download], a[href^="blob:"], a[href^="data:"]');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href) return;
      ev.preventDefault();
      ev.stopPropagation();
      const filename = a.getAttribute('download') || deriveName(href);
      if (/^https?:/i.test(href)) {
        downloadHttp(href).catch((e) => console.warn('[mobileDownload] a-http', e));
      } else {
        toBase64FromBlobUrl(href)
          .then((b64) => saveAndOpen(b64, filename))
          .catch((e) => console.warn('[mobileDownload] a-blob', e));
      }
    },
    true, // capture: App.js handler'larından önce
  );
}
