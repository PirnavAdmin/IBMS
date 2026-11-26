import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  validateTaxRate,
  getLiveTaxRateError,
  validateTax,
  calculatePreview,
  emptyTax,
} from '../src/pages/Taxes/taxModel.js';

test('validateTaxRate rejects ticket sample containing large numbers and alphabetic character (e)', () => {
  const ticketSamples = [
    '13123123123123123123123e',
    '05464848488e555555555555555555555555555555555555555',
    '6786879878e',
    '1e2',
    '1.5E2',
    '18a',
    'abc',
    'Infinity',
    'NaN',
  ];

  for (const sample of ticketSamples) {
    assert.equal(
      validateTaxRate(sample),
      'Tax rate must be a valid numeric value without alphabetic characters.',
      `Expected alphabetic/scientific input "${sample}" to be rejected`
    );
  }
});

test('validateTaxRate rejects excessively large numeric values and out-of-range rates', () => {
  const outOfRange = [
    '13123123123123123123123',
    '100.01',
    '101',
    '999999',
    '-1',
    '-0.5',
  ];

  for (const sample of outOfRange) {
    assert.equal(
      validateTaxRate(sample),
      'Enter a percentage from 0 to 100.',
      `Expected out-of-range input "${sample}" to be rejected`
    );
  }

  assert.equal(
    validateTaxRate('00000000000000018'),
    'Enter a valid tax rate from 0 to 100.'
  );
});

test('validateTaxRate rejects empty, malformed symbols, and >2 decimal precision', () => {
  assert.equal(validateTaxRate(''), 'Tax rate is required.');
  assert.equal(validateTaxRate('   '), 'Tax rate is required.');
  assert.equal(validateTaxRate(null), 'Tax rate is required.');

  assert.equal(validateTaxRate('18%'), 'Enter a valid numeric tax rate from 0 to 100.');
  assert.equal(validateTaxRate('+18'), 'Enter a valid numeric tax rate from 0 to 100.');
  assert.equal(validateTaxRate('18.'), 'Enter a valid numeric tax rate from 0 to 100.');
  assert.equal(validateTaxRate('.5'), 'Enter a valid numeric tax rate from 0 to 100.');
  assert.equal(validateTaxRate('12..5'), 'Enter a valid numeric tax rate from 0 to 100.');
  assert.equal(validateTaxRate('18.125'), 'Tax rate can have at most 2 decimal places.');
});

test('validateTaxRate accepts valid tax rates from 0 to 100', () => {
  for (const valid of ['0', 0, '0.00', '5', 5, '2.75', 2.75, '12.5', '18', '28', '100', '100.00', 100]) {
    assert.equal(validateTaxRate(valid), '', `Expected valid rate "${valid}" to pass`);
  }
});

test('getLiveTaxRateError flags e/out-of-range immediately while allowing mid-decimal typing', () => {
  assert.equal(getLiveTaxRateError(''), '');
  assert.equal(getLiveTaxRateError('18.'), '');
  assert.equal(getLiveTaxRateError('0.'), '');
  assert.ok(getLiveTaxRateError('150.'));
  assert.ok(getLiveTaxRateError('13123123123123123123123e'));
  assert.ok(getLiveTaxRateError('18e'));
  assert.ok(getLiveTaxRateError('999'));
});

test('validateTax and calculatePreview reject invalid/scientific tax rates', () => {
  const values = {
    ...emptyTax(),
    name: 'Standard GST',
    code: 'GST18',
    type: 'GST',
    rate: '13123123123123123123123e',
    effectiveFrom: '2026-09-18',
  };
  assert.equal(
    validateTax(values).rate,
    'Tax rate must be a valid numeric value without alphabetic characters.'
  );
  assert.equal(calculatePreview('1000', '1e2', 'Exclusive', 'GST', 'Intra-State'), null);
  assert.equal(calculatePreview('1000', '13123123123123123123123e', 'Exclusive', 'GST', 'Intra-State'), null);
});

test('Taxes.jsx configures text/decimal inputMode for Rate (%) and wires live + blur validation', () => {
  const file = fs.readFileSync(new URL('../src/pages/Taxes/Taxes.jsx', import.meta.url), 'utf8');
  assert.ok(file.includes('["rate", "Rate (%)", null, "text"]'), 'Add/Edit Tax Rate field must use text input instead of browser number type');
  assert.ok(file.includes('inputMode: "decimal"'), 'Rate field must specify decimal inputMode');
  assert.ok(file.includes('validateTaxRate(values.rate)'), 'Rate field must validate on blur');
  assert.ok(file.includes('getLiveTaxRateError(val)'), 'Rate field must validate live on change');
  assert.ok(file.includes('name="preview-rate"'), 'Preview rate field must remain present');
});
