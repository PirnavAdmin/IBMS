export const currency = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value || 0));

// UI preview only: the backend will be authoritative once quotation APIs are integrated.
export function lineTotals(item) {
  const gross = Math.max(0, Number(item.quantity || 0)) * Math.max(0, Number(item.unitPrice || 0));
  const rawDiscount = item.discountType === 'percentage' ? gross * Number(item.discountRate || 0) / 100 : Number(item.discountAmount || 0);
  const discount = Math.min(gross, Math.max(0, rawDiscount));
  const taxable = gross - discount;
  const tax = taxable * Math.max(0, Number(item.taxRate || 0)) / 100;
  return { gross, discount, taxable, tax, total: taxable + tax };
}

export function quotationTotals(items = [], invoiceDiscount = { type: 'percentage', value: 0 }, charges = []) {
  const lines = items.map(lineTotals);
  const subtotal = lines.reduce((sum, line) => sum + line.gross, 0);
  const lineDiscount = lines.reduce((sum, line) => sum + line.discount, 0);
  const beforeInvoiceDiscount = subtotal - lineDiscount;
  const invoiceDiscountAmount = invoiceDiscount.type === 'percentage'
    ? beforeInvoiceDiscount * Number(invoiceDiscount.value || 0) / 100
    : Math.min(beforeInvoiceDiscount, Number(invoiceDiscount.value || 0));
  const taxableAmount = Math.max(0, beforeInvoiceDiscount - invoiceDiscountAmount);
  const taxAmount = lines.reduce((sum, line) => sum + line.tax, 0) * (beforeInvoiceDiscount ? taxableAmount / beforeInvoiceDiscount : 1);
  const chargesAmount = charges.reduce((sum, charge) => sum + (charge.type === 'percentage' ? taxableAmount * Number(charge.amount || 0) / 100 : Number(charge.amount || 0)), 0);
  return { subtotal, discountAmount: lineDiscount + invoiceDiscountAmount, taxableAmount, taxAmount, chargesAmount, totalAmount: taxableAmount + taxAmount + chargesAmount, lines };
}
