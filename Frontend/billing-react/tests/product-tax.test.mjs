import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PRODUCT_VALUES, TAX_CATEGORIES, productValidationSchema,
  getProductTaxValues, resolveProductTax,
} from '../src/pages/Products/validation/productValidation.js';

const validProduct = {
  ...DEFAULT_PRODUCT_VALUES, name: 'Test product', type: 'Product', categoryId: '1', price: 100,
};

test('product tax defaults and options exclude removed choices', () => {
  assert.equal(DEFAULT_PRODUCT_VALUES.taxCategory, 'Not Applicable');
  assert.ok(TAX_CATEGORIES.includes('Other'));
  for (const option of ['', 'Not set', 'GST 0%', 'Exempt']) assert.ok(!TAX_CATEGORIES.includes(option));
});

test('custom tax supports decimals, persists, and restores for editing', async () => {
  const values = await productValidationSchema.validate({ ...validProduct, taxCategory: 'GST 7.5%' });
  assert.equal(resolveProductTax(values), 'GST 7.5%');
  assert.deepEqual(getProductTaxValues(resolveProductTax(values)), { taxCategory: 'GST 7.5%' });
  for (const percentage of [0, 100]) {
    const result = await productValidationSchema.validate({ ...validProduct, taxCategory: `GST ${percentage}%` });
    assert.equal(resolveProductTax(result), `GST ${percentage}%`);
  }
});

test('editable tax rejects empty text, unfinished Other, overlong categories, and invalid percentages', async () => {
  for (const taxCategory of ['', ' ', 'Other', 'GST -1%', 'GST 101%', 'Tax invalid%', 'x'.repeat(65)]) {
    await assert.rejects(productValidationSchema.validate({ ...validProduct, taxCategory }), error => error.path === 'taxCategory');
  }
});

test('switching away from Other excludes stale custom tax', async () => {
  const values = await productValidationSchema.validate({ ...validProduct, taxCategory: 'GST 18%', customTaxPercentage: 'invalid' });
  assert.ok(!('customTaxPercentage' in values));
  assert.equal(resolveProductTax(values), 'GST 18%');
  for (const tax of [null, undefined, '']) {
    assert.equal(getProductTaxValues(tax).taxCategory, 'Not Applicable');
  }
  for (const type of ['Product', 'Service']) {
    for (const taxCategory of ['Exempt', 'GST 0%', 'Local levy', 'GST 7.5%']) {
      const saved = await productValidationSchema.validate({ ...validProduct, type, ...getProductTaxValues(taxCategory) });
      assert.equal(resolveProductTax(saved), taxCategory);
    }
  }
});
