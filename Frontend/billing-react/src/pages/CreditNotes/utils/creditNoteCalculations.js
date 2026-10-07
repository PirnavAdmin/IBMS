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
  const subtotal = roundCurrency(Math.max(0, gross - discount));
  const tax = roundCurrency(subtotal * Number(item.taxRate || 0) / 100);
  return { subtotal, tax, total: roundCurrency(subtotal + tax) };
};

export const calculateCredit = (items = []) => {
  const subtotal = roundCurrency(items.reduce((sum, item) => sum + creditLineAmounts(item).subtotal, 0));
  const tax = items.reduce((sum, item) => {
    const amount = creditLineAmounts(item).tax;
    if (item.taxMode === 'inter-state') sum.igst += amount;
    else {
      const cgst = roundCurrency(amount / 2);
      sum.cgst += cgst;
      sum.sgst += amount - cgst;
    }
    return sum;
  }, { cgst: 0, sgst: 0, igst: 0 });
  const cgst = roundCurrency(tax.cgst);
  const sgst = roundCurrency(tax.sgst);
  const igst = roundCurrency(tax.igst);
  const taxAmount = roundCurrency(cgst + sgst + igst);
  return { subtotal, cgst, sgst, igst, taxAmount, rounding: 0, total: roundCurrency(subtotal + taxAmount) };
};

// Invoice totals are rounded to whole rupees when saved. A full credit must
// carry that same invoice-level rounding adjustment instead of rebuilding an
// unrounded line total that can exceed the persisted invoice balance.
export const reconcileFullCredit = (totals, items = [], eligibleAmount, isFull = false, allInvoiceItems = items) => {
  const selectedById = new Map(items.map((item) => [item.id, item]));
  const includesAllRemainingLines = allInvoiceItems.length > 0 && allInvoiceItems.every((invoiceItem) => {
    const remaining = Number(invoiceItem.remainingQuantity || 0);
    return remaining <= 0 || Number(selectedById.get(invoiceItem.id)?.quantity || 0) >= remaining;
  });
  if (!isFull || !items.length || !includesAllRemainingLines) return totals;
  const total = roundCurrency(eligibleAmount);
  const difference = roundCurrency(total - totals.total);
  if (difference === 0) return totals;
  return { ...totals, rounding: roundCurrency((totals.rounding || 0) + difference), total };
};

export const refundableBalance = (note) => Math.max(0, Number(note?.remainingRefundable ?? (Number(note?.total || 0) - Number(note?.refunded || 0))));

export const formatDate = (date) => date
  ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date))
  : '—';

export const formatDateTime = (date) => date
  ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(date))
  : '—';

export const eligibleCredit = (invoice) => roundCurrency(Math.max(0, Number(invoice?.remainingAmount ?? (Number(invoice?.total || 0) - Number(invoice?.previousCredits || 0)))));
