import { apiClient } from '../../../../billing-api-client/apiClient.js';
import { auditQuery, readAuditPage } from './auditModel.js';

export async function getAuditActivity(filters, page, pageSize, signal) {
  const response = await apiClient.get('/api/Audit', { params: auditQuery(filters, page, pageSize), signal });
  return readAuditPage(response);
}

export async function getAuditFilterOptions(signal) {
  const response = await apiClient.get('/api/Audit/filter-options', { signal });
  const data = response?.data ?? response?.Data ?? response;
  return {
    entityNames: data?.entityNames ?? data?.EntityNames ?? [],
    actions: data?.actions ?? data?.Actions ?? [],
    userNames: data?.userNames ?? data?.UserNames ?? [],
    modules: data?.modules ?? data?.Modules ?? data?.entityNames ?? data?.EntityNames ?? [],
    eventNames: data?.eventNames ?? data?.EventNames ?? data?.actions ?? data?.Actions ?? [],
    performedBy: data?.performedBy ?? data?.PerformedBy ?? data?.userNames ?? data?.UserNames ?? [],
  };
}

