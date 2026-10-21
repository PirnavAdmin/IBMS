import { apiClient } from 'billing-api-client';

const base = '/api/v1/webhooks/deliveries';
export const DELIVERY_STATUSES = ['Success', 'Retrying', 'Failed', 'DeadLetter', 'Pending'];
const sensitiveKey = key => /authorization|cookie|apikey|clientsecret|secret|signature|hmac|token|password|credential/i.test(String(key).replace(/[^a-z0-9]/gi, ''));
export function redactText(value) {
  return String(value ?? '').replace(/(\b(?:authorization|(?:set-)?cookie|x-ibms-signature)\s*:\s*)[^\r\n]*/gi, '$1[REDACTED]')
    .replace(/\bBearer\s+[^\s,;"'<>]+/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
    .replace(/((?:authorization|cookie|set-cookie|api[-_ ]?key|client[-_ ]?secret|secret[-_ ]?key|(?:hmac[-_ ]?)?signing[-_ ]?secret|secret|hmac|signature|access[-_ ]?token|refresh[-_ ]?token|password)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[REDACTED]');
}
function clean(value, depth = 0) {
  if (depth > 30) return '[Nested content omitted]';
  if (Array.isArray(value)) return value.map(item => clean(item, depth + 1));
  if (value && typeof value === 'object') {
    const headerEntry = sensitiveKey(Object.entries(value).find(([key]) => /^(name|key|header)$/i.test(key))?.[1] ?? '');
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [redactText(key), sensitiveKey(key) || (headerEntry && /^(value|values)$/i.test(key)) ? '[REDACTED]' : clean(item, depth + 1)]));
  }
  if (typeof value === 'string') {
    try { const nested = JSON.parse(value); if (nested && typeof nested === 'object') return clean(nested, depth + 1); } catch { /* Ordinary text inside a structured document. */ }
    return redactText(value);
  }
  return value;
}
export function safeDocument(value) {
  if (value == null || value === '') return 'Not provided';
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object') return 'Non-JSON content omitted for security.';
    return JSON.stringify(clean(parsed), null, 2);
  } catch { return 'Non-JSON content omitted for security.'; }
}
export function deliveryError(error) {
  const status = error?.response?.status ?? error?.status;
  if (!status) return error?.message?.startsWith('Invalid delivery') ? error.message : 'Backend unavailable. Check the network connection and ngrok tunnel, then retry.';
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return 'You do not have permission to view or replay webhook deliveries.';
  if (status >= 500) return 'The delivery service could not complete the request. Please try again.';
  if (error?.userMessage) return redactText(error.userMessage);
  const data = error?.response?.data;
  const errors = data?.errors && typeof data.errors === 'object' ? Object.values(data.errors).flat().filter(item => typeof item === 'string') : [];
  return redactText(errors.join(' ') || data?.message || data?.detail || ({ 400: 'Check the delivery filters or replay request.', 404: 'Delivery or webhook not found.', 409: 'This delivery changed. Refresh it before retrying.', 422: 'The request did not pass validation.' })[status] || 'The delivery request failed.');
}
function unwrap(response) {
  if (response?.success !== true || response.data == null) {
    // Retain only sanitized error text, never a raw response body.
    throw Object.assign(new Error(redactText(response?.message || 'Invalid delivery response.')), { status: 400, response: { status: 400, data: { message: redactText(response?.message || 'Invalid delivery response.'), errors: response?.errors?.map?.(redactText) } } });
  }
  return response.data;
}
async function request(operation) {
  try { return await operation(); }
  catch (error) {
    if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || error?.name === 'AbortError') throw error;
    const message = deliveryError(error);
    throw Object.assign(new Error(message), { userMessage: message, status: error?.response?.status ?? error?.status });
  }
}
export function mapDelivery(data, detail = false) {
  if (!Number.isInteger(data?.id) || !Number.isInteger(data.webhookId) || typeof data.eventId !== 'string' || typeof data.eventType !== 'string' || typeof data.status !== 'string' || !Number.isInteger(data.attemptNumber)) throw new Error('Invalid delivery response.');
  const mapped = { id: data.id, webhookId: data.webhookId, webhookName: redactText(data.webhookName ?? ''),
    eventId: redactText(data.eventId), eventType: redactText(data.eventType), status: data.status,
    responseStatusCode: data.responseStatusCode ?? null, attemptNumber: data.attemptNumber,
    maxAttempts: data.maxAttempts ?? null, createdAtUtc: data.createdAtUtc ?? null,
    deliveredAtUtc: data.deliveredAtUtc ?? null, nextRetryUtc: data.nextRetryUtc ?? null,
    failureReason: redactText(data.failureReason ?? ''), executionDurationMs: data.executionDurationMs ?? null };
  // Lists never retain payload/header/body data. Detail documents are sanitized before caching.
  return detail ? { ...mapped, payloadJson: safeDocument(data.payloadJson), requestHeadersJson: safeDocument(data.requestHeadersJson), responseBody: safeDocument(data.responseBody) } : mapped;
}
export function dateFilters(startDate, endDate) {
  return { ...(startDate ? { startDate: `${startDate}T00:00:00.000Z` } : {}), ...(endDate ? { endDate: `${endDate}T23:59:59.999Z` } : {}) };
}
export const deliveryService = {
  async list({ webhookId, eventType, status, startDate, endDate, pageNumber = 1, pageSize = 20 }, signal) {
    const data = unwrap(await request(() => apiClient.get(base, { signal, params: {
      ...(webhookId ? { webhookId: Number(webhookId) } : {}), ...(eventType ? { eventType } : {}),
      ...(status ? { status } : {}), ...dateFilters(startDate, endDate), pageNumber, pageSize,
    } })));
    if (!Array.isArray(data.items) || !Number.isInteger(data.totalCount) || data.totalCount < 0 ||
        !Number.isInteger(data.pageNumber) || data.pageNumber < 1 || !Number.isInteger(data.pageSize) || data.pageSize < 1 ||
        !Number.isInteger(data.totalPages) || data.totalPages < 0) throw new Error('Invalid delivery pagination response.');
    return { items: data.items.map(item => mapDelivery(item)), totalCount: data.totalCount, pageNumber: data.pageNumber, pageSize: data.pageSize, totalPages: data.totalPages };
  },
  async summary(signal) {
    const statuses = ['', 'Success', 'Retrying', 'Failed', 'DeadLetter'];
    const counts = await Promise.all(statuses.map(async status => (await deliveryService.list({ status, pageSize: 1 }, signal)).totalCount));
    return { Total: counts[0], Success: counts[1], Retrying: counts[2], Failed: counts[3], DeadLetter: counts[4] };
  },
  async get(id, signal) { return mapDelivery(unwrap(await request(() => apiClient.get(`${base}/${id}`, { signal }))), true); },
  async replay(id) {
    const data = unwrap(await request(() => apiClient.post(`${base}/${id}/replay`)));
    if (typeof data.success !== 'boolean' || typeof data.message !== 'string' || typeof data.status !== 'string' || !Number.isInteger(data.attemptNumber)) throw new Error('Invalid delivery replay response.');
    return { success: data.success, deliveryId: data.deliveryId, message: redactText(data.message), status: data.status, attemptNumber: data.attemptNumber };
  },
};
