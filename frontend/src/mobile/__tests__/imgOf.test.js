// Görsel arşivi: sunucu kopyası yalnız güncel linke aitse kullanılır; değilse orijinal linke düşer.
import { imgOf, imgFallback } from "../img";

test("kopya güncel → /api/img yolu", () => {
  expect(imgOf({ image_url: "https://x.com/a.jpg", image_cached: "/api/img/abc", image_cached_src: "https://x.com/a.jpg" })).toBe("/api/img/abc");
});
test("link değişmiş (kopya bayat) → yeni link", () => {
  expect(imgOf({ image_url: "https://x.com/b.jpg", image_cached: "/api/img/abc", image_cached_src: "https://x.com/a.jpg" })).toBe("https://x.com/b.jpg");
});
test("kopya yok → link; görsel yok → null", () => {
  expect(imgOf({ image_url: "https://x.com/a.jpg" })).toBe("https://x.com/a.jpg");
  expect(imgOf({})).toBeNull();
});
test("kopya yüklenemezse bir kez linke düşer, sonra gizlenir", () => {
  const p = { image_url: "https://x.com/a.jpg" };
  const el = document.createElement("img"); el.src = "http://localhost/api/img/abc";
  imgFallback(p)({ currentTarget: el });
  expect(el.src).toBe("https://x.com/a.jpg");
  imgFallback(p)({ currentTarget: el });
  expect(el.style.visibility).toBe("hidden");
});
