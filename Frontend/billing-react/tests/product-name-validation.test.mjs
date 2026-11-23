import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PRODUCT_VALUES,
  productValidationSchema,
  PRODUCT_NAME_REGEX,
  CONSECUTIVE_SYMBOLS_REGEX,
} from '../src/pages/Products/validation/productValidation.js';

const baseValidProduct = {
  ...DEFAULT_PRODUCT_VALUES,
  type: 'Product',
  categoryId: '1',
  price: 100,
  taxCategory: 'Not Applicable',
};

test('PRODUCT_NAME_REGEX accepts valid business product names with allowed characters', () => {
  const validNames = [
    'Enterprise Billing Software',
    'Wireless Mouse Pad (Anti-Slip)',
    'AC/DC Adapter + Cable, Type-C',
    "Men's Cotton T-Shirt",
    'USB-C to HDMI 4K/60Hz Adapter',
    'Model X_100 (v2.1)',
    '15.6 Inch Monitor',
    '100% Cotton Fabric' // wait: % is disallowed as invalid special character per ticket!
  ];

  for (const name of validNames.filter(n => !n.includes('%'))) {
    assert.equal(PRODUCT_NAME_REGEX.test(name), true, `Expected valid: ${name}`);
  }
});

test('PRODUCT_NAME_REGEX rejects invalid special characters from ticket and symbol spam', () => {
  const invalidNames = [
    'Product@@@',
    'Test%^&*',
    'Dgjwuffiuw e587846&^&%^$ 1552',
    'Product #1',
    'Item <script>',
    'Gadget [Pro]',
    'Item {1}',
    'Product | Test',
    'Product ~ Best',
    'Product = Test',
    'Product ? Test',
    'Product ! Test',
  ];

  for (const name of invalidNames) {
    assert.equal(PRODUCT_NAME_REGEX.test(name), false, `Expected invalid: ${name}`);
  }
});

test('CONSECUTIVE_SYMBOLS_REGEX flags consecutive punctuation characters', () => {
  const consecutiveExamples = [
    'Product---1',
    'Item..Pro',
    'Device // Hub',
    'Test,,2',
    'Item ((A))',
  ];

  for (const name of consecutiveExamples) {
    assert.equal(CONSECUTIVE_SYMBOLS_REGEX.test(name), true, `Expected consecutive symbols: ${name}`);
  }
});

test('productValidationSchema validates valid product names successfully', async () => {
  const validNames = [
    'Enterprise Billing Software',
    'Wireless Mouse Pad (Anti-Slip)',
    'AC/DC Adapter + Cable, Type-C',
    "Men's Cotton T-Shirt",
    'USB-C to HDMI 4K/60Hz Adapter',
    'Model X_100 (v2.1)',
  ];

  for (const name of validNames) {
    const result = await productValidationSchema.validate({ ...baseValidProduct, name });
    assert.equal(result.name, name);
  }
});

test('productValidationSchema rejects invalid special characters with appropriate error message', async () => {
  const ticketExamples = [
    'Product@@@',
    'Test%^&*',
    'Dgjwuffiuw e587846&^&%^$ 1552',
  ];

  for (const name of ticketExamples) {
    await assert.rejects(
      productValidationSchema.validate({ ...baseValidProduct, name }),
      error => {
        assert.equal(error.path, 'name');
        assert.ok(
          error.message.includes('Product name can only contain letters, numbers, spaces, and standard characters') ||
          error.message.includes('consecutive special characters')
        );
        return true;
      }
    );
  }
});

test('productValidationSchema rejects consecutive special characters', async () => {
  const consecutiveCases = [
    'Product--1',
    'Item..Pro',
    'Device//Hub',
  ];

  for (const name of consecutiveCases) {
    await assert.rejects(
      productValidationSchema.validate({ ...baseValidProduct, name }),
      error => {
        assert.equal(error.path, 'name');
        assert.equal(error.message, 'Product name cannot contain consecutive special characters');
        return true;
      }
    );
  }
});

test('productValidationSchema rejects product names containing no letters or numbers', async () => {
  const noAlphaCases = [
    '---',
    '.,.',
    '(-)',
  ];

  for (const name of noAlphaCases) {
    await assert.rejects(
      productValidationSchema.validate({ ...baseValidProduct, name }),
      error => {
        assert.equal(error.path, 'name');
        return true;
      }
    );
  }
});
