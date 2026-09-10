import { CustomerTable } from './CustomerTable';
import { useCustomerAudit } from '../../hooks/useCustomer';
import { CustomerState } from './CustomerShared';
import { displayDate } from './CustomerShared';

export function CustomerAudit({ customerId }) {
  const query = useCustomerAudit(customerId);
  if (!query.isSuccess) return <CustomerState query={query} />;
  const rows = query.data;
  const actions = [...new Set(rows.map(r => r.action).filter(Boolean))];
  return <CustomerTable title="Audit History" rows={rows} columns={[
    { key: 'date', label: 'Timestamp', render: (row) => displayDate(row.date, true) }, { key: 'user', label: 'User' }, { key: 'action', label: 'Action' }, { key: 'changes', label: 'Changes' }, { key: 'oldValue', label: 'Old Value' }, { key: 'newValue', label: 'New Value' },
  ]} selects={[{ key: 'action', label: 'Action', options: actions }, { key: 'user', label: 'User', options: [...new Set(rows.map((row) => row.user).filter(Boolean))].sort() }]}><p className="customer-note">Read-only history. Date filters use UTC dates; times are displayed in your local timezone.</p></CustomerTable>;
}
