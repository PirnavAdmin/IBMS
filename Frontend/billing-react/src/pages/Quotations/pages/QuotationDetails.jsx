import { QuotationAudit } from '../components/QuotationAudit';
import { ArrowBack, PrintOutlined } from '@mui/icons-material';
import { useState } from 'react';
import { currency, quotationTotals } from '../utils/quotationCalculations';
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
  const customer = quotation.customer || {};
  const customerName = customer.name || quotation.customerName || '';
  const customerCode = customer.code || customer.customerCode || '';
  const billingAddress = quotation.billingAddress || customer.billingAddress || quotation.customerAddress || '';
  const shippingAddress = quotation.shippingAddress || customer.shippingAddress || '';
  const customerEmail = quotation.customerEmail || customer.email || '';
  const customerPhone = quotation.customerPhone || customer.phone || customer.mobile || '';
  const customerTaxId = quotation.customerGstin || customer.taxId || customer.taxInfo || '';
  const formatDate = value => {
    if (!value) return '';
    const date = new Date(String(value).slice(0, 10) + 'T00:00:00');
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };
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
    {tab === 'Items' && <section className="quote-card"><div className="quote-table-wrap"><table className="quote-list-table"><thead><tr><th>Product</th><th>Description</th><th>Quantity</th><th>Unit Price</th><th>Discount</th><th>Tax</th><th>Total</th></tr></thead><tbody>{quotation.items.map(item => <tr key={item.id}><td>{item.productName}</td><td>{item.description}</td><td>{item.quantity}</td><td>{currency(item.unitPrice)}</td><td>{currency(item.discountAmount)}</td><td>{item.taxType} {item.taxRate}% ({currency(item.taxAmount)})</td><td>{currency(item.totalAmount)}</td></tr>)}</tbody></table></div>{quotation.charges?.length > 0 && <div className="quote-item-charges"><h2>Additional charges</h2><div className="quote-table-wrap"><table className="quote-list-table"><thead><tr><th>Charge</th><th>Type</th><th>Amount</th></tr></thead><tbody>{quotation.charges.map((charge, index) => { const amount = Number(charge.amount || 0); const total = charge.type === 'percentage' ? quotationTotals(quotation.items, quotation.invoiceDiscount, [charge]).chargesAmount : amount; return <tr key={charge.id || `${charge.name}-${index}`}><td>{charge.name || 'Additional charge'}</td><td>{charge.type === 'percentage' ? 'Percentage' : 'Fixed'}</td><td>{charge.type === 'percentage' ? `${amount}% (${currency(total)})` : currency(total)}</td></tr>; })}</tbody></table></div></div>}</section>}
    {tab === 'Communication' && <section className="quote-card"><h2>Communication history</h2>{quotation.communications?.length ? <div className="quote-table-wrap"><table className="quote-list-table"><thead><tr><th>Date</th><th>Type</th><th>Recipient</th><th>Subject</th><th>Status</th><th>Sent By</th><th>Message</th></tr></thead><tbody>{quotation.communications.map((entry, index) => <tr key={index}><td style={{ whiteSpace: 'nowrap' }}>{formatCommunicationDate(entry.date)}</td><td>{entry.type}</td><td>{entry.recipient}</td><td>{entry.subject}</td><td><QuotationStatusBadge status={entry.status} /></td><td>{entry.sentBy}</td><td>{entry.message}</td></tr>)}</tbody></table></div> : <p className="quote-state">No communication has been sent yet.</p>}</section>}
    {tab === 'Audit' && <QuotationAudit key={quotation.id} entries={quotation.auditLogs || []} />}
    <article className="quotation-print-sheet" aria-label="Quotation document">
      <header className="quotation-print-header">
        <div className="quotation-print-brand"><span className="quotation-print-logo">IBMS</span><div><strong>IBMS</strong><span>Integrated Billing Management System</span></div></div>
        <div className="quotation-print-title"><p>QUOTATION</p><h1>{quotation.quoteNumber}</h1><QuotationStatusBadge status={quotation.status} /></div>
        <dl className="quotation-print-meta"><div><dt>Quotation date</dt><dd>{formatDate(quotation.quotationDate)}</dd></div><div><dt>Valid until</dt><dd>{formatDate(quotation.validUntil)}</dd></div>{quotation.reference && <div><dt>Reference</dt><dd>{quotation.reference}</dd></div>}</dl>
      </header>
      <section className="quotation-print-customer">
        <h2>Customer details</h2><div className="quotation-print-customer-grid">
          <div className="quotation-print-customer-primary"><strong>{customerName}</strong>{customerCode && <span>Customer code: {customerCode}</span>}{customerEmail && <span>{customerEmail}</span>}{customerPhone && <span>{customerPhone}</span>}{customerTaxId && <span>Tax / GST: {customerTaxId}</span>}</div>
          {billingAddress && <div><strong>Billing address</strong><p>{billingAddress}</p></div>}
          {shippingAddress && <div><strong>Shipping address</strong><p>{shippingAddress}</p></div>}
        </div>
      </section>
      <section className="quotation-print-items"><h2>Quotation items</h2><table><thead><tr><th>Product / Service</th><th>Description</th><th className="numeric">Quantity</th><th className="numeric">Unit price</th><th className="numeric">Discount</th><th>Tax</th><th className="numeric">Total</th></tr></thead><tbody>{quotation.items.map(item => <tr key={item.id}><td>{item.productName || item.productCode || '—'}</td><td>{item.description || ''}</td><td className="numeric">{item.quantity}</td><td className="numeric">{currency(item.unitPrice)}</td><td className="numeric">{currency(item.discountAmount)}</td><td>{[item.taxType, item.taxRate != null ? item.taxRate + '%' : '', item.taxAmount != null ? currency(item.taxAmount) : ''].filter(Boolean).join(' · ')}</td><td className="numeric">{currency(item.totalAmount)}</td></tr>)}</tbody></table></section>
      <section className="quotation-print-summary"><h2>Financial summary</h2><div className="quotation-print-summary-card">
        {totals.subtotal != null && <div><span>Subtotal</span><strong>{currency(totals.subtotal)}</strong></div>}
        {totals.discountAmount != null && <div><span>Total discount</span><strong>{currency(totals.discountAmount)}</strong></div>}
        {totals.taxableAmount != null && <div><span>Taxable amount</span><strong>{currency(totals.taxableAmount)}</strong></div>}
        {totals.taxAmount != null && <div><span>Total tax</span><strong>{currency(totals.taxAmount)}</strong></div>}
        {totals.chargesAmount != null && <div><span>Additional charges</span><strong>{currency(totals.chargesAmount)}</strong></div>}
        {totals.totalAmount != null && <div className="quotation-print-grand-total"><span>Grand total</span><strong>{currency(totals.totalAmount)}</strong></div>}
      </div></section>
      {(quotation.notes || quotation.termsAndConditions) && <section className="quotation-print-notes"><h2>Notes & terms</h2>{quotation.notes && <div><strong>Notes</strong><p>{quotation.notes}</p></div>}{quotation.termsAndConditions && <div><strong>Terms & conditions</strong><p>{quotation.termsAndConditions}</p></div>}</section>}
      <section className="quotation-print-signatures"><h2>Acknowledgement & signature</h2><div className="quotation-print-signature-grid">
        {['Prepared by / Authorized representative', 'Customer signature', 'Authorized company signature'].map(label => <div className="quotation-print-signature" key={label}><strong>{label}</strong><div className="quotation-print-sign-line"/><div className="quotation-print-sign-fields"><span>Name</span><span>Date</span></div></div>)}
        <div className="quotation-print-stamp"><strong>Company stamp</strong></div>
      </div></section>
      <footer className="quotation-print-footer"><span>Thank you for your business.</span><strong>IBMS | Integrated Billing Management System</strong></footer>
    </article>
  </main>;
}
