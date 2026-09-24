import { apiClient } from './apiClient.js';
const base = '/api/v1/quotations';
export function unwrap(response) {
  if (response?.success === false || response?.isSuccess === false) throw new Error(response.message || 'Request failed.');
  return response && Object.hasOwn(response, 'data') ? response.data : response;
}
const path = id => {
  if (!Number.isInteger(Number(id)) || Number(id) <= 0) throw new Error('Invalid quotation ID.');
  return `${base}/${Number(id)}`;
};
export function quotationPayload(q) {
  if (Number(q.invoiceDiscount?.value || 0) || q.charges?.length) throw new Error('Only item discounts are supported for quotations.');
  return { customerId: Number(q.customerId), quotationDate: q.quotationDate, validUntil: q.validUntil,
    reference: q.reference || null, notes: q.notes || null, termsAndConditions: q.termsAndConditions || null,
    ...(q.id ? { rowVersion: q.rowVersion } : {}),
    items: q.items.map(i => ({ productId: i.productId ? Number(i.productId) : null, description: i.description.trim(),
      quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), discountType: i.discountType === 'percentage' ? 'Percentage' : 'Fixed',
      discountRate: Number(i.discountType === 'percentage' ? i.discountRate || 0 : i.discountAmount || 0),
      taxType: i.taxType, taxRate: Number(i.taxRate || 0), hsnsac: i.hsnSac || null })) };
}
export const normalizeCommunication = row => ({ ...row, date: row.sentAt || row.date, type: row.communicationType || row.type });
export function normalizeQuotation(q) {
  if (!q?.id) throw new Error('Invalid quotation response.');
  return { ...q, customerId: String(q.customerId),
    customer: { id: String(q.customerId), name: q.customerName || '', code: '', email: q.customerEmail || '', mobile: q.customerPhone || '' },
    quotationDate: q.quotationDate?.slice(0,10) || '', validUntil: q.validUntil?.slice(0,10) || '',
    reference: q.reference || '', notes: q.notes || '', termsAndConditions: q.termsAndConditions || '',
    invoiceDiscount: {type:'percentage',value:0}, charges: [],
    taxableAmount: Number(q.totalAmount || 0) - Number(q.taxAmount || 0) - Number(q.chargesAmount || 0),
    items: (q.items || []).map(i => ({ ...i, productId: i.productId == null ? '' : String(i.productId),
      productName: i.productName || i.description || '', description: i.description || '',
      discountType: i.discountType?.toLowerCase() || 'percentage', discountRate: i.discountRate || 0,
      discountAmount: i.discountAmount || 0, taxType: i.taxType || 'GST', taxRate: i.taxRate || 0, hsnSac: i.hsnsac || i.hsnSac || '' })),
    communications: (q.communications || []).map(normalizeCommunication), auditLogs: [] };
}
export function normalizeQuotationProduct(p) {
  const label = p.taxCategory || '';
  const rate = label.match(/(\d+(?:\.\d+)?)\s*%/);
  const type = label.match(/\b(CGST|SGST|IGST|GST|VAT)\b/i)?.[1]?.toUpperCase() || 'Custom Tax';
  return { ...p, id: String(p.id), code: p.productCode || '', price: p.price ?? 0,
    description: p.description || p.name || '', hsnSac: p.hsnSacCode || p.hsnSac || '',
    taxCategory: type, taxRate: p.taxRate ?? (rate ? Number(rate[1]) : 0) };
}
export async function fetchAllPages(fetchPage) {
  const rows=[];
  for (let pageNumber=1;;pageNumber++) {
    const page=await fetchPage({pageNumber,pageSize:100});
    const items=Array.isArray(page)?page:page?.items;
    if (!Array.isArray(items)) throw new Error('Invalid list response.');
    rows.push(...items);
    if (Array.isArray(page) || !items.length || rows.length>=page.totalCount || pageNumber>=page.totalPages ||
      (page.totalCount == null && page.totalPages == null && items.length<100)) return rows;
  }
}
export const quotationApi = {
  list: async params => unwrap(await apiClient.get(base,{params})),
  get: async id => normalizeQuotation(unwrap(await apiClient.get(path(id)))),
  save: async q => normalizeQuotation(unwrap(await (q.id ? apiClient.put(path(q.id),quotationPayload(q)) : apiClient.post(base,quotationPayload(q))))),
  action: async (id,action,reason) => {
    if (!['send','approve','cancel','convert'].includes(action)) throw new Error('Invalid quotation action.');
    if (action==='cancel' && !reason?.trim()) throw new Error('Cancellation reason is required.');
    return unwrap(await apiClient.post(`${path(id)}/${action}`,action==='cancel'?{reason:reason.trim()}:undefined));
  },
  communication: async id => unwrap(await apiClient.get(`${path(id)}/communication`)),
  audit: async id => unwrap(await apiClient.get(`${path(id)}/audit`)),
};
