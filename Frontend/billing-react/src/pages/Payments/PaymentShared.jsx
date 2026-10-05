import { Alert, Breadcrumbs, Button, LinearProgress } from '@mui/material';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from 'billing-api-client';
import { paymentError, paymentPermissions } from './paymentService';
import '../../styles/Payments.css';

export function PaymentShell({ title, children, actions, subtitle }) {
  return <main className="payments-page"><Breadcrumbs aria-label="Breadcrumb"><Link to="/payments">Payments</Link><span>{title}</span></Breadcrumbs>
    <header className="payments-heading"><div><span className="payment-eyebrow">Billing workspace</span><h1>{title}</h1><p>{subtitle || ({ "Payment Management": "Record, track and manage customer payments.", "Record Payment": "Record a customer payment against an eligible invoice.", "Payment Details": "Review payment information, allocations and activity." }[title])}</p></div><div className="payment-actions">{actions}</div></header>{children}</main>;
}
export function PaymentValues({ values }) {
  return <dl className="payment-values">{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value == null || value === '' ? '\u2014' : value}</dd></div>)}</dl>;
}
export function PaymentState({ loading, error, empty, onRetry }) {
  if (loading && !error) return <div className="payment-loading" role="status"><LinearProgress />Loading payment data...</div>;
  return <>{error && <Alert className="payment-error" severity="error" action={onRetry && <Button onClick={onRetry}>Retry</Button>}>{typeof error === 'string' ? error : paymentError(error)}</Alert>}{empty && !error && <p className="payments-state">{empty}</p>}</>;
}
export function usePaymentUser() {
  const query = useQuery({ queryKey: ['payment-user'], queryFn: ({ signal }) => apiClient.get('/api/Auth/me', { signal }), retry: false, staleTime: 60000 });
  return { ...query, permissions: paymentPermissions(query.data) };
}

export function PaymentStatus({ status }) {
  return <span className="payment-status" data-status={status}>{status}</span>;
}
