import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateTaxName, validateTax, emptyTax, TAX_NAME_REGEX } from '../src/pages/Taxes/taxModel.js';

test('TAX_NAME_REGEX rejects special characters ($ # ^ %) and symbol spam', () => {
  // Ticket reproduction sample: dyediuwy7373872839$#$^^%$7
  assert.equal(TAX_NAME_REGEX.test('dyediuwy7373872839$#$^^%$7'), false);
  assert.equal(TAX_NAME_REGEX.test('@#$%^&*()'), false);
  assert.equal(TAX_NAME_REGEX.test('$#$^^%$'), false);
  assert.equal(TAX_NAME_REGEX.test('Tax#1'), false);
  assert.equal(TAX_NAME_REGEX.test('GST 18%'), false); // % is unsupported in name; rate is in Rate field
  assert.equal(TAX_NAME_REGEX.test('<script>'), false);

  // Valid tax names
  assert.equal(TAX_NAME_REGEX.test('CGST-18'), true);
  assert.equal(TAX_NAME_REGEX.test('State GST (5)'), true);
  assert.equal(TAX_NAME_REGEX.test('VAT_Standard'), true);
  assert.equal(TAX_NAME_REGEX.test('Custom Tax Rule 1'), true);
});

test('validateTaxName rejects unsupported special characters with clear validation message', () => {
  const result = validateTaxName('dyediuwy7373872839$#$^^%$7');
  assert.equal(result, 'Tax name can only contain letters, numbers, spaces, hyphens, and parentheses.');

  assert.equal(
    validateTaxName('@#$%^&*()'),
    'Tax name can only contain letters, numbers, spaces, hyphens, and parentheses.'
  );
  assert.equal(
    validateTaxName('GST#18'),
    'Tax name can only contain letters, numbers, spaces, hyphens, and parentheses.'
  );
});

test('validateTaxName enforces required, length, and format boundaries', () => {
  // Required
  assert.equal(validateTaxName(''), 'Tax name is required.');
  assert.equal(validateTaxName('   '), 'Tax name is required.');
  assert.equal(validateTaxName(null), 'Tax name is required.');

  // Length
  assert.equal(validateTaxName('A'), 'Tax name must be at least 2 characters.');
  assert.equal(validateTaxName('A'.repeat(101)), 'Tax name cannot exceed 100 characters.');

  // Prefix & consecutive
  assert.equal(validateTaxName('-GST'), 'Tax name must start with a letter or number.');
  assert.equal(validateTaxName('CGST--18'), 'Tax name cannot contain consecutive special characters.');

  // Valid
  assert.equal(validateTaxName('CGST-18'), '');
  assert.equal(validateTaxName('State GST (5)'), '');
  assert.equal(validateTaxName('VAT_Standard 2'), '');
});

test('validateTax blocks saving when name contains special characters', () => {
  const values = {
    ...emptyTax(),
    name: 'dyediuwy7373872839$#$^^%$7',
    code: 'TX18',
    type: 'GST',
    rate: '18',
    effectiveFrom: '2026-09-18'
  };

  const errors = validateTax(values);
  assert.equal(errors.name, 'Tax name can only contain letters, numbers, spaces, hyphens, and parentheses.');
});

test('Taxes.jsx wires validateTaxName on blur and change', () => {
  const file = fs.readFileSync(new URL('../src/pages/Taxes/Taxes.jsx', import.meta.url), 'utf8');

  assert.ok(file.includes('validateTaxName'), 'Must import validateTaxName');
  assert.ok(file.includes('validateTaxName(values.name)'), 'Must validate on blur');
  assert.ok(file.includes('validateTaxName(val)'), 'Must re-validate on change');
});
