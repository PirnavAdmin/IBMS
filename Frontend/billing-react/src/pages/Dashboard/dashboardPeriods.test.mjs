import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dashboardPeriods } from './dashboardPeriods.js';
test('rolling periods include today and exactly 30 or 90 calendar dates', () => {
  const periods = dashboardPeriods(new Date(2026, 9, 6, 12));
  assert.equal(periods.find(row => row.id === '30days').start, '2026-09-07');
  assert.equal(periods.find(row => row.id === '90days').start, '2026-07-09');
  assert.ok(periods.every(row => row.end === '2026-10-06'));
});
test('month and quarter presets use the current local calendar boundaries', () => {
  const periods = dashboardPeriods(new Date(2026, 8, 15, 12));
  assert.equal(periods.find(row => row.id === 'month').start, '2026-09-01');
  assert.equal(periods.find(row => row.id === 'quarter').start, '2026-07-01');
});
test('rolling dates handle leap years and year transitions', () => {
  assert.equal(dashboardPeriods(new Date(2024, 2, 1, 12)).find(row => row.id === '30days').start, '2024-02-01');
  assert.equal(dashboardPeriods(new Date(2026, 0, 1, 12)).find(row => row.id === '30days').start, '2025-12-03');
});
