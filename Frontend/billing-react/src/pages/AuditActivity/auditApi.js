import { apiClient } from '../../../../billing-api-client/apiClient.js';
import { auditQuery, readAuditPage } from './auditModel.js';

export async function getAuditActivity(filters, page, pageSize, signal) {
  const response = await apiClient.get('/api/Audit', { params: auditQuery(filters, page, pageSize), signal });
  return readAuditPage(response);
}

export async function getAuditFilterOptions(signal) {
  const response = await apiClient.get('/api/Audit/filter-options', { signal });
  if ((response?.success ?? response?.Success) !== true) throw new Error(response?.message || response?.Message || 'Unable to retrieve audit filter options.');
  const data = response?.data ?? response?.Data;
  if (!data || !['entityNames', 'actions', 'userNames'].every(key => {
    const values = data[key] ?? data[key[0].toUpperCase() + key.slice(1)];
    return Array.isArray(values) && values.every(value => typeof value === 'string');
  })) throw new Error('The audit API returned invalid filter options.');
  return {
    entityNames: [...new Set(data?.entityNames ?? data?.EntityNames ?? [])],
    actions: [...new Set(data?.actions ?? data?.Actions ?? [])],
    userNames: [...new Set(data?.userNames ?? data?.UserNames ?? [])],
    modules: data?.modules ?? data?.Modules ?? data?.entityNames ?? data?.EntityNames ?? [],
    eventNames: data?.eventNames ?? data?.EventNames ?? data?.actions ?? data?.Actions ?? [],
    performedBy: data?.performedBy ?? data?.PerformedBy ?? data?.userNames ?? data?.UserNames ?? [],
  };
}

