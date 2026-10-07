import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCredit, creditLineAmounts, eligibleCredit, reconcileFullCredit } from '../src/pages/CreditNotes/utils/creditNoteCalculations.js';

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
