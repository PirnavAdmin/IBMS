import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuotationTimestamp, formatQuotationTimestamp } from '../src/pages/Quotations/utils/quotationDates.js';

test('explicit UTC and offset timestamps represent the same instant', () => {
  const expected = '2026-09-28T09:36:02.795Z';
  for (const value of ['2026-09-28T09:36:02.795964Z', '2026-09-28T15:06:02.795+05:30']) {
    assert.equal(parseQuotationTimestamp(value).toISOString(), expected);
    assert.match(formatQuotationTimestamp(value, { timeZone: 'Asia/Kolkata' }), /03:06 pm/i);
  }
});
test('conversion handles midnight and preserves explicit timezone offsets', () => {
  assert.match(formatQuotationTimestamp('2026-09-28T23:45:00Z', { timeZone: 'Asia/Kolkata' }), /29 Sept 2026, 05:15 am/i);
  assert.match(formatQuotationTimestamp('2026-09-28T09:36:00Z', { timeZone: 'UTC' }), /09:36 am/i);
});
test('invalid or missing timestamps have a readable fallback', () => {
  for (const value of [null, undefined, '', 'bad date']) {
    assert.equal(parseQuotationTimestamp(value), null);
    assert.match(formatQuotationTimestamp(value), /^Date unavailable/);
  }
});

test('missing API timezone is reported instead of guessed',()=>{assert.equal(parseQuotationTimestamp('2026-09-28T09:36:00'),null);assert.match(formatQuotationTimestamp('2026-09-28T09:36:00'),/timezone/);});
