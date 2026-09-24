// Sheet body'ye portal ile açılır: transform animasyonlu (m-stagger/m-in) ata içinde hapsolmaz, kayar.
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { Sheet } from "../ui";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("Sheet, animasyonlu kartın içinde render edilse de body'nin doğrudan çocuğu olur", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <div className="m-stagger"><div id="anim-parent"><Sheet open onClose={() => {}} title="Tahsilat Raporu" full><p>içerik</p></Sheet></div></div>
    );
  });
  expect(document.getElementById("anim-parent").textContent).toBe("");
  const sheet = Array.from(document.body.children).find((el) => el.textContent.includes("Tahsilat Raporu"));
  expect(sheet).toBeTruthy();
  expect(sheet.className).toContain("fixed");
  expect(sheet.querySelector(".m-scroll").className).toContain("min-h-0");
  act(() => root.unmount());
  container.remove();
});
