import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProductForm } from '../src/pages/Products/components/ProductForm';
import { ProductList } from '../src/pages/Products/ProductList';
import { apiClient } from 'billing-api-client';
import { MemoryRouter } from 'react-router-dom';

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
      for (const label of ['Not Applicable','GST 5%','GST 12%','GST 18%','GST 28%','Other / type custom tax']) {
        assert.ok([...document.querySelectorAll('.ant-select-item-option')].some(item=>item.textContent.includes(label)), `Same complete tax list includes ${label}`);
      }
      await choose('Other / type custom tax');
      assert.equal(tax.value, '');
      await input(tax, '6.25');
      await act(async () => Simulate.blur(tax)); await flush();
      assert.equal(tax.value, 'GST 6.25%');

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


test('Catalog All Categories and All Status independently clear filters and reset pagination', async () => {
  const cache = new QueryClient({ defaultOptions: { queries: { staleTime: 0, gcTime: Infinity, retry: false } } });
  cache.setQueryDefaults(['categories'], { staleTime: Infinity });
  cache.setQueryData(['categories', 'list'], [{ id: 1, name: 'Electronics', status: 'Active' }, { id: 2, name: 'Furniture', status: 'Active' }]);
  cache.setQueryDefaults(['products', 'metadata'], { staleTime: Infinity });
  cache.setQueryData(['products', 'metadata'], { summary: { total: 30, active: 25, inactive: 5, services: 2 } });
  const original = apiClient.get; const calls = [];
  apiClient.get = async (url, { params }) => {
    assert.equal(url, '/api/v1/products'); calls.push({ ...params });
    const categories = params.categoryId ? [Number(params.categoryId)] : [1, 2];
    const statuses = params.status ? [params.status] : ['Active', 'Inactive'];
    return { success: true, data: { items: categories.flatMap(id => statuses.map(status => ({ id: id * 10 + (status === 'Active' ? 1 : 2), name: `${id === 1 ? 'Catalog Electronics Item' : 'Catalog Furniture Item'} ${status}`, productCode: `PRD-${id}-${status}`, categoryId: id, type: 'Product', unit: 'Box', price: 100, currency: 'INR', status }))), totalCount: 30, pageSize: params.pageSize, pageNumber: params.pageNumber } };
  };
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const filter = label => [...host.querySelectorAll('.product-filters .MuiTextField-root')].find(node => node.querySelector('label')?.textContent === label);
  const selectOption = async (label, text) => {
    await act(async () => Simulate.mouseDown(filter(label).querySelector('[role="combobox"]'), { button: 0 }));
    const option = [...document.querySelectorAll('[role="option"]')].find(node => node.textContent === text); assert.ok(option, text);
    await act(async () => option.dispatchEvent(new MouseEvent('click', { bubbles: true }))); await flush();
  };
  try {
    await act(async () => root.render(<QueryClientProvider client={cache}><MemoryRouter><ProductList /></MemoryRouter></QueryClientProvider>)); await flush();
    assert.match(filter('Category').querySelector('[role="combobox"]').textContent, /All Categories/);
    assert.equal('categoryId' in calls.at(-1), false);
    assert.match(filter('Status').querySelector('[role="combobox"]').textContent, /All Status/);
    await input(host.querySelector('.product-search input'), 'Catalog');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 330)); }); await flush();
    await selectOption('Status', 'Active');
    await selectOption('Sort By', 'Price: Low to High');
    await selectOption('Category', 'Electronics');
    assert.equal(calls.at(-1).categoryId, 1);
    assert.match(host.querySelector('.product-table').textContent, /Catalog Electronics Item/);
    assert.doesNotMatch(host.querySelector('.product-table').textContent, /Catalog Furniture Item/);
    await act(async () => host.querySelector('[aria-label="Go to page 2"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))); await flush();
    assert.equal(calls.at(-1).pageNumber, 2);
    await selectOption('Category', 'All Categories');
    const request = calls.at(-1);
    assert.equal('categoryId' in request, false); assert.equal('category' in request, false);
    assert.equal(request.pageNumber, 1); assert.equal(request.search, 'Catalog');
    assert.equal(request.status, 'Active'); assert.equal(request.sortBy, 'price'); assert.equal(request.sortOrder, 'asc');
    assert.match(filter('Category').querySelector('[role="combobox"]').textContent, /All Categories/);
    assert.match(host.querySelector('.product-table').textContent, /Catalog Electronics Item/);
    assert.match(host.querySelector('.product-table').textContent, /Catalog Furniture Item/);
    await selectOption('Category', 'Furniture'); assert.equal(calls.at(-1).categoryId, 2);
    await selectOption('Category', 'All Categories'); assert.equal('categoryId' in calls.at(-1), false);
    await selectOption('Category', 'Electronics');
    await act(async () => host.querySelector('[aria-label="Go to page 2"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))); await flush();
    assert.equal(calls.at(-1).pageNumber, 2);
    await selectOption('Status', 'All Status');
    assert.equal(calls.at(-1).status, ''); assert.equal(calls.at(-1).pageNumber, 1);
    assert.equal(calls.at(-1).categoryId, 1); assert.equal(calls.at(-1).search, 'Catalog');
    assert.equal(calls.at(-1).sortBy, 'price'); assert.equal(calls.at(-1).sortOrder, 'asc');
    assert.match(filter('Status').querySelector('[role="combobox"]').textContent, /All Status/);
    assert.match(host.querySelector('.product-table').textContent, /Catalog Electronics Item Active/);
    assert.match(host.querySelector('.product-table').textContent, /Catalog Electronics Item Inactive/);
    await selectOption('Status', 'Inactive'); assert.equal(calls.at(-1).status, 'Inactive');
    assert.doesNotMatch(host.querySelector('.product-table').textContent, /Catalog Electronics Item Active/);
    await selectOption('Status', 'All Status'); assert.equal(calls.at(-1).status, '');
    const clear = [...host.querySelectorAll('button')].find(node => node.textContent === 'Clear Filters');
    await act(async () => clear.dispatchEvent(new MouseEvent('click', { bubbles: true }))); await flush();
    assert.match(filter('Category').querySelector('[role="combobox"]').textContent, /All Categories/);
    assert.match(filter('Status').querySelector('[role="combobox"]').textContent, /All Status/);
    assert.equal(calls.at(-1).status, ''); assert.equal('categoryId' in calls.at(-1), false);

  } finally { await act(async () => root.unmount()); host.remove(); cache.clear(); apiClient.get = original; }
});
