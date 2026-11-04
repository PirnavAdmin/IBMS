import { apiClient } from 'billing-api-client';
const base = '/api/v1/platform';
export function unwrapPlatform(response) {
  if (response?.success !== true || response.data == null) throw new Error(response?.message || 'Invalid platform API response.');
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
export function platformError(error) {
  const status = error?.response?.status;
  if (status === 401) return 'Your session expired. Please sign in again.';
  if (status === 403) return 'You do not have platform administration access.';
  if (status === 404) return 'The platform endpoint or record was not found.';
  const details = error?.response?.data;
  const messages = details?.errors && typeof details.errors === 'object' ? Object.values(details.errors).flat().filter(v => typeof v === 'string').join(' ') : '';
  return (status === 409 ? 'Conflict: ' : '') + (messages || details?.message || error?.message || 'Unable to complete the request.');
}
