// Çevrimdışı kuyruk: ağ hatasında servis yazmaları kaybolmaz, listede görünür, bağlantı gelince gönderilir.
const mockNet = { online: false, posts: [], puts: [], seq: 0 };
const mockOffline = () => Promise.reject({ response: { status: 0, data: { detail: "İnternet bağlantısı yok" } } });
jest.mock("axios", () => ({
  create: () => ({
    interceptors: { response: { use: () => {} } },
    get: (url) => (mockNet.online ? Promise.resolve({ data: url === "/services" ? [{ id: "s1", customer_name: "Ali", status: "received" }] : { id: url.split("/").pop(), customer_name: "Ali", status: "received" } }) : mockOffline()),
    post: (url, p) => { if (!mockNet.online) return mockOffline(); mockNet.posts.push(p); return Promise.resolve({ data: { ...p, id: `real-${++mockNet.seq}` } }); },
    put: (url, p) => { if (!mockNet.online) return mockOffline(); mockNet.puts.push([url, p]); return Promise.resolve({ data: p }); },
    delete: () => Promise.resolve({ data: {} }),
  }),
}));
jest.mock("sonner", () => { const f = () => {}; const t = () => {}; t.success = f; t.error = f; t.warning = f; return { toast: t }; });
jest.mock("@capacitor/haptics", () => ({ ImpactStyle: {}, NotificationType: {}, Haptics: { impact: () => Promise.resolve(), notification: () => Promise.resolve() } }));

const api = require("../api");
const outbox = require("../outbox");

beforeEach(() => { localStorage.clear(); Object.assign(mockNet, { online: false, posts: [], puts: [], seq: 0 }); });

test("çevrimdışı oluştur + sonraki güncelleme → tek bekleyen oluşturma; listede görünür; bağlanınca gönderilir", async () => {
  const r = await api.services.create({ customer_name: "Veli", items: [] });
  expect(r._pending).toBe(true);
  expect(outbox.isTmpId(r.id)).toBe(true);
  await api.services.update(r.id, { collections: [{ id: "c1", amount: 500, currency: "TRY" }] });
  expect(outbox.pendingCount()).toBe(1); // birleşti
  localStorage.setItem("mz:services", JSON.stringify([{ id: "s1", customer_name: "Ali" }]));
  const got = await api.services.get(r.id);
  expect(got).toMatchObject({ customer_name: "Veli", _pending: true });
  mockNet.online = true;
  const list = await api.services.list();
  expect(list.map((x) => x.customer_name)).toEqual(["Veli", "Ali"]); // bekleyen üstte
  expect(await outbox.flush()).toBe(1);
  expect(mockNet.posts[0]).toMatchObject({ customer_name: "Veli", collections: [{ id: "c1", amount: 500, currency: "TRY" }] });
  expect(outbox.pendingCount()).toBe(0);
  expect(outbox.realId(r.id)).toBe("real-1"); // açık ekrandaki tmp id artık sunucu kaydına gider
  await api.services.update(r.id, { status: "in_progress" });
  expect(mockNet.puts.at(-1)).toEqual(["/services/real-1", { status: "in_progress" }]);
});

test("çevrimdışı güncelleme: çevrimiçi listede üstüne uygulanır, gönderilince kuyruktan çıkar", async () => {
  await api.services.update("s1", { status: "delivered" });
  await api.services.update("s1", { delivery_date: "2026-09-24" });
  expect(outbox.pendingCount()).toBe(1);
  mockNet.online = true;
  const list = await api.services.list();
  expect(list[0]).toMatchObject({ id: "s1", status: "delivered", delivery_date: "2026-09-24", _pending: true });
  await outbox.flush();
  expect(mockNet.puts).toEqual([["/services/s1", { status: "delivered", delivery_date: "2026-09-24" }]]);
  expect(outbox.pendingCount()).toBe(0);
});

test("hâlâ çevrimdışıyken flush durur, kayıt korunur; sunucu reddederse düşürülür", async () => {
  await api.services.update("s1", { status: "delivered" });
  expect(await outbox.flush()).toBe(0);
  expect(outbox.pendingCount()).toBe(1);
  outbox.registerRunner("svc:update", () => Promise.reject({ response: { status: 422, data: { detail: "geçersiz" } } }));
  await outbox.flush();
  expect(outbox.pendingCount()).toBe(0);
});
