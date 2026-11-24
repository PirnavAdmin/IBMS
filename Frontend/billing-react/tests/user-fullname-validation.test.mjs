import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFullName } from '../src/utils/authValidation.js';

test('validateFullName rejects empty or whitespace-only names', () => {
  assert.equal(validateFullName(''), 'Enter a name with at least 2 characters.');
  assert.equal(validateFullName('   '), 'Enter a name with at least 2 characters.');
  assert.equal(validateFullName(null), 'Enter a name with at least 2 characters.');
  assert.equal(validateFullName(undefined), 'Enter a name with at least 2 characters.');
});

test('validateFullName rejects names shorter than 2 characters', () => {
  assert.equal(validateFullName('A'), 'Enter a name with at least 2 characters.');
  assert.equal(validateFullName(' V '), 'Enter a name with at least 2 characters.');
});

test('validateFullName rejects ticket sample containing numbers and special characters', () => {
  // Ticket reproduction input:
  // Varshitha T adayuqsdyga^%^&%^22323%^%M
  const reproSample = 'Varshitha T adayuqsdyga^%^&%^22323%^%M';
  const error = validateFullName(reproSample);
  assert.equal(error, 'Full Name should not contain numbers or special characters.');
});

test('validateFullName rejects numeric values in names', () => {
  assert.equal(validateFullName('Varshitha 22323'), 'Full Name must not contain numbers.');
  assert.equal(validateFullName('John123'), 'Full Name must not contain numbers.');
  assert.equal(validateFullName('12345'), 'Full Name must not contain numbers.');
});

test('validateFullName rejects special characters (^, %, &, @, $, *, #, etc.)', () => {
  assert.equal(validateFullName('Varshitha ^%&'), 'Full Name should not contain special characters.');
  assert.equal(validateFullName('John@Doe'), 'Full Name should not contain special characters.');
  assert.equal(validateFullName('Alice & Bob'), 'Full Name should not contain special characters.');
  assert.equal(validateFullName('User#Name'), 'Full Name should not contain special characters.');
  assert.equal(validateFullName('Varshitha*M'), 'Full Name should not contain special characters.');
  assert.equal(validateFullName('Alex$Kumar'), 'Full Name should not contain special characters.');
  assert.equal(validateFullName('.Varshitha'), 'Full Name should not contain special characters.');
});

test('validateFullName rejects names exceeding 100 characters', () => {
  const longName = 'Alexander '.repeat(12); // 120 chars
  assert.equal(validateFullName(longName), 'Full Name cannot exceed 100 characters.');
});

test('validateFullName rejects excessive character repetition', () => {
  assert.equal(validateFullName('Varrrrrrrrshitha'), 'Full Name contains invalid repeated characters.');
});

test('validateFullName accepts valid human names with letters, spaces, hyphens and apostrophes', () => {
  const validNames = [
    'Alex Kumar',
    'Varshitha T',
    'Varshitha Reddy',
    "O'Connor",
    'Mary-Jane',
    'Jean-Luc Picard',
    'Renée Dupont',
    'Dr. Rao', // Note: period followed by space
  ];

  for (const name of validNames) {
    assert.equal(validateFullName(name), '', `Expected "${name}" to be valid`);
  }
});
