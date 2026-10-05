import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProductActionItems } from '../src/pages/Products/components/ProductActionsMenu';
import { ProductTable } from '../src/pages/Products/components/ProductTable';
import { ProductPagination } from '../src/pages/Products/components/ProductPagination';
import { ProductForm, getProductInitialValues } from '../src/pages/Products/components/ProductForm';
import { ProductDetails } from '../src/pages/Products/pages/ProductDetails';
import { CategoryList } from '../src/pages/Products/pages/CategoryList';
import { CategoryFormPage } from '../src/pages/Products/pages/CategoryFormPage';

const categories = [{ id: 1, name: 'Active category', status: 'Active', description: 'Available', productCount: 2 }, { id: 2, name: 'Inactive category', status: 'Inactive', description: '', productCount: 1 }];
const product = { id: 7, productCode: 'PRD-7', name: 'Long product name '.repeat(20), type: 'Product', category: 'Active category', categoryId: 1, unit: 'Piece', price: 1234.5, currency: 'USD', taxCategory: '', status: 'Inactive', hsnSac: '001234', discountAllowed: false, discountPercentage: 0 };
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, gcTime: Infinity, staleTime: Infinity } } });
const render = (element, cache = client(), location = '/products') => renderToStaticMarkup(<StaticRouter location={location}><QueryClientProvider client={cache}>{element}</QueryClientProvider></StaticRouter>);
const table = props => <ProductTable items={[product]} loading={false} error={null} params={{ sortBy: 'price', sortOrder: 'desc' }} onSort={() => {}} onRetry={() => {}} onClear={() => {}} {...props} />;

test('PQA table: nine columns, actual currency, long names, inactive badge and numeric action URLs', () => {
  const html = render(table());
  for (const label of ['Product Code', 'Product Name', 'Type', 'Category', 'Unit', 'Price', 'Tax Category', 'Status', 'Actions']) assert.ok(html.includes(label));
  assert.match(html, /\$1,234\.50/); assert.doesNotMatch(html, /₹1,234/);
  assert.match(html, /href="\/products\/7"/); assert.doesNotMatch(html, /href="\/products\/7\/edit"/);
  assert.match(html, /aria-haspopup="menu"/); assert.match(html, /aria-expanded="false"/);
  assert.match(html, /Inactive/); assert.ok(html.includes(product.name));
  const statusHeader = html.match(/<th\b[^>]*>(?:(?!<\/th>).)*Status(?:(?!<\/th>).)*<\/th>/s)?.[0];
  assert.ok(statusHeader); assert.doesNotMatch(statusHeader, /role="button"/);
  assert.match(html, /aria-sort="descending"/);
});

test('PQA table states: skeleton, real empty, filtered empty and API failure never render fixture rows', () => {
  assert.match(render(table({ loading: true })), /MuiSkeleton/);
  assert.match(render(table({ items: [] })), /No products found/);
  assert.match(render(table({ items: [], filtered: true })), /No matching products/);
  const failed = render(table({ error: new Error('Access denied') }));
  assert.match(failed, /Unable to load products/); assert.doesNotMatch(failed, /PRD-7/);
});

test('PQA pagination: first, middle, last and empty bounds', () => {
  for (const [pageNumber, totalCount, first, last] of [[1, 21, 1, 10], [2, 21, 11, 20], [3, 21, 21, 21], [1, 0, 0, 0]]) {
    const html = render(<ProductPagination data={{ pageNumber, pageSize: 10, totalCount, totalPages: Math.ceil(totalCount / 10) }} onPage={() => {}} onPageSize={() => {}} />);
    assert.match(html, new RegExp(`Showing ${first}.*${last} of ${totalCount} products`));
  }
});

test('PQA product form: create excludes inactive category; edit retains its disabled association and legacy unit', () => {
  const cache = client(); cache.setQueryData(['categories', 'list'], categories);
  const create = render(<ProductForm mode="create" onSubmit={() => {}} />, cache);
  assert.match(create, /Select Category/); assert.match(create, /Select Type/);
  assert.doesNotMatch(create, /E-Commerce/);
  const unavailableCategory = render(<ProductForm mode="create" initialValues={{ ...product, categoryId: 2 }} onSubmit={() => {}} />, cache);
  assert.doesNotMatch(unavailableCategory, /Inactive category/);
  const edit = render(<ProductForm mode="edit" initialValues={{ ...product, categoryId: 2, unit: 'Hour', taxCategory: null }} onSubmit={() => {}} />, cache);
  assert.match(edit, /Inactive category \(Inactive\)/);
  assert.match(edit, /<input\b(?=[^>]*name="categoryId")(?=[^>]*value="2")[^>]*>/);
  assert.equal(getProductInitialValues({ ...product, unit: 'Hour' }).unit, 'Others');
  assert.equal(getProductInitialValues({ ...product, unit: 'Hour' }).customUnit, 'Hour');
  assert.match(edit, /name="customUnit"/);
  assert.match(edit, /Not set/);
});

test('PQA edit initialization never adds tax to an untaxed product and preserves optional values', () => {
  assert.equal(getProductInitialValues(null).taxCategory, 'GST 18%');
  for (const taxCategory of [null, undefined, '']) {
    const values = getProductInitialValues({ ...product, taxCategory, description: null, hsnSacCode: '001234', discountPercent: 0 });
    assert.equal(values.taxCategory, ''); assert.equal(values.description, '');
    assert.equal(values.hsnSac, '001234'); assert.equal(values.discountPercentage, 0);
    assert.equal(values.categoryId, '1');
  }
});

test('PQA categories: real cached rows, zero/known counts, edit and both status actions', () => {
  const cache = client(); cache.setQueryData(['categories', 'list'], categories);
  const html = render(<CategoryList />, cache, '/products/categories');
  assert.match(html, /Product Categories/); assert.match(html, /Available/);
  assert.match(html, /href="\/products\/categories\/1\/edit"/);
  assert.match(html, /aria-label="Deactivate Active category"/);
  assert.match(html, /aria-label="Activate Inactive category"/);
  assert.match(html, /2 categories/);
});

test('PQA categories: loading, empty and API-error states', () => {
  assert.match(render(<CategoryList />), /Loading categories/);
  const empty = client(); empty.setQueryData(['categories', 'list'], []);
  assert.match(render(<CategoryList />, empty), /No categories yet/);
  const failed = client(); failed.getQueryCache().build(failed, { queryKey: ['categories', 'list'] }).setState({ status: 'error', fetchStatus: 'idle', error: { status: 403 } });
  const html = render(<CategoryList />, failed);
  assert.match(html, /do not have permission/); assert.doesNotMatch(html, /No categories yet/);
});

test('PQA category forms: add and edit route render correct heading and populated values', () => {
  const cache = client(); cache.setQueryData(['categories', 'list'], categories); cache.setQueryData(['categories', 'detail', '1'], categories[0]);
  const route = <Routes><Route path="/products/categories/new" element={<CategoryFormPage />} /><Route path="/products/categories/:categoryId/edit" element={<CategoryFormPage />} /></Routes>;
  assert.match(render(route, cache, '/products/categories/new'), /Save Category/);
  const edit = render(route, cache, '/products/categories/1/edit');
  assert.match(edit, /Edit Category/); assert.match(edit, /value="Active category"/); assert.match(edit, /Available/);
});

test('PQA details: current scope renders HSN, currency, discount, description fallback and category', () => {
  const cache = client(); cache.setQueryData(['products', 'detail', '7'], product); cache.setQueryData(['categories', 'list'], categories);
  const html = render(<Routes><Route path="/products/:id" element={<ProductDetails />} /></Routes>, cache, '/products/7');
  for (const value of ['PRD-7', 'USD 1,234.50', '001234', 'Active category', 'No description provided.', 'Discount Allowed']) assert.ok(html.includes(value), value);
});


test('PQA discount preview: only positive valid discounts on a positive price', () => {
  const cache = client(); cache.setQueryData(['categories', 'list'], categories);
  for (const [price, discountPercentage, discountAllowed, visible] of [
    [1000, 0, true, false], [1000, '', true, false], [0, 10, true, false],
    [1000, 10, false, false], [1000, -1, true, false], [1000, 101, true, false],
    [1000, 'invalid', true, false], [1000, 10, true, true], [1000, 100, true, true],
  ]) {
    const html = render(<ProductForm mode="create" initialValues={{ ...product, currency: 'INR', price, discountPercentage, discountAllowed }} onSubmit={() => {}} />, cache);
    assert.equal(html.includes('Price after discount:'), visible, JSON.stringify({ price, discountPercentage, discountAllowed }));
    if (visible && discountPercentage === 10) assert.match(html, /class="product-discount-amount"><strong>\u20b9900\.00<\/strong> <span>\(before tax\)<\/span>/);
  }
});

test('PQA categories: active first, stable order within groups, cache unchanged', () => {
  const cache = client();
  const input = [categories[1], categories[0], { ...categories[0], id: 3, name: 'Another active' }];
  cache.setQueryData(['categories', 'list'], input);
  const html = render(<CategoryList />, cache, '/products/categories');
  assert.ok(html.indexOf('<strong>Active category') < html.indexOf('<strong>Another active'));
  assert.ok(html.indexOf('<strong>Another active') < html.indexOf('<strong>Inactive category'));
  assert.equal(cache.getQueryData(['categories', 'list'])[0].id, 2);
});


test('PQA pagination: five-row pages retain correct next/previous ranges', () => {
  for (const [pageNumber, first, last] of [[1, 1, 5], [2, 6, 10], [3, 11, 12]]) {
    const html = render(<ProductPagination data={{ pageNumber, pageSize: 5, totalCount: 12, totalPages: 3 }} onPage={() => {}} onPageSize={() => {}} />);
    assert.match(html, new RegExp(`Showing ${first}.*${last} of 12 products`));
    assert.match(html, /value="5"/);
    assert.match(html, /Next/);
    assert.match(html, /Previous/);
  }
});


test('PQA Price sorting: trailing arrow and right-aligned cells in both directions', () => {
  for (const sortOrder of ['asc', 'desc']) {
    const html = render(table({ params: { sortBy: 'price', sortOrder } }));
    const header = html.match(/<th\b[^>]*>(?:(?!<\/th>).)*>Price<(?:(?!<\/th>).)*<\/th>/s)?.[0];
    assert.ok(header);
    assert.match(header, /MuiTableCell-alignRight/);
    assert.match(header, /flex-direction:row;/);
    assert.doesNotMatch(header, /flex-direction:row-reverse/);
    assert.match(header.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, ''), /Price<svg/);
    assert.match(html, /<td[^>]*MuiTableCell-alignRight[^>]*product-price/);
    assert.match(html, /class="product-identity"><span class="product-row-icon product"[^>]*>.*?<\/span><a[^>]*class="product-name"/s);
  }
});


test('PQA custom units: Piece/Set hidden, Others required, custom edit populated in both modes', () => {
  const cache = client(); cache.setQueryData(['categories', 'list'], categories);
  for (const mode of ['create', 'edit']) {
    for (const unit of ['Piece', 'Set', 'Others', 'Box']) {
      const html = render(<ProductForm mode={mode} initialValues={{ ...product, unit }} onSubmit={() => {}} />, cache);
      assert.equal(html.includes('id="productCustomUnit"'), ['Others', 'Box'].includes(unit));
      if (unit === 'Box') {
        assert.equal(getProductInitialValues({ ...product, unit }).unit, 'Others');
        assert.equal(getProductInitialValues({ ...product, unit }).customUnit, 'Box');
        assert.match(html, /id="productCustomUnit"[^>]*required=""/);
      }
    }
  }
});

test('PQA setup failure renders one combined alert and one retry; recovery clears it', () => {
  const cache = client();
  cache.getQueryCache().build(cache, { queryKey: ['categories', 'list'] }).setState({ status: 'error', fetchStatus: 'idle', error: new Error('Unable to load categories') });
  const form = <ProductForm initialValues={product} onSubmit={() => {}} />;
  const html = render(form, cache);
  assert.equal((html.match(/role="alert"/g) || []).length, 1);
  assert.equal((html.match(/>Retry</g) || []).length, 1);
  assert.match(html, /Unable to load product setup data. Check your connection and try again./);
  cache.setQueryData(['categories', 'list'], categories);
  assert.doesNotMatch(render(form, cache), /Unable to load product setup data/);
});

 test('PQA overflow actions preserve view/edit routes and labels', () => {
  const html = render(<ProductActionItems product={product} onSelect={() => {}} />);
  assert.match(html, /href="\/products\/7"/);
  assert.match(html, /href="\/products\/7\/edit"/);
  assert.match(html, /View/); assert.match(html, /Edit/);
});

test('PQA create type starts empty and saved Product/Service edit types stay selected', () => {
  assert.equal(getProductInitialValues(null).type, '');
  const cache = client(); cache.setQueryData(['categories', 'list'], categories);
  for (const type of ['Product', 'Service']) {
    assert.equal(getProductInitialValues({ ...product, type }).type, type);
    const html = render(<ProductForm mode="edit" initialValues={{ ...product, type }} onSubmit={() => {}} />, cache);
    assert.match(html, new RegExp(`<input\\b(?=[^>]*name="type")(?=[^>]*value="${type}")[^>]*>`));
    assert.doesNotMatch(html, /Select Type/);
  }
});
