import React, { forwardRef, useLayoutEffect, useRef } from "react";
import { bulletEdit } from "../lib/bullets";

// Her satırı "• " ile başlatan textarea. onChange(value) metni alır (event değil).
const BulletTextarea = forwardRef(function BulletTextarea({ value, onChange, ...rest }, outerRef) {
  const innerRef = useRef(null);
  const pendingCaret = useRef(null);
  const setRef = (el) => {
    innerRef.current = el;
    if (typeof outerRef === "function") outerRef(el);
    else if (outerRef) outerRef.current = el;
  };

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (el && pendingCaret.current != null && document.activeElement === el) {
      el.setSelectionRange(pendingCaret.current, pendingCaret.current);
    }
    pendingCaret.current = null;
  }, [value]);

  const handle = (e) => {
    const r = bulletEdit(value, e.target.value, e.target.selectionStart ?? e.target.value.length);
    if (r.value !== e.target.value) pendingCaret.current = r.caret;
    onChange(r.value);
  };

  return <textarea ref={setRef} value={value || ""} onChange={handle} {...rest} />;
});

export default BulletTextarea;
