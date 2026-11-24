import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDeactivationReason } from '../src/pages/Customers/validation/customerValidation.js';

test('validateDeactivationReason rejects empty or whitespace-only inputs', () => {
  assert.equal(validateDeactivationReason('').valid, false);
  assert.equal(validateDeactivationReason('   ').valid, false);
  assert.equal(validateDeactivationReason(null).valid, false);
  assert.equal(validateDeactivationReason(undefined).valid, false);
  assert.equal(validateDeactivationReason('').error, 'Deactivation reason is required.');
});

test('validateDeactivationReason rejects inputs shorter than 5 characters', () => {
  assert.equal(validateDeactivationReason('abc').valid, false);
  assert.equal(validateDeactivationReason('1234').valid, false);
  assert.equal(validateDeactivationReason('abcd').error, 'Deactivation reason must be at least 5 characters.');
});

test('validateDeactivationReason rejects inputs from bug report (pure numbers and special characters)', () => {
  // Ticket samples:
  // 123456789
  // @#$%^&*()
  // 67656&^&%$#$%^
  const sample1 = '123456789';
  const sample2 = '@#$%^&*()';
  const sample3 = '67656&^&%$#$%^';

  const res1 = validateDeactivationReason(sample1);
  assert.equal(res1.valid, false);
  assert.equal(res1.error, 'Deactivation reason cannot contain only numbers or special characters.');

  const res2 = validateDeactivationReason(sample2);
  assert.equal(res2.valid, false);
  assert.equal(res2.error, 'Deactivation reason cannot contain only numbers or special characters.');

  const res3 = validateDeactivationReason(sample3);
  assert.equal(res3.valid, false);
  assert.equal(res3.error, 'Deactivation reason cannot contain only numbers or special characters.');
});

test('validateDeactivationReason rejects screenshot inputs with arbitrary symbol garbage', () => {
  // Screenshot sample:
  // Customer is not interested
  // 67656&^&%%$#$^%^&*&^*(^*(&(
  const screenshotSample = 'Customer is not interested\n67656&^&%%$#$^%^&*&^*(^*(&(';
  const res = validateDeactivationReason(screenshotSample);
  assert.equal(res.valid, false);
});

test('validateDeactivationReason rejects inputs lacking meaningful letters', () => {
  assert.equal(validateDeactivationReason('99999 a').valid, false);
  assert.equal(validateDeactivationReason('12345678 aa').valid, false);
  assert.equal(validateDeactivationReason('12345678 aa').error, 'Deactivation reason must contain meaningful text with letters.');
});

test('validateDeactivationReason rejects unsupported/dangerous characters (^, $, ~, <, >, {, }, \\, |)', () => {
  assert.equal(validateDeactivationReason('Customer left ^ due to pricing').valid, false);
  assert.equal(validateDeactivationReason('Account closure <script>alert(1)</script>').valid, false);
  assert.equal(validateDeactivationReason('Customer ~ agreement cancelled').valid, false);
  assert.equal(validateDeactivationReason('Reason with \\ backslash error').valid, false);
});

test('validateDeactivationReason rejects excessive consecutive special characters', () => {
  const res1 = validateDeactivationReason('Customer cancelled **** details');
  assert.equal(res1.valid, false);
  assert.equal(res1.error, 'Deactivation reason contains excessive special characters.');

  const res2 = validateDeactivationReason('Account closed !@#$%^&* abruptly');
  assert.equal(res2.valid, false);
});

test('validateDeactivationReason rejects repetitive characters (spam/gibberish)', () => {
  const res = validateDeactivationReason('Customer aaaaaaa closure');
  assert.equal(res.valid, false);
  assert.equal(res.error, 'Deactivation reason cannot contain repetitive meaningless characters.');
});

test('validateDeactivationReason rejects text exceeding 500 characters', () => {
  const longText = 'Customer account closed. '.repeat(25); // 625 chars
  const res = validateDeactivationReason(longText);
  assert.equal(res.valid, false);
  assert.equal(res.error, 'Deactivation reason cannot exceed 500 characters.');
});

test('validateDeactivationReason accepts valid business reasons', () => {
  const validReasons = [
    'Customer is not interested',
    'Customer requested account deactivation',
    'Account closed per customer phone call',
    'Business operations suspended indefinitely',
    'Duplicate customer account merged into CUST-002',
    'Payment overdue for 90+ days without response (Ref: INV-2026-001)',
    'Moved to a different vendor per mutual agreement.',
  ];

  for (const reason of validReasons) {
    const res = validateDeactivationReason(reason);
    assert.deepEqual(res, { valid: true, error: '' }, `Expected "${reason}" to be valid`);
  }
});
