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

test("customerNames: teklif+servis tekil, sıralı", () => {
  const { customerNames } = require("../cache");
  localStorage.clear();
  cache.set("quotes", [{ customer_name: "Zeki" }, { customer_name: "ali" }]);
  cache.set("services", [{ customer_name: "Ali " }, { customer_name: "Çetin" }]);
  expect(customerNames()).toEqual(["ali", "Çetin", "Zeki"]);
});

test("logout temizliği son kullanıcı adını korur", () => {
  localStorage.clear();
  cache.set("last_user", "karavan_admin");
  cache.set("quotes", [1]);
  cache.clearAll(["theme", "last_user"]);
  expect(cache.get("last_user")).toBe("karavan_admin");
  expect(cache.get("quotes")).toBeNull();
});
