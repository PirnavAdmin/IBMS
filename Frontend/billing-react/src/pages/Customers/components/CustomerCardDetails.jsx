import { Alert, Button, CircularProgress, Skeleton } from '@mui/material';
import { PersonOffOutlined } from '@mui/icons-material';
import { useCustomer, useCustomerAudit } from '../hooks/useCustomer';
import { displayDate, formatCurrency } from './CustomerShared';

function RequestState({ query }) {
  if (query.isError) return <Alert severity="error">{query.error.message}<Button onClick={() => query.refetch()}>Retry</Button></Alert>;
  return <CircularProgress size={18} aria-label="Loading customer details" />;
}

export function InactivityReason({ customerId, compact = false }) {
  const query = useCustomerAudit(customerId);
  if (query.isPending) return <section className="customer-inactivity-reason" aria-label="Loading inactivity reason" aria-busy="true">
    <PersonOffOutlined aria-hidden="true" />
    <div><strong>{compact ? 'Loading reason…' : 'Why this customer is inactive'}</strong><Skeleton width="70%" /><Skeleton width="42%" /></div>
  </section>;
  if (query.isError) return <Alert className="customer-inactivity-error" severity="warning" action={<Button color="inherit" size="small" onClick={() => query.refetch()}>Retry</Button>}>
    Could not load the deactivation reason. {query.error.message}
  </Alert>;
  const latest = query.data
    .filter(row => String(row.action).toUpperCase() === 'DEACTIVATE')
    .sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0))[0];
  return <section className="customer-inactivity-reason" aria-label="Customer inactivity details">
    <PersonOffOutlined aria-hidden="true" />
    <div>
      <strong>{compact ? 'Reason recorded' : 'Why this customer is inactive'}</strong>
      <p>{latest?.changes || 'No deactivation reason was recorded for this customer.'}</p>
      {latest && <small>Deactivated {displayDate(latest.date, true)}{latest.user ? ` | ${latest.user}` : ''}</small>}
    </div>
  </section>;
}

function OutstandingInvoices({ customerId }) {
  const query = useCustomer(customerId);
  if (!query.isSuccess) return <RequestState query={query} />;
  const invoices = query.data.invoices.filter(row => row.balance > 0 && !['draft', 'cancelled', 'void'].includes(String(row.status).toLowerCase()))
    .sort((a, b) => (Date.parse(a.dueDate || a.date) || Infinity) - (Date.parse(b.dueDate || b.date) || Infinity));
  return <div className="customer-outstanding-invoices">
    {invoices.length ? <ol>{invoices.map(row => <li key={row.id}>
      <strong>{row.invoiceNumber || row.id}</strong>
      <span>Due: {displayDate(row.dueDate)}</span>
      <span>Total: {formatCurrency(row.amount, row.currency)} | Paid: {formatCurrency(row.paid, row.currency)}</span>
      <span>Outstanding: {formatCurrency(row.balance, row.currency)} | {row.status}</span>
    </li>)}</ol> : <p>No unpaid invoice details available.</p>}
  </div>;
}

export function CustomerCardDetails({ customerId, view, compact = false }) {
  return view === 'inactive' ? <InactivityReason customerId={customerId} compact={compact} /> : <OutstandingInvoices customerId={customerId} />;
}
