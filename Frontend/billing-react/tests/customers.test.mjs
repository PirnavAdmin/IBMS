import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { apiClient } from '../../billing-api-client/apiClient.js';
import { authApi } from '../../billing-api-client/authApi.js';
import { customerApi } from '../../billing-api-client/customerApi.js';
import { customerUpdatePayload, validateCustomerEdit } from '../src/features/customers/api/customerEdit.js';
import { getCustomers, getCustomerById, getCustomerDetails, getCustomerAudit, updateCustomer, createCustomer, deactivateCustomer, validCustomerId } from '../src/features/customers/api/customerService.js';
let calls, response, status;
beforeEach(() => {
  calls = []; response = {}; status = 200;
  const storage = new Map([['billing_auth_token', 'Bearer Bearer test-token']]);
  globalThis.localStorage = { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) };
  apiClient.defaults.adapter = async config => {
    calls.push(config);
    if (status >= 400) throw { config, response: { status, data: response } };
    return { data: { success: true, data: response }, status, config, headers: {} };
  };
});
test('list sends server filters and a single Bearer prefix', async () => {
  response = { items: [{ id: 1, customerCode: 'ACME-1', isActive: true }], totalCount: 21, pageNumber: 2, pageSize: 10, totalPages: 3, hasNextPage: true };
  const params = { Search: 'acme', IsActive: false, PageNumber: 2, PageSize: 10, SortBy: 'name', SortOrder: 'asc' };
  const data = await getCustomers(params);
  assert.equal(data.totalCount, 21); assert.equal(data.items[0].id, 1);
  for (const [k,v] of Object.entries(params)) assert.equal(calls[0].params[k], v);
  assert.equal(calls[0].headers.Authorization, 'Bearer test-token');
});
test('details keep backend totals and empty histories, and map nested addresses', async () => {
  response = { customer: { id: 1, isActive: false, addresses: [{ addressType: 'Billing', addressLine1: 'Main', addressLine2: null }] }, addresses: [], financialSummary: { totalInvoiced: 999, totalPaid: 12, outstandingBalance: 987, currency: 'INR' }, invoices: [], payments: [] };
  const data = await getCustomerDetails('1');
  assert.equal(calls[0].url, '/api/v1/customers/1/details');
  assert.deepEqual(data.financialSummary, response.financialSummary);
  assert.deepEqual(data.invoices, []); assert.deepEqual(data.payments, []);
  assert.equal(data.customer.billingAddress.line1, 'Main'); assert.equal(data.customer.shippingAddress, null);
  assert.equal(data.customer.status, 'Inactive');
});
test('numeric IDs validate before any request', async () => {
  assert.equal(validCustomerId('1'), true);
  for (const id of ['ACME-1', '0', '-1', '1.5', '9007199254740992']) await assert.rejects(getCustomerById(id), { code: 'INVALID_ID' });
  assert.equal(calls.length, 0);
});
test('write transport uses POST, PUT, and PATCH with caller DTO unchanged', async () => {
  const dto = { name: 'Test', rowVersion: 'opaque' };
  await createCustomer(dto); await updateCustomer(1, dto); await deactivateCustomer(1);
  assert.deepEqual(calls.map(c => [c.method,c.url]), [['post','/api/v1/customers'],['put','/api/v1/customers/1'],['patch','/api/v1/customers/1/deactivate']]);
  assert.deepEqual(JSON.parse(calls[1].data), dto);
});
test('owned Create/Edit API rejects unsuccessful HTTP 200 envelopes', async () => {
  apiClient.defaults.adapter = async config => ({ data: { success: false, message: 'Validation failed', errors: ['Email already exists.'] }, status: 200, config, headers: {} });
  await assert.rejects(customerApi.createCustomer({}), /Email already exists/);
  await assert.rejects(customerApi.updateCustomer(1, {}), /Email already exists/);
});
test('null customer responses produce not-found and malformed histories fail explicitly', async () => {
  for (const missing of [null, { customer: null }]) {
    response = missing;
    await assert.rejects(getCustomerDetails(1), { code: 'NOT_FOUND' });
  }
  response = { customer: { id: 1 }, invoices: {} };
  await assert.rejects(getCustomerDetails(1), /invalid records/);
});
test('default addresses, zero transaction amounts and currency fallback preserve supplied values', async () => {
  response = { customer: { id: 1, currency: 'INR' }, billingAddress: { addressLine1: 'Main', isDefault: true }, invoices: [{ id: 2, issueDate: '2026-09-10', totalAmount: 0, amountPaid: 0, balanceDue: 0 }], payments: [{ id: 3, paymentDate: '2026-09-10', amount: 0, invoiceNumber: 'INV-2' }] };
  const data = await getCustomerDetails(1);
  assert.equal(data.customer.billingAddress.isDefault, true);
  assert.equal(data.invoices[0].amount, 0);
  assert.equal(data.invoices[0].currency, 'INR');
  assert.equal(data.payments[0].invoiceNumber, 'INV-2');
});
test('edit loads the numeric route ID and preserves PUT fields and exact rowVersion', async () => {
  response = { id: 12, name: 'Original', email: 'old@example.com', rowVersion: '2026-09-09T12:00:00.1234567Z', companyName: 'Company', taxId: 'TAX', currency: 'INR', isActive: false, notes: 'Keep', addresses: [{ id: 4 }], tenantId: 2 };
  const customer = await getCustomerById('12');
  const payload = customerUpdatePayload(customer, { ...customer, name: ' Updated ', email: 'new@example.com', phone: '', website: '' });
  await updateCustomer('12', payload);
  assert.deepEqual(calls.map(c => [c.method, c.url]), [['get', '/api/v1/customers/12'], ['put', '/api/v1/customers/12']]);
  assert.equal(calls[1].headers.Authorization, 'Bearer test-token');
  assert.deepEqual(JSON.parse(calls[1].data), { name: 'Updated', email: 'new@example.com', rowVersion: response.rowVersion, companyName: 'Company', taxId: 'TAX', currency: 'INR', isActive: false, notes: 'Keep', phone: '', website: '' });
});
test('edit validation rejects blank names, malformed email, phone and website', () => {
  assert.deepEqual(Object.keys(validateCustomerEdit({ name: ' ', email: 'bad', phone: 'abc', website: 'bad' })), ['name', 'email', 'phone', 'website']);
  assert.deepEqual(validateCustomerEdit({ name: 'Customer', email: 'user@example.com', phone: '+91 1234567890', website: 'https://example.com' }), {});
});
test('PUT surfaces backend validation and concurrency errors and rejects failed envelopes', async () => {
  status = 400; response = { message: 'Validation failed', errors: ['Invalid email format.'] };
  await assert.rejects(updateCustomer(1, {}), /Invalid email format/);
  response = { message: 'Concurrency conflict', errors: ['Please reload and try again.'] };
  await assert.rejects(updateCustomer(1, {}), /Concurrency conflict.*Please reload/);
  apiClient.defaults.adapter = async config => ({ data: { success: false, message: 'Email conflict', errors: ['Email already exists.'] }, status: 200, config, headers: {} });
  await assert.rejects(updateCustomer(1, {}), /Email already exists/);
});
test('audit keeps supplied changes and no invented user', async () => {
  response = [{ action: 'Updated', timestamp: '2026-09-09T00:00:00Z', changes: { name: 'Test' } }];
  const rows = await getCustomerAudit(1);
  assert.equal(calls[0].url, '/api/v1/customers/1/audit'); assert.equal(rows[0].user, undefined);
  assert.equal(rows[0].newValue, '{"name":"Test"}');
});
test('HTTP failures are safe and 401 clears authentication without retry', async () => {
  for (const [code,message] of [[400,'Invalid customer data'],[401,'Your session has expired'],[403,'You do not have permission'],[404,'Customer not found'],[500,'Server Error. Customer service is currently unavailable']]) {
    status = code; response = '<html>private backend stack</html>';
    await assert.rejects(getCustomerDetails(1), e => e.message.startsWith(`HTTP ${code}: ${message}`));
  }
  assert.equal(localStorage.getItem('billing_auth_token'), undefined);
  assert.equal(calls.length, 5);
});
test('ngrok offline and network errors never load fixture data', async () => {
  status = 503; response = 'ERR_NGROK_3200';
  await assert.rejects(getCustomers(), /currently unavailable/);
  apiClient.defaults.adapter = async () => { throw { code: 'ERR_NETWORK' }; };
  await assert.rejects(getCustomers(), /currently unavailable/);
});
test('login saves the real access token with normalized prefix', async () => {
  response = { accessToken: 'Bearer real-token', user: { userId: 2, tenantId: '2' } };
  await authApi.login({ email: 'test@example.com', password: 'test-only' });
  assert.equal(localStorage.getItem('billing_auth_token'), 'real-token');
  assert.equal(JSON.parse(localStorage.getItem('billing_auth_user')).userId, 2);
});

test('other HTTP status codes and ngrok codes remain visible without raw errors', async () => {
  for (const code of [405, 422, 429, 502, 503, 504]) {
    status = code; response = '<html>ERR_NGROK_3200 private stack</html>';
    await assert.rejects(getCustomers(), e => e.message.startsWith(`HTTP ${code} (ERR_NGROK_3200):`) && !e.message.includes('private stack'));
  }
  apiClient.defaults.adapter = async () => { throw { code: 'ERR_NETWORK' }; };
  await assert.rejects(getCustomers(), e => e.message.startsWith('Network Error:') && !e.message.includes('HTTP'));
});
