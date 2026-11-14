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
