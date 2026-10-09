import { apiClient } from '../../../../billing-api-client/apiClient.js';
import { auditQuery, readAuditPage } from './auditModel.js';

export async function getAuditActivity(filters, page, pageSize, signal) {
  const response = await apiClient.get('/api/Audit', { params: auditQuery(filters, page, pageSize), signal });
  return readAuditPage(response);
}
