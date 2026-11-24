import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateTaxCode, validateTax, emptyTax, TAX_CODE_REGEX } from '../src/pages/Taxes/taxModel.js';

test('TAX_CODE_REGEX rejects special characters (. @ $) and symbol spam', () => {
  // Ticket reproduction sample: GST11.@$$
  assert.equal(TAX_CODE_REGEX.test('GST11.@$$'), false);
  assert.equal(TAX_CODE_REGEX.test('@#$%^&*()'), false);
  assert.equal(TAX_CODE_REGEX.test('GST.18'), false);
  assert.equal(TAX_CODE_REGEX.test('TX 10'), false); // no spaces in code
  assert.equal(TAX_CODE_REGEX.test('GST!'), false);
  assert.equal(TAX_CODE_REGEX.test('TAX#1'), false);
  assert.equal(TAX_CODE_REGEX.test('<script>'), false);

  // Valid tax codes
  assert.equal(TAX_CODE_REGEX.test('TX-10'), true);
  assert.equal(TAX_CODE_REGEX.test('GST18'), true);
  assert.equal(TAX_CODE_REGEX.test('GST_20'), true);
  assert.equal(TAX_CODE_REGEX.test('VAT647'), true);
  assert.equal(TAX_CODE_REGEX.test('001'), true);
});

test('validateTaxCode rejects unsupported special characters with clear validation message', () => {
  // Ticket reproduction sample: GST11.@$$
  const result = validateTaxCode('GST11.@$$');
  assert.equal(result, 'Tax code can only contain letters, numbers, hyphens, and underscores.');

  assert.equal(
    validateTaxCode('@#$%^&*()'),
    'Tax code can only contain letters, numbers, hyphens, and underscores.'
  );
  assert.equal(
    validateTaxCode('CODE@123'),
    'Tax code can only contain letters, numbers, hyphens, and underscores.'
  );
});

test('validateTaxCode enforces required, length, and format boundaries', () => {
  // Required
  assert.equal(validateTaxCode(''), 'Tax code is required.');
  assert.equal(validateTaxCode('   '), 'Tax code is required.');
  assert.equal(validateTaxCode(null), 'Tax code is required.');

  // Length
  assert.equal(validateTaxCode('A'), 'Tax code must be at least 2 characters.');
  assert.equal(validateTaxCode('A'.repeat(65)), 'Tax code cannot exceed 64 characters.');

  // Prefix & consecutive
  assert.equal(validateTaxCode('-TX'), 'Tax code must start with a letter or number.');
  assert.equal(validateTaxCode('_GST'), 'Tax code must start with a letter or number.');
  assert.equal(validateTaxCode('TX--10'), 'Tax code cannot contain consecutive special characters.');
  assert.equal(validateTaxCode('GST__20'), 'Tax code cannot contain consecutive special characters.');

  // Valid
  assert.equal(validateTaxCode('TX-10'), '');
  assert.equal(validateTaxCode('GST18'), '');
  assert.equal(validateTaxCode('GST_20'), '');
  assert.equal(validateTaxCode('21312'), '');
});

test('validateTax blocks saving when code contains special characters', () => {
  const values = {
    ...emptyTax(),
    name: 'SGST',
    code: 'GST11.@$$',
    type: 'SGST',
    rate: '9',
    effectiveFrom: '2026-09-18'
  };

  const errors = validateTax(values);
  assert.equal(errors.code, 'Tax code can only contain letters, numbers, hyphens, and underscores.');
});

test('Taxes.jsx wires validateTaxCode on blur and change', () => {
  const file = fs.readFileSync(new URL('../src/pages/Taxes/Taxes.jsx', import.meta.url), 'utf8');

  assert.ok(file.includes('validateTaxCode'), 'Must import validateTaxCode');
  assert.ok(file.includes('validateTaxCode(values.code)'), 'Must validate code on blur');
  assert.ok(file.includes('validateTaxCode(val)'), 'Must re-validate code on change');
});
