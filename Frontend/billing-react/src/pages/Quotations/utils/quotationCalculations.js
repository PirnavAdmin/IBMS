export const currency = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value || 0));

// Estimate for the currently supported draft DTO only. Saved details always use server totals.
// Shared-engine save integration is a reported backend blocker.
export function lineTotals(item) {
  const gross = Math.max(0, Number(item.quantity || 0)) * Math.max(0, Number(item.unitPrice || 0));
  const rawDiscount = item.discountType === 'percentage' ? gross * Number(item.discountRate || 0) / 100 : Number(item.discountAmount || 0);
  const discount = Math.min(gross, Math.max(0, rawDiscount));
  const taxable = gross - discount;
  const tax = taxable * Math.max(0, Number(item.taxRate || 0)) / 100;
  return { gross, discount, taxable, tax, total: taxable + tax };
}

export function quotationTotals(items = []) {
  const lines=items.map(lineTotals);
  const sum=key=>lines.reduce((total,line)=>total+line[key],0);
  return {subtotal:sum('gross'),discountAmount:sum('discount'),taxableAmount:sum('taxable'),taxAmount:sum('tax'),chargesAmount:0,totalAmount:sum('total'),lines};
}
