export const initialQuotationQuery = { search: '', status: '', customerId: '', fromDate: '', toDate: '', pageNumber: 1, pageSize: 10, sortBy: 'quotationDate', sortOrder: 'desc' };
export function quotationQuery(params) {
  return Object.fromEntries(Object.entries(params).filter(([key, value]) => Object.hasOwn(initialQuotationQuery, key) && value !== '' && value != null));
}
export function quotationPage(data) {
  if (!Array.isArray(data?.items) || !Number.isFinite(data.totalCount)) throw new Error('Invalid quotation list response. Please retry.');
  return data;
}
