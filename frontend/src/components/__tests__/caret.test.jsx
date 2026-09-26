import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { keepCaret } from '../../lib/caret';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Upper({ withFix }) {
  const [v, setV] = useState('ABCD');
  return <input value={v} onChange={(e) => { if (withFix) keepCaret(e); setV(e.target.value.toLocaleUpperCase('tr-TR')); }} />;
}

const typeAt = (input, pos, ch) => {
  const next = input.value.slice(0, pos) + ch + input.value.slice(pos);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, next);
  input.setSelectionRange(pos + 1, pos + 1);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

async function caretAfterTyping(withFix) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<Upper withFix={withFix} />));
  const input = container.querySelector('input');
  input.focus();
  await act(async () => typeAt(input, 2, 'x'));
  await act(async () => new Promise((r) => requestAnimationFrame(() => r())));
  const out = { value: input.value, caret: input.selectionStart };
  root.unmount();
  container.remove();
  return out;
}

test('uppercase controlled input keeps the caret where the user typed', async () => {
  const broken = await caretAfterTyping(false);
  expect(broken.caret).toBe(5); // düzeltme olmadan imleç sona atlıyor (hata)
  const fixed = await caretAfterTyping(true);
  expect(fixed.value).toBe('ABXCD');
  expect(fixed.caret).toBe(3);
});
