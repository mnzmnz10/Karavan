import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import PhotoGallery from "../PhotoGallery";

const PHOTOS = ["data:image/png;base64,AAA", "data:image/png;base64,BBB", "data:image/png;base64,CCC"];

function mount(index, onIndex) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(<PhotoGallery photos={PHOTOS} index={index} onIndex={onIndex} />); });
  return () => { act(() => root.unmount()); host.remove(); document.body.innerHTML = ""; };
}
const button = (label) => document.body.querySelector(`button[aria-label="${label}"]`);

test("arrows move to the next/previous photo and wrap around", () => {
  const onIndex = jest.fn();
  const done = mount(2, onIndex);
  expect(document.body.textContent).toContain("3 / 3");
  act(() => { button("Sonraki fotoğraf").click(); });
  expect(onIndex).toHaveBeenLastCalledWith(0);
  act(() => { button("Önceki fotoğraf").click(); });
  expect(onIndex).toHaveBeenLastCalledWith(1);
  done();
});

test("keyboard arrows and Escape", () => {
  const onIndex = jest.fn();
  const done = mount(0, onIndex);
  act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" })); });
  expect(onIndex).toHaveBeenLastCalledWith(1);
  act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
  expect(onIndex).toHaveBeenLastCalledWith(null);
  done();
});

test("closed when index is null", () => {
  const done = mount(null, jest.fn());
  expect(document.body.querySelector("img")).toBeNull();
  done();
});
