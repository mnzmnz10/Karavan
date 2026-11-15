import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
global.IS_REACT_ACT_ENVIRONMENT = true;
import { useRates } from '../useRates';
import { rates } from '../api';
import { cache } from '../cache';
import { serviceCostRate } from '../../lib/serviceItems';

jest.mock('../api', () => ({ rates: { get: jest.fn() } }));
jest.mock('../cache', () => ({ cache: { get: jest.fn(), set: jest.fn() } }));

test('empty mobile cache fetches live rates and updates cost', async () => {
  cache.get.mockReturnValue(null);
  rates.get.mockResolvedValue({ EUR: 45, USD: 40 });
  let current;
  function Probe() { current = useRates(); return null; }
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<Probe />); });
  expect(current.USD).toBe(40);
  expect(serviceCostRate({ cost_currency: 'USD', cost_rate: '' }, 1, current)).toBe(40);
  await act(async () => { root.unmount(); });
  expect(cache.set).toHaveBeenCalledWith('rates', { EUR: 45, USD: 40 });
});
