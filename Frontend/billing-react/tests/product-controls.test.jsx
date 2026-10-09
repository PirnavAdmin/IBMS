import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProductForm } from '../src/pages/Products/components/ProductForm';

const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
const input = async (element, value) => { await act(async () => Simulate.change(element, { target: { value } })); await flush(); };
const choose = async text => {
  const option = [...document.querySelectorAll('.ant-select-item-option')].find(item => item.textContent.includes(text));
  assert.ok(option, `Option ${text} is available`);
  await act(async () => option.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await flush();
};

// Isolated test fixtures exercise controls; no live records are created.
for (const mode of ['create', 'edit']) for (const type of ['Product', 'Service']) {
  test(`${mode} ${type}: editable tax, currency search, and submission use one control per field`, async () => {
    const cache = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false } } });
    cache.setQueryData(['categories', 'list'], [{ id: 1, name: 'Test category', status: 'Active' }]);
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host); const submissions = [];
    const initialValues = { id: 1, name: 'Test product', productCode: 'PRD-1', type, categoryId: 1, unit: 'Piece', price: 100, currency: 'AED', taxCategory: 'GST 7.5%', discountAllowed: false, status: 'Active' };
    try {
      await act(async () => root.render(<QueryClientProvider client={cache}><ProductForm mode={mode} initialValues={initialValues} onSubmit={value => submissions.push(value)} /></QueryClientProvider>));
      await flush();
      let tax = host.querySelector('#productTaxCategory');
      assert.equal(tax.value, 'GST 7.5%');
      assert.equal(host.querySelectorAll('#productTaxCategory').length, 1);
      assert.equal(host.querySelector('#productCustomTax'), null);
      assert.ok(host.querySelector('#productCurrency').closest('.ant-select').textContent.includes('AED'));

      await input(tax, 'Local levy');
      await act(async () => Simulate.submit(host.querySelector('form'))); await flush();
      assert.equal(submissions.at(-1).taxCategory, 'Local levy');
      assert.equal(submissions.at(-1).currency, 'AED');
      assert.ok(!('customTaxPercentage' in submissions.at(-1)));

      await input(tax, 'GST');
      await choose('GST 12%');
      assert.equal(tax.value, 'GST 12%');
      await input(tax, 'Other');
      await choose('Other / type custom tax');
      assert.equal(tax.value, '');
      await input(tax, 'GST 6.25%');

      const currency = host.querySelector('#productCurrency');
      await act(async () => Simulate.focus(currency));
      await input(currency, 'Japan');
      await choose('JPY');
      await act(async () => Simulate.submit(host.querySelector('form'))); await flush();
      assert.equal(submissions.at(-1).currency, 'JPY');
      assert.equal(submissions.at(-1).taxCategory, 'GST 6.25%');
      assert.ok(host.textContent.includes('Unit Price (¥)'));

      await input(tax, 'GST'); await choose('GST 18%');
      await act(async () => Simulate.submit(host.querySelector('form'))); await flush();
      assert.equal(submissions.at(-1).taxCategory, 'GST 18%');
      assert.ok(!('customTaxPercentage' in submissions.at(-1)));
    } finally {
      await act(async () => root.unmount()); host.remove(); cache.clear();
    }
  });
}
