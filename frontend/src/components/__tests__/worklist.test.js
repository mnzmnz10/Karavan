import { worklistItems, worklistUrl } from "../../lib/worklist";

test("worklistItems keeps original index, drops empty names and zero qty", () => {
  const svc = { items: [{ name: "Akü", qty: 1 }, { name: "", qty: 2 }, { name: "Komisyon", qty: 0 }, { name: " Webasto ", qty: 2 }] };
  expect(worklistItems(svc)).toEqual([{ idx: 0, name: "Akü", qty: 1 }, { idx: 3, name: "Webasto", qty: 2 }]);
});

test("worklistUrl adds only the needed params", () => {
  expect(worklistUrl("/api", "x")).toBe("/api/services/x/pdf?plain=1");
  expect(worklistUrl("/api", "x", { skip: [3, 0], notes: false, ops: true })).toBe("/api/services/x/pdf?plain=1&skip=0%2C3&notes=false");
});
