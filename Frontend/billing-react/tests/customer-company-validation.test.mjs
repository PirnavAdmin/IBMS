import test from 'node:test';
import assert from 'node:assert/strict';
import {
  customerValidationSchema,
  COMPANY_NAME_REGEX,
  CONSECUTIVE_COMPANY_SYMBOLS_REGEX,
} from '../src/pages/Customers/validation/customerValidation.js';

const companySchema = customerValidationSchema.pick(['companyName']);

test('COMPANY_NAME_REGEX accepts valid company names with supported characters', () => {
  const validNames = [
    'Deccan Tech Solutions',
    'pirnav.com',
    'Johnson & Johnson',
    "O'Connor & Sons (India) Pvt. Ltd.",
    'Tata Motors Ltd.',
    '3M Company',
    'A-Z Logistics, Inc.',
  ];

  for (const name of validNames) {
    assert.equal(COMPANY_NAME_REGEX.test(name), true, `Expected valid: ${name}`);
  }
});

test('COMPANY_NAME_REGEX rejects invalid special characters (*, ^, %, $, @, #, etc.)', () => {
  const invalidNames = [
    'pirnav.com 125*&^%5', // Ticket test sample
    'Acme Corp*',
    'Google % Inc',
    'Company ^ Tech',
    'Company @ Solutions',
    'Company #1',
    'Company $ Ltd',
    'Company ! Global',
    'Company ~ Systems',
    'Company = Enterprises',
    'Company <Tech>',
  ];

  for (const name of invalidNames) {
    assert.equal(COMPANY_NAME_REGEX.test(name), false, `Expected invalid: ${name}`);
  }
});

test('CONSECUTIVE_COMPANY_SYMBOLS_REGEX flags consecutive punctuation characters', () => {
  const consecutiveCases = [
    'Company && More',
    'Hardware--Tools',
    'Items..Stock',
    'Company (())',
  ];

  for (const name of consecutiveCases) {
    assert.equal(CONSECUTIVE_COMPANY_SYMBOLS_REGEX.test(name), true, `Expected consecutive: ${name}`);
  }
});

test('customerValidationSchema accepts valid company names', () => {
  const validNames = [
    'Deccan Tech Solutions',
    'pirnav.com',
    'Johnson & Johnson',
    "O'Connor & Sons (India) Pvt. Ltd.",
    'Tata Motors Ltd.',
    '3M Company',
    'A-Z Logistics, Inc.',
  ];

  for (const companyName of validNames) {
    const result = companySchema.validateSync({ companyName });
    assert.equal(result.companyName, companyName);
  }
});

test('customerValidationSchema allows empty or null companyName as optional field', () => {
  for (const companyName of ['', null, undefined]) {
    const result = companySchema.validateSync({ companyName });
    assert.ok(result.companyName == null);
  }
});

test('customerValidationSchema rejects unsupported special characters from ticket', () => {
  const ticketSamples = [
    'pirnav.com 125*&^%5',
    'Company * Tech',
    'Company ^ Corp',
    'Company % Global',
    'Company @ Solutions',
  ];

  for (const companyName of ticketSamples) {
    assert.throws(
      () => companySchema.validateSync({ companyName }),
      (err) => {
        assert.equal(err.path, 'companyName');
        assert.ok(
          err.message.includes('Company name can only contain letters, numbers, spaces, and standard characters') ||
          err.message.includes('consecutive special characters')
        );
        return true;
      }
    );
  }
});

test('customerValidationSchema rejects consecutive special characters and pure symbol company names', () => {
  const invalidCases = [
    'Company && More',
    '---',
    '...',
  ];

  for (const companyName of invalidCases) {
    assert.throws(
      () => companySchema.validateSync({ companyName }),
      (err) => {
        assert.equal(err.path, 'companyName');
        return true;
      }
    );
  }
});
