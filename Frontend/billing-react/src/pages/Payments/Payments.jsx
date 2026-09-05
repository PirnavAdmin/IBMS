import { PaymentsOutlined, Refresh } from '@mui/icons-material';
import { usePayments } from '../../hooks/usePayments';
import '../../styles/Payments.css';

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export const Payments = () => {
  const { payments, loading, error, retry } = usePayments();

  return <main className="payments-page">
    <header className="payments-heading">
      <div><span>Billing workspace</span><h1>Payments</h1><p>Temporary API integration preview using payment-shaped test records.</p></div>
      {!loading && <button onClick={retry}><Refresh /> Refresh</button>}
    </header>

    {loading && <div className="payments-state" role="status"><span className="payments-spinner" />Loading payments...</div>}
    {!loading && error && <div className="payments-error" role="alert"><strong>Network Error</strong><button onClick={retry}>Retry</button></div>}
    {!loading && !error && payments.length === 0 && <div className="payments-state">No payments found</div>}
    {!loading && !error && payments.length > 0 && <section className="payments-card">
      <div className="payments-card-title"><span><PaymentsOutlined /> Payment records</span><small>{payments.length} transactions</small></div>
      <div className="payments-table-wrap"><table><thead><tr><th>Customer</th><th>Invoice #</th><th>Method</th><th>Amount</th><th>Status</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id}><td><strong>{payment.customer}</strong><small>{payment.email}</small></td><td>{payment.invoiceNumber}</td><td>{payment.method}</td><td>{currency.format(payment.amount)}</td><td><span className="payments-status">{payment.status}</span></td></tr>)}</tbody></table></div>
    </section>}
  </main>;
};

export default Payments;
