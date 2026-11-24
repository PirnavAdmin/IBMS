import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Tax Calculation Preview Amount (INR) field uses whole-number step="1"', () => {
  const taxesFile = fs.readFileSync(new URL('../src/pages/Taxes/Taxes.jsx', import.meta.url), 'utf8');

  // Verify preview-amount field definition
  assert.ok(taxesFile.includes('name="preview-amount"'), 'Must contain preview-amount field');
  assert.ok(taxesFile.includes('label="Amount (INR)"'), 'Must contain Amount (INR) label');

  // Verify step="1" is configured
  assert.match(
    taxesFile,
    /name="preview-amount"[\s\S]*?label="Amount \(INR\)"[\s\S]*?step="1"/,
    'preview-amount must configure step="1" for whole-number increments and decrements'
  );

  // Verify step="0.01" is not present on preview-amount
  assert.equal(
    /name="preview-amount"[\s\S]*?step="0\.01"/.test(taxesFile),
    false,
    'preview-amount must not allow decimal step="0.01"'
  );
});
