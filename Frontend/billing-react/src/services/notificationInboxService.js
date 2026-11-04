import { apiClient, API_ENDPOINTS } from 'billing-api-client';
import { hasPermission } from '../utils/permissionUtils';

// Shared apiClient supplies VITE_API_BASE_URL, bearer auth and tenant headers.
const endpoints = API_ENDPOINTS.NOTIFICATION_INBOX;
const invalid = () => new Error('Notifications are unavailable right now. Please try again.');
function unwrap(response) {
  if (response?.success === false) throw invalid();
  return response?.data ?? response;
}
const count = value => Number.isSafeInteger(value) && value >= 0;
const timestamp = value => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
export function parseInboxPage(response) {
  const page = unwrap(response);
  if (!Array.isArray(page?.items) || page.items.length > 20 || !count(page.totalCount) || page.totalCount < page.items.length || !Number.isInteger(page.pageNumber) || page.pageNumber < 1 || page.pageSize !== 20 || !timestamp(page.snapshotAtUtc)) throw invalid();
  const seen = new Set();
  for (const item of page.items) {
    if (!item || !['string', 'number'].includes(typeof item.id) || !String(item.id) || seen.has(String(item.id)) || typeof item.title !== 'string' || !item.title.trim() || typeof item.message !== 'string' || typeof item.isRead !== 'boolean' || !timestamp(item.createdAtUtc)) throw invalid();
    seen.add(String(item.id));
  }
  return page;
}

// Only known app destinations are allowed. Never navigate to a server-supplied URL.
export function notificationDestination(action, user) {
  if (!action || !/^[A-Za-z0-9_-]+$/.test(String(action.entityId ?? ''))) return null;
  const routes = {
    invoices: ['invoices.view', '/invoices/'], payments: ['payments.view', '/payments/'],
    customers: ['customers.view', '/customers/'], 'credit-notes': ['creditnotes.view', '/credit-notes/'],
  };
  const route = Object.hasOwn(routes, action.module) ? routes[action.module] : null;
  return route && hasPermission(route[0], user) ? route[1] + encodeURIComponent(action.entityId) : null;
}

export const notificationInboxService = {
  async unreadCount(signal) {
    const data = unwrap(await apiClient.get(endpoints.UNREAD_COUNT, { signal }));
    if (!count(data?.unreadCount)) throw invalid();
    return data.unreadCount;
  },
  async list({ unreadOnly, pageNumber }, signal) {
    const page = parseInboxPage(await apiClient.get(endpoints.BASE, { signal, params: { unreadOnly, pageNumber, pageSize: 20 } }));
    if (page.pageNumber !== pageNumber) throw invalid();
    return page;
  },
  async markRead(id) { unwrap(await apiClient.patch(endpoints.MARK_READ(id), {})); },
  async markAllRead(throughCreatedAtUtc) { unwrap(await apiClient.patch(endpoints.MARK_ALL_READ, { throughCreatedAtUtc })); },
};
