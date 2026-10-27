import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { DeliveryTime } from '../src/pages/Webhooks/DeliveryDetails';
import { formatChargeValue } from '../src/pages/Settings/chargeDisplay';
import { displayDate } from '../src/utils/localDate';
import { formatQuotationTimestamp } from '../src/pages/Quotations/utils/quotationDates';

test('Fixed charge values preserve precision without inventing a missing currency', () => {
  const charge = { calculationType: 'Fixed', value: 20000 };
  const before = JSON.stringify(charge);
  assert.equal(formatChargeValue(charge), '20,000.00');
  assert.equal(formatChargeValue({ ...charge, value: 100 }), '100.00');
  assert.equal(formatChargeValue({ ...charge, value: 0 }), '0.00');
  assert.equal(formatChargeValue(charge, 'unsupported'), '20,000.00');
  assert.equal(JSON.stringify(charge), before);
});

test('Confirmed charge currency reuses the shared formatter and percentages remain rates', () => {
  assert.equal(formatChargeValue({ calculationType: 'Fixed', value: 12.345 }, 'USD'), '$12.35');
  assert.match(formatChargeValue({ calculationType: 'Fixed', value: 100 }, 'INR'), /100\.00/);
  assert.equal(formatChargeValue({ calculationType: 'Percentage', value: 7.5 }), '7.5%');
  assert.equal(formatChargeValue({ calculationType: 'Fixed', value: null }), 'Unavailable');
  assert.equal(formatChargeValue({ calculationType: 'Fixed', value: Infinity }), 'Unavailable');
});

test('Delivery timestamp renders invoice-style UTC calendar day and explicit UTC clock', () => {
  const html = renderToStaticMarkup(<DeliveryTime value="2026-10-27T00:15:00+05:30" />);
  assert.match(html, /26\/10\/2026/);
  assert.match(html, /6:45 pm UTC/);
  assert.match(html, /2026-10-26T18:45:00.000Z/);
  assert.doesNotMatch(html, /27\/10\/2026/);
});

test('Delivery preserves legacy timezone-less UTC semantics and missing-date fallback', () => {
  const html = renderToStaticMarkup(<DeliveryTime value="2026-10-26T18:45:00" />);
  assert.match(html, /26\/10\/2026/);
  assert.match(html, /6:45 pm UTC/);
  for (const value of [null, '', 'invalid']) assert.match(renderToStaticMarkup(<DeliveryTime value={value} />), /Not provided/);
});

test('Quotation timestamps preserve the instant, expose timezone and reject ambiguous API timestamps', () => {
  assert.match(formatQuotationTimestamp('2026-10-26T23:45:00Z'), /27\/10\/2026.*05:15 am IST/);
  assert.match(formatQuotationTimestamp('2026-10-27T05:15:00+05:30'), /27\/10\/2026.*05:15 am IST/);
  assert.match(formatQuotationTimestamp('2026-10-26T23:45:00Z', { timeZone: 'UTC' }), /26\/10\/2026.*11:45 pm UTC/);
  assert.match(formatQuotationTimestamp('2026-10-26T23:45:00'), /missing or invalid timezone/);
});

test('Date-only invoice convention retains the supplied day under multiple browser timezones', () => {
  const original = process.env.TZ;
  try {
    for (const zone of ['Asia/Kolkata', 'America/Los_Angeles', 'UTC']) {
      process.env.TZ = zone;
      assert.equal(displayDate('2026-10-26'), '26/10/2026');
      assert.equal(displayDate('2026-11-25T00:00:00Z'), '25/11/2026');
    }
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
});
