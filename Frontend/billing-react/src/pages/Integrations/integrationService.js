import { apiClient } from 'billing-api-client';

// IntegrationsController / IntegrationApplicationDtos / PagedResult contracts.
const base = '/api/v1/integrations';
export const REGISTRATION_FLAGS = ['AllowAutoReplay', 'SyncInvoices', 'BetaV2Api'];

export function integrationAccess(response) {
  const user = response?.data ?? response;
  const raw = user?.roles ?? user?.Roles ?? user?.role ?? user?.Role ?? [];
  return (Array.isArray(raw) ? raw : [raw]).flatMap(value => String(value).split(','))
    .some(role => ['tenantadmin', 'superadmin', 'user'].includes(role.trim().toLowerCase()));
}

export function integrationError(error) {
  const status = error?.response?.status ?? error?.status;
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return 'You do not have permission to manage integrations.';
  if (status >= 500) return 'The integration service could not complete the request. Please try again.';
  const data = error?.response?.data;
  const errors = data?.errors && typeof data.errors === 'object'
    ? Object.values(data.errors).flat().filter(value => typeof value === 'string') : [];
  if (errors.length) return errors.join(' ');
  if (status === 404) return data?.message || 'This application is no longer available. Refresh the list.';
  if (status === 400) return data?.message || 'Please check the application details and try again.';
  return error?.userMessage || error?.message || 'Unable to reach the integration service.';
}

function unwrap(response) {
  if (response?.success !== true || response.data == null) {
    throw Object.assign(new Error(response?.message || 'Invalid integration response.'), {
      response: { status: 400, data: response },
    });
  }
  return response.data;
}

export function mapApplication(data) {
  if (!data || !Number.isInteger(data.id) || typeof data.name !== 'string' ||
      typeof data.clientId !== 'string' || !['Active', 'Inactive'].includes(data.status) ||
      !data.featureFlags || typeof data.featureFlags !== 'object' || Array.isArray(data.featureFlags) ||
      Object.values(data.featureFlags).some(value => typeof value !== 'boolean')) {
    throw new Error('Invalid integration application response.');
  }
  // Explicit allow-list: raw credentials can never enter the list/detail query cache.
  return {
    id: data.id, name: data.name, description: data.description ?? '', clientId: data.clientId,
    status: data.status, featureFlags: { ...data.featureFlags },
    webhooksCount: Number.isInteger(data.webhooksCount) ? data.webhooksCount : null,
    createdAtUtc: data.createdAtUtc ?? null, updatedAtUtc: data.updatedAtUtc ?? null,
  };
}

export const integrationService = {
  async list({ status, searchTerm, pageNumber, pageSize }, signal) {
    const data = unwrap(await apiClient.get(base, { signal, params: {
      ...(status ? { status } : {}), ...(searchTerm?.trim() ? { searchTerm: searchTerm.trim() } : {}),
      pageNumber, pageSize,
    } }));
    if (!Array.isArray(data.items) || !Number.isInteger(data.totalCount) || data.totalCount < 0 ||
        !Number.isInteger(data.pageNumber) || data.pageNumber < 1 ||
        !Number.isInteger(data.pageSize) || data.pageSize < 1 ||
        !Number.isInteger(data.totalPages) || data.totalPages < 0) {
      throw new Error('Invalid integration pagination response.');
    }
    return { items: data.items.map(mapApplication), totalCount: data.totalCount,
      pageNumber: data.pageNumber, pageSize: data.pageSize, totalPages: data.totalPages };
  },
  async get(id, signal) { return mapApplication(unwrap(await apiClient.get(`${base}/${id}`, { signal }))); },
  async register(dto) {
    const data = unwrap(await apiClient.post(base, dto));
    if (!data.clientId || !data.clientSecret) throw new Error('Registration response did not include the one-time credentials. Do not register again; contact your administrator.');
    // Called imperatively, never through useMutation/useQuery or persistent draft storage.
    return { clientId: data.clientId, clientSecret: data.clientSecret };
  },
  async update(id, dto) { return mapApplication(unwrap(await apiClient.put(`${base}/${id}`, dto))); },
  async flags(id, featureFlags) {
    return mapApplication(unwrap(await apiClient.patch(`${base}/${id}/feature-flags`, { featureFlags })));
  },
  async toggle(id) { return mapApplication(unwrap(await apiClient.patch(`${base}/${id}/toggle-status`))); },
  async remove(id) {
    if (unwrap(await apiClient.delete(`${base}/${id}`)) !== true) throw new Error('Application deletion was not confirmed by the server.');
  },
};
