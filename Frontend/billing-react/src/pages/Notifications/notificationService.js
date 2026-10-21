import { apiClient, getUserFriendlyError } from 'billing-api-client';
import { errorPresentation } from '../../utils/errorPresentation';

export const EVENT_TYPES = ['InvoiceIssued', 'InvoiceSent', 'PaymentReceived', 'PaymentFailed', 'InvoiceOverdue', 'QuotationSent', 'CreditNoteIssued'];
export const HISTORY_STATUSES = ['Sent', 'Failed', 'Queued'];
export const eventLabel = value => value?.replace(/([a-z])([A-Z])/g, '$1 $2') || '—';
export const eventOptions = EVENT_TYPES.map(value => ({ value, label: eventLabel(value) }));
export const notificationError = error => errorPresentation(error?.userMessage || (error?.response ? getUserFriendlyError(error) : error?.message));

function unwrap(response) {
  if (response?.success !== true) throw new Error(response?.message || 'The notification service returned an invalid response.');
  return response.data;
}
function arrayData(response) {
  const data = unwrap(response);
  if (!Array.isArray(data)) throw new Error('The notification service returned an invalid list.');
  return data;
}
export function templatePayload(values, editing = false) {
  const { name, description, subjectTemplate, bodyTemplate, isActive } = values;
  const payload = { name, description: description ?? null, subjectTemplate, bodyTemplate, isActive: Boolean(isActive) };
  return editing ? payload : { ...payload, eventType: values.eventType, channel: 'Email' };
}
export const previewPayload = ({ eventType, subjectTemplate, bodyTemplate }) => ({ eventType, subjectTemplate, bodyTemplate });
export function historyParams(filters) {
  const params = { pageNumber: filters.pageNumber, pageSize: filters.pageSize };
  for (const key of ['eventType', 'status', 'searchTerm']) if (filters[key]?.trim()) params[key] = filters[key].trim();
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) throw new Error('To date must be on or after From date.');
  // Match the existing audit module's complete IST calendar-day boundaries.
  if (filters.startDate) params.startDate = new Date(`${filters.startDate}T00:00:00+05:30`).toISOString();
  if (filters.endDate) params.endDate = new Date(`${filters.endDate}T23:59:59.999+05:30`).toISOString().replace('.999Z', '.9999999Z');
  return params;
}
export function insertToken(text = '', token, start = text.length, end = start) {
  return { text: text.slice(0, start) + token + text.slice(end), cursor: start + token.length };
}

const templates = '/api/v1/notification-templates';
export const notificationService = {
  async getTemplates(params = {}, { signal } = {}) {
    const query = {};
    if (params.eventType) query.eventType = params.eventType;
    if (typeof params.isActive === 'boolean') query.isActive = params.isActive;
    return arrayData(await apiClient.get(templates, { params: query, signal }));
  },
  async getTemplateById(id, { signal } = {}) {
    const data = unwrap(await apiClient.get(`${templates}/${encodeURIComponent(id)}`, { signal }));
    if (!data || data.id == null || typeof data.subjectTemplate !== 'string' || typeof data.bodyTemplate !== 'string') throw new Error('The notification service returned an invalid template.');
    return data;
  },
  async createTemplate(data) { return unwrap(await apiClient.post(templates, templatePayload(data))); },
  async updateTemplate(id, data) { return unwrap(await apiClient.put(`${templates}/${encodeURIComponent(id)}`, templatePayload(data, true))); },
  async deleteTemplate(id) { return unwrap(await apiClient.delete(`${templates}/${encodeURIComponent(id)}`)); },
  async seedDefaults() { return unwrap(await apiClient.post(`${templates}/seed-defaults`, {})); },
  async getVariables(eventType, { signal } = {}) {
    return arrayData(await apiClient.get(`${templates}/variables/${encodeURIComponent(eventType)}`, { signal }));
  },
  async previewTemplate(payload, { signal } = {}) {
    const data = unwrap(await apiClient.post(`${templates}/preview`, previewPayload(payload), { signal }));
    if (typeof data?.renderedSubject !== 'string' || typeof data?.renderedBody !== 'string') throw new Error('The notification service returned an invalid preview.');
    return data;
  },
  async getHistory(params, { signal } = {}) {
    const data = unwrap(await apiClient.get('/api/v1/notifications/history', { params: historyParams(params), signal }));
    if (!Array.isArray(data?.items) || !Number.isInteger(data.totalCount) || data.totalCount < 0 || !Number.isInteger(data.pageNumber) || data.pageNumber < 1 || !Number.isInteger(data.pageSize) || data.pageSize < 1 || !Number.isInteger(data.totalPages) || data.totalPages < 0) throw new Error('The notification service returned an invalid history page.');
    return data;
  },
  async retryNotification(id) { return unwrap(await apiClient.post(`/api/v1/notifications/${encodeURIComponent(id)}/retry`, {})); },
};
