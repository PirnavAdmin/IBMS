import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReasonDetails } from '../src/pages/CreditNotes/utils/creditNoteCalculations.js';

test('validateReasonDetails rejects empty or short inputs under 8 characters', () => {
  assert.equal(validateReasonDetails('').valid, false);
  assert.equal(validateReasonDetails('   ').valid, false);
  assert.equal(validateReasonDetails('short').valid, false);
  assert.equal(validateReasonDetails('1234567').valid, false);
});

test('validateReasonDetails rejects text exceeding 600 characters', () => {
  const longText = 'Valid description '.repeat(40); // 720 chars
  const result = validateReasonDetails(longText);
  assert.equal(result.valid, false);
  assert.match(result.error, /cannot exceed 600 characters/i);
});

test('validateReasonDetails rejects inputs without meaningful words/letters', () => {
  const result = validateReasonDetails('1234567890');
  assert.equal(result.valid, false);
  assert.match(result.error, /meaningful text with letters/i);
});

test('validateReasonDetails rejects unsupported special characters from bug report', () => {
  // Bug report exact inputs: iu87687687678^&%^&$^%$%#$ and dhfhfhiuwhw iu87687687678^&%^&$^%$%#$
  const bugReportInput1 = 'iu87687687678^&%^&$^%$%#$';
  const bugReportInput2 = 'dhfhfhiuwhw  iu87687687678^&%^&$^%$%#$';

  const result1 = validateReasonDetails(bugReportInput1);
  assert.equal(result1.valid, false);

  const result2 = validateReasonDetails(bugReportInput2);
  assert.equal(result2.valid, false);
});

test('validateReasonDetails rejects arbitrary code/shell characters (^, $, ~, <, >, {, }, \\, |)', () => {
  assert.equal(validateReasonDetails('Service cancellation with ^ symbol').valid, false);
  assert.equal(validateReasonDetails('Credit refund total $500 invalid').valid, false);
  assert.equal(validateReasonDetails('Customer ~ agreement deficiency').valid, false);
  assert.equal(validateReasonDetails('Description with <script> tag').valid, false);
  assert.equal(validateReasonDetails('Backslash \\ inside text error').valid, false);
});

test('validateReasonDetails rejects excessive consecutive special characters', () => {
  const result1 = validateReasonDetails('Service cancelled **** details');
  assert.equal(result1.valid, false);
  assert.match(result1.error, /excessive special characters/i);

  const result2 = validateReasonDetails('Service cancelled !@#$%^&* details');
  assert.equal(result2.valid, false);
});

test('validateReasonDetails rejects excessive special characters ratio', () => {
  const result = validateReasonDetails('Reason test * * * # # # @ @ @ % % %');
  assert.equal(result.valid, false);
  assert.match(result.error, /too many special characters/i);
});

test('validateReasonDetails accepts valid business descriptions and audit explanations', () => {
  const sample1 = 'Service cancellation approved by customer.';
  const sample2 = 'Goods returned due to minor defects (PO-9948, 10% deduction agreed).';
  const sample3 = 'Incorrect quantity billed on line 2; credit issued per contract ref #4489.';
  const sample4 = 'Partial credit applied as per manager review... see ticket CRM-102.';

  assert.deepEqual(validateReasonDetails(sample1), { valid: true, error: '' });
  assert.deepEqual(validateReasonDetails(sample2), { valid: true, error: '' });
  assert.deepEqual(validateReasonDetails(sample3), { valid: true, error: '' });
  assert.deepEqual(validateReasonDetails(sample4), { valid: true, error: '' });
});
