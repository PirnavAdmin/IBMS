import test from 'node:test';
import assert from 'node:assert/strict';
import { apiClient } from '../../billing-api-client/apiClient.js';
import { downloadInvoiceCsv } from '../src/pages/Invoices/services/invoiceExport.js';

test('Invoice CSV uses authenticated shared transport, tenant and all filters without page slicing', async () => {
  const original = { adapter: apiClient.defaults.adapter, storage: globalThis.localStorage, document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  const clicked = []; const removed = []; const revoked = [];
  let sent;
  const query = { searchTerm: 'Cook & Pan', status: 'Issued', customerId: 7, startDate: '2026-10-01T00:00:00Z', endDate: '2026-10-24T23:59:59.999Z', currency: 'INR', paymentState: 'Outstanding', sortBy: 'BalanceAmount', sortOrder: 'asc', page: 3, pageSize: 20 };
  const blob = new Blob(['InvoiceNumber,Date\n'], {type: 'text/csv'});
  apiClient.defaults.adapter = async config => { sent = config; return { data: blob, status: 200, statusText: 'OK', headers: {}, config }; };
  globalThis.localStorage = { getItem: key => ({billing_auth_token: 'Bearer test-session', billing_auth_user: JSON.stringify({tenantId: 27})}[key] ?? null) };
  globalThis.document = { body: {appendChild() {}}, createElement: () => ({click() {clicked.push({...this});}, remove() {removed.push(true);}}) };
  URL.createObjectURL = value => { assert.equal(value, blob); return 'blob:invoice-csv'; };
  URL.revokeObjectURL = value => revoked.push(value);
  try {
    await downloadInvoiceCsv(query);
    assert.equal(sent.url, '/api/v1/invoices/export');
    assert.equal(sent.responseType, 'blob');
    assert.equal(sent.headers.Authorization, 'Bearer test-session'); assert.equal(sent.headers['X-Tenant-Id'], '27');
    const {page, pageSize, ...filters} = query;
    assert.deepEqual(sent.params, {...filters, format: 'csv', 'ngrok-skip-browser-warning': 'true'});
    assert.equal(clicked.length, 1); assert.match(clicked[0].download, /^invoices_export_.*\.csv$/);
    assert.equal(removed.length, 1);
    await new Promise(resolve => setTimeout(resolve, 1100));
    assert.deepEqual(revoked, ['blob:invoice-csv']);
  } finally {
    apiClient.defaults.adapter = original.adapter;
    globalThis.localStorage = original.storage; globalThis.document = original.document;
    URL.createObjectURL = original.create; URL.revokeObjectURL = original.revoke;
  }
});

test('Invoice export rejects JSON, HTML, empty and malformed file responses; HTTP failures remain errors', async () => {
  const original = apiClient.get;
  try {
    for (const value of [{success: false}, new Blob(['{"success":false}'], {type:'application/json'}), new Blob(['login'], {type:'text/html'}), new Blob([], {type:'text/csv'})]) {
      apiClient.get = async () => value;
      await assert.rejects(downloadInvoiceCsv({}), /did not return an invoice CSV/);
    }
    for (const status of [401,403,404,409,500]) {
      apiClient.get = async () => {throw Object.assign(new Error('Export failed'), {response: {status}});};
      await assert.rejects(downloadInvoiceCsv({}), error => error.response.status === status);
    }
  } finally { apiClient.get = original; }
});
