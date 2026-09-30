import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchRoutes } from 'react-router-dom';
import { apiClient } from '../../billing-api-client/apiClient.js';
import { productApi } from '../../billing-api-client/productApi.js';
import { categoryApi } from '../../billing-api-client/categoryApi.js';
import { productApiService, normalizeProduct, normalizeProductPage } from '../src/pages/Products/services/productService.js';
import { categoryService, normalizeCategory, validateCategory, categoryError } from '../src/pages/Products/services/categoryService.js';
import { productValidationSchema, DEFAULT_PRODUCT_VALUES, PRODUCT_TYPES, resolveProductUnit } from '../src/pages/Products/validation/productValidation.js';
import { formatProductPrice } from '../src/pages/Products/utils/formatProductPrice.js';

const valid = { ...DEFAULT_PRODUCT_VALUES, name: 'QA product', categoryId: '7', price: 10 };
const page = { items: [{ id: 1, name: 'Example', type: 'Service', price: 10 }], totalCount: 21, pageNumber: 2, pageSize: 10, totalPages: 3 };

test('PQA routes: static category routes outrank product detail routes', () => {
  const source = readFileSync(new URL('../src/routes/AppRoutes.jsx', import.meta.url), 'utf8');
  const routes = [...source.matchAll(/<Route path="(\/products[^"]*)" element=\{<(\w+)/g)].map(([, path, component]) => ({ path, component }));
  for (const [url, expected] of Object.entries({ '/products': 'ProductList', '/products/new': 'CreateProduct', '/products/7': 'ProductDetails', '/products/7/edit': 'EditProduct', '/products/categories': 'CategoryList', '/products/categories/new': 'CategoryFormPage', '/products/categories/7/edit': 'CategoryFormPage' })) {
    assert.equal(matchRoutes(routes, url).at(-1).route.component, expected);
  }
});

test('PQA query: search, category ID, status, sorting and pagination travel together', async () => {
  const original = productApi.getProducts;
  let sent;
  productApi.getProducts = async params => { sent = params; return page; };
  try {
    const result = await productApiService.getProducts({ search: 'Cook & Pan', category: '7', status: 'Inactive', sortBy: 'price', sortOrder: 'desc', pageNumber: 2, pageSize: 10 });
    assert.deepEqual(sent, { search: 'Cook & Pan', categoryId: 7, status: 'Inactive', sortBy: 'price', sortOrder: 'desc', pageNumber: 2, pageSize: 10 });
    assert.equal(result.totalPages, 3);
    assert.deepEqual(result.items.map(p => p.id), [1]);
    await productApiService.getProducts({ category: '', search: '' });
    assert.equal(Object.hasOwn(sent, 'categoryId'), false);
  } finally { productApi.getProducts = original; }
});

test('PQA mapping: real status, nested category, HSN zeros, zero discount, no fake rows', () => {
  const result = normalizeProduct({ id: 1, category: { id: 7, name: 'Parts' }, isActive: false, status: 'Active', hsnSacCode: '001234', discountPercent: 0 });
  assert.equal(result.status, 'Inactive'); assert.equal(result.category, 'Parts'); assert.equal(result.categoryId, 7);
  assert.equal(result.hsnSac, '001234'); assert.equal(result.discountPercentage, 0);
  assert.equal(normalizeProduct({ id: 1, category: null }).category, '');
  assert.deepEqual(normalizeProductPage({ items: [], totalCount: 0, pageNumber: 1, pageSize: 10 }).items, []);
  assert.throws(() => normalizeProductPage({ message: 'failure' }));
  assert.throws(() => normalizeProduct(null));
});

test('PQA KPI: all four queries use backend totals, with type=Service', async () => {
  const original = productApi.getProducts;
  const calls = [];
  productApi.getProducts = async params => { calls.push(params); return { ...page, items: [], totalCount: params.type ? 3 : params.status === 'Active' ? 8 : params.status ? 2 : 10 }; };
  try {
    assert.deepEqual((await productApiService.getCatalogMetadata()).summary, { total: 10, active: 8, inactive: 2, services: 3 });
    assert.equal(calls.find(p => p.type)?.type, 'Service');
    assert.ok(calls.every(p => p.pageNumber === 1 && p.pageSize === 1));
  } finally { productApi.getProducts = original; }
});

test('PQA validation: whitespace, category, price, types, status and optional fields', () => {
  for (const patch of [{ name: '  ' }, { name: 'a' }, { categoryId: '' }, { categoryId: '0' }, { price: -1 }, { price: 'bad' }, { type: 'Unknown' }, { status: 'Unknown' }]) {
    assert.throws(() => productValidationSchema.validateSync({ ...valid, ...patch }));
  }
  for (const type of PRODUCT_TYPES) assert.equal(productValidationSchema.validateSync({ ...valid, type }).type, type);
  assert.equal(productValidationSchema.validateSync({ ...valid, price: 0, hsnSac: '00123456' }).hsnSac, '00123456');
});

test('PQA validation: current Swagger length and price boundaries', () => {
  const result = productValidationSchema.validateSync({ ...valid, productCode: 'A'.repeat(64), name: 'N'.repeat(256), unit: 'U'.repeat(32), price: 999999999.99 });
  assert.equal(result.name.length, 256);
  for (const patch of [{ productCode: 'A'.repeat(65) }, { name: 'N'.repeat(257) }, { unit: 'U'.repeat(33) }, { price: 1000000000 }, { price: Infinity }]) assert.throws(() => productValidationSchema.validateSync({ ...valid, ...patch }));
});

test('PQA category mapping and validation handle status, duplicate and incomplete lists', async () => {
  assert.equal(normalizeCategory({ categoryId: 7, categoryName: 'Parts', isActive: false, productCount: 0 }).status, 'Inactive');
  assert.equal(normalizeCategory({ id: 1, name: 'Parts' }).status, 'Unknown');
  assert.match(validateCategory({ name: '  ', status: 'Active' }, []), /required/);
  assert.match(validateCategory({ name: ' parts ', status: 'Active' }, [{ id: 1, name: 'Parts' }]), /already exists/);
  assert.equal(validateCategory({ name: ' parts ', status: 'Active' }, [{ id: 1, name: 'Parts' }], 1), '');
  const original = categoryApi.getCategories;
  categoryApi.getCategories = async () => ({ items: [{ id: 1, name: 'Parts' }], totalCount: 2 });
  try { await assert.rejects(categoryService.getAll(), /Incomplete/); } finally { categoryApi.getCategories = original; }
});

test('PQA category writes use current POST/PUT/PATCH contract', async () => {
  const originals = { post: apiClient.post, put: apiClient.put, patch: apiClient.patch };
  const calls = [];
  for (const method of Object.keys(originals)) apiClient[method] = async (...args) => { calls.push({ method, args }); return { success: true, data: { id: 7 } }; };
  try {
    await categoryService.save({ name: ' Parts ', description: ' Desc ', status: 'Active' });
    await categoryService.save({ name: ' Parts ', description: '', status: 'Inactive' }, 7);
    await categoryService.setStatus(7, 'Inactive');
    await categoryService.setStatus(7, 'Active');
    assert.deepEqual(calls[0].args, ['/api/v1/categories', { name: 'Parts', description: 'Desc', status: 'Active' }]);
    assert.equal(calls[1].args[0], '/api/v1/categories/7');
    assert.deepEqual(calls[2].args, ['/api/v1/categories/7/status', null, { params: { status: 'Inactive' } }]);
    assert.deepEqual(calls[3].args[2], { params: { status: 'Active' } });
  } finally { Object.assign(apiClient, originals); }
});

test('PQA category failures retain safe backend business validation', async () => {
  const original = apiClient.post;
  apiClient.post = async () => ({ success: false, message: 'Validation failed', errors: ['A category with this name already exists.'] });
  try {
    await assert.rejects(categoryApi.createCategory({ name: 'Parts' }), error => {
      assert.match(categoryError(error), /already exists/); return true;
    });
  } finally { apiClient.post = original; }
});

test('PQA errors: Product GET/POST/PUT reject HTTP failures and failed success envelopes', async () => {
  const originals = { get: apiClient.get, post: apiClient.post, put: apiClient.put };
  try {
    for (const status of [400, 401, 403, 404, 409, 500, undefined]) {
      for (const method of Object.keys(originals)) apiClient[method] = async () => { throw Object.assign(new Error('Request failed'), { response: status ? { status, data: { message: 'Request failed' } } : undefined }); };
      for (const run of [() => productApi.getProducts(), () => productApi.getProductById(7), () => productApi.createProduct(valid), () => productApi.updateProduct(7, valid)]) {
        await assert.rejects(run(), error => { assert.equal(error.status, status); return true; });
      }
    }
    apiClient.post = async () => ({ success: false, message: 'Rejected' });
    await assert.rejects(productApi.createProduct(valid));
  } finally { Object.assign(apiClient, originals); }
});

test('PQA edit payload keeps rowVersion, category ID and optional values', async () => {
  const original = productApi.updateProduct;
  let sent;
  productApi.updateProduct = async (_id, data) => { sent = data; return data; };
  try {
    await productApiService.updateProduct(7, { ...valid, rowVersion: 'version', description: '', taxCategory: '', hsnSac: '', category: 'Parts' });
    assert.equal(sent.categoryId, 7); assert.equal(sent.rowVersion, 'version');
    assert.equal(sent.taxCategory, ''); assert.equal(sent.hsnSacCode, ''); assert.equal(sent.description, '');
  } finally { productApi.updateProduct = original; }
});

test('PQA currency: INR, USD, EUR, zero, large and missing amounts are not relabelled', () => {
  assert.match(formatProductPrice(1234.5, 'USD'), /\$1,234\.50/);
  assert.match(formatProductPrice(0, 'EUR'), /€0\.00/);
  assert.match(formatProductPrice(999999999.99, 'INR'), /₹99,99,99,999\.99/);
  assert.equal(formatProductPrice(null), '-'); assert.equal(formatProductPrice('bad'), '-');
  assert.match(formatProductPrice(12, 'invalid'), /invalid 12\.00/);
  assert.equal(productValidationSchema.validateSync({ ...valid, taxCategory: '' }).taxCategory, '');
});

test('PQA product errors: preserve validation but never expose server exception details', async () => {
  const original = apiClient.post;
  try {
    apiClient.post = async () => { throw { response: { status: 500, data: { message: 'SqlException SELECT secret FROM accounts' } } }; };
    await assert.rejects(productApi.createProduct(valid), error => {
      assert.equal(error.status, 500); assert.match(error.message, /unavailable/); assert.doesNotMatch(error.message, /SqlException|SELECT|accounts/); return true;
    });
    apiClient.post = async () => ({ success: false, message: 'Validation failed', errors: ['Product code already exists.'] });
    await assert.rejects(productApi.createProduct(valid), /already exists/);
  } finally { apiClient.post = original; }
});

test('PQA categories: GET/POST/PUT/PATCH never report success on HTTP or business failure', async () => {
  const originals = { get: apiClient.get, post: apiClient.post, put: apiClient.put, patch: apiClient.patch };
  try {
    for (const status of [400, 401, 403, 404, 409, 500, undefined]) {
      for (const method of Object.keys(originals)) apiClient[method] = async () => { throw Object.assign(new Error('Request failed'), { response: status ? { status, data: { message: 'Request failed' } } : undefined }); };
      for (const run of [() => categoryApi.getCategories(), () => categoryApi.getCategoryById(7), () => categoryApi.createCategory({}), () => categoryApi.updateCategory(7, {}), () => categoryApi.setCategoryStatus(7, false)]) await assert.rejects(run());
    }
    apiClient.patch = async () => ({ success: false, message: 'Status change denied' });
    await assert.rejects(categoryApi.setCategoryStatus(7, false));
    assert.doesNotMatch(categoryError({ response: { status: 500, data: { message: 'SqlException' } } }), /SqlException/);
  } finally { Object.assign(apiClient, originals); }
});


test('PQA HSN/SAC: exact type-specific digits, optional empty, and type switches', () => {
  for (const [type, code, message, invalid] of [
    ['Product', '12345678', 'HSN code must contain exactly 8 digits.', ['123456', '123456789', '12AB5678', '1234-5678', ' 12345678', '12345678 ', '1234 678', '        ']],
    ['Service', '998313', 'SAC code must contain exactly 6 digits.', ['99831', '99831344', '99AB13', ' 998313', '998313 ', '99-313', '      ']],
  ]) {
    for (const hsnSac of [code, '', null, undefined, '0'.repeat(code.length)]) {
      assert.doesNotThrow(() => productValidationSchema.validateSync({ ...valid, type, hsnSac }));
    }
    for (const hsnSac of invalid) {
      assert.throws(() => productValidationSchema.validateSync({ ...valid, type, hsnSac }), error => error.message === message);
    }
  }
  for (const [type, hsnSac] of [['Service', '12345678'], ['Product', '998313']]) {
    assert.throws(() => productValidationSchema.validateSync({ ...valid, type, hsnSac }));
  }
});


test('PQA custom unit validation and actual API unit value', () => {
  for (const customUnit of ['', '   ', undefined]) {
    assert.throws(() => productValidationSchema.validateSync({ ...valid, unit: 'Others', customUnit }),
      error => error.message === 'Please enter a custom unit of measurement.');
  }
  const custom = productValidationSchema.validateSync({ ...valid, unit: 'Others', customUnit: '  Box  ' });
  assert.equal(custom.customUnit, 'Box');
  assert.equal(resolveProductUnit(custom), 'Box');
  assert.throws(() => productValidationSchema.validateSync({ ...valid, unit: 'Others', customUnit: 'x'.repeat(33) }));
  for (const unit of ['Piece', 'Set']) {
    const data = productValidationSchema.validateSync({ ...valid, unit, customUnit: '' });
    assert.equal(resolveProductUnit(data), unit);
    assert.equal(Object.hasOwn(data, 'customUnit'), false);
  }
});
