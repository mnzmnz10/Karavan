import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { searchProducts, foldTR } from "../../lib/productSearch";
import ProductPicker from "../ProductPicker";

const PRODUCTS = [
  { id: "a", name: "Megacell 12.8V 200Ah Akü", brand: "Megacell", category_id: "c1", list_price_try: 36614 },
  { id: "b", name: "Havensis 40A MPPT", brand: "Havensis", category_id: "c2", list_price_try: 9099 },
  { id: "c", name: "Işık Şeridi LED", brand: "Ledo", category_id: "c3", list_price_try: 450 },
];
const CATS = [{ id: "c1", name: "Akü" }, { id: "c2", name: "Şarj Cihazı" }, { id: "c3", name: "Aydınlatma" }];

describe("searchProducts", () => {
  test("folds Turkish characters and case", () => {
    expect(foldTR("IŞIK Şeridi Akü")).toBe("isik seridi aku");
  });
  test("matches every word in any order", () => {
    expect(searchProducts(PRODUCTS, "200 akü").map((p) => p.id)).toEqual(["a"]);
    expect(searchProducts(PRODUCTS, "isik").map((p) => p.id)).toEqual(["c"]);
    expect(searchProducts(PRODUCTS, "havensis mppt 40").map((p) => p.id)).toEqual(["b"]);
  });
  test("extra text (category name) is searchable", () => {
    const cat = new Map(CATS.map((c) => [c.id, c.name]));
    expect(searchProducts(PRODUCTS, "sarj", { extra: (p) => cat.get(p.category_id) }).map((p) => p.id)).toEqual(["b"]);
  });
  test("empty query returns the list", () => {
    expect(searchProducts(PRODUCTS, "  ")).toHaveLength(3);
  });
});

describe("ProductPicker", () => {
  let host, root;
  beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
  afterEach(() => { act(() => root.unmount()); host.remove(); document.body.innerHTML = ""; });

  const render = (props) => act(() => { root.render(<ProductPicker open onClose={() => {}} products={PRODUCTS} categories={CATS} {...props} />); });

  test("click to pick with quantity, then add", () => {
    const onAdd = jest.fn();
    render({ onAdd });
    const row = Array.from(document.body.querySelectorAll("[title]")).find((el) => el.getAttribute("title") === "Havensis 40A MPPT").closest(".cursor-pointer");
    act(() => { row.click(); });
    act(() => { row.click(); });
    const add = Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent.includes("Ekle (1)"));
    act(() => { add.click(); });
    expect(onAdd).toHaveBeenCalledWith([{ product: PRODUCTS[1], qty: 2 }]);
  });

  test("category filter narrows the list", () => {
    render({ onAdd: jest.fn() });
    const catBtn = Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent.startsWith("Aydınlatma"));
    act(() => { catBtn.click(); });
    const titles = Array.from(document.body.querySelectorAll(".line-clamp-2")).map((el) => el.textContent);
    expect(titles).toEqual(["Işık Şeridi LED"]);
  });
});
