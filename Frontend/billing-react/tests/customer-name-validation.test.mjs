import test from 'node:test';
import assert from 'node:assert/strict';
import { customerValidationSchema } from '../src/pages/Customers/validation/customerValidation.js';
import { validateCustomerEdit } from '../src/pages/Customers/api/customerEdit.js';

const nameSchema = customerValidationSchema.pick(['name']);
const validate = (name) => nameSchema.validateSync({ name });

test('Customer Name rejects special characters like period (.) and comma (,)', () => {
  const invalidNames = [
    'varshitha.,',
    'John,',
    'David.',
    'varsha,. ............',
    'varshitha., TM',
    'J. Doe',
    'Doe, John',
    'Alice & Bob',
    'User#Name',
    'Test@Client',
    'Customer_Name',
  ];

  for (const name of invalidNames) {
    assert.throws(
      () => validate(name),
      /Customer Name should not contain special characters/,
      `Name "${name}" should be rejected with "Customer Name should not contain special characters"`
    );

    const editErrors = validateCustomerEdit({ name });
    assert.equal(
      editErrors.name,
      'Customer Name should not contain special characters.',
      `CustomerEdit should also reject "${name}"`
    );
  }
});

test('Customer Name accepts valid alphabetic names with standard spaces, hyphens, and apostrophes', () => {
  const validNames = [
    'Venkat Rao',
    'John Doe',
    'David',
    'Varshitha',
    "O'Connor",
    'Mary-Jane',
  ];

  for (const name of validNames) {
    assert.equal(validate(name).name, name.trim());
    const editErrors = validateCustomerEdit({ name });
    assert.equal(editErrors.name, undefined);
  }
});

test('Customer Name rejects numbers, empty strings, and excessive repetition', () => {
  assert.throws(() => validate(''), /Customer name is required/);
  assert.throws(() => validate('A'), /Customer name must be at least 2 characters/);
  assert.throws(() => validate('John123'), /Customer name must not contain numbers/);
});
