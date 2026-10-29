import { apiClient } from 'billing-api-client';

const base = '/api/v1/webhooks';
export const WEBHOOK_STATUSES = ['Active', 'Disabled', 'Suspended'];
export const PAYLOAD_FORMATS = [
  { value: 'Standard', label: 'Standard JSON (Default / Zapier / Excel / REST API)' },
  { value: 'Slack', label: 'Slack Incoming Webhook (formatted message text)' },
  { value: 'Discord', label: 'Discord Webhook (channel content message)' },
  { value: 'Custom', label: 'Custom JSON Template (Field Mapping)' },
];

export function webhookError(error) {
  const status = error?.response?.status ?? error?.status;
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return 'You do not have permission to manage webhooks.';
  if (status >= 500) return 'The webhook service could not complete the request. Please try again.';
  const data = error?.response?.data;
  const messages = data?.errors && typeof data.errors === 'object'
    ? Object.values(data.errors).flat().filter(value => typeof value === 'string') : [];
  return messages.join(' ') || data?.message || data?.detail || ({
    400: 'Check the webhook details and try again.', 404: 'Webhook not found. Refresh the list.',
    409: 'The webhook changed. Reload its details before trying again.', 422: 'The webhook did not pass validation.',
  })[status] || error?.userMessage || error?.message || 'Unable to reach the webhook service.';
}

function unwrap(response) {
  if (response?.success !== true || response.data == null) throw Object.assign(new Error(response?.message || 'Invalid webhook response.'), { response: { status: 400, data: response } });
  return response.data;
}

export function mapWebhook(data) {
  if (!Number.isInteger(data?.id) || typeof data.name !== 'string' || typeof data.targetUrl !== 'string' ||
      !WEBHOOK_STATUSES.includes(data.status) || !Array.isArray(data.subscribedEvents) ||
      data.subscribedEvents.some(event => typeof event !== 'string') || !Number.isInteger(data.consecutiveFailureCount)) throw new Error('Invalid webhook response.');
  // Never pass raw secret fields through to query caches or detail views.
  return {
    id: data.id,
    applicationId: data.applicationId ?? null,
    applicationName: data.applicationName ?? null,
    name: data.name,
    targetUrl: data.targetUrl,
    subscribedEvents: [...data.subscribedEvents],
    customHeaders: data.customHeaders && typeof data.customHeaders === 'object' ? { ...data.customHeaders } : {},
    payloadFormat: typeof data.payloadFormat === 'string' && data.payloadFormat ? data.payloadFormat : 'Standard',
    customTemplate: data.customTemplate ?? '',
    status: data.status,
    consecutiveFailureCount: data.consecutiveFailureCount,
    lastTriggeredAtUtc: data.lastTriggeredAtUtc ?? null,
    createdAtUtc: data.createdAtUtc ?? null,
    updatedAtUtc: data.updatedAtUtc ?? null,
    secretKeyPreview: data.secretKeyPreview ?? ''
  };
}

export function validateWebhook(form) {
  const errors = {};
  if (!form.name?.trim()) errors.name = 'Webhook name is required.';
  try {
    const url = new URL(form.targetUrl?.trim());
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error();
  } catch {
    errors.targetUrl = 'Enter a valid HTTP or HTTPS destination URL.';
  }
  if (!form.subscribedEvents?.length) errors.subscribedEvents = 'Select at least one event.';
  if (form.payloadFormat === 'Custom' && !form.customTemplate?.trim()) {
    errors.customTemplate = 'Custom JSON template is required when Custom format is selected.';
  }
  return errors;
}

export function webhookDto(form) {
  return {
    applicationId: form.applicationId ?? null,
    name: form.name.trim(),
    targetUrl: form.targetUrl.trim(),
    subscribedEvents: [...form.subscribedEvents],
    customHeaders: form.customHeaders || {},
    payloadFormat: form.payloadFormat || 'Standard',
    customTemplate: form.payloadFormat === 'Custom' ? (form.customTemplate || '').trim() : null,
    status: form.status
  };
}

export const webhookService = {
  async list({ status, eventType, searchTerm, pageNumber = 1, pageSize = 20 }, signal) {
    const data = unwrap(await apiClient.get(base, { signal, params: {
      ...(status ? { status } : {}), ...(eventType ? { eventType } : {}),
      ...(searchTerm?.trim() ? { searchTerm: searchTerm.trim() } : {}), pageNumber, pageSize,
    } }));
    if (!Array.isArray(data.items) || !Number.isInteger(data.totalCount) || data.totalCount < 0 ||
        !Number.isInteger(data.pageNumber) || data.pageNumber < 1 || !Number.isInteger(data.pageSize) || data.pageSize < 1 ||
        !Number.isInteger(data.totalPages) || data.totalPages < 0) throw new Error('Invalid webhook pagination response.');
    return { items: data.items.map(mapWebhook), totalCount: data.totalCount, pageNumber: data.pageNumber, pageSize: data.pageSize, totalPages: data.totalPages };
  },
  async summary(signal) {
    const counts = await Promise.all(['', ...WEBHOOK_STATUSES].map(async status =>
      (await webhookService.list({ status, pageNumber: 1, pageSize: 1 }, signal)).totalCount));
    return { Total: counts[0], Active: counts[1], Disabled: counts[2], Suspended: counts[3] };
  },
  async events(signal) {
    const data = unwrap(await apiClient.get(`${base}/events`, { signal }));
    if (!Array.isArray(data) || data.some(event => !event.eventType || typeof event.category !== 'string' || typeof event.description !== 'string')) throw new Error('Invalid webhook event catalog response.');
    return data.map(event => ({ eventType: event.eventType, category: event.category, description: event.description }));
  },
  async get(id, signal) { return mapWebhook(unwrap(await apiClient.get(`${base}/${id}`, { signal }))); },
  async create(dto) { return mapWebhook(unwrap(await apiClient.post(base, dto))); },
  async update(id, dto) { return mapWebhook(unwrap(await apiClient.put(`${base}/${id}`, dto))); },
  async toggle(id) { return mapWebhook(unwrap(await apiClient.patch(`${base}/${id}/toggle-status`))); },
  async remove(id) { if (unwrap(await apiClient.delete(`${base}/${id}`)) !== true) throw new Error('Webhook deletion was not confirmed by the server.'); },
  async ping(id) {
    const data = unwrap(await apiClient.post(`${base}/${id}/ping`));
    if (typeof data.success !== 'boolean' || !Number.isInteger(data.statusCode) || !Number.isFinite(data.latencyMs) || typeof data.message !== 'string') throw new Error('Invalid webhook ping response.');
    return {
      success: data.success,
      statusCode: data.statusCode,
      latencyMs: data.latencyMs,
      message: data.message,
      responseBody: data.responseBody ?? '',
      requestHeaders: data.requestHeaders ?? '',
      requestPayload: data.requestPayload ?? ''
    };
  },
  async rotate(id) {
    // Imperative only: one-time credentials must not enter a React Query mutation cache.
    const data = unwrap(await apiClient.post(`${base}/${id}/rotate-secret`));
    if (typeof data.newSecretKey !== 'string' || !data.newSecretKey) throw new Error('The rotation response did not include the one-time secret. Contact your administrator before rotating again.');
    return data.newSecretKey;
  },
};
