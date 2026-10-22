import test from 'node:test';
import assert from 'node:assert/strict';
import { customerValidationSchema } from '../src/pages/Customers/validation/customerValidation.js';

const phoneSchema = customerValidationSchema.pick(['phoneCountryCode', 'phone']);
const validate = (phone, phoneCountryCode = '+91') => phoneSchema.validateSync({ phone, phoneCountryCode });

test('India rejects each starting digit from 0 through 5 with a specific message', () => {
  for (const prefix of ['0', '1', '2', '3', '4', '5']) {
    assert.throws(() => validate(prefix + '234556666'), /Indian mobile numbers must start with 6, 7, 8 or 9/);
  }
});

test('India accepts ten digits starting with 6, 7, 8 or 9 and preserves the number', () => {
  for (const prefix of ['6', '7', '8', '9']) {
    const phone = prefix + '234556666';
    assert.deepEqual(validate(phone), { phone, phoneCountryCode: '+91' });
  }
});

test('India retains required, digits-only and exact length validation', () => {
  assert.throws(() => validate(''), /Mobile number is required/);
  assert.throws(() => validate('912345678'), /exactly 10 digits/);
  assert.throws(() => validate('91234567890'), /exactly 10 digits/);
  assert.throws(() => validate('9abcdefghi'), /digits only/);
});

test('Other country rules are unchanged and do not inherit the Indian prefix restriction', () => {
  assert.equal(validate('1234556666', '+1').phone, '1234556666');
  assert.equal(validate('212345678', '+971').phone, '212345678');
  assert.equal(validate('21234567', '+65').phone, '21234567');
  assert.throws(() => validate('21234567', '+971'), /requires 9 digits/);
  assert.equal(validate('1234556666', '').phone, '1234556666');
});
