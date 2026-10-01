// Madde işaretli serbest metin: her satır "• " ile başlar.
// bulletEdit(prev, next, caret) → { value, caret } — textarea onChange'inde kullanılır.

export const BULLET = "• ";

export function bulletEdit(prev, next, caret) {
  const p = prev || "";
  const n = next || "";
  if (!n) return { value: "", caret: 0 };
  // Boş alana ilk karakter (yapıştırma dahil) → başına madde işareti
  if (!p && !n.startsWith("•")) return { value: BULLET + n, caret: caret + BULLET.length };
  // Tek bir satır sonu eklendiyse (Enter)
  if (n.length === p.length + 1 && caret > 0 && n[caret - 1] === "\n") {
    const lineStart = n.lastIndexOf("\n", caret - 2) + 1;
    const line = n.slice(lineStart, caret - 1);
    // Boş madde satırında Enter → listeyi bitir (işareti ve yeni satırı kaldır)
    if (line.trim() === "•") return { value: n.slice(0, lineStart) + n.slice(caret), caret: lineStart };
    return { value: n.slice(0, caret) + BULLET + n.slice(caret), caret: caret + BULLET.length };
  }
  return { value: n, caret };
}
