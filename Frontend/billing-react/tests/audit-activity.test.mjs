import test from 'node:test';
import assert from 'node:assert/strict';
import { apiClient } from '../../billing-api-client/apiClient.js';
import { getAuditActivity, getAuditFilterOptions } from '../src/pages/AuditActivity/auditApi.js';
import { auditQuery, readAuditPage, auditDate, auditSnapshot, emptyAuditFilters, searchAuditPage } from '../src/pages/AuditActivity/auditModel.js';

const record = { id: 7, action: 'PDF Generated', userName: 'Admin', entityName: 'InvoiceDocument', entityId: '52', timestamp: '2026-10-09T04:52:23.454293Z', changes: 'Saved invoice PDF', oldValues: null, newValues: '{"Status":"Generated"}' };
const response = { success: true, data: { items: [record], totalCount: 41, pageNumber: 2, pageSize: 20, totalPages: 3 } };

test('filter options use the authenticated endpoint and preserve backend values', async () => {
  const original = apiClient.get;
  const signal = new AbortController().signal;
  const data = { entityNames: ['Quotation', 'Invoice', 'Invoice'], actions: ['Cancelled'], userNames: ['Acme Admin'] };
  try {
    apiClient.get = async (url, config) => {
      assert.equal(url, '/api/Audit/filter-options');
      assert.deepEqual(config, { signal });
      return { success: true, data };
    };
    const options = await getAuditFilterOptions(signal);
    assert.deepEqual(options.entityNames, ['Quotation', 'Invoice']);
    assert.deepEqual(options.actions, data.actions);
    assert.deepEqual(options.userNames, data.userNames);
    apiClient.get = async () => ({ success: true, data: { entityNames: [], actions: [], userNames: [] } });
    const empty = await getAuditFilterOptions();
    assert.deepEqual([empty.entityNames, empty.actions, empty.userNames], [[], [], []]);
    apiClient.get = async () => ({ success: true, data: { entityNames: [] } });
    await assert.rejects(getAuditFilterOptions(), /invalid filter options/);
    apiClient.get = async () => ({ success: false, message: 'Options failed' });
    await assert.rejects(getAuditFilterOptions(), /Options failed/);
    const forbidden = Object.assign(new Error('Access denied'), { response: { status: 403 } });
    apiClient.get = async () => { throw forbidden; };
    await assert.rejects(getAuditFilterOptions(), error => error === forbidden);
  } finally { apiClient.get = original; }
});

test('audit filters use only supported exact-match parameters and complete IST date boundaries', () => {
  const query = auditQuery({ ...emptyAuditFilters, entityName: ' Invoice ', userName: ' Admin ', action: ' UPDATE ', startDate: '2026-10-09', endDate: '2026-10-09' }, 2, 20);
  assert.deepEqual(query, { Page: 2, PageSize: 20, EntityName: 'Invoice', UserName: 'Admin', Action: 'UPDATE', StartDate: '2026-10-08T18:30:00.000Z', EndDate: '2026-10-09T18:29:59.9999999Z' });
  assert.deepEqual(auditQuery(emptyAuditFilters, 1, 10), { Page: 1, PageSize: 10 });
  assert.throws(() => auditQuery({ ...emptyAuditFilters, startDate: '2026-10-10', endDate: '2026-10-09' }, 1, 20), /end date/);
});

test('audit page preserves real response data and supports PascalCase contracts', () => {
  assert.deepEqual(readAuditPage(response), { ...response.data });
  const pascal = { Success: true, Data: { Items: [{ Id: 9, Action: 'UPDATE', EntityName: 'Customer' }], TotalCount: 1, PageNumber: 1, PageSize: 20, TotalPages: 1 } };
  assert.equal(readAuditPage(pascal).items[0].entityName, 'Customer');
  assert.equal(readAuditPage(pascal).items[0].userName, null);
  assert.deepEqual(readAuditPage({ success: true, data: { items: [], totalCount: 0, pageNumber: 1, pageSize: 20, totalPages: 0 } }).items, []);
  assert.throws(() => readAuditPage({ success: false, message: 'Forbidden' }), /Forbidden/);
  assert.throws(() => readAuditPage({ success: true, data: null }), /invalid page/);
  assert.throws(() => readAuditPage({ success: true, data: { ...response.data, totalCount: '41' } }), /invalid page/);
});

test('timestamps display UTC and UTC-kindless backend values consistently in IST', () => {
  const expected = auditDate(record.timestamp);
  assert.match(expected, /09 Oct 2026/);
  assert.match(expected, /10:22:23/);
  assert.match(expected, /IST/);
  assert.equal(auditDate('2026-10-09T04:52:23.454293'), expected);
  assert.equal(auditDate('2026-10-09T10:22:23.454293+05:30'), expected);
  assert.equal(auditDate(null), '—');
  assert.equal(auditDate('invalid'), 'Unavailable');
});

test('details preserve actual field values while redacting nested credential fields', () => {
  const formatted = auditSnapshot('{"Name":"Customer","PasswordHash":"hidden","nested":{"RefreshToken":"private","Status":"Active"}}');
  assert.match(formatted, /Customer/);
  assert.match(formatted, /Active/);
  assert.doesNotMatch(formatted, /hidden|private/);
  assert.match(formatted, /Redacted/);
  assert.equal(auditSnapshot(null), 'Not recorded');
  assert.match(auditSnapshot('not JSON'), /not available/);
});

test('header search filters only supplied page rows without changing server totals', () => {
  const data = readAuditPage(response);
  assert.equal(searchAuditPage(data.items, 'pdf').length, 1);
  assert.equal(searchAuditPage(data.items, 'customer').length, 0);
  assert.equal(data.totalCount, 41);
  assert.deepEqual(searchAuditPage(data.items, ''), data.items);
});

test('API integration uses the authenticated shared client, real endpoint, pagination, and cancellation', async () => {
  const original = apiClient.get;
  const controller = new AbortController();
  try {
    apiClient.get = async (url, config) => {
      assert.equal(url, '/api/Audit');
      assert.deepEqual(config.params, { Page: 2, PageSize: 20, EntityName: 'InvoiceDocument' });
      assert.equal(config.signal, controller.signal);
      assert.equal('TenantId' in config.params, false);
      return response;
    };
    assert.equal((await getAuditActivity({ ...emptyAuditFilters, entityName: 'InvoiceDocument' }, 2, 20, controller.signal)).totalCount, 41);
    const forbidden = Object.assign(new Error('Access denied'), { response: { status: 403 } });
    apiClient.get = async () => { throw forbidden; };
    await assert.rejects(getAuditActivity(emptyAuditFilters, 1, 20), error => error === forbidden);
  } finally { apiClient.get = original; }
});

test('getAuditFilterOptions calls /api/Audit/filter-options and extracts distinct filter arrays', async () => {
  const original = apiClient.get;
  const controller = new AbortController();
  const mockResponse = {
    success: true,
    data: {
      entityNames: ['Customer', 'Invoice', 'Quotation'],
      actions: ['CREATE', 'ISSUE', 'UPDATE'],
      userNames: ['Alice', 'Bob'],
      modules: ['Customer', 'Invoice', 'Quotation'],
      eventNames: ['CREATE', 'ISSUE', 'UPDATE'],
      performedBy: ['Alice', 'Bob']
    }
  };
  try {
    apiClient.get = async (url, config) => {
      assert.equal(url, '/api/Audit/filter-options');
      assert.equal(config.signal, controller.signal);
      return mockResponse;
    };
    const options = await getAuditFilterOptions(controller.signal);
    assert.deepEqual(options.entityNames, ['Customer', 'Invoice', 'Quotation']);
    assert.deepEqual(options.actions, ['CREATE', 'ISSUE', 'UPDATE']);
    assert.deepEqual(options.userNames, ['Alice', 'Bob']);
    assert.deepEqual(options.modules, ['Customer', 'Invoice', 'Quotation']);
    assert.deepEqual(options.eventNames, ['CREATE', 'ISSUE', 'UPDATE']);
    assert.deepEqual(options.performedBy, ['Alice', 'Bob']);
  } finally { apiClient.get = original; }
});

