export function validateQuotation(form) {
  const errors={};
  if(!Number.isInteger(Number(form.customerId))||Number(form.customerId)<=0)errors.customerId='Select a customer.';
  if(!form.quotationDate||!Number.isFinite(Date.parse(form.quotationDate)))errors.quotationDate='Quotation date is required.';
  if(!form.validUntil||!Number.isFinite(Date.parse(form.validUntil)))errors.validUntil='Valid until date is required.';
  if(form.quotationDate&&form.validUntil&&form.validUntil<form.quotationDate)errors.validUntil='Valid until must be on or after quotation date.';
  if(!form.items?.length)errors.items='Add at least one quotation item.';
  form.items?.forEach((item,index)=>{
    const key=`item-${index}`;
    if(item.productId&&(!Number.isInteger(Number(item.productId))||Number(item.productId)<=0))errors[key]='Select a valid product.';
    if(!item.description?.trim()||item.description.length>500)errors[key]='Enter a description (maximum 500 characters).';
    if(!Number.isFinite(Number(item.quantity))||Number(item.quantity)<0.0001||Number(item.quantity)>1000000)errors[key]='Quantity must be between 0.0001 and 1,000,000.';
    if(item.unitPrice===''||!Number.isFinite(Number(item.unitPrice))||Number(item.unitPrice)<0||Number(item.unitPrice)>1000000000)errors[key]='Enter a valid non-negative unit price.';
    const discount=Number(item.discountType==='percentage'?item.discountRate||0:item.discountAmount||0);
    if(!Number.isFinite(discount)||discount<0||(item.discountType==='percentage'?discount>100:discount>Number(item.quantity)*Number(item.unitPrice)))errors[key]='Discount cannot exceed the item amount (or 100%).';
    if(!Number.isFinite(Number(item.taxRate))||Number(item.taxRate)<0||Number(item.taxRate)>100)errors[key]='Tax rate must be between 0 and 100.';
  });
  for(const [field,max] of [['reference',128],['notes',2000],['termsAndConditions',4000]])if((form[field]||'').length>max)errors[field]=`${field}: maximum ${max} characters allowed.`;
  if(Number(form.invoiceDiscount?.value||0)||form.charges?.length)errors.discount='Only item discounts are supported for quotations.';
  return errors;
}
