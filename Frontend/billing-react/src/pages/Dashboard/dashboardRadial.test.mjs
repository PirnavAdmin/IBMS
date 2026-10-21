import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agingRadial, revenueAmounts, revenueCohort } from './dashboardRadial.js';
test('revenue indicators preserve authoritative totals without manufacturing rates', () => {
  assert.deepEqual(revenueAmounts([{ id: 'invoiced', value: 100 }, { id: 'paid', value: 200 }]), { invoiced: 100, collected: 200 });
  assert.deepEqual(revenueAmounts([]), { invoiced: null, collected: null });
});
test('aging shares conserve the total with cumulative proportional ring segments', () => {
  const result = agingRadial([{ label: 'Current', value: 70 }, { label: '1?30 Days', value: 20 }, { label: 'No due date', value: 10 }]);
  assert.equal(result.total, 100);
  assert.equal(result.currentShare, 70);
  assert.deepEqual(result.buckets.map(row => row.share), [70, 20, 10]);
  assert.deepEqual(result.buckets.map(row => row.offset), [0, 70, 90]);
  assert.equal(result.buckets[1].label, '1\u201330 Days');
});
test('zero outstanding produces finite zero percentages', () => {
  const result = agingRadial([{ label: 'Current', value: 0 }, { label: '90+ Days', value: 0 }]);
  assert.equal(result.total, 0);
  assert.equal(result.currentShare, 0);
  assert.ok(result.buckets.every(row => row.share === 0 && Number.isFinite(row.offset)));
});
test('fractional aging amounts add up to 100 percent before display rounding', () => {
  const result = agingRadial([{ label: 'Current', value: 0.1 }, { label: '1-30 Days', value: 0.2 }, { label: '31-60 Days', value: 0.3 }]);
  assert.ok(Math.abs(result.buckets.reduce((sum, row) => sum + row.share, 0) - 100) < 1e-10);
});

test('revenue percentages match paid balances to the same issued invoice cohort', () => {
  const records = [
    { currency: 'INR', status: 'Issued', totalAmount: 1000, paidAmount: 200 },
    { currency: 'INR', status: 'Draft', totalAmount: 500, paidAmount: 0 },
    { currency: 'INR', status: 'Cancelled', totalAmount: 500, paidAmount: 400 },
    { currency: 'USD', status: 'Paid', totalAmount: 1000, paidAmount: 1000 },
  ];
  assert.deepEqual(revenueCohort(records, 'INR'), { invoiced: 1000, collected: 200, invoicedPercent: 100, collectedPercent: 20 });
});
test('missing invoice paid amounts and zero bases fall back instead of fabricating progress', () => {
  assert.equal(revenueCohort([], 'INR'), null);
  assert.equal(revenueCohort([{ currency: 'INR', status: 'Issued', totalAmount: 100 }], 'INR'), null);
  assert.equal(revenueCohort([{ currency: 'INR', status: 'Issued', totalAmount: 0, paidAmount: 0 }], 'INR'), null);
});
test('paid invoice cohort shows 100 percent without using unrelated payment-period totals', () => {
  assert.equal(revenueCohort([{ currency: 'INR', status: 'Paid', totalAmount: 500, paidAmount: 500 }], 'INR').collectedPercent, 100);
});
