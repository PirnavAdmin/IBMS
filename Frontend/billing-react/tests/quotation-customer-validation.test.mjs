import test from 'node:test';
import assert from 'node:assert/strict';
import { validateQuotation } from '../src/pages/Quotations/utils/quotationValidation.js';

const mockCustomers = [
  { id: '13', name: 'Varshitha T M', code: 'CUST-013', email: 'varshithatm11@gmail.com', mobile: '+91 8216121321' },
  { id: '14', name: 'Acme Corp', code: 'CUST-014', email: 'acme@example.com', mobile: '+91 9876543210' },
];

const createValidForm = (overrides = {}) => ({
  customerId: '13',
  quotationDate: '2026-11-20',
  validUntil: '2026-12-20',
  reference: 'REF-001',
  items: [
    {
      productId: '101',
      productName: 'Widget',
      quantity: 2,
      unitPrice: 100,
      discountType: 'percentage',
      discountRate: 0,
      taxType: 'GST',
      taxRate: 5,
    },
  ],
  invoiceDiscount: { type: 'percentage', value: 0 },
  charges: [],
  notes: '',
  termsAndConditions: '',
  ...overrides,
});

test('Valid quotation with registered customer passes validation', () => {
  const form = createValidForm({ customerId: '13' });
  const errors = validateQuotation(form, mockCustomers);
  assert.equal(errors.customerId, undefined);
  assert.equal(Object.keys(errors).length, 0);
});

test('Empty customerId fails validation with customer error', () => {
  const form = createValidForm({ customerId: '' });
  const errors = validateQuotation(form, mockCustomers);
  assert.ok(errors.customerId, 'Should have customerId error');
  assert.match(errors.customerId, /Select a customer/);
});

test('Non-existent / invalid customerId fails validation', () => {
  const form = createValidForm({ customerId: '99999' });
  const errors = validateQuotation(form, mockCustomers);
  assert.ok(errors.customerId, 'Should have customerId error for non-existent customer');
  assert.equal(errors.customerId, 'Select a valid customer from the search results.');
});

test('Customer field deselects and blocks saving when manual entry does not match any customer', () => {
  // Simulating when user types "Varshitha T M · CUST-0131"
  // SearchablePicker calls onChange('') when manual entry does not match
  const formWithClearedCustomer = createValidForm({ customerId: '' });
  const errors = validateQuotation(formWithClearedCustomer, mockCustomers);
  assert.ok(errors.customerId, 'Draft cannot be saved without a valid customer');
});
