import { useState } from 'react';
import { currency } from '../utils/quotationCalculations';
export function QuotationDialog({ type, quotation, onClose, onConfirm, error }) {
  const [reason,setReason]=useState('Customer requested cancellation');
  const [other,setOther]=useState('');
  if(!type||!quotation)return null;
  const labels={send:['Send quotation','Send Quotation'],approve:['Approve quotation','Approve'],convert:['Convert to invoice','Convert to Invoice'],cancel:['Cancel quotation','Cancel Quotation']};
  const [title,action]=labels[type], cancellationReason=reason==='Other'?other.trim():reason;
  return <div className="quote-dialog-backdrop"><section className="quote-dialog" role="dialog" aria-modal="true" aria-labelledby="quote-dialog-title">
    <h2 id="quote-dialog-title">{title}</h2><p><strong>{quotation.quoteNumber}</strong> for {quotation.customer.name}</p>
    {error&&<p className="quote-error" role="alert">{error}</p>}
    <dl><div><dt>Recipient</dt><dd>{quotation.customer.email||'Not provided'}</dd></div><div><dt>Amount</dt><dd>{currency(quotation.totalAmount)}</dd></div><div><dt>Valid until</dt><dd>{quotation.validUntil}</dd></div></dl>
    {type==='cancel'&&<label>Cancellation reason<select value={reason} onChange={e=>setReason(e.target.value)}>{['Customer requested cancellation','Pricing changed','Duplicate quotation','Expired requirement','Other'].map(v=><option key={v}>{v}</option>)}</select>{reason==='Other'&&<input value={other} onChange={e=>setOther(e.target.value)} placeholder="Enter cancellation reason"/>}</label>}
    <div className="quote-dialog-actions"><button className="quote-btn secondary" onClick={onClose}>Back</button><button disabled={type==='cancel'&&!cancellationReason} className={`quote-btn ${type==='cancel'?'danger':'primary'}`} onClick={()=>onConfirm(type==='cancel'?cancellationReason:undefined)}>{action}</button></div>
  </section></div>;
}
