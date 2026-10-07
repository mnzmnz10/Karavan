// Ürün arama: Türkçe karakter ve büyük/küçük harf duyarsız, kelimeler ayrı ayrı (sıra fark etmez).
// "akü 200" → "Megacell 12.8V 200Ah Akü" bulunur.

const FOLD = { ç: "c", ğ: "g", ı: "i", i̇: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

export function foldTR(s) {
  return String(s || "")
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîû]/g, (ch) => FOLD[ch] || ch)
    .replace(/i̇/g, "i");
}

export function productHaystack(p, extra = "") {
  return foldTR([p.name, p.brand, p.code, p.description, p.company_name, extra].filter(Boolean).join(" "));
}

// list: ürünler; q: arama metni; opts.extra(p): ek aranacak metin (örn. kategori adı)
export function searchProducts(list, q, opts = {}) {
  const tokens = foldTR(q).split(/\s+/).filter(Boolean);
  if (!tokens.length) return list;
  const out = [];
  for (const p of list) {
    const hay = productHaystack(p, opts.extra ? opts.extra(p) : "");
    if (tokens.every((t) => hay.includes(t))) out.push(p);
  }
  // Adı aramayla başlayanlar önce
  const first = tokens[0];
  return out.sort((a, b) => {
    const as = foldTR(a.name).startsWith(first) ? 0 : 1;
    const bs = foldTR(b.name).startsWith(first) ? 0 : 1;
    return as - bs;
  });
}
