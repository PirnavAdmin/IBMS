export function validateQuotation(form, { allowDiscount = true } = {}) {
  const errors = {};
  if (!form.customerId) errors.customerId = 'Select a customer.';
  if (!form.quotationDate) errors.quotationDate = 'Quotation date is required.';
  if (!form.validUntil) errors.validUntil = 'Valid until date is required.';
  if (form.quotationDate && form.validUntil && form.validUntil < form.quotationDate) errors.validUntil = 'Valid until must be on or after quotation date.';
  if (!form.items?.length) errors.items = 'Add at least one quotation item.';
  form.items?.forEach((item, index) => {
    if (!item.productId) errors[`item-${index}`] = 'Choose an active product or service.';
    if (Number(item.quantity) <= 0) errors[`item-${index}`] = 'Quantity must be greater than zero.';
    if (Number(item.unitPrice) < 0) errors[`item-${index}`] = 'Unit price cannot be negative.';
    if (Number(item.discountRate || 0) > 20) errors[`item-${index}`] = 'Discount exceeds the configured maximum of 20%.';
  });
  if (!allowDiscount && Number(form.invoiceDiscount?.value || 0) > 0) errors.discount = 'You do not have permission to apply this discount.';
  if (form.invoiceDiscount?.type === 'percentage' && Number(form.invoiceDiscount?.value || 0) > 20) errors.discount = 'Discount exceeds the configured maximum of 20%.';
  form.charges?.forEach((charge, index) => { if (!charge.name || Number(charge.amount) < 0) errors[`charge-${index}`] = 'Enter a charge name and a non-negative amount.'; });
  return errors;
}
