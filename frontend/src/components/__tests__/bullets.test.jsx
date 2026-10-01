import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { bulletEdit } from "../../lib/bullets";
import BulletTextarea from "../BulletTextarea";

describe("bulletEdit", () => {
  test("first character on empty field gets a bullet", () => {
    expect(bulletEdit("", "K", 1)).toEqual({ value: "• K", caret: 3 });
  });

  test("Enter adds a bullet to the new line", () => {
    const prev = "• Kablo";
    const next = "• Kablo\n";
    expect(bulletEdit(prev, next, next.length)).toEqual({ value: "• Kablo\n• ", caret: 10 });
  });

  test("Enter in the middle of the text bullets the split line", () => {
    const prev = "• Akü takıldı";
    const next = "• Akü\n takıldı";
    expect(bulletEdit(prev, next, 6).value).toBe("• Akü\n•  takıldı");
  });

  test("Enter on an empty bullet line ends the list", () => {
    const prev = "• Kablo\n• ";
    const next = "• Kablo\n• \n";
    expect(bulletEdit(prev, next, next.length)).toEqual({ value: "• Kablo\n", caret: 8 });
  });

  test("ordinary typing and deleting is untouched", () => {
    expect(bulletEdit("• Kab", "• Kabl", 6)).toEqual({ value: "• Kabl", caret: 6 });
    expect(bulletEdit("• Kabl", "• Kab", 5)).toEqual({ value: "• Kab", caret: 5 });
    expect(bulletEdit("• K", "", 0)).toEqual({ value: "", caret: 0 });
  });

  test("text already starting with a bullet is not double-bulleted", () => {
    expect(bulletEdit("", "• Not", 5).value).toBe("• Not");
  });
});

describe("BulletTextarea", () => {
  test("passes the bulleted value to onChange", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const onChange = jest.fn();
    act(() => { root.render(<BulletTextarea value="" onChange={onChange} />); });
    const ta = host.querySelector("textarea");
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    act(() => {
      setter.call(ta, "A");
      ta.setSelectionRange(1, 1);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("• A");
    act(() => root.unmount());
    host.remove();
  });
});
