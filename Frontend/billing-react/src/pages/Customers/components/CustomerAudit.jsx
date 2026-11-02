import { formatAuditChanges } from './customerAuditUtils';
import { CustomerTable } from './CustomerTable';
import { useCustomerAudit } from '../hooks/useCustomer';
import { CustomerState } from './CustomerShared';
import { displayDate } from './CustomerShared';
import Chip from '@mui/material/Chip';

export function CustomerAudit({ customerId }) {
  const query = useCustomerAudit(customerId);
  if (!query.isSuccess) return <CustomerState query={query} />;
  const rows = query.data;
  const actions = [...new Set(rows.map(r => r.action).filter(Boolean))];
  return <CustomerTable title="Audit History" rows={rows} columns={[
    { key: 'action', label: 'Action', render: row => row.action ? <Chip size="small" variant="outlined" label={row.action} /> : '—' }, { key: 'user', label: 'Performed By' }, { key: 'date', label: 'Timestamp', render: (row) => displayDate(row.date, true) }, { key: 'changes', label: 'Changes', render: formatAuditChanges },
  ]} emptyMessage="No customer activity available." selects={[{ key: 'action', label: 'Action', options: actions }, { key: 'user', label: 'User', options: [...new Set(rows.map((row) => row.user).filter(Boolean))].sort() }]}><p className="customer-note">Read-only history. Times are displayed in your local timezone.</p></CustomerTable>;
}
