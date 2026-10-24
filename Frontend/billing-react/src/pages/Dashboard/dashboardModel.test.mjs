import assert from 'node:assert/strict';
import { test } from 'node:test';
import { billingInsights, collectPages, defaultDashboardFilters, selectDashboardCurrency } from './dashboardModel.js';
const invoice = (id, patch = {}) => ({ id, currency: 'INR', status: 'Issued', totalAmount: 100, balanceAmount: 60, invoiceDate: '2026-10-02', dueDate: '2026-10-01', ...patch });
const payment = (id, patch = {}) => ({ id, currency: 'INR', status: 'Completed', amount: 40, paymentDate: '2026-10-03', ...patch });
const now = new Date('2026-10-06T12:00:00Z');
test('financial totals exclude drafts, voids, cancellations and other currencies', () => {
  const data = billingInsights([invoice(1), invoice(2, { status: 'Draft' }), invoice(3, { status: 'Cancelled' }), invoice(4, { status: 'Voided' }), invoice(5, { currency: 'USD' })], [payment(1), payment(2, { status: 'Reversed' }), payment(3, { status: 'Failed' }), payment(4, { status: 'Pending' }), payment(5, { currency: 'USD' })], 'INR', now);
  assert.deepEqual(data.summary.map(row => row.value), [100, 40, 60, 60, 1]);
});
test('aging bucket boundaries and unknown due dates conserve balances', () => {
  const dueDates = ['2026-10-06', '2026-10-07', '2026-10-05', '2026-09-06', '2026-09-05', '2026-08-07', '2026-08-06', '2026-07-08', '2026-07-07', null];
  const data = billingInsights(dueDates.map((dueDate, id) => invoice(id, { dueDate })), [], 'INR', now);
  assert.deepEqual(data.aging.map(row => row.value), [120, 120, 120, 120, 60, 60]);
  assert.equal(data.aging.reduce((sum, row) => sum + row.value, 0), data.summary[2].value);
});
test('trend groups invoice and completed payment dates independently', () => {
  const data = billingInsights([invoice(1)], [payment(1, { paymentDate: '2026-09-30' })], 'INR', now);
  assert.deepEqual(data.revenue, [{ label: '2026-09', invoiced: 0, collected: 40 }, { label: '2026-10', invoiced: 100, collected: 0 }]);
});
test('empty ledgers return zero totals without fabricated series', () => {
  const data = billingInsights([], [], 'INR', now);
  assert.deepEqual(data.summary.map(row => row.value), [0, 0, 0, 0, 0]);
  assert.deepEqual(data.revenue, []);
});
test('missing amounts fail visibly', () => assert.throws(() => billingInsights([invoice(1, { totalAmount: undefined })], [], 'INR', now), /Missing totalAmount/));
test('pagination retrieves all records before returning totals', async () => {
  const calls = [];
  const rows = await collectPages(async page => { calls.push(page); return { items: page === 1 ? [{ id: 1 }, { id: 2 }] : [{ id: 3 }], totalCount: 3, pageSize: 2 }; });
  assert.equal(rows.length, 3); assert.deepEqual(calls, [1, 2]);
});
test('large ranges reject instead of reporting partial aggregates', async () => assert.rejects(collectPages(async () => ({ items: [], totalCount: 2001, pageSize: 100 })), /Narrow the dates/));
test('pagination changes reject instead of combining inconsistent pages', async () => assert.rejects(collectPages(async page => ({ items: [{ id: page }], totalCount: page === 1 ? 2 : 3, pageSize: 1 })), /changed while loading/));
test('duplicate records and missing pages reject', async () => {
  await assert.rejects(collectPages(async () => ({ items: [{ id: 1 }, { id: 1 }], totalCount: 2, pageSize: 2 })), /Incomplete/);
  await assert.rejects(collectPages(async () => ({ items: [], totalCount: 1, pageSize: 1 })), /Incomplete/);
});
test('service failure is propagated', async () => assert.rejects(collectPages(async () => { throw new Error('Unavailable'); }), /Unavailable/));
test('default range includes historical billing records without date bounds', () => {
  assert.deepEqual(defaultDashboardFilters(), { start: '', end: '' });
});

test('historical INR activity remains visible alongside an AOA draft', () => {
  const currencies = ['AOA', 'INR'];
  const currency = selectDashboardCurrency(currencies, '');
  assert.equal(currency, 'INR');
  const data = billingInsights([
    invoice(1, { invoiceDate: '2026-08-15' }),
    invoice(2, { invoiceDate: '2026-09-15' }),
    invoice(3, { currency: 'AOA', status: 'Draft' }),
  ], [payment(1, { paymentDate: '2026-09-20' })], currency, now);
  assert.deepEqual(data.summary.map(row => row.value), [200, 40, 120, 120, 0]);
  assert.deepEqual(data.revenue.map(row => row.label), ['2026-08', '2026-09']);
  assert.equal(selectDashboardCurrency(currencies, 'AOA'), 'INR');
  assert.equal(selectDashboardCurrency(['AOA'], 'AOA'), undefined);
  assert.equal(selectDashboardCurrency(['USD'], 'INR'), 'USD');
  assert.equal(selectDashboardCurrency([], ''), undefined);
});

test('missing balances, currency and invalid dates reject rather than disappear', () => {
  for (const patch of [{ balanceAmount: undefined }, { currency: '' }, { invoiceDate: 'invalid' }, { dueDate: 'invalid' }]) assert.throws(() => billingInsights([invoice(1, patch)], [], 'INR', now));
});

test('decimal money reconciles summary, aging and monthly totals to cents', () => {
  const data = billingInsights([invoice(1, { totalAmount: 0.1, balanceAmount: 0.1 }), invoice(2, { totalAmount: 0.2, balanceAmount: 0.2 })], [payment(1, { amount: 0.1 }), payment(2, { amount: 0.2 })], 'INR', now);
  assert.deepEqual(data.summary.slice(0, 4).map(row => row.value), [0.3, 0.3, 0.3, 0.3]);
  assert.equal(data.aging.reduce((sum, row) => sum + row.value, 0), 0.3);
  assert.deepEqual(data.revenue, [{ label: '2026-10', invoiced: 0.3, collected: 0.3 }]);
});
