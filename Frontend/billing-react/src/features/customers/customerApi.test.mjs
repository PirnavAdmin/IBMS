import test from 'node:test';
import assert from 'node:assert/strict';
import { customerPayload, customerQuery, mapCustomer, mapCustomerPage, unwrapCustomerResponse } from './customerContract.ts';

// Synthetic contract fixtures only; these are never imported by the application.
const record = { id: 7, customerCode: 'TEST-7', name: 'Contract Test', phone: '9000000000', email: 'contract@example.invalid', taxId: '29ABCDE1234F1Z5', isActive: true };
const params = { page: 2, pageSize: 10 };

test('uses current Swagger filters and preserves server pagination', () => {
  assert.deepEqual(customerQuery({ ...params, status: 'inactive' }), { pageNumber: 2, pageSize: 10, status: 'Inactive' });
  assert.equal(customerQuery(params).status, 'All');
  assert.deepEqual(customerQuery({ ...params, search: ' Ravi ', customerType: 'business', taxId: ' TAX123 ', sortBy: 'customerCode', sortOrder: 'asc' }), { pageNumber: 2, pageSize: 10, status: 'All', search: 'Ravi', customerType: 'Business', taxId: 'TAX123', sortBy: 'code', sortOrder: 'asc' });
  assert.equal(customerQuery({ ...params, customerType: 'individual' }).customerType, 'Individual');
  assert.throws(() => customerQuery({ ...params, outstanding: 'yes' }), /not supported/);
  assert.throws(() => customerQuery({ ...params, customerType: 'organization' }), /Invalid/);
  assert.throws(() => customerQuery({ ...params, sortBy: 'outstandingBalance' }), /Invalid/);
  assert.deepEqual(customerQuery({ page: 1, pageSize: 10, search: '', taxId: '' }), { pageNumber: 1, pageSize: 10, status: 'All' });
  assert.throws(() => customerQuery({ page: -1, pageSize: 10 }), /Invalid/);
});

test('maps wrapped server pages without slicing, sorting or inventing totals', () => {
  const result = mapCustomerPage({ data: { items: [record], totalCount: 31, pageNumber: 2, pageSize: 10 } }, params);
  assert.equal(result.totalPages, 4);
  assert.equal(result.page, 2);
  assert.equal(result.items[0].id, '7');
  assert.equal(result.items[0].mobile, record.phone);
  assert.equal(result.items[0].gstin, record.taxId);
  assert.equal(result.items[0].status, 'active');
  assert.equal(result.items[0].outstandingBalance, null);
  assert.equal(result.items[0].customerType, '');
  assert.throws(() => mapCustomerPage([record], params), /totalCount/);
  assert.throws(() => mapCustomerPage({ items: [record] }, params), /totalCount/);
  assert.throws(() => mapCustomer({ name: 'Missing ID' }), /valid numeric/);
  assert.equal(mapCustomerPage({ items: [], totalCount: 0 }, params).items.length, 0);
});

test('does not invent status or financial values and reads detail envelopes', () => {
  const result = mapCustomer({ data: { profile: { id: 8, taxId: 'ABCDE1234F' }, financialSummary: { outstandingBalance: 25 } } });
  assert.equal(result.status, 'unknown');
  assert.equal(result.taxId, 'ABCDE1234F');
  assert.equal(result.outstandingBalance, 25);
  assert.equal(result.creditLimit, null);
  assert.throws(() => unwrapCustomerResponse({ success: false, message: 'Rejected' }), /Rejected/);
});

test('POST/PUT DTO maps phone and tax, excludes unsupported fields, preserves addresses and concurrency', () => {
  const existing = mapCustomer({ ...record, addresses: [{ id: 12, addressLine1: 'Existing address' }], rowVersion: '2026-09-09T00:00:00Z', city: 'Existing city' });
  const update = customerPayload({ name: 'Edited', mobile: '9111111111', gstin: '', taxId: 'ABCDE1234F', customerType: 'business', creditLimit: 20 }, existing);
  assert.equal(update.phone, '9111111111');
  assert.equal(update.taxId, 'ABCDE1234F');
  assert.deepEqual(update.addresses, existing.backend.addresses);
  assert.equal(update.rowVersion, existing.backend.rowVersion);
  assert.equal(update.customerCode, 'TEST-7');
  assert.ok(!('creditLimit' in update));
  assert.ok(!('customerType' in update));
  assert.ok(!('mobile' in update));
  const create = customerPayload({ name: 'New', mobile: '9222222222', gstin: record.taxId });
  assert.ok(!('rowVersion' in create));
  assert.ok(!('customerCode' in create));
  assert.throws(() => customerPayload({ gstin: record.taxId, taxId: 'ABCDE1234F' }), /one Tax ID/);
});
