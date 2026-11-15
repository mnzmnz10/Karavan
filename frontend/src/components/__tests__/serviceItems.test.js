import { insertSubItem, removeItemWithSubs, normalizeSubs } from "../../lib/serviceItems";

const A = { name: "Akü" }, B = { name: "Panel" };

test("insertSubItem adds after the parent's existing subs", () => {
  let l = insertSubItem([A, B], 0, { name: "İşçilik 1" });
  l = insertSubItem(l, 0, { name: "İşçilik 2" });
  expect(l.map((x) => x.name)).toEqual(["Akü", "İşçilik 1", "İşçilik 2", "Panel"]);
  expect(l.map((x) => !!x.sub)).toEqual([false, true, true, false]);
  // alt kalemden çağrılırsa aynı ana kaleme eklenir
  expect(insertSubItem(l, 1, { name: "X" })[3]).toMatchObject({ name: "X", sub: true });
});

test("removeItemWithSubs drops a parent with its subs, a sub alone", () => {
  const l = [A, { name: "s1", sub: true }, { name: "s2", sub: true }, B];
  expect(removeItemWithSubs(l, 0).map((x) => x.name)).toEqual(["Panel"]);
  expect(removeItemWithSubs(l, 1).map((x) => x.name)).toEqual(["Akü", "s2", "Panel"]);
  expect(removeItemWithSubs(l, 3).map((x) => x.name)).toEqual(["Akü", "s1", "s2"]);
});

test("normalizeSubs never leaves an orphan sub at the top", () => {
  expect(normalizeSubs([{ name: "s", sub: true }, { name: "t", sub: true }]).map((x) => x.sub)).toEqual([false, true]);
  expect(normalizeSubs([{ name: "eski" }])[0].sub).toBe(false);
});


test("saving an empty parent never reparents its children to the previous block", () => {
  const { cleanServiceItems } = require("../../lib/serviceItems");
  const saved = cleanServiceItems([A, { name: "", sub: false }, { name: "s1", sub: true }, { name: "s2", sub: true }, B]);
  expect(saved.map((it) => it.sub)).toEqual([false, false, true, false]);
  expect(removeItemWithSubs(saved, 0).map((it) => it.name)).toEqual(["s1", "s2", "Panel"]);
});

test("mobile quantity preserves zero and defaults only empty quantities", () => {
  const { serviceItemQty } = require("../../lib/serviceItems");
  expect(serviceItemQty(0)).toBe(0);
  expect(serviceItemQty("0")).toBe(0);
  expect(serviceItemQty("")).toBe(1);
});

test("service KDV is off for old records and applied to the discounted net", () => {
  const { serviceKdvRate, serviceKdvAmount } = require("../../lib/serviceItems");
  expect(serviceKdvRate({})).toBe(0);
  expect(serviceKdvAmount(1000, { kdv_rate: 20 })).toBe(0);
  expect(serviceKdvRate({ kdv_enabled: true })).toBe(20);
  expect(serviceKdvAmount(47000 - 2000, { kdv_enabled: true, kdv_rate: 20 })).toBe(9000);
  expect(serviceKdvAmount(0.29, { kdv_enabled: true, kdv_rate: 50 })).toBe(0.15);
  expect(serviceKdvAmount(1.25, { kdv_enabled: true, kdv_rate: 10 })).toBe(0.13);
  expect(serviceKdvAmount(333.33, { kdv_enabled: true, kdv_rate: "10" })).toBe(33.33);
});

describe("drag reorder and category headers", () => {
  const { moveServiceItem, cleanServiceItems, categorySubtotal, newHeaderItem, normalizeSubs } = require("../../lib/serviceItems");
  const H = (name) => newHeaderItem(name);
  const S = (name) => ({ name, sub: true });
  const names = (l) => l.map((x) => (x.header ? `#${x.name}` : x.sub ? `-${x.name}` : x.name));

  test("a parent moves with its subs, never into another block", () => {
    const l = [A, S("a1"), S("a2"), B, S("b1"), { name: "C" }];
    expect(names(moveServiceItem(l, 0, 3))).toEqual(["Panel", "-b1", "Akü", "-a1", "-a2", "C"]);
    expect(names(moveServiceItem(l, 3, 1))).toEqual(["Panel", "-b1", "Akü", "-a1", "-a2", "C"]);
    expect(names(moveServiceItem(l, 5, 0))).toEqual(["C", "Akü", "-a1", "-a2", "Panel", "-b1"]);
    expect(moveServiceItem(l, 0, 1)).toEqual(l); // kendi alt kalemine bırakılırsa değişmez
  });

  test("a sub reorders inside its parent, can join another parent, becomes main at top or under a header", () => {
    const l = [A, S("a1"), S("a2"), B];
    expect(names(moveServiceItem(l, 2, 1))).toEqual(["Akü", "-a2", "-a1", "Panel"]);
    expect(names(moveServiceItem(l, 1, 3))).toEqual(["Akü", "-a2", "Panel", "-a1"]);
    expect(names(moveServiceItem(l, 1, 0))).toEqual(["a1", "Akü", "-a2", "Panel"]);
    const h = [H("Elektrik"), A, S("a1"), H("Su"), B];
    expect(names(moveServiceItem(h, 2, 3))).toEqual(["#Elektrik", "Akü", "#Su", "a1", "Panel"]);
  });

  test("headers move alone and regroup the items below them", () => {
    const l = [H("Elektrik"), A, S("a1"), B, H("Su")];
    expect(names(moveServiceItem(l, 4, 2))).toEqual(["#Elektrik", "#Su", "Akü", "-a1", "Panel"]);
    expect(names(moveServiceItem(l, 4, 3))).toEqual(["#Elektrik", "Akü", "-a1", "#Su", "Panel"]);
    expect(names(moveServiceItem(l, 0, 1))).toEqual(["Akü", "-a1", "#Elektrik", "Panel", "#Su"]);
    expect(normalizeSubs([H("x"), S("y")])[1].sub).toBe(false);
  });

  test("removing a header keeps its items; cleaning keeps named headers, drops empty ones", () => {
    const l = [H("Elektrik"), A, S("a1"), H(""), S("b")];
    expect(names(removeItemWithSubs(l, 0))).toEqual(["Akü", "-a1", "#", "-b"]);
    const saved = cleanServiceItems(l);
    expect(names(saved)).toEqual(["#Elektrik", "Akü", "-a1", "b"]);
    expect(saved[0]).toMatchObject({ header: true, qty: 0, unit_price: 0, unit_cost: 0, sub: false });
  });

  test("category subtotal sums until the next header, subs included", () => {
    const l = [H("E"), { qty: 2, unit_price: 10 }, { qty: 1, unit_price: 5, sub: true }, H("S"), { qty: 1, unit_price: 100 }];
    const line = (it) => (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
    expect(categorySubtotal(l, 0, line)).toBe(25);
    expect(categorySubtotal(l, 3, line)).toBe(100);
  });
});
