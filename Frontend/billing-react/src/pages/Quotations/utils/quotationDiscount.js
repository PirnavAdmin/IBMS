import { phase5Api } from '../../Settings/services/phase5Api';
export function discountValidationRequest(item) {
  return { value:Number(item.discountType==='percentage'?item.discountRate||0:item.discountAmount||0), discountType:item.discountType==='percentage'?'Percentage':'Fixed', invoiceAmount:Number(item.quantity)*Number(item.unitPrice), isManualOverride:false };
}
export async function validateQuotationDiscounts(items) {
  const discounted=items.filter(item=>discountValidationRequest(item).value>0);
  if(!discounted.length)return;
  const configuration=await phase5Api.getDiscountConfiguration();
  if(configuration.status!=='Active'||!configuration.allowLineLevel)throw new Error('Line discounts are not enabled in discount settings.');
  for(const item of discounted) {
    const request=discountValidationRequest(item);
    if(!request.value)continue;
    const result=await phase5Api.validateMaximumDiscount(request);
    if(!result?.isValid)throw new Error(result?.message||'The discount was not approved.');
  }
}
