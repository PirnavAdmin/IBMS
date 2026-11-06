import { apiClient, getUserFriendlyError } from 'billing-api-client';
const base = '/api/v1/platform';
export function unwrapPlatform(response) {
  if (response?.success !== true || response.data == null) throw Object.assign(new Error(response?.message || 'Invalid platform API response.'), { response: { data: response } });
  return response.data;
}
export function platformPage(response) {
  const data = unwrapPlatform(response);
  if (!Array.isArray(data.items) || !Number.isInteger(data.totalCount) || !Number.isInteger(data.pageNumber) || !Number.isInteger(data.pageSize)) throw new Error('Invalid platform pagination response.');
  return data;
}
const get = async (path, params, signal, paged = false) => (paged ? platformPage : unwrapPlatform)(await apiClient.get(base + path, { params, signal }));
const write = async (method, path, payload) => unwrapPlatform(await apiClient[method](base + path, payload));
export const platformService = {
  dashboard: signal => get('/dashboard', undefined, signal),
  tenants: (params, signal) => get('/tenants', params, signal, true),
  tenant: (id, signal) => get('/tenants/' + encodeURIComponent(id), undefined, signal),
  createTenant: payload => write('post', '/tenants', payload),
  updateTenant: (id, payload) => write('put', '/tenants/' + encodeURIComponent(id), payload),
  tenantStatus: (id, payload) => write('patch', '/tenants/' + encodeURIComponent(id) + '/status', payload),
  users: (params, signal) => get('/users', params, signal, true),
  createUser: payload => write('post', '/users', payload),
  userStatus: (id, status) => write('patch', '/users/' + encodeURIComponent(id) + '/status', { status }),
  roles: signal => get('/roles', undefined, signal),
  assignRoles: (id, roles) => write('post', '/users/' + encodeURIComponent(id) + '/roles', { roles }),
  assignTenant: (id, payload) => write('put', '/users/' + encodeURIComponent(id) + '/assignment', payload),
  audit: (params, signal) => get('/audit', params, signal, true),
  settings: signal => get('/settings', undefined, signal),
  updateSettings: payload => write('put', '/settings', payload),
};
const errorText = value => typeof value === 'string' && !/<(?:!doctype|html|body)[\s>]/i.test(value) ? value.trim() : '';
const validationMessages = details => details?.errors && typeof details.errors === 'object'
  ? Object.values(details.errors).flat().map(errorText).filter(Boolean) : [];
export function platformFieldErrors(error, fields) {
  const errors = error?.response?.data?.errors;
  if (!errors || Array.isArray(errors) || typeof errors !== 'object') return {};
  const result = {};
  for (const [key, value] of Object.entries(errors)) {
    const name = key.split('.').pop().replace(/\[\d+\]/g, '').toLowerCase();
    const field = fields.find(item => item.name.toLowerCase() === name);
    const message = (Array.isArray(value) ? value : [value]).map(errorText).filter(Boolean).join(' ');
    if (field && message) result[field.name] = [result[field.name], message].filter(Boolean).join(' ');
  }
  return result;
}
export function platformError(error) {
  const status = error?.response?.status ?? error?.status;
  if (status === 401) return 'Your session expired. Please sign in again.';
  if (status === 403) return 'You do not have platform administration access.';
  if (status === 404) return 'The platform endpoint or record was not found.';
  if (status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (status >= 500) return 'Server is currently unavailable. Please try again later.';
  if (!status && (error?.request || ['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH'].includes(error?.code) || /network error|failed to fetch|unable to reach the server|no internet connection/i.test(error?.message || ''))) return getUserFriendlyError(error);
  const details = error?.response?.data;
  const message = validationMessages(details).join(' ') || errorText(details?.detail) || errorText(details?.message) || errorText(details?.title) || errorText(error?.userMessage) || errorText(error?.message);
  if (status === 409) return 'Conflict: ' + (message || 'This record changed. Refresh the page and try again.');
  return message || (status === 400 || status === 422 ? 'Check the entered values and try again.' : 'Unable to complete the request. Please try again.');
}
