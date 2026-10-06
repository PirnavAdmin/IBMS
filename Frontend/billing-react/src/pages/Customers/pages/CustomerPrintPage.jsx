import { Button, Skeleton } from "@mui/material";
import { Link as RouterLink, useParams } from "react-router-dom";
import { useCustomer } from "../hooks/useCustomer";
import { CustomerState } from "../components/CustomerShared";
import { formatCurrency, displayDate } from "../components/CustomerShared";
import "../styles/customer-details.css";

const value = (item) => item == null || item === "" ? "—" : item;
const addressFields = (address) => address ? [address.line1, address.line2, address.city, address.state, address.postalCode, address.country].filter(Boolean) : [];

function PrintSection({ title, children }) {
  return <section className="customer-print-section"><h2>{title}</h2>{children}</section>;
}

export function CustomerPrintPage() {
  const { customerId } = useParams();
  const query = useCustomer(customerId);
  const record = query.data;
  const customer = record?.customer;
  const summary = record?.financialSummary || {};
  if (query.isPending) return <main className="customer-page"><Skeleton height={80} /><Skeleton height={260} /></main>;
  if (query.isError) return <main className="customer-page"><CustomerState query={query} /><Button component={RouterLink} to={`/customers/${encodeURIComponent(customerId)}`}>Back to customer</Button></main>;

  return (
    <main className="customer-print-page">
      <div className="customer-print-toolbar">
        <Button component={RouterLink} to={`/customers/${encodeURIComponent(customerId)}`} variant="outlined">Back to Customer</Button>
        <Button variant="contained" onClick={() => window.print()}>Print Customer Details</Button>
      </div>
      <article className="customer-print-sheet">
        <header className="customer-print-header">
          <div className="customer-print-brand">CUSTOMER PROFILE</div>
          <div className="customer-print-title-row"><div><h1>{value(customer.name)}</h1><p>{value(customer.companyName)}</p></div><span className={`customer-print-status ${customer.isActive === false ? "inactive" : "active"}`}>{value(customer.status)}</span></div>
          <div className="customer-print-meta"><span>Customer ID <strong>{value(customer.customerCode)}</strong></span><span>Prepared {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span></div>
        </header>

        <PrintSection title="Contact & Account">
          <dl className="customer-print-grid">
            {[["Email", customer.email], ["Phone", customer.phone || customer.mobile], ["Website", customer.website], ["Customer Type", customer.customerType], ["Tax ID", customer.taxId || customer.gstin], ["Tax Registration", customer.taxRegistration], ["Currency", summary.currency || customer.currency], ["Payment Terms", customer.paymentTerms], ["Created", displayDate(customer.createdAt)]].map(([label, item]) => <div key={label}><dt>{label}</dt><dd>{value(item)}</dd></div>)}
          </dl>
        </PrintSection>

        <PrintSection title="Financial Summary">
          <div className="customer-print-summary">{[["Total Invoiced", summary.totalInvoiced], ["Total Paid", summary.totalPaid], ["Outstanding Balance", summary.outstandingBalance ?? customer.outstandingBalance], ["Credit Limit", summary.creditLimit ?? customer.creditLimit]].map(([label, amount]) => <div key={label}><span>{label}</span><strong>{amount == null ? "—" : formatCurrency(amount, summary.currency || customer.currency)}</strong></div>)}</div>
        </PrintSection>

        <PrintSection title="Addresses">
          <div className="customer-print-addresses">{[["Billing Address", customer.billingAddress], ["Shipping Address", customer.shippingAddress]].map(([title, address]) => <div key={title}><h3>{title}</h3>{addressFields(address).length ? addressFields(address).map((line, index) => <p key={`${title}-${index}`}>{line}</p>) : <p>Not provided</p>}</div>)}</div>
        </PrintSection>

        <PrintSection title={`Invoices (${record.invoices?.length || 0})`}>
          {record.invoices?.length ? <table className="customer-print-table"><thead><tr><th>Invoice</th><th>Date</th><th>Due Date</th><th>Status</th><th>Amount</th><th>Balance</th></tr></thead><tbody>{record.invoices.map((invoice, index) => <tr key={invoice.id || invoice.invoiceNumber || index}><td>{value(invoice.invoiceNumber)}</td><td>{displayDate(invoice.date)}</td><td>{displayDate(invoice.dueDate)}</td><td>{value(invoice.status)}</td><td>{formatCurrency(invoice.amount, invoice.currency)}</td><td>{formatCurrency(invoice.balance, invoice.currency)}</td></tr>)}</tbody></table> : <p className="customer-print-empty">No invoices recorded.</p>}
        </PrintSection>

        <PrintSection title={`Payments (${record.payments?.length || 0})`}>
          {record.payments?.length ? <table className="customer-print-table"><thead><tr><th>Reference</th><th>Date</th><th>Method</th><th>Invoice</th><th>Status</th><th>Amount</th></tr></thead><tbody>{record.payments.map((payment, index) => <tr key={payment.id || payment.paymentNumber || index}><td>{value(payment.paymentNumber)}</td><td>{displayDate(payment.date)}</td><td>{value(payment.method)}</td><td>{value(payment.invoiceNumber)}</td><td>{value(payment.status)}</td><td>{formatCurrency(payment.amount, payment.currency)}</td></tr>)}</tbody></table> : <p className="customer-print-empty">No payments recorded.</p>}
        </PrintSection>
        <footer className="customer-print-footer">Generated from the customer account record.</footer>
      </article>
    </main>
  );
}
