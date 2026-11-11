import { shouldDownload, cmpNative, channelOf, pickDownloaded, manifestUrl } from "../ota";

const URL = "https://github.com/mnzmnz10/Karavan/releases/download/ota-beta/bundle-web-202611121000-abcdef1.zip";
const m = (o = {}) => ({ version: "web-202611121000-abcdef1", url: URL, min_native: "1.2", ...o });
const CUR = "web-202611110900-1234567";

test("newer bundle on matching native downloads", () => {
  expect(shouldDownload(m(), CUR, "1.2")).toBe(true);
  expect(shouldDownload(m(), CUR, "1.10")).toBe(true);
});

test("same or older bundle is skipped", () => {
  expect(shouldDownload(m({ version: CUR }), CUR, "1.2")).toBe(false);
  expect(shouldDownload(m({ version: "web-202601010000-aaaaaaa" }), CUR, "1.2")).toBe(false);
});

test("min_native above the installed app blocks download", () => {
  expect(shouldDownload(m({ min_native: "1.3" }), CUR, "1.2")).toBe(false);
  expect(shouldDownload(m({ min_native: "1.2.1" }), CUR, "1.2")).toBe(false);
});

test("foreign url, bad manifest or dev build never downloads", () => {
  expect(shouldDownload(m({ url: "https://evil.example/x.zip" }), CUR, "1.2")).toBe(false);
  expect(shouldDownload(m({ version: "latest" }), CUR, "1.2")).toBe(false);
  expect(shouldDownload(null, CUR, "1.2")).toBe(false);
  expect(shouldDownload(m(), "web-dev", "1.2")).toBe(false);
});

test("cmpNative compares numerically", () => {
  expect(cmpNative("1.10", "1.9")).toBe(1);
  expect(cmpNative("1.2", "1.2.0")).toBe(0);
  expect(cmpNative("1.1", "1.2")).toBe(-1);
});

test("channel follows the bundle id", () => {
  expect(channelOf("shop.corlukaravan.app.beta")).toBe("beta");
  expect(channelOf("shop.corlukaravan.app")).toBe("prod");
  expect(manifestUrl("prod")).toBe("https://github.com/mnzmnz10/Karavan/releases/download/ota-prod/manifest.json");
});

test("pickDownloaded takes the newest usable bundle, never a failed one", () => {
  const bundles = [
    { id: "a", version: "web-202611120000-aaaaaaa", status: "pending" },
    { id: "b", version: "web-202611130000-bbbbbbb", status: "error" },
    { id: "c", version: "web-202611120500-ccccccc", status: "success" },
    { id: "d", version: CUR, status: "success" },
    { id: "builtin", version: "1.2", status: "success" },
  ];
  expect(pickDownloaded(bundles, CUR).id).toBe("c");
  expect(pickDownloaded(bundles, "web-202611200000-fffffff")).toBe(null);
  expect(pickDownloaded([], CUR)).toBe(null);
});
