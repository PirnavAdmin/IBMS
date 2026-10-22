import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProductForm } from '../src/pages/Products/components/ProductForm';
import { ProductList } from '../src/pages/Products/ProductList';
import { ProductFilters } from '../src/pages/Products/components/ProductFilters';
import { ProductPagination } from '../src/pages/Products/components/ProductPagination';
import { ProductSelect } from '../src/pages/Products/components/ProductSelect';
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

test('Empty Category and Status labels return inside the field on dismissal or selecting All', async () => {
  function Filters() {
    const [params, setParams] = useState({ category: '', status: '' });
    return <ProductFilters search="" onSearch={() => {}} params={params} onChange={patch => setParams(previous => ({ ...previous, ...patch }))} categories={[{ id: 1, name: 'Electronics' }]} onClear={() => {}} />;
  }
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<Filters />)); await flush();
    for (const [label, choice, all] of [['Category', 'Electronics', 'All Categories'], ['Status', 'Active', 'All Status']]) {
      const field = [...host.querySelectorAll('.MuiTextField-root')].find(element => element.querySelector('label')?.textContent === label);
      const open = async () => { await act(async () => Simulate.mouseDown(field.querySelector('[role="combobox"]'), { button: 0 })); await flush(); };
      const select = async text => { await open(); await act(async () => [...document.querySelectorAll('[role="option"]')].find(option => option.textContent === text).click()); await flush(); };
      await open();
      await act(async () => Simulate.keyDown(document.querySelector('[role="listbox"]'), { key: 'Escape' })); await flush();
      assert.equal(field.querySelector('label').getAttribute('data-shrink'), 'false');
      assert.equal(field.querySelector('[role="combobox"]').getAttribute('aria-expanded'), 'false');
      await select(choice);
      assert.equal(field.querySelector('label').getAttribute('data-shrink'), 'true');
      await select(all);
      assert.equal(field.querySelector('label').getAttribute('data-shrink'), 'false');
    }
  } finally { await act(async () => root.unmount()); host.remove(); }
});

test('Rows per page near the viewport bottom uses space above and exposes every size', async () => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); const selected = [];
  try {
    await act(async () => root.render(<ProductPagination data={{ pageNumber: 1, pageSize: 50, totalCount: 100, totalPages: 2 }} onPage={() => {}} onPageSize={value => selected.push(value)} />)); await flush();
    const control = host.querySelector('.MuiInputBase-root');
    control.getBoundingClientRect = () => ({ x: 20, y: window.innerHeight - 60, top: window.innerHeight - 60, bottom: window.innerHeight - 20, left: 20, right: 160, width: 140, height: 40 });
    await act(async () => Simulate.mouseDown(control.querySelector('[role="combobox"]'), { button: 0 })); await flush();
    const menu = document.querySelector('.product-select-menu');
    assert.equal(menu.style.maxHeight, '280px');
    assert.equal(menu.style.height, 'auto');
    const options = [...document.querySelectorAll('[role="option"]')];
    assert.deepEqual(options.map(option => option.textContent), ['5', '10', '20', '50']);
    await act(async () => options[1].click()); await flush();
    assert.deepEqual(selected, [10]);
  } finally { await act(async () => root.unmount()); host.remove(); }
});

test('Product Type menu sizes to its three options without a forced minimum height', async () => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<ProductSelect value="Service" onChange={() => {}} ariaLabel="Product Type" options={[{ value: '', label: 'Select Type' }, { value: 'Product', label: 'Product' }, { value: 'Service', label: 'Service' }]} />)); await flush();
    await act(async () => Simulate.mouseDown(host.querySelector('[role="combobox"]'), { button: 0 })); await flush();
    const menu = document.querySelector('.product-select-menu');
    assert.equal(menu.style.height, 'auto');
    assert.equal(menu.style.minHeight, '0');
    assert.deepEqual([...document.querySelectorAll('[role="option"]')].map(option => option.textContent), ['Select Type', 'Product', 'Service']);
  } finally { await act(async () => root.unmount()); host.remove(); }
});

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
    assert.equal(filter('Category').querySelector('label').getAttribute('data-shrink'), 'false');
    assert.equal('categoryId' in calls.at(-1), false);
    assert.equal(filter('Status').querySelector('label').getAttribute('data-shrink'), 'false');
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
    assert.equal(filter('Category').querySelector('label').getAttribute('data-shrink'), 'false');
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
    assert.equal(filter('Status').querySelector('label').getAttribute('data-shrink'), 'false');
    assert.match(host.querySelector('.product-table').textContent, /Catalog Electronics Item Active/);
    assert.match(host.querySelector('.product-table').textContent, /Catalog Electronics Item Inactive/);
    await selectOption('Status', 'Inactive'); assert.equal(calls.at(-1).status, 'Inactive');
    assert.doesNotMatch(host.querySelector('.product-table').textContent, /Catalog Electronics Item Active/);
    await selectOption('Status', 'All Status'); assert.equal(calls.at(-1).status, '');
    const clear = [...host.querySelectorAll('button')].find(node => node.textContent === 'Clear Filters');
    await act(async () => clear.dispatchEvent(new MouseEvent('click', { bubbles: true }))); await flush();
    assert.equal(filter('Category').querySelector('label').getAttribute('data-shrink'), 'false');
    assert.equal(filter('Status').querySelector('label').getAttribute('data-shrink'), 'false');
    assert.equal(calls.at(-1).status, ''); assert.equal('categoryId' in calls.at(-1), false);

  } finally { await act(async () => root.unmount()); host.remove(); cache.clear(); apiClient.get = original; }
});
