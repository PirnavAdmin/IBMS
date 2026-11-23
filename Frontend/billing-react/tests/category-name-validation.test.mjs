import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCategory,
  CATEGORY_NAME_REGEX,
  CONSECUTIVE_CATEGORY_SYMBOLS_REGEX,
} from '../src/pages/Products/services/categoryService.js';

test('CATEGORY_NAME_REGEX accepts valid category names with approved characters (&, -, /, \')', () => {
  const validNames = [
    'Electronics',
    'Software & IT Services',
    'Hardware / Networking',
    "Men's Apparel",
    'Pre-Owned Equipment',
    'Category 101',
    'Books & Stationary',
  ];

  for (const name of validNames) {
    assert.equal(CATEGORY_NAME_REGEX.test(name), true, `Expected valid: ${name}`);
  }
});

test('CATEGORY_NAME_REGEX rejects invalid special characters and symbol spam', () => {
  const invalidNames = [
    'Dgiwuffiuw e587846^&^&^%$ 1552aa',
    'Hardware@@@',
    'Test%^&*',
    'Electronics ###',
    'Services <Test>',
    'Gadgets {1}',
    'Category ~ Test',
    'Category = Test',
    'Category * Test',
    'Category $ Test',
    'Category ! Test',
  ];

  for (const name of invalidNames) {
    assert.equal(CATEGORY_NAME_REGEX.test(name), false, `Expected invalid: ${name}`);
  }
});

test('CONSECUTIVE_CATEGORY_SYMBOLS_REGEX detects consecutive approved symbols', () => {
  const consecutiveCases = [
    'Category && More',
    'Hardware--Tools',
    'Items // Stock',
    "Men''s",
    'Test &/ Mix',
  ];

  for (const name of consecutiveCases) {
    assert.equal(CONSECUTIVE_CATEGORY_SYMBOLS_REGEX.test(name), true, `Expected consecutive: ${name}`);
  }
});

test('validateCategory accepts valid category payloads', () => {
  const validCategories = [
    { name: 'Electronics', status: 'Active' },
    { name: 'Software & IT Services', status: 'Active' },
    { name: 'Hardware / Networking', status: 'Inactive' },
    { name: "Men's Apparel", status: 'Active' },
    { name: 'Pre-Owned Equipment', status: 'Active' },
  ];

  for (const values of validCategories) {
    const error = validateCategory(values, []);
    assert.equal(error, '', `Expected no error for: ${values.name}`);
  }
});

test('validateCategory rejects invalid special characters with ticket expected message', () => {
  const ticketCases = [
    'Dgiwuffiuw e587846^&^&^%$ 1552aa',
    'Hardware@@@',
    'Test%^&*',
    'Electronics ###',
  ];

  for (const name of ticketCases) {
    const error = validateCategory({ name, status: 'Active' }, []);
    assert.equal(
      error,
      "Special characters are not allowed except &, -, /, and '.",
      `Unexpected error message for "${name}": ${error}`
    );
  }
});

test('validateCategory rejects consecutive approved symbols', () => {
  const consecutiveCases = [
    'Category && More',
    'Hardware--Tools',
    'Items // Stock',
  ];

  for (const name of consecutiveCases) {
    const error = validateCategory({ name, status: 'Active' }, []);
    assert.equal(
      error,
      'Category name cannot contain consecutive special characters.',
      `Unexpected error message for "${name}": ${error}`
    );
  }
});

test('validateCategory rejects names without letters or numbers', () => {
  const invalidCases = [
    '---',
    '&',
    '//',
    "''",
  ];

  for (const name of invalidCases) {
    const error = validateCategory({ name, status: 'Active' }, []);
    assert.ok(error.length > 0, `Expected error for pure symbols: "${name}"`);
  }
});

test('validateCategory preserves duplicate detection and status validation', () => {
  const existing = [{ id: 1, name: 'Electronics' }, { id: 2, name: 'Clothing' }];
  
  assert.equal(
    validateCategory({ name: 'electronics', status: 'Active' }, existing, 2),
    'A category with this name already exists.'
  );

  assert.equal(
    validateCategory({ name: 'Electronics', status: 'Active' }, existing, 1),
    ''
  );

  assert.equal(
    validateCategory({ name: 'New Category', status: 'Pending' }, existing),
    'Select a valid category status.'
  );
});
