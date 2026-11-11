import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCredit, creditBalance, creditLineAmounts, creditQuantitiesForScope, eligibleCredit, invoiceLineWarnings, reconcileFullCredit, refundableBalance, splitTaxAmount, validateCreditQuantity, validateInvoiceTaxAmount, validateRefundAmount } from '../src/pages/CreditNotes/utils/creditNoteCalculations.js';
import { fetchAllInvoicePages } from '../src/pages/CreditNotes/utils/creditNoteInvoicePages.js';

const line = {
  id: 1, originalQuantity: 1, remainingQuantity: 1, quantity: 1,
  unitPrice: 5400, discountAmount: 648, taxRate: 22,
};

test('full credit reconciles invoice whole-rupee rounding to authoritative eligibility', () => {
  const items = [{ ...line }];
  const raw = calculateCredit(items);
  assert.equal(raw.total, 5797.44);
  assert.equal(eligibleCredit({ remainingAmount: 5797 }), 5797);
  const full = reconcileFullCredit(raw, items, 5797, true);
  assert.equal(full.total, 5797);
  assert.equal(full.subtotal, 4752);
  assert.equal(full.rounding, -0.44);
  assert.equal(items[0].quantity, 1);
});

test('genuine overage remains visible and quantity changes recalculate immediately', () => {
  assert.equal(creditLineAmounts(line, 1).total, 5797.44);
  assert.equal(creditLineAmounts(line, 0.5).total, 2898.72);
  const overLine = { ...line, quantity: 0.5, remainingQuantity: 1 };
  const over = calculateCredit([overLine]);
  assert.ok(over.total > 2800);
});

test('full-credit reconciliation does not modify a partial selection', () => {
  const partialLine = { ...line, quantity: 0.5, remainingQuantity: 1 };
  const totals = calculateCredit([partialLine]);
  assert.equal(reconcileFullCredit(totals, [partialLine], 5797, true).total, totals.total);
});

test('full credit without discount calculates subtotal, GST split, and total', () => {
  const totals = calculateCredit([{ ...line, unitPrice: 100, discountAmount: 0, taxRate: 18, taxMode: 'intra-state' }]);
  assert.deepEqual(totals, { subtotal: 100, cgst: 9, sgst: 9, igst: 0, taxAmount: 18, rounding: 0, total: 118 });
});

test('partial credit prorates line discount once and recalculates tax on the discounted amount', () => {
  const discounted = { ...line, quantity: 0.5, unitPrice: 100, discountAmount: 20, originalQuantity: 1, taxRate: 5 };
  assert.deepEqual(creditLineAmounts(discounted), { subtotal: 40, tax: 2, total: 42 });
});

test('invoice and line totals use the supported line discount exactly once', () => {
  const full = { ...line, quantity: 2, originalQuantity: 2, unitPrice: 50, discountAmount: 10, taxRate: 0 };
  const partial = { ...full, quantity: 1 };
  assert.equal(creditLineAmounts(full).total, 90);
  assert.equal(creditLineAmounts(partial).total, 45);
});

test('supported exclusive tax rates calculate from discounted taxable subtotal', () => {
  for (const rate of [0, 5, 12, 18, 28]) {
    const result = creditLineAmounts({ unitPrice: 100, quantity: 1, discountAmount: 10, originalQuantity: 1, taxRate: rate });
    assert.equal(result.subtotal, 90);
    assert.equal(result.tax, Math.round((90 * rate / 100 + Number.EPSILON) * 100) / 100);
    assert.equal(result.total, result.subtotal + result.tax);
  }
});

test('inclusive tax extracts included tax from the entered total', () => {
  assert.deepEqual(creditLineAmounts({ quantity: 1, unitPrice: 112, originalQuantity: 1, discountAmount: 0, taxRate: 12, taxType: 'GST Inclusive' }), { subtotal: 100, tax: 12, total: 112 });
});

test('invoice line tax is prorated by quantity and tax-inclusive/exclusive tax agrees with its rate', () => {
  const exclusive = { quantity: 2, originalQuantity: 2, unitPrice: 100, discountAmount: 10, taxRate: 10, taxType: 'GST Exclusive', taxAmount: 19 };
  assert.equal(validateInvoiceTaxAmount(exclusive), null);
  assert.deepEqual(creditLineAmounts(exclusive, 1), { subtotal: 95, tax: 9.5, total: 104.5 });

  const inclusive = { quantity: 2, originalQuantity: 2, unitPrice: 112, discountAmount: 0, taxRate: 12, taxType: 'GST Inclusive', taxAmount: 24 };
  assert.equal(validateInvoiceTaxAmount(inclusive), null);
  assert.deepEqual(creditLineAmounts(inclusive, 1), { subtotal: 100, tax: 12, total: 112 });
});

test('tax amount inconsistency raises a warning and calculation preserves invoice tax amount', () => {
  const inconsistent = { quantity: 2, originalQuantity: 2, unitPrice: 100, discountAmount: 0, taxRate: 10, taxType: 'GST Exclusive', taxAmount: 10 };
  assert.match(validateInvoiceTaxAmount(inconsistent), /does not match 10% tax/);
  assert.deepEqual(creditLineAmounts(inconsistent), { subtotal: 200, tax: 10, total: 210 });
});

test('missing prior credit discount allocation is surfaced when remaining discounted quantities exist', () => {
  const lineWithPreviousCredit = { previouslyCreditedQuantity: 1, discountAmount: 20, taxAmount: 21.86, taxRate: 12, originalQuantity: 2, unitPrice: 112, taxType: 'GST Inclusive' };
  assert.ok(invoiceLineWarnings(lineWithPreviousCredit).some((warning) => /earlier credits/.test(warning)));
  assert.deepEqual(invoiceLineWarnings({ ...lineWithPreviousCredit, previouslyCreditedQuantity: 0 }), []);
});

test('available, selected, and remaining credit update for full and partial selections', () => {
  const items = [
    { id: 1, quantity: 3, originalQuantity: 3, previouslyCreditedQuantity: 1, remainingQuantity: 2, unitPrice: 50, discountAmount: 0, taxRate: 0 },
    { id: 2, quantity: 2, originalQuantity: 2, previouslyCreditedQuantity: 0, remainingQuantity: 2, unitPrice: 25, discountAmount: 0, taxRate: 0 },
  ];
  const fullQuantities = creditQuantitiesForScope(items, 'Full');
  assert.deepEqual(fullQuantities, { 1: 2, 2: 2 });
  const fullTotals = calculateCredit(items.map((item) => ({ ...item, quantity: fullQuantities[item.id] })));
  assert.deepEqual(creditBalance(150, fullTotals.total), { availableCredit: 150, selectedCredit: 150, remainingCredit: 0 });

  const partialQuantities = creditQuantitiesForScope(items, 'Partial');
  assert.deepEqual(partialQuantities, {});
  const partialLine = { ...items[0], quantity: 1 };
  const partialTotals = calculateCredit([partialLine]);
  assert.deepEqual(creditBalance(150, partialTotals.total), { availableCredit: 150, selectedCredit: 50, remainingCredit: 100 });
  assert.equal(creditBalance(40, 50).remainingCredit, 0);
});

test('credit subtotal and total stay consistent with selected item amounts', () => {
  const selected = [
    { id: 1, quantity: 2, originalQuantity: 2, unitPrice: 100, discountAmount: 10, taxRate: 10, taxMode: 'intra-state' },
    { id: 2, quantity: 1, originalQuantity: 1, unitPrice: 50, discountAmount: 0, taxRate: 12, taxMode: 'IGST' },
  ];
  const totals = calculateCredit(selected);
  const lineTotals = selected.reduce((sum, item) => sum + creditLineAmounts(item).total, 0);
  assert.equal(totals.subtotal, 240);
  assert.equal(totals.total, lineTotals);
  assert.equal(totals.total, 265);
});

test('IGST and intra-state GST split are rounded to currency precision', () => {
  assert.deepEqual(splitTaxAmount(18, 'IGST'), { cgst: 0, sgst: 0, igst: 18 });
  assert.deepEqual(splitTaxAmount(5, 'intra-state'), { cgst: 2.5, sgst: 2.5, igst: 0 });
});

test('previously credited and remaining quantities cap a full credit line', () => {
  const invoiceItem = { quantity: 5, previouslyCreditedQuantity: 2, remainingQuantity: 3 };
  assert.equal(invoiceItem.quantity - invoiceItem.previouslyCreditedQuantity, invoiceItem.remainingQuantity);
  assert.deepEqual(validateCreditQuantity(invoiceItem.remainingQuantity, invoiceItem.remainingQuantity), { valid: true, quantity: 3, error: '' });
});

test('credit quantity rejects negative, over-available, malformed, and over-precision values', () => {
  assert.equal(validateCreditQuantity('-1', 2).valid, false);
  assert.equal(validateCreditQuantity('2.01', 2).valid, false);
  assert.equal(validateCreditQuantity('abc', 2).valid, false);
  assert.equal(validateCreditQuantity('1.001', 2).valid, false);
  assert.deepEqual(validateCreditQuantity('0', 2), { valid: true, quantity: 0, error: '' });
  assert.equal(calculateCredit([{ unitPrice: 100, quantity: 0, taxRate: 18 }]).total, 0);
});

test('rounding reconciliation only applies a half-unit rounding difference', () => {
  const all = [{ id: 1, quantity: 1, remainingQuantity: 1, unitPrice: 99.99, taxRate: 0 }];
  const totals = calculateCredit(all);
  assert.equal(reconcileFullCredit(totals, all, 100, true).total, 100);
  assert.equal(reconcileFullCredit(totals, all, 101, true).total, totals.total);
});

test('remaining refundable amount follows total credit less amount refunded', () => {
  assert.equal(refundableBalance({ total: 100, refunded: 25 }), 75);
  assert.equal(refundableBalance({ total: 100, refunded: 25, remainingRefundable: 70 }), 70);
  assert.equal(refundableBalance({ total: 100, refunded: 120 }), 0);
});

test('refund validation requires a positive amount, at most two decimals, and no over-refund', () => {
  assert.equal(validateRefundAmount('0', 10).valid, false);
  assert.equal(validateRefundAmount('1.001', 10).valid, false);
  assert.equal(validateRefundAmount('10.01', 10).valid, false);
  assert.deepEqual(validateRefundAmount('9.99', 10), { valid: true, amount: 9.99, error: '' });
});

test('invoice selection pagination loads every API page instead of stopping at the first 100', async () => {
  const calls = [];
  const records = await fetchAllInvoicePages(async (page, pageSize) => {
    calls.push([page, pageSize]);
    const all = ['a', 'b', 'c', 'd', 'e'];
    return { items: all.slice((page - 1) * pageSize, page * pageSize), totalCount: all.length, totalPages: Math.ceil(all.length / pageSize) };
  }, 2);
  assert.deepEqual(records, ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(calls, [[1, 2], [2, 2], [3, 2]]);
});
