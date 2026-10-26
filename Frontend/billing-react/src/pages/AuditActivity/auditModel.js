export const emptyAuditFilters = { entityName: '', userName: '', action: '', startDate: '', endDate: '' };

export function auditEventLabel(value) {
  if (!value) return '—';
  return String(value)
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim().split(/\s+/)
    .map(word => /^(PDF|SMS|API|GST|OTP)$/i.test(word) ? word.toUpperCase()
      : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

export function auditQuery(filters, page, pageSize) {
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
    throw new Error('The end date must be on or after the start date.');
  }
  const params = { Page: page, PageSize: pageSize };
  for (const [field, parameter] of [['entityName', 'EntityName'], ['userName', 'UserName'], ['action', 'Action']]) {
    if (filters[field]?.trim()) params[parameter] = filters[field].trim();
  }
  // Date fields represent complete Indian calendar days, converted to UTC for the API.
  if (filters.startDate) params.StartDate = new Date(`${filters.startDate}T00:00:00+05:30`).toISOString();
  if (filters.endDate) params.EndDate = new Date(`${filters.endDate}T23:59:59.999+05:30`).toISOString().replace('.999Z', '.9999999Z');
  return params;
}

export function readAuditPage(response) {
  const success = response?.success ?? response?.Success;
  const data = response?.data ?? response?.Data;
  if (success !== true) throw new Error(response?.message || response?.Message || 'Unable to retrieve audit activity.');
  const items = data?.items ?? data?.Items;
  const totalCount = data?.totalCount ?? data?.TotalCount;
  const pageNumber = data?.pageNumber ?? data?.PageNumber;
  const pageSize = data?.pageSize ?? data?.PageSize;
  const totalPages = data?.totalPages ?? data?.TotalPages;
  if (!Array.isArray(items) || !Number.isInteger(totalCount) || totalCount < 0
      || !Number.isInteger(pageNumber) || pageNumber < 1 || !Number.isInteger(pageSize) || pageSize < 1
      || !Number.isInteger(totalPages) || totalPages < 0) throw new Error('The audit API returned an invalid page.');
  return {
    items: items.map(row => Object.fromEntries(['Id', 'EntityName', 'EntityId', 'Action', 'UserName', 'Timestamp', 'Changes', 'OldValues', 'NewValues']
      .map(key => [key[0].toLowerCase() + key.slice(1), row[key[0].toLowerCase() + key.slice(1)] ?? row[key] ?? null]))),
    totalCount, pageNumber, pageSize, totalPages,
  };
}

export { displayDateTime as auditDate } from '../../utils/localDate.js';

export function auditSnapshot(value) {
  if (!value) return 'Not recorded';
  try {
    // Automated audits can contain complete snapshots, including credential fields.
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return JSON.stringify(parsed, (key, item) => /password|secret|token|securitystamp|otp/i.test(key) ? '[Redacted]' : item, 2);
  } catch { return 'Snapshot is not available as structured JSON.'; }
}

export function formatAuditChanges(value) {
  if (!value) return '';
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const status = parsed.status ?? parsed.newStatus;
      if (status != null && status !== '') {
        const readableStatus = String(status).replace(/([a-z])([A-Z])/g, '$1 $2');
        const actor = parsed.approvedBy || parsed.issuedBy || parsed.submittedBy || parsed.changedBy || parsed.userName;
        if (/^pending approval$/i.test(readableStatus) && actor && parsed.submittedBy) {
          return `Submitted for approval by ${actor}`;
        }
        const action = readableStatus.toLowerCase() === 'issued' ? 'Issued'
          : readableStatus.toLowerCase() === 'approved' ? 'Approved'
            : `Status changed to ${readableStatus}`;
        return actor ? `${action} by ${actor}` : action;
      }

      const summary = Object.entries(parsed)
        .filter(([, item]) => item !== null && item !== undefined && item !== '')
        .slice(0, 2)
        .map(([key, item]) => {
          const label = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
          return `${label.charAt(0).toUpperCase()}${label.slice(1)}: ${typeof item === 'object' ? JSON.stringify(item) : String(item)}`;
        })
        .join(' · ');
      return summary || 'Audit details recorded';
    }
  } catch {
    return String(value);
  }
  return String(value);
}

export function searchAuditPage(rows, search) {
  const term = search.trim().toLocaleLowerCase();
  return term ? rows.filter(row => [row.action, row.entityName, row.entityId, row.userName, row.changes]
    .some(value => String(value ?? '').toLocaleLowerCase().includes(term))) : rows;
}
