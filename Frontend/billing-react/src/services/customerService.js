import { apiClient } from '../../../billing-api-client/apiClient.js';

export const validCustomerId = (id) => /^[1-9]\d*$/.test(String(id)) && Number.isSafeInteger(Number(id));
const path = (id) => {
  if (!validCustomerId(id)) throw Object.assign(new Error('Invalid customer ID.'), { code: 'INVALID_ID' });
  return `/api/v1/customers/${id}`;
};
export function customerError(error) {
  const status = error.response?.status;
  const messages = { 400: 'Invalid customer data. Please check the form values.', 401: 'Your session has expired. Please login again.', 403: 'You do not have permission to access customer data.', 404: 'Customer not found.', 409: 'This customer was changed by another user. Reload before saving.' };
  const data = error.response?.data;
  const validationMessages = [400, 422].includes(status) && data && typeof data === 'object'
    ? [data.message, ...Object.values(data.errors || {}).flat()].filter(value => typeof value === 'string' && value.length <= 500 && !/[<>]/.test(value)) : [];
  const detail = validationMessages.join(' ') || messages[status] || 'Customer service is currently unavailable. Please try again.';
  const responseText = typeof error.response?.data === 'string' ? error.response.data : '';
  const ngrokCode = responseText.match(/ERR_NGROK_\d+/)?.[0];
  const codeLabel = status ? `HTTP ${status}` : 'Network Error';
  const message = `${codeLabel}${ngrokCode ? ` (${ngrokCode})` : ''}: ${detail}`;
  return Object.assign(new Error(message), { status, code: status === 404 ? 'NOT_FOUND' : error.code });
}
async function request(operation) {
  try {
    const response = await operation();
    if (response?.success === false) throw Object.assign(new Error('Request failed'), { response: { status: 400, data: response } });
    return response?.data ?? response;
  } catch (error) { throw customerError(error); }
}
const address = (value) => value ? { ...value, line1: value.addressLine1, line2: value.addressLine2 } : null;
export const mapCustomer = (c) => ({ ...c, status: c.isActive === true ? 'Active' : c.isActive === false ? 'Inactive' : null, createdAt: c.createdAtUtc, updatedAt: c.updatedAtUtc });
export function mapDetails(data) {
  if (!data?.customer) throw new Error('Customer service returned an invalid response. Please try again.');
  const addresses = [...(data.addresses || []), ...(data.customer.addresses || [])];
  return { ...data, customer: { ...mapCustomer(data.customer), billingAddress: address(data.billingAddress ?? addresses.find(a => a.addressType === 'Billing')), shippingAddress: address(data.shippingAddress ?? addresses.find(a => a.addressType === 'Shipping')) },
    financialSummary: data.financialSummary || {},
    invoices: (data.invoices || []).map(r => ({ ...r, date: r.issueDate, amount: r.totalAmount, paid: r.amountPaid, balance: r.balanceDue })),
    payments: (data.payments || []).map(r => ({ ...r, date: r.paymentDate, method: r.paymentMethod, reference: r.referenceNumber, currency: r.currency ?? data.financialSummary?.currency ?? data.customer.currency })) };
}
export async function getCustomers(params = {}) {
  const data = await request(() => apiClient.get('/api/v1/customers', { params }));
  if (!Array.isArray(data?.items)) throw new Error('Customer service returned an invalid list response. Please try again.');
  return { ...data, items: data.items.map(mapCustomer) };
}
export async function getCustomerById(id) { const url = path(id); return mapCustomer(await request(() => apiClient.get(url))); }
export async function getCustomerDetails(id) { const url = path(id); return mapDetails(await request(() => apiClient.get(`${url}/details`))); }
// Keep only fields actually supplied by audit; do not synthesize actors or changes.
export async function getCustomerAudit(id) {
  const url = path(id);
  const data = await request(() => apiClient.get(`${url}/audit`));
  const rows = Array.isArray(data) ? data : data?.items;
  if (!Array.isArray(rows)) throw new Error('Customer audit response is not supported. Please contact support.');
  const display = value => value != null && typeof value === 'object' ? JSON.stringify(value) : value;
  return rows.map((r, index) => ({ ...r, id: r.id ?? index, date: r.timestamp ?? r.createdAtUtc ?? r.date, user: display(r.user ?? r.userName), entity: r.entity ?? r.fieldName, oldValue: display(r.oldValue ?? r.oldValues), newValue: display(r.newValue ?? r.newValues ?? r.changes) }));
}
// Callers must supply a confirmed request DTO; response profile fields are not a write contract.
export const createCustomer = payload => request(() => apiClient.post('/api/v1/customers', payload));
export async function updateCustomer(id, payload) { const url = path(id); return request(() => apiClient.put(url, payload)); }
export async function deactivateCustomer(id) { const url = path(id); return request(() => apiClient.patch(`${url}/deactivate`)); }
