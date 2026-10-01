import { useState } from 'react';
import { Alert, Breadcrumbs, Button, LinearProgress } from '@mui/material';
import { Link } from 'react-router-dom';
import { unavailableMessage } from './paymentService';
import '../../styles/Payments.css';

export function PaymentShell({ title, children, actions }) {
  return <main className="payments-page"><Breadcrumbs aria-label="Breadcrumb"><Link to="/payments">Payments</Link><span>{title}</span></Breadcrumbs>
    <header className="payments-heading"><div><span>Billing workspace</span><h1>{title}</h1></div><div className="payment-actions">{actions}</div></header>{children}</main>;
}
export function PaymentValues({ values }) {
  return <dl className="payment-values">{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value == null || value === '' ? '\u2014' : value}</dd></div>)}</dl>;
}
export function PaymentState({ loading, error, empty, onRetry }) {
  if (loading) return <div role="status"><LinearProgress />Loading payment data...</div>;
  return <>{error && <Alert severity="info" action={onRetry && <Button onClick={onRetry}>Retry</Button>}>{error}</Alert>}{empty && <p className="payments-state">{empty}</p>}</>;
}
export function usePaymentRequest() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(unavailableMessage);
  const run = async operation => {
    setLoading(true); setError('');
    try { await operation(); }
    catch (err) { setError(err.code === 'PAYMENT_CONTRACT_UNAVAILABLE' ? unavailableMessage : 'Unable to load payment data. Please try again.'); }
    finally { setLoading(false); }
  };
  return { loading, error, run };
}
