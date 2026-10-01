import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { Routes, Route } from 'react-router-dom';
import { Payments } from '../src/pages/Payments/Payments';
import { RecordPayment } from '../src/pages/Payments/RecordPayment';
import { PaymentDetails } from '../src/pages/Payments/PaymentDetails';
import { PaymentReversalContent } from '../src/pages/Payments/PaymentReversal';
import { PaymentState } from '../src/pages/Payments/PaymentShared';
import { paymentService } from '../src/pages/Payments/paymentService';
import { paymentSchema, reversalSchema } from '../src/pages/Payments/paymentValidation';

const render = (path) => renderToStaticMarkup(<StaticRouter location={path}><Routes>
  <Route path="/payments" element={<Payments />} /><Route path="/payments/new" element={<RecordPayment />} /><Route path="/payments/:id" element={<PaymentDetails />} />
</Routes></StaticRouter>);

test('Payment list: controls, table and integration-pending empty state', () => {
  const html = render('/payments');
  for (const label of ['Payment Management', 'Record Payment', 'Refresh', 'Search payments', 'Status', 'Payment Method', 'From Date', 'To Date', 'Allocated', 'Actions', 'Rows per page', 'No payments available.']) assert.ok(html.includes(label), label);
  assert.match(html, /Payment API is not available yet/);
  assert.match(html, /href="\/payments\/new"/);
});

test('Record route: full form, authoritative read-only fields and unavailable options', () => {
  const html = render('/payments/new');
  for (const label of ['Invoice Search', 'Customer', 'Invoice Total', 'Previously Paid', 'Current Outstanding', 'Payment Date', 'Payment Amount', 'Payment Method', 'Method Reference', 'Notes', 'Preview Confirmation', 'No eligible invoices available.']) assert.ok(html.includes(label), label);
  const balanceFields = (html.match(/<input\b[^>]*>/g) || []).filter(input => input.includes('placeholder="Select an eligible invoice"'));
  assert.equal(balanceFields.length, 4);
  assert.ok(balanceFields.every(input => /readonly=""/i.test(input)));
  assert.match(html, /Payment methods unavailable/);
});

test('Payment details route: all empty sections without fabricated values', () => {
  const html = render('/payments/test-id');
  for (const label of ['Payment Summary', 'Invoice Allocation', 'Reversal Information', 'Audit Timeline', 'No payment details available.', 'No audit history available.']) assert.ok(html.includes(label), label);
  assert.doesNotMatch(html, /Completed|INV-|\u20b9/);
});

test('Payment loading and empty states render', () => {
  assert.match(renderToStaticMarkup(<PaymentState loading />), /Loading payment data/);
  assert.match(renderToStaticMarkup(<PaymentState empty="No payment details available." />), /No payment details available/);
});

test('Record validation: date, amount and missing integration selections', () => {
  for (const amount of ['', 0, -1, 'invalid', Infinity]) assert.throws(() => paymentSchema.validateSyncAt('amount', { amount }));
  assert.equal(paymentSchema.validateSyncAt('amount', { amount: '12.50' }), 12.5);
  assert.throws(() => paymentSchema.validateSyncAt('notes', { notes: 'x'.repeat(1001) }));
  for (const date of ['', '2026-02-30', 'invalid']) assert.throws(() => paymentSchema.validateSyncAt('date', { date }));
  assert.equal(paymentSchema.validateSyncAt('date', { date: '2026-09-30' }), '2026-09-30');
  assert.throws(() => paymentSchema.validateSync({ date: '2026-09-30', amount: 10, invoice: '', method: '' }));
});

test('Reversal: reason required/trimmed and balance warning renders', () => {
  for (const reason of ['', '   ']) assert.throws(() => reversalSchema.validateSync({ reason }));
  assert.equal(reversalSchema.validateSync({ reason: '  Entered twice  ' }).reason, 'Entered twice');
  const html = renderToStaticMarkup(<PaymentReversalContent reason="" onChange={() => {}} error="Reversal Reason is required." />);
  assert.match(html, /Reversing this payment will update the invoice paid and outstanding balance/);
  assert.match(html, /Reversal Reason is required/);
});

test('Service stubs never return fake responses or perform network requests', () => {
  for (const method of Object.values(paymentService)) assert.throws(() => method(), error => error.message === 'Payment backend contract unavailable');
});

test('Payment runtime contains no mock storage, records or guessed endpoints; routes preserved', () => {
  const directory = join(__dirname, '../src/pages/Payments');
  for (const name of readdirSync(directory).filter(name => /\.(js|jsx)$/.test(name))) {
    const source = readFileSync(join(directory, name), 'utf8');
    assert.doesNotMatch(source, /localStorage|setTimeout|jsonplaceholder|samplePayments|mockPayments|dummyPayments|https?:\/\/|['"]\/api\//, name);
  }
  const routes = readFileSync(join(__dirname, '../src/routes/AppRoutes.jsx'), 'utf8');
  for (const path of ['/payments', '/payments/new', '/payments/:id']) assert.ok(routes.includes(`path="${path}"`));
});
