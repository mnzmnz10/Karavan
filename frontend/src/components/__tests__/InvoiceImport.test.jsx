import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import axios from 'axios';
import InvoiceImport, { convert, lineAction, withVat } from '../InvoiceImport';

jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const rates = { TRY: 1, EUR: 50, USD: 40 };

test('convert and lineAction', () => {
  expect(convert(100, 'EUR', 'EUR', rates)).toBe(100);
  expect(convert(5000, 'TRY', 'EUR', rates)).toBe(100);
  expect(withVat(171, 20, true)).toBeCloseTo(205.2);
  expect(withVat(171, 20, false)).toBe(171);
  expect(withVat(171, null, true)).toBe(171);
  expect(lineAction({ sel: '__skip' }, 'F')).toBe('skip');
  expect(lineAction({ sel: '__new' }, 'F')).toBe('create');
  expect(lineAction({ sel: 'p', product: { company_id: 'F' } }, 'F')).toBe('update');
  expect(lineAction({ sel: 'p', product: { company_id: 'T' } }, 'F')).toBe('add_supplier');
});

test('reads an invoice, shows matched price change and applies selected actions', async () => {
  const match = { id: 'f1', name: 'Plus Fan Uyku Kliması', company_id: 'F', company_name: 'Fermil', currency: 'EUR', list_price: 300, discounted_price: 205.2, score: 0.91, by: 'benzer isim' };
  axios.post.mockImplementation(async (url, body) => {
    if (url.endsWith('/purchase-invoices/parse')) {
      return { data: { errors: [], rates, invoices: [{
        file: 'f.xml', source: 'xml', supplier_name: 'FERMİL KARAVAN', tax_id: '123', invoice_no: 'A1', date: '2026-09-20', type: 'SATIS', currency: 'EUR', total: 570,
        company: { id: 'F', name: 'Fermil', by: 'vkn' }, duplicate: null,
        lines: [
          { name: 'PLUS FAN 12V', code: 'PF', qty: 2, unit_price: 194.94, gross_price: 216, discount: 9.8, vat: 20, currency: 'EUR', match, candidates: [match], action: 'update', product_id: 'f1' },
          { name: 'Tente Kolu', code: '', qty: 1, unit_price: 85.12, gross_price: 89.6, discount: 5, vat: 20, currency: 'EUR', candidates: [], action: 'create' },
        ] }] } };
    }
    if (url.endsWith('/purchase-invoices/apply')) return { data: { updated: 1, created: 1, added: 0, skipped: 0, errors: [], body } };
    throw new Error(url);
  });
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(
    <InvoiceImport api="/api" companies={[{ id: 'F', name: 'Fermil' }, { id: 'T', name: 'Termosa' }]} categories={[]} onDone={jest.fn()} />,
  ));
  const input = container.querySelector('input[type=file]');
  Object.defineProperty(input, 'files', { value: [new File(['<x/>'], 'f.xml')] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  const readBtn = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Faturayı oku'));
  await act(async () => readBtn.click());

  const text = container.textContent;
  expect(text).toContain('e-Fatura XML');
  expect(text).toContain('Alış güncellenir');
  expect(text).toContain('Yeni ürün');
  expect(text).toContain('KDV dahil');
  expect(text).toMatch(/205,20 → 233,93/);
  expect(text).toMatch(/▲ %14\.0/);

  const removeBtn = container.querySelector('[aria-label="Tente Kolu kalemini kaldır"]');
  await act(async () => removeBtn.click());
  expect(container.textContent).not.toContain('Tente Kolu');
  expect(container.textContent).toContain('1 kaldırılan kalemi geri al');
  const undo = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('geri al'));
  await act(async () => undo.click());
  expect(container.textContent).toContain('Tente Kolu');
  await act(async () => container.querySelector('[aria-label="Tente Kolu kalemini kaldır"]').click());

  const applyBtn = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Onayla ve uygula'));
  await act(async () => applyBtn.click());
  const body = axios.post.mock.calls.find(([u]) => u.endsWith('/apply'))[1];
  expect(body.company_id).toBe('F');
  expect(body.lines.map((l) => l.action)).toEqual(['update', 'skip']);
  expect(body.lines[0].unit_price).toBeCloseTo(233.928);

});
