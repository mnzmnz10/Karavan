// Yazarken büyük harfe çevrilen (toLocaleUpperCase) kontrollü alanlarda değer, yazılandan farklı
// olduğu için React onu yeniden basar ve imleç sona atlar. onChange başında çağır: seçim render
// sonrası geri konur (odak hâlâ o alandaysa).
export function keepCaret(e) {
  const el = e?.target;
  if (!el || typeof el.selectionStart !== 'number') return;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const restore = () => {
    if (document.activeElement !== el) return;
    try { el.setSelectionRange(start, end); } catch { /* seçim desteklemeyen tür */ }
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(restore);
  else setTimeout(restore, 0);
}
