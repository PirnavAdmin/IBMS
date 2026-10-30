export const money = (amount, currency = 'INR') => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(Number(amount) || 0);

export const roundCurrency = (amount) => {
  const value = Number(amount) || 0;
  return Math.round((value + Number.EPSILON * Math.abs(value)) * 100) / 100;
};

export const creditLineAmounts = (item, quantity = item.quantity) => {
  const selectedQuantity = Number(quantity || 0);
  const gross = selectedQuantity * Number(item.unitPrice || 0);
  const discount = roundCurrency(Number(item.discountAmount || 0) * selectedQuantity / Math.max(Number(item.originalQuantity || selectedQuantity || 0), 0.000001));
  const net = roundCurrency(Math.max(0, gross - discount));
  const taxRate = Number(item.taxRate || 0);
  const isInclusive = String(item?.taxType || '').trim().toLowerCase() === 'inclusive';
  if (isInclusive && taxRate > 0) {
    const baseAmount = net / (1 + taxRate / 100);
    const tax = roundCurrency(net - baseAmount);
    const subtotal = roundCurrency(Math.max(0, net - tax));
    return { subtotal, tax, total: net };
  }
  const subtotal = net;
  const tax = roundCurrency(subtotal * taxRate / 100);
  return { subtotal, tax, total: roundCurrency(subtotal + tax) };
};

export const splitTaxAmount = (amount, taxMode) => {
  const tax = roundCurrency(amount);
  if (taxMode === 'inter-state') return { cgst: 0, sgst: 0, igst: tax };
  const cgst = roundCurrency(tax / 2);
  return { cgst, sgst: roundCurrency(tax - cgst), igst: 0 };
};

export const calculateCredit = (items = []) => {
  const subtotal = roundCurrency(items.reduce((sum, item) => sum + creditLineAmounts(item).subtotal, 0));
  const tax = items.reduce((sum, item) => {
    const amount = creditLineAmounts(item).tax;
    const split = splitTaxAmount(amount, item.taxMode);
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
  if (includesAllRemainingLines || (isFull && includesAllRemainingLines) || (difference < 0 && Math.abs(difference) <= 0.5)) {
    return { ...totals, rounding: roundCurrency((totals.rounding || 0) + difference), total };
  }
  return totals;
};

export const refundableBalance = (note) => Math.max(0, Number(note?.remainingRefundable ?? (Number(note?.total || 0) - Number(note?.refunded || 0))));

export { displayDate as formatDate, displayDateTime as formatDateTime } from '../../../utils/localDate.js';

export const eligibleCredit = (invoice) => roundCurrency(Math.max(0, Number(invoice?.remainingAmount ?? (Number(invoice?.total || 0) - Number(invoice?.previousCredits || 0)))));
