import test from 'node:test';
import assert from 'node:assert/strict';
import { getProductPageSize, saveProductPageSize, PRODUCT_PAGE_SIZES } from '../src/pages/Products/utils/productPageSize.js';

test('Product page size survives reinitialization for every supported selection', () => {
  const original = globalThis.window;
  const stored = new Map();
  globalThis.window = { localStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) } };
  try {
    assert.equal(getProductPageSize(), 10);
    for (const size of PRODUCT_PAGE_SIZES) {
      saveProductPageSize(size);
      assert.equal(getProductPageSize(), size);
    }
    saveProductPageSize(5);
    saveProductPageSize(7);
    assert.equal(getProductPageSize(), 5);
    stored.set('ibms.products.pageSize', 'invalid');
    assert.equal(getProductPageSize(), 10);
  } finally {
    if (original === undefined) delete globalThis.window;
    else globalThis.window = original;
  }
});

test('Product page size safely defaults when storage is blocked', () => {
  const original = globalThis.window;
  globalThis.window = { get localStorage() { throw new Error('Storage blocked'); } };
  try {
    assert.equal(getProductPageSize(), 10);
    assert.doesNotThrow(() => saveProductPageSize(5));
  } finally {
    if (original === undefined) delete globalThis.window;
    else globalThis.window = original;
  }
});
