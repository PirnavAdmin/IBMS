import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateInvoice,
  blankInvoice,
  productToItem,
} from '../src/pages/Invoices/validation/invoiceValidation.js';
import { validateQuotation } from '../src/pages/Quotations/utils/quotationValidation.js';

test('productToItem auto-populates HSN/SAC from product master', () => {
  const product = {
    id: 10,
    name: 'Dell Laptop',
    description: 'laptop dell125',
    price: 5500,
    unit: 'Set',
    hsnSac: '84713010',
    taxCategory: 'GST 5%',
  };

  const item = productToItem(product, [], 'INR');
  assert.equal(item.hsnsac, '84713010');
  assert.equal(item.unit, 'Set');
  assert.equal(item.unitPrice, '5500');
});

test('validateInvoice accepts valid numeric HSN/SAC codes (4 to 8 digits)', () => {
  const baseForm = blankInvoice('INR');
  baseForm.customerId = '1';
  baseForm.items = [
    {
      productId: '10',
      description: 'laptop dell125',
      unitPrice: '5500',
      quantity: '2',
      taxRate: '5',
      discountRate: '20',
      hsnsac: '84713010',
    },
  ];

  const errors = validateInvoice(baseForm);
  assert.equal(errors['items.0.hsnsac'], undefined);
});

test('validateInvoice rejects invalid/arbitrary HSN/SAC codes from ticket sample', () => {
  const baseForm = blankInvoice('INR');
  baseForm.customerId = '1';

  const invalidCodes = [
    '987456fw',      // Ticket sample from screenshot
    '987456fwef',    // Ticket sample from screenshot
    '8471@#',
    '12',            // Less than 4 digits
    '123456789',     // More than 8 digits
    'ABCDEF',
  ];

  for (const hsnsac of invalidCodes) {
    baseForm.items = [
      {
        productId: '10',
        description: 'laptop dell125',
        unitPrice: '5500',
        quantity: '2',
        taxRate: '5',
        discountRate: '0',
        hsnsac,
      },
    ];

    const errors = validateInvoice(baseForm);
    assert.equal(
      errors['items.0.hsnsac'],
      'HSN/SAC must be 4 to 8 digits.',
      `Expected error for invalid HSN/SAC: ${hsnsac}`
    );
  }
});

test('validateQuotation validates HSN/SAC code format when provided', () => {
  const baseQuote = {
    customerId: '1',
    quotationDate: '2026-11-23',
    validUntil: '2026-12-23',
    items: [
      {
        productId: '10',
        quantity: 2,
        unitPrice: 5500,
        taxRate: 5,
        hsnSac: '84713010',
      },
    ],
  };

  const validErrors = validateQuotation(baseQuote, [{ id: 1, name: 'Customer' }]);
  assert.equal(validErrors['item-0'], undefined);

  // Invalid HSN/SAC from ticket
  baseQuote.items[0].hsnSac = '987456fw';
  const invalidErrors = validateQuotation(baseQuote, [{ id: 1, name: 'Customer' }]);
  assert.equal(invalidErrors['item-0'], 'HSN/SAC must be 4 to 8 digits.');
});
