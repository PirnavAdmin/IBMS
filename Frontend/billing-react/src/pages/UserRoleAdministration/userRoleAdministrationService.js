import { apiClient } from 'billing-api-client';

const usersPath = '/api/Users';
const rolesPath = '/api/Roles';

function readEnvelope(response, label) {
  const success = response?.success ?? response?.Success;
  if (success !== true) {
    throw new Error(response?.message ?? response?.Message ?? `The ${label} API returned an unsuccessful response.`);
  }
  return response?.data ?? response?.Data;
}

function requiredArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`The ${label} API returned an invalid response.`);
  return value;
}

function readMutation(response, label) {
  const data = readEnvelope(response, label);
  return {
    data,
    message: response?.message ?? response?.Message ?? `${label} operation completed.`,
  };
}

export const userRoleAdministrationService = {
  async listUsers(params, { signal } = {}) {
    const response = await apiClient.get(usersPath, { params, signal });
    const data = readEnvelope(response, 'user');
    if (!Array.isArray(data)) throw new Error('The user API returned an invalid list response.');
    return {
      items: data,
      totalCount: Number(response?.totalCount ?? response?.TotalCount ?? data.length),
      pageNumber: Number(response?.pageNumber ?? response?.PageNumber ?? params.PageNumber ?? 1),
      pageSize: Number(response?.pageSize ?? response?.PageSize ?? params.PageSize ?? data.length),
    };
  },
  async getUser(id, { signal } = {}) {
    return readEnvelope(await apiClient.get(`${usersPath}/${encodeURIComponent(id)}`, { signal }), 'user');
  },
  async createUser(payload) {
    return readMutation(await apiClient.post(usersPath, payload), 'user');
  },
  async mapHostIdentity(payload) {
    return readMutation(await apiClient.post(`${usersPath}/host-identity`, payload), 'user');
  },
  async updateUser(id, payload) {
    return readMutation(await apiClient.put(`${usersPath}/${encodeURIComponent(id)}`, payload), 'user');
  },
  async setUserStatus(id, status) {
    return readMutation(await apiClient.patch(`${usersPath}/${encodeURIComponent(id)}/status`, { status }), 'user');
  },
  async assignUserRoles(id, roles) {
    return readMutation(await apiClient.post(`${usersPath}/${encodeURIComponent(id)}/roles`, { roles }), 'user');
  },
  async assignTenantApplication(id, tenantId, applicationId) {
    return readMutation(await apiClient.put(`${usersPath}/${encodeURIComponent(id)}/assignment`, { tenantId, applicationId }), 'user');
  },
  async deleteUser(id) {
    return readMutation(await apiClient.delete(`${usersPath}/${encodeURIComponent(id)}`), 'user');
  },
  async listRoles({ tenantId, signal } = {}) {
    const response = await apiClient.get(rolesPath, { params: tenantId ? { tenantId } : undefined, signal });
    return requiredArray(readEnvelope(response, 'role'), 'role');
  },
  async getRole(id, { signal } = {}) {
    return readEnvelope(await apiClient.get(`${rolesPath}/${encodeURIComponent(id)}`, { signal }), 'role');
  },
  async createRole(payload) {
    return readMutation(await apiClient.post(rolesPath, payload), 'role');
  },
  async updateRole(id, payload) {
    return readMutation(await apiClient.put(`${rolesPath}/${encodeURIComponent(id)}`, payload), 'role');
  },
  async deleteRole(id) {
    return readMutation(await apiClient.delete(`${rolesPath}/${encodeURIComponent(id)}`), 'role');
  },
  async listPermissions({ signal } = {}) {
    const response = await apiClient.get(`${rolesPath}/permissions`, { signal });
    return requiredArray(readEnvelope(response, 'permission'), 'permission');
  },
  async assignRolePermissions(id, permissions) {
    return readMutation(await apiClient.post(`${rolesPath}/${encodeURIComponent(id)}/permissions`, { permissions }), 'permission');
  },
};
