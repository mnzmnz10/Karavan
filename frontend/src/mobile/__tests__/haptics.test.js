// Dokunsal geri bildirim: mockNative'de doğru tür, web'de hiç; toast seçeneği sonner'a sızmaz.
const mockCalls = [];
let mockNative = true;
jest.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => mockNative } }));
jest.mock("@capacitor/haptics", () => ({
  ImpactStyle: { Light: "LIGHT" },
  NotificationType: { Success: "SUCCESS", Warning: "WARNING", Error: "ERROR" },
  Haptics: {
    impact: (o) => { mockCalls.push(["impact", o.style]); return Promise.resolve(); },
    notification: (o) => { mockCalls.push(["notif", o.type]); return Promise.resolve(); },
  },
}));
const mockSeen = [];
jest.mock("sonner", () => { const t = () => {}; t.success = (m, o) => mockSeen.push(["success", m, o]); t.error = (m, o) => mockSeen.push(["error", m, o]); t.warning = () => {}; return { toast: t }; });

const { toast } = require("../toast");

beforeEach(() => { mockCalls.length = 0; mockSeen.length = 0; mockNative = true; });

test("başarı/hata bildirimi → uygun titreşim; light seçeneği hafif dokunuş", () => {
  toast.success("Kaydedildi");
  toast.error("Olmadı");
  toast.success("Teklife eklendi", { duration: 1200, haptic: "light" });
  expect(mockCalls).toEqual([["notif", "SUCCESS"], ["notif", "ERROR"], ["impact", "LIGHT"]]);
  expect(mockSeen[2]).toEqual(["success", "Teklife eklendi", { duration: 1200 }]); // haptic seçeneği sonner'a gitmez
  expect(mockSeen[0][2]).toBeUndefined();
});

test("web'de titreşim yok, haptic:false susturur", () => {
  mockNative = false;
  toast.success("x");
  mockNative = true;
  toast.success("y", { haptic: false });
  expect(mockCalls).toEqual([]);
  expect(mockSeen.length).toBe(2);
});
