import test from 'node:test';
import assert from 'node:assert/strict';
import { customerValidationSchema, EMAIL_REGEX } from '../src/pages/Customers/validation/customerValidation.js';

const emailSchema = customerValidationSchema.pick(['email']);
const validateEmail = (email) => emailSchema.validateSync({ email });

test('EMAIL_REGEX correctly rejects invalid email format with unsupported special characters', () => {
  const invalidEmails = [
    '1565$^$%@121gmail.com',
    'user$name@example.com',
    'user%tag@example.com',
    'user^test@example.com',
    'user#test@example.com',
    'user!test@example.com',
    'user*test@example.com',
    'user?test@example.com',
    'user`test@example.com',
    '{user}@example.com',
    'user|pipe@example.com',
    'user~tilde@example.com',
    'user..doubledot@example.com',
    '.leadingdot@example.com',
    'trailingdot.@example.com',
    'plainaddress',
    '@missinguser.com',
    'missingdomain@.com',
    'user@domain',
    'user@domain..com',
  ];

  for (const email of invalidEmails) {
    assert.equal(EMAIL_REGEX.test(email), false, `Expected ${email} to fail EMAIL_REGEX`);
  }
});

test('Customer validation rejects 1565$^$%@121gmail.com with standard error message', () => {
  assert.throws(
    () => validateEmail('1565$^$%@121gmail.com'),
    (err) => {
      assert.match(err.message, /Please enter a valid email address/);
      return true;
    }
  );
});

test('Customer validation rejects empty or whitespace email with required message', () => {
  assert.throws(
    () => validateEmail(''),
    (err) => {
      assert.match(err.message, /Email address is required/);
      return true;
    }
  );
  assert.throws(
    () => validateEmail('   '),
    (err) => {
      assert.match(err.message, /Email address is required/);
      return true;
    }
  );
});

test('Customer validation accepts valid emails and preserves trimmed value', () => {
  const validEmails = [
    'venkat.rao@deccantech.in',
    'admin@example.com',
    'first.last+tag@company.co.in',
    'john.doe@domain.org',
    'user_name@service.net',
    'support@sub.domain.com',
  ];

  for (const email of validEmails) {
    const result = validateEmail(`  ${email}  `);
    assert.equal(result.email, email, `Expected ${email} to be valid and trimmed`);
  }
});
