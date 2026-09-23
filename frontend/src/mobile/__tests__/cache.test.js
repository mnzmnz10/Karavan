import { cache } from "../cache";

test("clearAll: mz: iş verisini siler, tema ve yabancı anahtarlar kalır", () => {
  localStorage.clear();
  cache.set("theme", "dark");
  cache.set("quotes", [{ id: 1 }]);
  cache.set("prodcost", { a: 1 });
  cache.set("cart_form", { name: "x" });
  localStorage.setItem("other", "1");
  cache.clearAll(["theme"]);
  expect(cache.get("theme")).toBe("dark");
  expect(cache.get("quotes")).toBeNull();
  expect(cache.get("prodcost")).toBeNull();
  expect(cache.get("cart_form")).toBeNull();
  expect(localStorage.getItem("other")).toBe("1");
});
