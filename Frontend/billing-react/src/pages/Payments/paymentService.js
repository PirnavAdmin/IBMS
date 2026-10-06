import { apiClient } from 'billing-api-client';

// Contracts: PaymentsController, PaymentContracts, PaymentMethod/PaymentStatus.
const base = '/api/v1/payments';
export const PAYMENT_METHODS = ['Cash', 'BankTransfer', 'UPI', 'Card', 'Cheque', 'Gateway', 'Custom'];
export const PAYMENT_STATUSES = ['Pending', 'Completed', 'Failed', 'Reversed'];
export const methodLabel = method => method === 'BankTransfer' ? 'Bank Transfer' : method;
export const methodFields = {
  Cash: [], BankTransfer: ['reference', 'bankName', 'accountLabel', 'transferDate'],
  UPI: ['reference', 'providerTransactionId', 'upiPayerMetadata'],
  Card: ['reference', 'providerName', 'providerTransactionId'],
  Cheque: ['chequeNumber', 'bankName', 'chequeDate', 'clearingStatus'],
  Gateway: ['providerName', 'providerTransactionId', 'reference', 'callbackStatus'],
  Custom: ['customMethodName', 'reference'],
};
export function paymentError(error) {
  const status = error?.response?.status ?? error?.status;
  const data = error?.response?.data;
  const fallback = { 400: 'Payment validation failed.', 401: 'Your session has expired. Please sign in.', 403: 'You do not have permission for this payment operation.', 404: 'Payment resource not found. It may be unavailable on this server.', 409: 'Payment conflict. Refresh the balance and review your payment again.' };
  if (!status) return error?.code === 'ECONNABORTED' ? 'Payment request timed out. Retry the same payment safely.' : error?.message === 'Invalid payment response.' ? error.message : 'Unable to reach the payment service. Check your connection and retry.';
  if (status >= 500) return 'The payment server could not complete the request. Please retry.';
  if (status === 401 || status === 403) return fallback[status];
  const messages = data?.errors && typeof data.errors === 'object' ? Object.values(data.errors).flat().filter(v => typeof v === 'string') : [];
  return messages.join(' ') || (typeof data?.message === 'string' ? data.message : '') || fallback[status] || 'Payment request failed.';
}
export function unwrapPayment(response) {
  if (response?.success !== true || response.data == null) throw Object.assign(new Error(response?.message || 'Invalid payment response.'), { status: 400, response: { status: 400, data: response } });
  return response.data;
}
export function mapPayment(data) {
  if (!data || !Number.isInteger(data.id) || !Number.isFinite(data.amount) || !Array.isArray(data.allocations)) throw new Error('Invalid payment response.');
  return { ...data, invoiceDisplay: data.invoiceNumbers?.length ? data.invoiceNumbers.join(', ') : data.invoiceNumber, methodDisplay: data.methodDisplay || methodLabel(data.method), auditHistory: data.auditHistory ?? [] };
}
export function mapBalance(data) {
  if (!data || !Number.isInteger(data.invoiceId) || ![data.invoiceTotal, data.previouslyPaid, data.currentOutstanding].every(Number.isFinite)) throw new Error('Invalid payment response.');
  return data;
}
export function paymentQuery(p) {
  return Object.fromEntries(Object.entries({ search: p.search?.trim(), status: p.status, method: p.method, fromDate: p.from, toDate: p.to, pageNumber: p.pageNumber, pageSize: p.pageSize, sortBy: p.sortBy, sortOrder: p.sortOrder }).filter(([,v]) => v !== '' && v != null));
}
export function createPaymentDto(form, invoice, idempotencyKey) {
  const dto = { invoiceId: invoice.invoiceId, customerId: invoice.customerId, currency: invoice.currency, paymentDate: `${form.date}T00:00:00Z`, amount: Number(form.amount), method: form.method, notes: form.notes.trim(), idempotencyKey };
  for (const field of methodFields[form.method] || []) {
    const value = form[field]?.trim();
    if (value) dto[field] = field.endsWith('Date') ? `${value}T00:00:00Z` : value;
  }
  return dto;
}
export function createAttemptManager(keyFactory = () => crypto.randomUUID()) {
  let attempt;
  return { keyFor(payload) { const signature = JSON.stringify(payload); if (!attempt || attempt.signature !== signature) attempt = { signature, key: keyFactory() }; return attempt.key; }, reset() { attempt = undefined; } };
}
export const paymentService = {
  async getPayments(params, { signal } = {}) {
    const page = unwrapPayment(await apiClient.get(base, { params: paymentQuery(params), signal }));
    if (!Array.isArray(page.items) || !Number.isFinite(page.totalCount) || !Number.isInteger(page.pageNumber) || !Number.isInteger(page.pageSize) || page.pageSize < 1) throw new Error('Invalid payment response.');
    return { ...page, items: page.items.map(mapPayment) };
  },
  async getPaymentById(id, { signal } = {}) { return mapPayment(unwrapPayment(await apiClient.get(`${base}/${encodeURIComponent(id)}`, { signal }))); },
  async createPayment(dto) { return mapPayment(unwrapPayment(await apiClient.post(base, dto))); },
  async reversePayment(id, reason, idempotencyKey) { return mapPayment(unwrapPayment(await apiClient.post(`${base}/${encodeURIComponent(id)}/reverse`, { reason: reason.trim(), idempotencyKey }))); },
  async getEligibleInvoices({ signal } = {}) { const data = unwrapPayment(await apiClient.get(`${base}/eligible-invoices`, { signal })); if (!Array.isArray(data)) throw new Error('Invalid payment response.'); return data.map(mapBalance).filter(invoice => invoice.isEligibleForPayment); },
  async getInvoiceBalance(id, { signal } = {}) { return mapBalance(unwrapPayment(await apiClient.get(`${base}/invoices/${encodeURIComponent(id)}/balance`, { signal }))); },
};
export const invalidatePaymentData = client => Promise.all(['payments', 'payment-invoices', 'payment-balance', 'invoices', 'invoice', 'dashboard', 'finance', 'financial', 'customers'].map(key => client.invalidateQueries({ queryKey: [key] })));
export const money = (amount, currency) => amount == null ? '\u2014' : new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount);
export const displayDate = (value) => {
  if (!value) return '\u2014';
  try {
    const raw = String(value).slice(0, 10);
    const parts = raw.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return raw;
  } catch {
    return value || '\u2014';
  }
};
export function paymentPermissions(user) {
  const list = value => (Array.isArray(value) ? value : [value]).filter(Boolean).flatMap(v => String(v).split(',')).map(v => v.trim().toLowerCase());
  const roles = list(user?.roles ?? user?.role); const permissions = list(user?.permissions);
  return { view: Boolean(user), create: Boolean(user), reverse: roles.some(role => ['superadmin','tenantadmin','admin','billingmanager','finance','financeadmin','accountant'].includes(role)) || permissions.some(permission => ['all','billing.admin','payment.reverse','payments.reverse'].includes(permission)) };
}

export function createSubmissionGuard() {
  let running = false;
  return { acquire() { if (running) return false; running = true; return true; }, release() { running = false; } };
}
