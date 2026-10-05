export const money = (amount, currency = 'INR') => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(Number(amount) || 0);

export const creditLineAmounts = (item, quantity = item.quantity) => {
  const selectedQuantity = Number(quantity || 0);
  const gross = selectedQuantity * Number(item.unitPrice || 0);
  const discount = Number(item.discountAmount || 0) * selectedQuantity / Math.max(Number(item.originalQuantity || selectedQuantity || 0), 0.000001);
  const subtotal = Math.max(0, gross - discount);
  const tax = subtotal * Number(item.taxRate || 0) / 100;
  return { subtotal, tax, total: subtotal + tax };
};

export const calculateCredit = (items = []) => {
  const subtotal = items.reduce((sum, item) => {
    return sum + creditLineAmounts(item).subtotal;
  }, 0);
  const tax = items.reduce((sum, item) => {
    const amount = creditLineAmounts(item).tax;
    if (item.taxMode === 'inter-state') sum.igst += amount;
    else { sum.cgst += amount / 2; sum.sgst += amount / 2; }
    return sum;
  }, { cgst: 0, sgst: 0, igst: 0 });
  const cgst = Number(tax.cgst.toFixed(2));
  const sgst = Number(tax.sgst.toFixed(2));
  const igst = Number(tax.igst.toFixed(2));
  const taxAmount = Number((cgst + sgst + igst).toFixed(2));
  return { subtotal: Number(subtotal.toFixed(2)), cgst, sgst, igst, taxAmount, rounding: 0, total: Number((subtotal + taxAmount).toFixed(2)) };
};

export const refundableBalance = (note) => Math.max(0, Number(note?.remainingRefundable ?? (Number(note?.total || 0) - Number(note?.refunded || 0))));

export const formatDate = (date) => date
  ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date))
  : '—';

export const formatDateTime = (date) => date
  ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(date))
  : '—';

export const eligibleCredit = (invoice) => Math.max(0, Number(invoice?.remainingAmount ?? (Number(invoice?.total || 0) - Number(invoice?.previousCredits || 0))));
