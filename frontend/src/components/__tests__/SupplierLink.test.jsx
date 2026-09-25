import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { SupplierCompanies, SupplierPrices, SupplierEdit, isGrouped } from '../SupplierLink';

jest.mock('axios', () => ({ delete: jest.fn(), get: jest.fn(), post: jest.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const product = {
  id: 'a', name: 'Berhimi Plus Fan', currency: 'EUR',
  suppliers: [
    { id: 'a', name: 'Berhimi Plus Fan', company_name: 'Termosa', currency: 'EUR', list_price: 320, discounted_price: 206, list_price_try: 16034, cost_try: 10500, is_best: false },
    { id: 'b', name: 'Plus Fan', company_name: 'Fermil', currency: 'EUR', list_price: 300, discounted_price: 205.2, list_price_try: 15000, cost_try: 10460, is_best: true },
  ],
};

test('grouped product splits cells per supplier in the same order', () => {
  expect(isGrouped(product)).toBe(true);
  expect(isGrouped({ suppliers: [product.suppliers[0]] })).toBe(false);
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => createRoot(container).render(
    <table><tbody><tr>
      <td><SupplierCompanies product={product} api="/api" showCost /></td>
      <td><SupplierPrices product={product} kind="list" /></td>
      <td><SupplierPrices product={product} kind="cost" /></td>
    </tr></tbody></table>,
  ));
  const cells = container.querySelectorAll('td');
  expect(cells[0].textContent).toMatch(/Termosa.*Fermil/);
  expect(cells[1].textContent).toMatch(/€ 320.*€ 300/);
  expect(cells[2].textContent).toMatch(/€ 206.*€ 205,2 ✓/);
  expect(container.querySelector('[title="En ucuz tedarikçi"]').textContent).toContain('205,2');
});

test('grouped edit renders one input per supplier bound by id', () => {
  const vals = { a: '320', b: '300' };
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => createRoot(container).render(
    <SupplierEdit product={product} kind="list_price" value={(s) => vals[s.id]} onChange={() => {}} />,
  ));
  const inputs = container.querySelectorAll('input');
  expect(inputs).toHaveLength(2);
  expect([...inputs].map((i) => i.value)).toEqual(['320', '300']);
  expect(inputs[1].getAttribute('aria-label')).toBe('Fermil liste fiyatı');
});
