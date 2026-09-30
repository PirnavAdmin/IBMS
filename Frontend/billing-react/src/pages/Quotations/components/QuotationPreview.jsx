import { currency } from '../utils/quotationCalculations';
export function QuotationPreview({ quotation: q }) {
  return <section className="quote-card" aria-label="Read-only quotation preview">
    <h2>Quotation preview</h2><p>{q.quoteNumber || 'Number assigned on save'} ? {q.customer?.name || 'Select a customer'}</p>
    <p>Quotation date: {q.quotationDate} ? Valid until: {q.validUntil}</p>
    <div className="quote-table-wrap"><table className="quote-list-table"><thead><tr>{['Product','Description','Quantity','Unit price','Discount','Tax','Total'].map(label=><th key={label}>{label}</th>)}</tr></thead>
      <tbody>{q.items.map((item,index)=><tr key={item.id||index}><td>{item.productName}</td><td>{item.description}</td><td>{item.quantity}</td><td>{currency(item.unitPrice)}</td><td>{currency(item.discountAmount)}</td><td>{currency(item.taxAmount)}</td><td>{currency(item.totalAmount)}</td></tr>)}</tbody>
    </table></div>
    <dl>{[['Subtotal',q.subtotal],['Discount',q.discountAmount],['Tax',q.taxAmount],['Charges',q.chargesAmount],['Grand Total',q.totalAmount]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{currency(value)}</dd></div>)}</dl>
    <h3>Notes</h3><p>{q.notes||'?'}</p><h3>Terms & Conditions</h3><p>{q.termsAndConditions||'?'}</p>
  </section>;
}
