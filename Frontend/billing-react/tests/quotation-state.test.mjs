import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import vm from 'node:vm';

// Exercise the page's async handlers with deterministic hook state and API responses.
// Child components are boundaries; rendering and styling are checked by the production build.
async function harness(loadFailure = null) {
  const slots = []; let cursor = 0; const effects = []; const calls = [];
  let record = { id: 1, customerId: '1', customer: {}, status: 'Draft', items: [], communications: [], auditLogs: [], rowVersion: 'v1' };
  let failGet = false, failAudit = false, failSave = false, saveGate;
  const api = {
    list: async () => { if (loadFailure) throw loadFailure; return [record]; },
    get: async () => { calls.push('get'); if (failGet) throw new Error('Refresh failed'); return { ...record }; },
    save: async q => { calls.push('save'); if (saveGate) await saveGate; if (failSave) throw new Error('Invalid quotation data'); record = { ...record, ...q, rowVersion: 'v2' }; return { ...record }; },
    action: async (id, action) => { calls.push(action); record = { ...record, status: { send: 'Sent', approve: 'Approved', cancel: 'Cancelled', convert: 'Converted' }[action] }; },
    communication: async () => { calls.push('communication'); return [{ type: record.status }]; },
    audit: async () => { calls.push('audit'); if (failAudit) throw new Error('Audit unavailable'); return [{ action: record.status, timestamp: '2026-09-28' }]; },
  };
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef: initial => { const i = cursor++; return slots[i] ||= { current: initial }; },
    useEffect: fn => { const i = cursor++; if (!(i in slots)) { slots[i] = true; effects.push(fn); } },
  };
  const source = await readFile(new URL('../src/pages/Quotations/QuotationManagement.jsx', import.meta.url), 'utf8');
  const compiled = await transform(source, { loader: 'jsx', format: 'cjs', jsx: 'transform' });
  const module = { exports: {} };
  vm.runInNewContext(compiled.code, { module, exports: module.exports, React: react, require: id => {
    if (id === 'react') return react;
    if (id.includes('quotationApi')) return { quotationApi: api, fetchAllPages: fn => fn(), normalizeQuotation: q => q, normalizeQuotationProduct: q => q, normalizeCommunication: q => q, unwrap: q => q };
    if (id.includes('apiClient')) return { apiClient: { get: async () => { if (loadFailure) throw loadFailure; return []; } } };
    if (id.includes('customer.contracts')) return { parseCustomerResponse: q => q };
    if (id.includes('quotationErrors')) return { quotationErrorMessage: e => e.message };
    return new Proxy({}, { get: (_, name) => name === 'newQuotation' ? () => ({}) : name });
  } });
  const render = () => { cursor = 0; return module.exports.QuotationManagement(); };
  const find = (node, type) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === type) return node.props;
    for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, type); if (found) return found; }
  };
  const props = type => find(render(), type);
  render(); effects.forEach(fn => fn());
  await new Promise(resolve => setImmediate(resolve));
  return { props, calls, api, setFailGet: v => { failGet = v; }, setFailAudit: v => { failAudit = v; }, setFailSave: v => { failSave = v; }, setSaveGate: v => { saveGate = v; } };
}

test('create and edit refresh details/history and update the list without reloading', async () => {
  const h = await harness(); h.props('QuotationList').onCreate();
  await h.props('QuotationForm').onSave({ id: 2, reference: 'Created' });
  assert.equal(h.props('QuotationDetails').quotation.id, 2);
  assert.equal(h.props('QuotationDetails').quotation.auditLogs.length, 1);
  assert.deepEqual(h.calls, ['save', 'get', 'communication', 'audit']);
  await h.props('QuotationDetails').onEdit({ id: 2 });
  assert.equal(h.props('QuotationForm').initial.rowVersion, 'v2');
  await h.props('QuotationForm').onSave({ id: 2, reference: 'Edited' });
  h.props('QuotationDetails').onBack();
  const rows = h.props('QuotationList').quotations;
  assert.equal(rows.find(q => q.id === 2).reference, 'Edited');
  assert.equal(rows.filter(q => q.id === 2).length, 1);
});

for (const action of ['send', 'approve', 'cancel', 'convert']) {
  test(`${action} refreshes status, communication, audit and list`, async () => {
    const h = await harness();
    if (['approve', 'convert'].includes(action)) await h.api.action(1, 'send');
    if (action === 'convert') await h.api.action(1, 'approve');
    await h.props('QuotationList').onView({ id: 1 });
    const detail = h.props('QuotationDetails');
    await detail.onAction(action, detail.quotation);
    assert.equal(h.props('QuotationDetails').quotation.auditLogs.length, 1);
    await h.props('QuotationDialog').onConfirm('Customer requested cancellation');
    const q = h.props('QuotationDetails').quotation;
    assert.equal(q.status, { send: 'Sent', approve: 'Approved', cancel: 'Cancelled', convert: 'Converted' }[action]);
    assert.equal(q.auditLogs[0].action, q.status);
    assert.equal(q.communications[0].type, q.status);
    h.props('QuotationDetails').onBack();
    assert.equal(h.props('QuotationList').quotations[0].status, q.status);
  });
}

test('successful save survives refresh failure and retry loads history', async () => {
  const h = await harness(); h.props('QuotationList').onCreate(); h.setFailGet(true);
  await h.props('QuotationForm').onSave({ id: 2 });
  assert.equal(h.props('QuotationDetails').quotation.id, 2);
  assert.match(h.props('Alert').children.join(''), /Quotation saved, but details/);
  h.setFailGet(false); await h.props('Alert').action.props.onClick();
  assert.equal(h.props('QuotationDetails').quotation.auditLogs.length, 1);
});

test('history failure reports an error and can be retried', async () => {
  const h = await harness(); h.setFailAudit(true);
  await h.props('QuotationList').onView({ id: 1 });
  assert.match(h.props('Alert').children.join(''), /History could not be loaded/);
  h.setFailAudit(false); await h.props('Alert').action.props.onClick();
  assert.equal(h.props('QuotationDetails').quotation.auditLogs.length, 1);
});

test('failed save keeps form open; concurrent saves only submit once', async () => {
  const h = await harness(); h.props('QuotationList').onCreate(); h.setFailSave(true);
  await h.props('QuotationForm').onSave({ reference: 'Keep input' });
  assert.ok(h.props('QuotationForm'));
  h.setFailSave(false); let release; h.setSaveGate(new Promise(resolve => { release = resolve; }));
  const save = h.props('QuotationForm').onSave;
  const pending = save({ id: 2 }); await save({ id: 2 }); release(); await pending;
  assert.equal(h.calls.filter(c => c === 'save').length, 2);
});

test('quotation errors share customer wording and reject unsafe server detail', async () => {
  const source = await readFile(new URL('../src/pages/Quotations/utils/quotationErrors.js', import.meta.url), 'utf8');
  const contracts = await import('../../billing-contracts/customer.contracts.js');
  const compiled = await transform(source, { format: 'cjs' });
  const module = { exports: {} };
  vm.runInNewContext(compiled.code, { module, exports: module.exports, require: () => contracts });
  const message = module.exports.quotationErrorMessage;
  assert.match(message({ response: { status: 409 } }), /This quotation has changed/);
  assert.match(message({ code: 'ERR_NETWORK' }), /^Network Error$/);
  assert.match(message({ response: { status: 400, data: { errors: { customer: ['Select a customer.'] } } } }), /Select a customer/);
  assert.doesNotMatch(message({ response: { status: 500, data: { message: 'SQL exception secret' } } }), /secret/);
  assert.doesNotMatch(message({ response: { status: 400, data: { message: '<html>secret</html>' } } }), /secret/);
});

test('completed status change falls back to a refreshed list when detail refresh fails', async () => {
  const h = await harness();
  await h.props('QuotationList').onAction('send', { id: 1 });
  h.setFailGet(true);
  await h.props('QuotationDialog').onConfirm();
  assert.equal(h.props('QuotationList').quotations[0].status, 'Sent');
  assert.match(h.props('Alert').children.join(''), /Action completed, but details/);
  assert.equal(h.calls.filter(c => c === 'send').length, 1);
});

test('cancelling edit reloads details and audit history', async () => {
  const h = await harness();
  await h.props('QuotationList').onEdit({ id: 1 });
  await h.props('QuotationForm').onCancel();
  assert.equal(h.props('QuotationDetails').quotation.auditLogs.length, 1);
});


test('simultaneous loading failures show one message in the customer-style error state', async () => {
  const h = await harness(new Error('Network Error'));
  const list = h.props('QuotationList');
  assert.equal(list.loadFailed, true);
  assert.equal(list.error, 'Network Error');
  assert.equal(typeof list.onRetry, 'function');
});
