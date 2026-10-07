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

export function quotationTotals(items = [], invoiceDiscount = { type: 'percentage', value: 0 }, charges = [], additionalTaxes = [], additionalDiscounts = []) {
  const lines = items.map(lineTotals);
  const subtotal = lines.reduce((sum, line) => sum + line.gross, 0);
  const lineDiscount = lines.reduce((sum, line) => sum + line.discount, 0);
  const beforeInvoiceDiscount = subtotal - lineDiscount;
  const invoiceDiscountAmount = invoiceDiscount.type === 'percentage'
    ? beforeInvoiceDiscount * Number(invoiceDiscount.value || 0) / 100
    : Math.min(beforeInvoiceDiscount, Number(invoiceDiscount.value || 0));
  const baseTaxableAmount = Math.max(0, beforeInvoiceDiscount - invoiceDiscountAmount);
  const baseTaxAmount = lines.reduce((sum, line) => sum + line.tax, 0) * (beforeInvoiceDiscount ? baseTaxableAmount / beforeInvoiceDiscount : 1);
  const availableByItem = new Map(items.map((item, index) => [String(item.id), lines[index].taxable]));
  let additionalDiscountAmount = 0;
  for (const discount of additionalDiscounts) {
    const itemKey = String(discount.itemId ?? '');
    const available = availableByItem.get(itemKey) || 0;
    if (!itemKey || available <= 0) continue;
    const value = Math.max(0, Number(discount.discountValue) || 0);
    const amount = discount.discountType === 'percentage' ? available * value / 100 : value;
    const applied = Math.min(available, amount);
    additionalDiscountAmount += applied;
    availableByItem.set(itemKey, available - applied);
  }
  additionalDiscountAmount = Math.min(baseTaxableAmount, additionalDiscountAmount);
  const taxableAmount = Math.max(0, baseTaxableAmount - additionalDiscountAmount);
  const taxReduction = baseTaxableAmount ? taxableAmount / baseTaxableAmount : 1;
  const additionalTaxAmount = additionalTaxes.reduce((sum, tax) => sum + (tax.itemId ? Math.max(0, Number(tax.taxAmount) || 0) : 0), 0);
  const taxAmount = baseTaxAmount * taxReduction + additionalTaxAmount;
  const chargesAmount = charges.reduce((sum, charge) => sum + (charge.type === 'percentage' ? taxableAmount * Number(charge.amount || 0) / 100 : Number(charge.amount || 0)), 0);
  return { subtotal, discountAmount: lineDiscount + invoiceDiscountAmount + additionalDiscountAmount, taxableAmount, taxAmount, chargesAmount, totalAmount: taxableAmount + taxAmount + chargesAmount, lines };
}
