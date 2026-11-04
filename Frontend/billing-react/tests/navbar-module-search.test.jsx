import { customerQuery } from '../src/pages/Customers/api/customerContract';
import React, { act, useState } from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { apiClient } from 'billing-api-client';
import { AppLayout } from '../src/layouts/AppLayout';
import { CustomerListPage } from '../src/pages/Customers/pages/CustomerListPage';
import { ProductList } from '../src/pages/Products/ProductList';
import { productService } from '../src/pages/Products/services/productService';
import { categoryService } from '../src/pages/Products/services/categoryService';
import { useNavbarSearch } from '../src/hooks/useNavbarSearch';

const settle = (ms = 30) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
const type = (input, value) => act(async () => { assert.ok(input); Simulate.change(input, { target: { value } }); });
const click = element => act(async () => { assert.ok(element); Simulate.click(element, { button: 0 }); });
const customers = [{ id: 1, name: 'Harish', customerCode: 'CUS-1', status: 'Active', email: 'harish@example.test' }, { id: 2, name: 'Ravi', customerCode: 'CUS-2', status: 'Active' }];
const products = [{ id: 1, name: 'vivo phone', productCode: 'VIVO', price: 100, type: 'Product', status: 'Active', currency: 'INR' }, { id: 2, name: 'Desk', productCode: 'DESK', price: 50, type: 'Product', status: 'Active', currency: 'INR' }];
function Links() { return <nav aria-label="Test routes"><Link to="/customers">Customers test</Link><Link to="/products">Products test</Link><Link to="/unsupported">Form test</Link><Link to="/other">Other test</Link></nav>; }
function Location() { const location = useLocation(); return <output data-location>{location.pathname + location.search}</output>; }
function OtherModule() { const [search, setSearch] = useState(''); useNavbarSearch(search, setSearch, 'Search other records'); return <input aria-label="Local other search" value={search} onChange={event => setSearch(event.target.value)} />; }
async function mount(path = '/customers') {
  localStorage.setItem('billing_auth_user', JSON.stringify({ userId: 'search-test', tenantId: 1, roles: ['TenantAdmin'] }));
  const originalGet = apiClient.get; const originalProducts = productService.getProducts; const originalMetadata = productService.getCatalogMetadata; const originalCategories = categoryService.getAll;
  const calls = [];
  apiClient.get = async (url, config = {}) => {
    if (url.endsWith('/inbox/unread-count')) return { data: { unreadCount: 0 } };
    if (url.endsWith('/customers/summary')) return { data: { totalCustomers: 2, activeCustomers: 2, inactiveCustomers: 0, totalOutstanding: 0, currency: 'INR' } };
    if (url === '/api/v1/customers') {
      calls.push({ module: 'customers', ...config.params });
      const term = String(config.params.search || config.params.Search || '').toLowerCase();
      const items = customers.filter(item => item.name.toLowerCase().includes(term));
      return { data: { items, totalCount: items.length } };
    }
    throw new Error(`Unexpected GET ${url}`);
  };
  productService.getProducts = async params => {
    calls.push({ module: 'products', ...params });
    const items = products.filter(item => item.name.toLowerCase().includes((params.search || '').toLowerCase()));
    return { items, totalCount: items.length, totalPages: 1, pageNumber: params.pageNumber, pageSize: params.pageSize };
  };
  productService.getCatalogMetadata = async () => ({ summary: { total: 2, active: 2, inactive: 0, services: 0 } });
  categoryService.getAll = async () => [];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Links /><Location /><Routes><Route element={<AppLayout />}>
    <Route path="customers" element={<CustomerListPage />} /><Route path="products" element={<ProductList />} /><Route path="unsupported" element={<p>Form without searchable records</p>} /><Route path="other" element={<OtherModule />} />
  </Route></Routes></MemoryRouter></QueryClientProvider>));
  await settle();
  return { host, calls, close: async () => { await act(async () => root.unmount()); client.clear(); host.remove(); apiClient.get = originalGet; productService.getProducts = originalProducts; productService.getCatalogMetadata = originalMetadata; categoryService.getAll = originalCategories; localStorage.clear(); } };
}
const header = host => host.querySelector('.bd-header input');

test('Customers navbar filters server directory, updates local field/count, and survives URL changes', async () => {
  const view = await mount('/customers?status=active&sortBy=name&sortOrder=asc&page=2');
  try {
    await type(header(view.host), 'Harish'); await settle(360); await settle();
    assert.equal(view.host.querySelector('.customer-search input').value, 'Harish');
    assert.equal(header(view.host).value, 'Harish');
    assert.match(view.host.querySelector('[data-location]').textContent, /search=Harish/);
    assert.equal(view.host.querySelectorAll('.customer-table tbody tr').length, 1);
    assert.match(view.host.querySelector('.customer-table tbody').textContent, /Harish/);
    assert.doesNotMatch(view.host.querySelector('.customer-table tbody').textContent, /Ravi/);
    const params = view.calls.filter(call => call.module === 'customers').at(-1);
    assert.equal(params.status ?? params.Status, 'Active');
    assert.equal(params.pageNumber ?? params.PageNumber ?? params.page, 1);
    await type(view.host.querySelector('.customer-search input'), 'Ravi'); await settle(360); await settle();
    assert.equal(header(view.host).value, 'Ravi');
    await click(view.host.querySelector('.bd-search-clear')); await settle(360); await settle();
    assert.equal(view.host.querySelector('.customer-search input').value, '');
    assert.equal(view.host.querySelectorAll('.customer-table tbody tr').length, 2);
  } finally { await view.close(); }
});

test('Products navbar and local search share filters, empty results, clear and pagination reset', async () => {
  const view = await mount('/products');
  try {
    await type(header(view.host), 'vivo'); await settle(360); await settle();
    assert.equal(view.host.querySelector('.product-search input').value, 'vivo');
    assert.equal(view.host.querySelectorAll('.product-table tbody tr').length, 1);
    assert.match(view.host.querySelector('.product-result-count').textContent, /1 matching items/);
    assert.equal(view.calls.filter(call => call.module === 'products').at(-1).pageNumber, 1);
    await type(header(view.host), 'missing'); await settle(360); await settle();
    assert.match(view.host.querySelector('.product-table').textContent, /No .*match|No products/i);
    await type(view.host.querySelector('.product-search input'), 'Desk'); await settle(360); await settle();
    assert.equal(header(view.host).value, 'Desk');
    await click(view.host.querySelector('.bd-search-clear')); await settle(360); await settle();
    assert.equal(view.host.querySelector('.product-search input').value, '');
    assert.equal(view.host.querySelectorAll('.product-table tbody tr').length, 2);
  } finally { await view.close(); }
});

test('route changes unregister old search; unsupported pages omit navbar search and remount starts clean', async () => {
  const view = await mount('/products');
  try {
    await type(header(view.host), 'vivo'); await settle(360);
    await click(view.host.querySelector('a[href="/unsupported"]')); await settle();
    assert.equal(header(view.host), null);
    await click(view.host.querySelector('a[href="/other"]')); await settle();
    assert.equal(header(view.host).getAttribute('aria-label'), 'Search other records');
    assert.equal(header(view.host).value, '');
    await type(header(view.host), 'term'); assert.equal(view.host.querySelector('[aria-label="Local other search"]').value, 'term');
    await click(view.host.querySelector('a[href="/products"]')); await settle();
    assert.equal(header(view.host).value, '');
    await click(view.host.querySelector('a[href="/customers"]')); await settle();
    assert.equal(header(view.host).value, '');
  } finally { await view.close(); }
});

// IMS-104: customer fields must never be advertised as product prices.
test('IMS-104 customer sort menu exposes code sorting and sends that exact field/direction', async () => {
  const view = await mount('/customers?search=Harish&status=active&page=2');
  try {
    for (const direction of ['asc', 'desc']) {
      await act(async () => Simulate.mouseDown(view.host.querySelector('.customer-sort-select [role="combobox"]'), { button: 0 }));
      await settle();
      const options = [...document.querySelectorAll('[role="option"]')];
      assert.ok(options.length > 1);
      assert.ok(options.every(option => !/price/i.test(option.textContent)));
      const option = options.find(option => option.getAttribute('data-value') === `customerCode:${direction}`);
      assert.ok(option);
      assert.match(option.textContent, /Customer Code/);
      await click(option); await settle(360); await settle();
      const request = view.calls.filter(call => call.module === 'customers').at(-1);
      assert.equal(request.sortBy, 'code');
      assert.equal(request.sortOrder, direction);
      assert.equal(request.search, 'Harish');
      assert.equal(request.status, 'Active');
      assert.equal(request.pageNumber, 1);
    }
  } finally { await view.close(); }
});

test('IMS-104 legacy price sort URLs are ignored and direct price-sort requests are rejected', async () => {
  const view = await mount('/customers?sortBy=price&sortOrder=asc');
  try {
    const request = view.calls.filter(call => call.module === 'customers').at(-1);
    assert.ok(request);
    assert.equal(request.sortBy, undefined);
    assert.doesNotMatch(view.host.querySelector('.customer-sort-select').textContent, /Price/);
    assert.throws(() => customerQuery({ page: 1, pageSize: 10, sortBy: 'price', sortOrder: 'asc' }), /Invalid customer sort field/);
    assert.equal(customerQuery({ page: 1, pageSize: 10, sortBy: 'customerCode', sortOrder: 'desc' }).sortBy, 'code');
    assert.equal(customerQuery({ page: 1, pageSize: 10, sortBy: 'name', sortOrder: 'asc' }).sortBy, 'name');
  } finally { await view.close(); }
});