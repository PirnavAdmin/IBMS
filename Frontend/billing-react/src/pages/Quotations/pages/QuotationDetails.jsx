import { QuotationAudit } from '../components/QuotationAudit';
import { ArrowBack, PrintOutlined } from '@mui/icons-material';
import { useState } from 'react';
import { currency } from '../utils/quotationCalculations';
import { QuotationStatusBadge } from '../components/QuotationStatusBadge';
function formatCommunicationDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}
export function QuotationDetails({ quotation, onBack, onAction, onEdit }) {
  const [tab, setTab] = useState('Details');
  const totals = quotation;
  const actions = <div className="quote-header-actions">
    <button className="quote-btn secondary" onClick={() => window.print()}><PrintOutlined /> Print</button>
    {quotation.status === 'Draft' && <><button className="quote-btn secondary" onClick={() => onEdit(quotation)}>Edit</button><button className="quote-btn primary" onClick={() => onAction('send', quotation)}>Send</button></>}
    {quotation.status === 'Sent' && <button className="quote-btn primary" onClick={() => onAction('approve', quotation)}>Approve</button>}
    {quotation.status === 'Approved' && <button className="quote-btn primary" onClick={() => onAction('convert', quotation)}>Convert to Invoice</button>}
    {['Draft', 'Sent', 'Approved'].includes(quotation.status) && <button className="quote-btn danger" onClick={() => onAction('cancel', quotation)}>Cancel</button>}
  </div>;

  return <main className="quotation-page quotation-details-page">
    <button className="quote-back" onClick={onBack}><ArrowBack /> Back to quotations</button>
    <header className="quotation-header">
      <div><span className="quote-eyebrow">QUOTATION</span><h1>{quotation.quoteNumber} <QuotationStatusBadge status={quotation.status} /></h1><p>{quotation.customer.name} · {currency(totals.totalAmount)}</p></div>
      {actions}
    </header>
    <div className="quote-tabs">{['Details', 'Items', 'Communication', 'Audit'].map(name => <button className={tab === name ? 'active' : ''} key={name} onClick={() => setTab(name)}>{name}</button>)}</div>
    {tab === 'Details' && <section className="quote-card quote-details-combined">
      <div className="quote-details-content"><h2>Quotation details</h2><dl className="quote-detail-list">
        <div><dt>Quote number</dt><dd>{quotation.quoteNumber}</dd></div><div><dt>Customer</dt><dd>{quotation.customer.name} ({quotation.customer.code})</dd></div>
        <div><dt>Quote date</dt><dd>{quotation.quotationDate}</dd></div><div><dt>Valid until</dt><dd>{quotation.validUntil}</dd></div>
        <div><dt>Reference</dt><dd>{quotation.reference || '—'}</dd></div><div><dt>Status</dt><dd><QuotationStatusBadge status={quotation.status} /></dd></div>
      </dl><h3>Notes</h3><p>{quotation.notes || '—'}</p><h3>Terms & Conditions</h3><p>{quotation.termsAndConditions || '—'}</p></div>
      <section className="quotation-financial-summary"><h2>Financial summary</h2>{[['Subtotal', totals.subtotal], ['Discount', -totals.discountAmount], ['Taxable Amount', totals.taxableAmount], ['Tax', totals.taxAmount], ['Charges', totals.chargesAmount]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{currency(value)}</strong></div>)}<div className="quote-grand-total"><span>Grand Total</span><strong>{currency(totals.totalAmount)}</strong></div></section>
    </section>}
    {tab === 'Items' && <section className="quote-card"><div className="quote-table-wrap"><table className="quote-list-table"><thead><tr><th>Product</th><th>Description</th><th>Quantity</th><th>Unit Price</th><th>Discount</th><th>Tax</th><th>Total</th></tr></thead><tbody>{quotation.items.map(item => <tr key={item.id}><td>{item.productName}</td><td>{item.description}</td><td>{item.quantity}</td><td>{currency(item.unitPrice)}</td><td>{currency(item.discountAmount)}</td><td>{item.taxType} {item.taxRate}% ({currency(item.taxAmount)})</td><td>{currency(item.totalAmount)}</td></tr>)}</tbody></table></div></section>}
    {tab === 'Communication' && <section className="quote-card"><h2>Communication history</h2>{quotation.communications?.length ? <div className="quote-table-wrap"><table className="quote-list-table"><thead><tr><th>Date</th><th>Type</th><th>Recipient</th><th>Subject</th><th>Status</th><th>Sent By</th><th>Message</th></tr></thead><tbody>{quotation.communications.map((entry, index) => <tr key={index}><td style={{ whiteSpace: 'nowrap' }}>{formatCommunicationDate(entry.date)}</td><td>{entry.type}</td><td>{entry.recipient}</td><td>{entry.subject}</td><td><QuotationStatusBadge status={entry.status} /></td><td>{entry.sentBy}</td><td>{entry.message}</td></tr>)}</tbody></table></div> : <p className="quote-state">No communication has been sent yet.</p>}</section>}
    {tab === 'Audit' && <QuotationAudit key={quotation.id} entries={quotation.auditLogs || []} />}
    <article className="quotation-print-sheet">
      <header className="quotation-print-header"><span>QUOTATION</span><h1>{quotation.quoteNumber}</h1><p>{quotation.status}</p></header>
      <section className="quotation-print-details"><h2>Quotation details</h2><div><span>Customer</span><strong>{quotation.customer.name} ({quotation.customer.code})</strong></div><div><span>Quote date</span><strong>{quotation.quotationDate}</strong></div><div><span>Valid until</span><strong>{quotation.validUntil}</strong></div><div><span>Reference</span><strong>{quotation.reference || '—'}</strong></div></section>
      <section className="quotation-print-items"><h2>Items</h2><table><thead><tr><th>Product / Service</th><th>Description</th><th>Qty</th><th>Unit Price</th><th>Discount</th><th>Tax</th><th>Total</th></tr></thead><tbody>{quotation.items.map(item => <tr key={item.id}><td>{item.productName}</td><td>{item.description}</td><td>{item.quantity}</td><td>{currency(item.unitPrice)}</td><td>{currency(item.discountAmount)}</td><td>{item.taxType} {item.taxRate}%</td><td>{currency(item.totalAmount)}</td></tr>)}</tbody></table></section>
      <section className="quotation-print-summary"><h2>Financial summary</h2>{[['Subtotal', totals.subtotal], ['Discount', -totals.discountAmount], ['Taxable Amount', totals.taxableAmount], ['Tax', totals.taxAmount], ['Charges', totals.chargesAmount], ['Grand Total', totals.totalAmount]].map(([label, value]) => <div key={label} className={label === 'Grand Total' ? 'quotation-print-grand-total' : ''}><span>{label}</span><strong>{currency(value)}</strong></div>)}</section>
      {(quotation.notes || quotation.termsAndConditions) && <section className="quotation-print-notes"><h2>Notes & terms</h2>{quotation.notes && <p>{quotation.notes}</p>}{quotation.termsAndConditions && <p>{quotation.termsAndConditions}</p>}</section>}
    </article>
  </main>;
}
