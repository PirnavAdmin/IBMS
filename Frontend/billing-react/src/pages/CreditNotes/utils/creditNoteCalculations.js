export const money = (amount, currency = 'INR') => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(Number(amount) || 0);

export const roundCurrency = (amount) => {
  const value = Number(amount) || 0;
  return Math.round((value + Number.EPSILON * Math.abs(value)) * 100) / 100;
};

export const validateCreditQuantity = (value, available) => {
  const raw = String(value ?? '').trim();
  if (!raw) return { valid: true, quantity: 0, error: '' };
  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(raw)) {
    return { valid: false, quantity: 0, error: 'Enter a valid quantity with up to 2 decimal places.' };
  }
  const quantity = Number(raw);
  const limit = Number(available);
  if (!Number.isFinite(quantity) || quantity < 0) {
    return { valid: false, quantity: 0, error: 'Quantity cannot be negative.' };
  }
  if (!Number.isFinite(limit) || limit < 0) {
    return { valid: false, quantity: 0, error: 'Available quantity is unavailable.' };
  }
  if (quantity > limit) {
    return { valid: false, quantity: 0, error: `Quantity cannot exceed the available ${limit}.` };
  }
  return { valid: true, quantity, error: '' };
};

export const validateRefundAmount = (value, remaining) => {
  const raw = String(value ?? '').trim();
  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(raw)) {
    return { valid: false, amount: 0, error: 'Enter a refund amount with up to 2 decimal places.' };
  }
  const amount = Number(raw);
  const balance = Number(remaining);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { valid: false, amount: 0, error: 'Refund amount must be greater than zero.' };
  }
  if (!Number.isFinite(balance) || balance < 0 || amount > balance) {
    return { valid: false, amount: 0, error: 'Refund amount cannot exceed the remaining refundable amount.' };
  }
  return { valid: true, amount: roundCurrency(amount), error: '' };
};

export const creditLineAmounts = (item, quantity = item.quantity) => {
  const selectedQuantity = Number(quantity || 0);
  if (!Number.isFinite(selectedQuantity) || selectedQuantity <= 0) return { subtotal: 0, tax: 0, total: 0 };
  const gross = selectedQuantity * Number(item.unitPrice || 0);
  const discount = roundCurrency(Number(item.discountAmount || 0) * selectedQuantity / Math.max(Number(item.originalQuantity || selectedQuantity || 0), 0.000001));
  const net = roundCurrency(Math.max(0, gross - discount));
  const taxRate = Number(item.taxRate || 0);
  const inclusiveFlag = item?.isTaxInclusive ?? item?.taxInclusive;
  const isInclusive = inclusiveFlag == null ? /inclusive/i.test(String(item?.taxType || '')) : Boolean(inclusiveFlag);
  const originalQuantity = Math.max(Number(item.originalQuantity || selectedQuantity || 0), 0.000001);
  const hasInvoiceTaxAmount = item.taxAmount != null && Number.isFinite(Number(item.taxAmount));
  const invoiceTax = hasInvoiceTaxAmount
    ? roundCurrency(Number(item.taxAmount) * selectedQuantity / originalQuantity)
    : null;
  if (isInclusive && taxRate > 0) {
    const baseAmount = invoiceTax == null ? net / (1 + taxRate / 100) : net - invoiceTax;
    const tax = invoiceTax == null ? roundCurrency(net - baseAmount) : invoiceTax;
    const subtotal = roundCurrency(Math.max(0, net - tax));
    return { subtotal, tax, total: net };
  }
  const subtotal = net;
  const tax = invoiceTax == null ? roundCurrency(subtotal * taxRate / 100) : invoiceTax;
  return { subtotal, tax, total: roundCurrency(subtotal + tax) };
};

export const splitTaxAmount = (amount, taxMode) => {
  const tax = roundCurrency(amount);
  if (/^(?:inter[- ]?state|igst)$/i.test(String(taxMode || ''))) return { cgst: 0, sgst: 0, igst: tax };
  const cgst = roundCurrency(tax / 2);
  return { cgst, sgst: roundCurrency(tax - cgst), igst: 0 };
};

export const calculateCredit = (items = []) => {
  const subtotal = roundCurrency(items.reduce((sum, item) => sum + creditLineAmounts(item).subtotal, 0));
  const tax = items.reduce((sum, item) => {
    const amount = creditLineAmounts(item).tax;
    const selectedQuantity = Number(item.quantity || 0);
    const originalQuantity = Math.max(Number(item.originalQuantity || selectedQuantity || 0), 0.000001);
    const taxScale = selectedQuantity / originalQuantity;
    const hasTaxComponents = [item.cgstAmount, item.sgstAmount, item.igstAmount].some((value) => value != null && Number.isFinite(Number(value)));
    const split = hasTaxComponents
      ? {
        cgst: roundCurrency(Number(item.cgstAmount || 0) * taxScale),
        sgst: roundCurrency(Number(item.sgstAmount || 0) * taxScale),
        igst: roundCurrency(Number(item.igstAmount || 0) * taxScale),
      }
      : splitTaxAmount(amount, item.taxMode);
    sum.cgst += split.cgst;
    sum.sgst += split.sgst;
    sum.igst += split.igst;
    return sum;
  }, { cgst: 0, sgst: 0, igst: 0 });
  const cgst = roundCurrency(tax.cgst);
  const sgst = roundCurrency(tax.sgst);
  const igst = roundCurrency(tax.igst);
  const taxAmount = roundCurrency(cgst + sgst + igst);
  return { subtotal, cgst, sgst, igst, taxAmount, rounding: 0, total: roundCurrency(subtotal + taxAmount) };
};

// Invoice totals are rounded to whole rupees when saved. Whenever all remaining
// lines are credited in full (or when a partial selection exceeds remaining
// eligibility solely by whole-rupee rounding <= 0.50), carry that rounding
// adjustment so the credit reconciles cleanly to the persisted invoice balance.
export const reconcileFullCredit = (totals, items = [], eligibleAmount, isFull = false, allInvoiceItems = items) => {
  if (!items.length) return totals;
  const selectedById = new Map(items.map((item) => [item.id, item]));
  const includesAllRemainingLines = allInvoiceItems.length > 0 && allInvoiceItems.every((invoiceItem) => {
    const remaining = Number(invoiceItem.remainingQuantity ?? invoiceItem.quantity ?? 0);
    return remaining <= 0 || Number(selectedById.get(invoiceItem.id)?.quantity || 0) >= remaining;
  });
  const total = roundCurrency(eligibleAmount);
  if (total <= 0) return totals;
  const difference = roundCurrency(total - totals.total);
  if (difference === 0) return totals;
  if ((includesAllRemainingLines || isFull) && Math.abs(difference) <= 0.5) {
    return { ...totals, rounding: roundCurrency((totals.rounding || 0) + difference), total };
  }
  return totals;
};

export const refundableBalance = (note) => {
  const fromApi = note?.remainingRefundable == null ? Number.NaN : Number(note.remainingRefundable);
  const calculated = Number(note?.total || 0) - Number(note?.refunded || 0);
  return roundCurrency(Math.max(0, Number.isFinite(fromApi) ? fromApi : calculated));
};

export { displayDate as formatDate, displayDateTime as formatDateTime } from '../../../utils/localDate.js';

export const eligibleCredit = (invoice) => roundCurrency(Math.max(0, Number(invoice?.remainingAmount ?? (Number(invoice?.total || 0) - Number(invoice?.previousCredits || 0)))));
