import { shouldRefreshOnResume, hasOpenOverlay, RESUME_REFRESH_MS } from "../resume";

test("open form/sheet blocks the resume refresh", () => {
  expect(shouldRefreshOnResume(10 * 60 * 1000, true)).toBe(false);
});

test("short trips to another app keep the screen as is", () => {
  expect(shouldRefreshOnResume(20 * 1000, false)).toBe(false);
});

test("long absence with nothing open refreshes", () => {
  expect(shouldRefreshOnResume(RESUME_REFRESH_MS, false)).toBe(true);
});

test("hasOpenOverlay detects a portalled sheet", () => {
  expect(hasOpenOverlay()).toBe(false);
  const el = document.createElement("div");
  el.className = "m-backdrop-enter";
  document.body.appendChild(el);
  expect(hasOpenOverlay()).toBe(true);
  el.remove();
});
