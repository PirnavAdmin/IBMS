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
  if (!/^(?:\d+(?:\.\d{1,4})?|\.\d{1,4})$/.test(raw)) {
    return { valid: false, quantity: 0, error: 'Enter a valid quantity with up to 4 decimal places.' };
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

export const creditQuantitiesForScope = (items = [], scope = 'Partial') => scope === 'Full'
  ? Object.fromEntries(items
    .filter((item) => Number(item.remainingQuantity) > 0)
    .map((item) => [item.id, Number(item.remainingQuantity)]))
  : {};

export const creditBalance = (available, selected) => {
  const availableCredit = roundCurrency(Math.max(0, Number(available) || 0));
  const selectedCredit = roundCurrency(Math.max(0, Number(selected) || 0));
  return {
    availableCredit,
    selectedCredit,
    remainingCredit: roundCurrency(Math.max(0, availableCredit - selectedCredit)),
  };
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
  // The creditable-summary API exposes TaxAmount on each invoice line. Treat it
  // as the whole-line amount, then prorate by selected/original quantity.
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

export const validateInvoiceTaxAmount = (item, currency = 'INR') => {
  const rawTax = item?.taxAmount;
  const rawRate = item?.taxRate;
  if (rawTax == null || !Number.isFinite(Number(rawTax))) return null;
  const tax = Number(rawTax);
  if (rawRate == null || !Number.isFinite(Number(rawRate))) {
    return Math.abs(tax) > 0.005 ? 'The invoice includes a tax amount but no tax rate, so the tax amount cannot be checked.' : null;
  }
  const taxRate = Number(rawRate);
  if (taxRate < 0 || taxRate > 100) return `The invoice tax rate (${taxRate}%) is outside the valid range.`;
  const originalQuantity = Number(item?.originalQuantity ?? item?.quantity);
  const unitPrice = Number(item?.unitPrice);
  if (!Number.isFinite(originalQuantity) || originalQuantity <= 0 || !Number.isFinite(unitPrice)) {
    return Math.abs(tax) > 0.005 ? 'The invoice line is missing quantity or unit price, so its tax amount cannot be checked.' : null;
  }
  const gross = roundCurrency(originalQuantity * unitPrice);
  const discount = Math.min(gross, Math.max(0, roundCurrency(Number(item?.discountAmount) || 0)));
  const afterDiscount = Math.max(0, roundCurrency(gross - discount));
  const inclusiveFlag = item?.isTaxInclusive ?? item?.taxInclusive;
  const isInclusive = inclusiveFlag == null
    ? /inclusive/i.test(String(item?.taxType || ''))
    : Boolean(inclusiveFlag);
  const taxForBase = (base) => isInclusive && taxRate > 0
    ? roundCurrency(base - base / (1 + taxRate / 100))
    : roundCurrency(base * taxRate / 100);
  const possibleTaxes = [taxForBase(afterDiscount), taxForBase(gross)];
  const minimumTax = Math.min(...possibleTaxes);
  const maximumTax = Math.max(...possibleTaxes);
  if (tax >= minimumTax - 0.05 && tax <= maximumTax + 0.05) return null;
  return `The invoice line tax amount (${money(tax, currency)}) does not match ${taxRate}% tax for any base between the invoice line amount and its reported discount (expected ${money(minimumTax, currency)}–${money(maximumTax, currency)}). The preview keeps the invoice tax amount and does not replace it.`;
};

export const validatePreviouslyCreditedAllocation = (item) => {
  const previouslyCreditedQuantity = Number(item?.previouslyCreditedQuantity) || 0;
  const discountAmount = Number(item?.discountAmount) || 0;
  if (previouslyCreditedQuantity <= 0 || discountAmount <= 0) return null;
  return 'The invoice summary does not include the discount and tax amounts allocated to earlier credits, so this remaining discounted line cannot be reconciled exactly with the saved credit calculation.';
};

export const invoiceLineWarnings = (item, currency = 'INR') => [
  validateInvoiceTaxAmount(item, currency),
  validatePreviouslyCreditedAllocation(item),
].filter(Boolean);

export const splitTaxAmount = (amount, taxMode) => {
  const tax = roundCurrency(amount);
  if (/(?:inter[- ]?state|igst)/i.test(String(taxMode || ''))) return { cgst: 0, sgst: 0, igst: tax };
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
export const reconcileFullCredit = (totals, items = [], eligibleAmount, isFull = false, allInvoiceItems = items, options = {}) => {
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
  const maxFullAdjustment = Math.max(
    1,
    roundCurrency(Math.abs(Number(options?.rounding || 0)) + Math.max(0, Number(options?.charges || 0)) + 0.5),
  );
  if (includesAllRemainingLines && Math.abs(difference) <= maxFullAdjustment) {
    return { ...totals, rounding: roundCurrency((totals.rounding || 0) + difference), total };
  }
  if (!includesAllRemainingLines && difference < 0 && Math.abs(difference) <= 0.5) {
    return { ...totals, rounding: roundCurrency((totals.rounding || 0) + difference), total };
  }
  return totals;
};

export const summarizeCreditTaxBreakdown = (note) => {
  const breakdown = (note?.items || []).reduce((sum, item) => {
    const taxable = item.taxableAmount != null && Number.isFinite(Number(item.taxableAmount))
      ? Number(item.taxableAmount)
      : creditLineAmounts(item).subtotal;
    const tax = item.taxAmount != null && Number.isFinite(Number(item.taxAmount))
      ? Number(item.taxAmount)
      : creditLineAmounts(item).tax;
    const hasSplit = [item.cgstAmount, item.sgstAmount, item.igstAmount].some(
      (value) => value != null && Number.isFinite(Number(value)),
    );
    const split = hasSplit
      ? {
        cgst: Number(item.cgstAmount || 0),
        sgst: Number(item.sgstAmount || 0),
        igst: Number(item.igstAmount || 0),
      }
      : splitTaxAmount(tax, item.taxMode || item.taxType);
    sum.taxable += taxable;
    sum.cgst += split.cgst;
    sum.sgst += split.sgst;
    sum.igst += split.igst;
    return sum;
  }, { taxable: 0, cgst: 0, sgst: 0, igst: 0 });

  const roundingSource = note?.roundingAmount ?? note?.rounding;
  const roundingAdjustment = roundingSource != null && Number.isFinite(Number(roundingSource)) && Number(roundingSource) !== 0
    ? roundCurrency(Number(roundingSource))
    : (note ? roundCurrency(Number(note.total || 0) - Number(note.subtotal || 0) - Number(note.taxAmount || 0)) : 0);

  return {
    taxable: roundCurrency(breakdown.taxable),
    cgst: roundCurrency(breakdown.cgst),
    sgst: roundCurrency(breakdown.sgst),
    igst: roundCurrency(breakdown.igst),
    roundingAdjustment,
  };
};

export const refundableBalance = (note) => {
  const fromApi = note?.remainingRefundable == null ? Number.NaN : Number(note.remainingRefundable);
  const calculated = Number(note?.total || 0) - Number(note?.refunded || 0);
  return roundCurrency(Math.max(0, Number.isFinite(fromApi) ? fromApi : calculated));
};

export { displayDate as formatDate, displayDateTime as formatDateTime } from '../../../utils/localDate.js';

export const eligibleCredit = (invoice) => roundCurrency(Math.max(0, Number(invoice?.remainingAmount ?? (Number(invoice?.total || 0) - Number(invoice?.previousCredits || 0)))));
