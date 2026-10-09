import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CURRENCY_CODES, CURRENCY_OPTIONS, filterCurrencyOption, getCurrencyOptions, getCurrencySymbol } from '../src/utils/currencies.js';
import { DEFAULT_PRODUCT_VALUES, productValidationSchema } from '../src/pages/Products/validation/productValidation.js';
import { productApiService } from '../src/pages/Products/services/productService.js';
import { productApi } from '../../billing-api-client/productApi.js';

test('offline currencies cover current ISO monetary entries without duplicates', () => {
  const xml = readFileSync(new URL('../src/data/iso4217.xml', import.meta.url), 'utf8');
  const nonBilling = new Set(['XAU', 'XAG', 'XPD', 'XPT', 'XBA', 'XBB', 'XBC', 'XBD', 'XTS', 'XXX']);
  const codes = [...new Set([...xml.matchAll(/<Ccy>([A-Z]{3})<\/Ccy>/g)].map(match => match[1]))].filter(code => !nonBilling.has(code)).sort();
  assert.deepEqual([...CURRENCY_CODES].sort(), codes);
  assert.equal(new Set(CURRENCY_OPTIONS.map(option => option.value)).size, CURRENCY_OPTIONS.length);
  assert.equal(getCurrencyOptions('INR').length, CURRENCY_OPTIONS.length);
  assert.equal(getCurrencyOptions('BGN')[0].value, 'BGN');
});

test('currency search matches shared countries, names, codes and accents', () => {
  for (const [query, code] of [['India', 'INR'], ['Japan', 'JPY'], ['yen', 'JPY'], ['AED', 'AED'], ['Germany', 'EUR'], ['Bulgaria', 'EUR'], ['Ecuador', 'USD'], ['Curacao', 'XCG']]) {
    assert.ok(CURRENCY_OPTIONS.filter(option => filterCurrencyOption(query, option)).some(option => option.value === code), query);
  }
  assert.equal(getCurrencySymbol('INR'), '₹');
  assert.equal(getCurrencySymbol('JPY'), '¥');
});

test('Product and Service currency/custom tax values reach create and update payloads unchanged', async () => {
  const original = { createProduct: productApi.createProduct, updateProduct: productApi.updateProduct };
  const sent = [];
  productApi.createProduct = async payload => { sent.push(payload); return payload; };
  productApi.updateProduct = async (id, payload) => { sent.push(payload); return payload; };
  try {
    for (const type of ['Product', 'Service']) {
      for (const currency of ['INR', 'USD', 'GBP', 'EUR', 'AED', 'JPY', 'XCG', 'ZWG']) {
        const value = await productValidationSchema.validate({ ...DEFAULT_PRODUCT_VALUES, type, categoryId: '1', name: 'Contract test', price: 12, currency, taxCategory: 'Local levy', customTaxPercentage: 18 });
        await productApiService.createProduct(value);
        await productApiService.updateProduct(1, value);
        for (const payload of sent.splice(0)) {
          assert.equal(payload.currency, currency);
          assert.equal(payload.taxCategory, 'Local levy');
          assert.ok(!('customTaxPercentage' in payload));
        }
      }
    }
    await assert.rejects(productValidationSchema.validateAt('currency', { currency: 'ZZZ' }));
    assert.equal(await productValidationSchema.validateAt('currency', { currency: 'BGN' }, { context: { existingCurrency: 'BGN' } }), 'BGN');
  } finally { Object.assign(productApi, original); }
});
