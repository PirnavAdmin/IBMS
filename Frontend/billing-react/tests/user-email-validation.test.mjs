import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateUserEmail } from '../src/utils/authValidation.js';

test('validateUserEmail rejects invalid special characters in local part from ticket sample', () => {
  // Ticket reproduction sample: varshitha$%^$^^&145tm@gmail.com
  const result = validateUserEmail('varshitha$%^$^^&145tm@gmail.com');
  assert.equal(result, 'Special characters are not allowed in the email address format.');
});

test('validateUserEmail rejects unsupported special characters in email address format', () => {
  const invalidEmails = [
    'user$name@example.com',
    'user%tag@example.com',
    'user^test@example.com',
    'user&test@example.com',
    'user*test@example.com',
    'user#test@example.com',
    'user!test@example.com',
    'user~test@example.com',
    '{user}@example.com',
    'user|pipe@example.com',
    'user<tag>@example.com',
    'varshitha?test@gmail.com',
    'user..doubledot@example.com',
    '.leadingdot@example.com',
    'trailingdot.@example.com',
  ];

  for (const email of invalidEmails) {
    const error = validateUserEmail(email);
    assert.equal(error, 'Special characters are not allowed in the email address format.', `Expected ${email} to be rejected for special characters`);
  }
});

test('validateUserEmail handles required and generic malformed email addresses', () => {
  assert.equal(validateUserEmail(''), 'Enter a valid email address, such as name@example.com.');
  assert.equal(validateUserEmail('   '), 'Enter a valid email address, such as name@example.com.');
  assert.equal(validateUserEmail(null), 'Enter a valid email address, such as name@example.com.');
  assert.equal(validateUserEmail('plainaddress'), 'Enter a valid email address, such as name@example.com.');
  assert.equal(validateUserEmail('@nodomain.com'), 'Enter a valid email address, such as name@example.com.');
  assert.equal(validateUserEmail('nouser@'), 'Enter a valid email address, such as name@example.com.');
  assert.equal(validateUserEmail('user@domain'), 'Enter a valid email address, such as name@example.com.');
});

test('validateUserEmail accepts standard business and personal emails', () => {
  assert.equal(validateUserEmail('alex@company.com'), '');
  assert.equal(validateUserEmail('manasa.k@sub.domain.org'), '');
  assert.equal(validateUserEmail('user+tag_01-test@gmail.com'), '');
  assert.equal(validateUserEmail('support.desk_2@service.co.in'), '');
});

test('UserRoleAdministration.jsx wires validateUserEmail on blur, change, and submit', () => {
  const file = fs.readFileSync(new URL('../src/pages/UserRoleAdministration/UserRoleAdministration.jsx', import.meta.url), 'utf8');

  assert.ok(file.includes('validateUserEmail'), 'Must import or reference validateUserEmail');
  assert.ok(file.includes('validateUserEmail(email)'), 'Must validate on email change');
  assert.ok(file.includes('validateUserEmail(values.email)'), 'Must validate on blur and in validate()');
});
