import { ArrowBack, DeleteOutline, DescriptionOutlined, DownloadOutlined, EditOutlined, PersonOutline, PrintOutlined, SaveOutlined, UndoOutlined, VisibilityOutlined } from '@mui/icons-material';
import { useEffect, useRef, useState } from 'react';
import { currency, lineTotals, quotationTotals } from '../utils/quotationCalculations';
import { QuotationStatusBadge } from '../components/QuotationStatusBadge';

const wordsBelowHundred = value => {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  if (value < 20) return ones[value];
  return `${tens[Math.floor(value / 10)]}${value % 10 ? ` ${ones[value % 10]}` : ''}`;
};

function amountInWords(value) {
  const paiseTotal = Math.round((Number(value) || 0) * 100);
  const rupees = Math.floor(paiseTotal / 100);
  const paise = paiseTotal % 100;
  const chunkWords = amount => {
    if (amount < 100) return wordsBelowHundred(amount);
    if (amount < 1000) return `${wordsBelowHundred(Math.floor(amount / 100))} Hundred${amount % 100 ? ` ${wordsBelowHundred(amount % 100)}` : ''}`;
    for (const [unit, divisor] of [['Crore', 10000000], ['Lakh', 100000], ['Thousand', 1000]]) {
      if (amount >= divisor) {
        const whole = Math.floor(amount / divisor);
        const remainder = amount % divisor;
        return `${chunkWords(whole)} ${unit}${remainder ? ` ${chunkWords(remainder)}` : ''}`;
      }
    }
    return '';
  };
  const rupeeWords = chunkWords(rupees) || 'Zero';
  return `Rupees ${rupeeWords}${paise ? ` and ${chunkWords(paise)} Paise` : ''} Only`;
}

const makeAddress = value => typeof value === 'string'
  ? value
  : Object.values(value || {}).filter(part => typeof part === 'string' && part.trim()).join(', ');

function formatCommunicationDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}
const amount = value => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
const exportWidthPx = Math.round((196 / 25.4) * 96);
const exportHeightPx = Math.round((285 / 25.4) * 96);
function drawSignature(canvas, strokes) {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  const context = canvas.getContext('2d');
  context.scale(ratio, ratio);
  context.clearRect(0, 0, rect.width, rect.height);
  context.strokeStyle = '#173d70';
  context.fillStyle = '#173d70';
  context.lineWidth = 2.2;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  strokes.forEach(stroke => {
    if (!stroke.length) return;
    context.beginPath();
    context.moveTo(stroke[0].x * rect.width, stroke[0].y * rect.height);
    if (stroke.length === 1) {
      context.arc(stroke[0].x * rect.width, stroke[0].y * rect.height, context.lineWidth / 2, 0, Math.PI * 2);
      context.fill();
      return;
    }
    stroke.slice(1).forEach(point => context.lineTo(point.x * rect.width, point.y * rect.height));
    context.stroke();
  });
}
export function QuotationDetails({ quotation, onBack, onAction, onEdit }) {
  const [tab, setTab] = useState('Details');
  const [preview, setPreview] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [signature, setSignature] = useState('');
  const [signatureStrokes, setSignatureStrokes] = useState([]);
  const [signatureError, setSignatureError] = useState('');
  const invoiceRef = useRef(null);
  const signatureCanvasRef = useRef(null);
  const currentStrokeRef = useRef(null);
  const signatureStorageKey = `quotation-signature-${quotation.id || quotation.quoteNumber}`;
  const customer = quotation.customer || {};
  const customerName = customer.name || quotation.customerName || '—';
  const calculatedTotals = quotationTotals(
    quotation.items || [],
    quotation.invoiceDiscount || { type: 'percentage', value: 0 },
    (quotation.charges || []).map(charge => ({ ...charge, type: charge.type || 'fixed' })),
  );
  const totals = {
    ...calculatedTotals,
    ...quotation,
    subtotal: quotation.subtotal ?? calculatedTotals.subtotal,
    discountAmount: quotation.discountAmount ?? calculatedTotals.discountAmount,
    taxableAmount: quotation.taxableAmount ?? calculatedTotals.taxableAmount,
    taxAmount: quotation.taxAmount ?? calculatedTotals.taxAmount,
    chargesAmount: quotation.chargesAmount ?? calculatedTotals.chargesAmount,
    totalAmount: quotation.totalAmount ?? calculatedTotals.totalAmount,
  };
  const billingAddress = makeAddress(quotation.billingAddress || customer.billingAddress || quotation.customerAddress || '');
  const customerEmail = quotation.customerEmail || customer.email || '';
  const customerPhone = quotation.customerPhone || customer.phone || customer.mobile || '';
  const customerTaxId = String(quotation.customerGstin || customer.taxId || customer.taxInfo || '').replace(/^GSTIN\s*:\s*/i, '');
  const sellerName = quotation.companyName || quotation.businessName || quotation.company?.name || quotation.business?.name || 'ACME ADMIN STORE';
  const sellerAddress = makeAddress(quotation.companyAddress || quotation.businessAddress || quotation.company?.address || quotation.business?.address || '12, Green Park Main Road, Kondapur, Hyderabad - 500084, Telangana, India');
  const sellerPhone = quotation.companyPhone || quotation.businessPhone || quotation.company?.phone || quotation.business?.phone || '1800 123 4567 | +91 98765 43210';
  const sellerEmail = quotation.companyEmail || quotation.businessEmail || quotation.company?.email || quotation.business?.email || 'support@acmeadmin.com';
  const sellerWebsite = quotation.companyWebsite || quotation.businessWebsite || quotation.company?.website || quotation.business?.website || 'www.acmeadmin.com';
  const taxGroups = (quotation.items || []).reduce((groups, item) => {
    const tax = item.taxAmount ?? lineTotals(item).tax;
    const type = String(item.taxType || 'GST').toUpperCase();
    const rate = Number(item.taxRate || 0);
    const splitTaxes = ['GST', 'CGST', 'SGST'].includes(type);
    const entries = splitTaxes
      ? type === 'GST'
        ? [[`CGST (${rate / 2}%)`, Number(tax || 0) / 2], [`SGST (${rate / 2}%)`, Number(tax || 0) / 2]]
        : [[`${type} (${rate}%)`, Number(tax || 0)]]
      : [[`${item.taxType || 'Tax'}${item.taxRate != null ? ` (${item.taxRate}%)` : ''}`, Number(tax || 0)]];
    for (const [label, amount] of entries) groups.set(label, (groups.get(label) || 0) + amount);
    return groups;
  }, new Map());
  const formatDate = value => {
    if (!value) return '';
    const date = new Date(String(value).slice(0, 10) + 'T00:00:00');
    return Number.isNaN(date.getTime()) ? String(value) : [
      String(date.getDate()).padStart(2, '0'),
      String(date.getMonth() + 1).padStart(2, '0'),
      date.getFullYear(),
    ].join('-');
  };
  const quotationDate = formatDate(quotation.quotationDate);
  const invoiceTerms = [
    'Goods once sold are subject to store policy.',
    'Please check quantity and products before leaving the store.',
    'GST is applicable as per product category.',
    'Keep this invoice for returns and warranty claims.',
    'No exchange or refund on opened products.',
  ];
  useEffect(() => {
    try {
      setSignature(window.localStorage.getItem(signatureStorageKey) || '');
      setSignatureError('');
    } catch (error) {
      console.error('Could not load the saved quotation signature.', error);
      setSignatureError('Could not load the saved signature from this browser.');
    }
  }, [signatureStorageKey]);
  useEffect(() => {
    drawSignature(signatureCanvasRef.current, signatureStrokes);
  }, [signatureStrokes]);
  useEffect(() => {
    const canvas = signatureCanvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => drawSignature(canvas, signatureStrokes));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [signatureStrokes]);
  const signaturePoint = event => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };
  const startSignatureStroke = event => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    currentStrokeRef.current = [signaturePoint(event)];
    setSignatureStrokes(strokes => [...strokes, currentStrokeRef.current]);
  };
  const continueSignatureStroke = event => {
    if (!currentStrokeRef.current) return;
    currentStrokeRef.current.push(signaturePoint(event));
    drawSignature(signatureCanvasRef.current, signatureStrokes);
  };
  const finishSignatureStroke = () => {
    currentStrokeRef.current = null;
  };
  const saveSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas || !signatureStrokes.length) return;
    try {
      const saved = canvas.toDataURL('image/png');
      window.localStorage.setItem(signatureStorageKey, saved);
      setSignature(saved);
      setSignatureStrokes([]);
      setSignatureError('');
    } catch (error) {
      console.error('Could not save the quotation signature.', error);
      setSignatureError('Could not save the signature. Please try again.');
    }
  };
  const clearSignature = () => {
    currentStrokeRef.current = null;
    setSignatureStrokes([]);
    setSignature('');
    try {
      window.localStorage.removeItem(signatureStorageKey);
      setSignatureError('');
    } catch (error) {
      console.error('Could not clear the saved quotation signature.', error);
      setSignatureError('Could not clear the saved signature from this browser.');
    }
  };
  const undoSignatureStroke = () => {
    currentStrokeRef.current = null;
    setSignatureStrokes(strokes => strokes.slice(0, -1));
  };
  const downloadInvoice = async () => {
    if (!invoiceRef.current) {
      setPdfError('The invoice is not ready to download.');
      return;
    }

    setPdfBusy(true);
    setPdfError('');
    const invoice = invoiceRef.current;
    const originalStyle = invoice.getAttribute('style');
    try {
      invoice.classList.add('is-pdf-export');
      invoice.style.display = 'block';
      invoice.style.width = `${exportWidthPx}px`;
      invoice.style.maxWidth = 'none';
      invoice.style.margin = '0 auto';
      invoice.style.padding = '0';
      invoice.style.backgroundColor = '#fff';

      const { default: html2pdf } = await import('html2pdf.js');
      const fileName = `${String(quotation.quoteNumber || 'invoice').replace(/[^a-zA-Z0-9-_]/g, '-')}.pdf`;
      const worker = html2pdf()
        .set({
          margin: [6, 7, 6, 7],
          filename: fileName,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: [] },
        })
        .from(invoiceRef.current)
        .toCanvas();
      await worker;
      const canvas = await worker.get('canvas');
      const pdfWorker = worker.toPdf();
      await pdfWorker;
      const pdf = await pdfWorker.get('pdf');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const contentWidth = pageWidth - 14;
      const contentHeight = pageHeight - 12;
      const scale = Math.min(contentWidth / canvas.width, contentHeight / canvas.height);
      const imageWidth = canvas.width * scale;
      const imageHeight = canvas.height * scale;
      const image = canvas.toDataURL('image/jpeg', 0.98);

      for (let page = pdf.getNumberOfPages(); page > 1; page -= 1) pdf.deletePage(page);
      pdf.setPage(1);
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pageWidth, pageHeight, 'F');
      pdf.addImage(image, 'JPEG', (pageWidth - imageWidth) / 2, (pageHeight - imageHeight) / 2, imageWidth, imageHeight, undefined, 'FAST');
      pdf.save(fileName);
    } catch (error) {
      console.error('Failed to download quotation invoice PDF.', error);
      setPdfError('Could not download the invoice PDF. Please try again.');
    } finally {
      invoice.classList.remove('is-pdf-export');
      if (originalStyle === null) invoice.removeAttribute('style');
      else invoice.setAttribute('style', originalStyle);
      setPdfBusy(false);
    }
  };
  const printInvoice = () => {
    if (!invoiceRef.current) return;
    const invoice = invoiceRef.current;
    const originalStyle = invoice.getAttribute('style');
    invoice.classList.add('is-print-export');
    invoice.style.display = 'block';
    invoice.style.width = `${exportWidthPx}px`;
    invoice.style.maxWidth = 'none';
    invoice.style.margin = '0 auto';
    invoice.style.padding = '0';
    invoice.style.zoom = String(Math.min(1, exportHeightPx / invoice.scrollHeight));

    const restoreInvoice = () => {
      invoice.classList.remove('is-print-export');
      if (originalStyle === null) invoice.removeAttribute('style');
      else invoice.setAttribute('style', originalStyle);
      window.removeEventListener('afterprint', restoreInvoice);
    };
    window.addEventListener('afterprint', restoreInvoice);
    window.print();
  };
  const actions = <div className="quote-header-actions">
    <button className="quote-btn secondary" aria-pressed={preview} onClick={() => setPreview(value => !value)}>{preview ? <><ArrowBack /> Back to details</> : <><VisibilityOutlined /> View</>}</button>
    {quotation.status === 'Draft' && <><button className="quote-btn secondary" onClick={() => onEdit(quotation)}>Edit</button><button className="quote-btn primary" onClick={() => onAction('send', quotation)}>Send</button></>}
    {quotation.status === 'Sent' && <button className="quote-btn primary" onClick={() => onAction('approve', quotation)}>Approve</button>}
    {quotation.status === 'Approved' && <button className="quote-btn primary" onClick={() => onAction('convert', quotation)}>Convert to Invoice</button>}
    {['Draft', 'Sent', 'Approved'].includes(quotation.status) && <button className="quote-btn danger" onClick={() => onAction('cancel', quotation)}>Cancel</button>}
  </div>;

  return <main className={`quotation-page quotation-details-page${preview ? ' is-preview' : ''}`}>
    <button className="quote-back" onClick={onBack}><ArrowBack /> Back to quotations</button>
    <header className="quotation-header">
      <div><span className="quote-eyebrow">QUOTATION</span><h1>{quotation.quoteNumber} <QuotationStatusBadge status={quotation.status} /></h1></div>
      {actions}
    </header>
    <div className="quote-tabs">{['Details', 'Items', 'Communication'].map(name => <button className={tab === name ? 'active' : ''} key={name} onClick={() => setTab(name)}>{name}</button>)}</div>
    {tab === 'Details' && <section className="quote-card quote-details-combined">
      <div className="quote-details-content"><h2>Quotation details</h2><dl className="quote-detail-list">
        <div><dt>Quote number</dt><dd>{quotation.quoteNumber}</dd></div><div><dt>Customer</dt><dd>{quotation.customer.name} ({quotation.customer.code})</dd></div>
        <div><dt>Quote date</dt><dd>{quotation.quotationDate}</dd></div><div><dt>Valid until</dt><dd>{quotation.validUntil}</dd></div>
        <div><dt>Reference</dt><dd>{quotation.reference || '—'}</dd></div><div><dt>Status</dt><dd><QuotationStatusBadge status={quotation.status} /></dd></div>
        {quotation.status === 'Converted' && quotation.convertedInvoiceId != null && <div><dt>Invoice reference</dt><dd>{quotation.convertedInvoiceId}</dd></div>}
      </dl><h3>Notes</h3><p>{quotation.notes || '—'}</p><h3>Terms & Conditions</h3><p>{quotation.termsAndConditions || '—'}</p></div>
      <section className="quotation-financial-summary"><h2>Financial summary</h2>{[['Subtotal', totals.subtotal], ['Discount', -totals.discountAmount], ['Taxable Amount', totals.taxableAmount], ['Tax', totals.taxAmount], ['Charges', totals.chargesAmount]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{currency(value)}</strong></div>)}<div className="quote-grand-total"><span>Grand Total</span><strong>{currency(totals.totalAmount)}</strong></div></section>
    </section>}
    {tab === 'Items' && <section className="quote-card"><div className="quote-table-wrap"><table className="quote-list-table"><thead><tr><th>Product</th><th>Description</th><th>Quantity</th><th>Unit Price</th><th>Discount</th><th>Tax</th><th>Total</th></tr></thead><tbody>{quotation.items.map(item => <tr key={item.id}><td>{item.productName}</td><td>{item.description}</td><td>{item.quantity}</td><td>{currency(item.unitPrice)}</td><td>{currency(item.discountAmount)}</td><td>{item.taxType} {item.taxRate}% ({currency(item.taxAmount)})</td><td>{currency(item.totalAmount)}</td></tr>)}</tbody></table></div>{quotation.charges?.length > 0 && <div className="quote-item-charges"><h2>Additional charges</h2><div className="quote-table-wrap"><table className="quote-list-table"><thead><tr><th>Charge</th><th>Type</th><th>Amount</th></tr></thead><tbody>{quotation.charges.map((charge, index) => { const amount = Number(charge.amount || 0); const total = charge.type === 'percentage' ? quotationTotals(quotation.items, quotation.invoiceDiscount, [charge]).chargesAmount : amount; return <tr key={charge.id || `${charge.name}-${index}`}><td>{charge.name || 'Additional charge'}</td><td>{charge.type === 'percentage' ? 'Percentage' : 'Fixed'}</td><td>{charge.type === 'percentage' ? `${amount}% (${currency(total)})` : currency(total)}</td></tr>; })}</tbody></table></div></div>}</section>}
    {tab === 'Communication' && <section className="quote-card"><h2>Communication history</h2>{quotation.communications?.length ? <div className="quote-table-wrap"><table className="quote-list-table"><thead><tr><th>Date</th><th>Type</th><th>Recipient</th><th>Subject</th><th>Status</th><th>Sent By</th><th>Message</th></tr></thead><tbody>{quotation.communications.map((entry, index) => <tr key={index}><td style={{ whiteSpace: 'nowrap' }}>{formatCommunicationDate(entry.date)}</td><td>{entry.type}</td><td>{entry.recipient}</td><td>{entry.subject}</td><td><QuotationStatusBadge status={entry.status} /></td><td>{entry.sentBy}</td><td>{entry.message}</td></tr>)}</tbody></table></div> : <p className="quote-state">No communication has been sent yet.</p>}</section>}
    <article ref={invoiceRef} className="quotation-print-sheet invoice-design-sheet" aria-label="Quotation document">
      <header className="invoice-brand-header">
        <div className="invoice-brand-block">
          <div className="invoice-brand-mark" aria-hidden="true"><span className="invoice-brand-mark-shape" /></div>
          <div className="invoice-brand-copy">
            <div className="invoice-brand-title">{sellerName.replace(/\s+STORE$/i, '')}</div>
            <div className="invoice-brand-subtitle">STORE</div>
            <div className="invoice-brand-tagline">Wholesale&nbsp; • &nbsp;Retail&nbsp; • &nbsp;Bulk Supply</div>
          </div>
        </div>
        <div className="invoice-brand-contact">
          <strong>{sellerName}</strong>
          {sellerAddress && <div className="invoice-contact-row"><span className="invoice-contact-symbol">●</span>{sellerAddress}</div>}
          {sellerPhone && <div className="invoice-contact-row"><span className="invoice-contact-symbol">☎</span>Ph: {sellerPhone}</div>}
          {sellerEmail && <div className="invoice-contact-row"><span className="invoice-contact-symbol">✉</span>Email: {sellerEmail}</div>}
          {sellerWebsite && <div className="invoice-contact-row"><span className="invoice-contact-symbol">◎</span>{sellerWebsite}</div>}
        </div>
      </header>

      <section className="invoice-title-row">
        <div className="invoice-title-copy">
          <h1>QUOTATION</h1>
          <p>Quality Products&nbsp; | &nbsp;Best Prices&nbsp; | &nbsp;Trusted Always</p>
        </div>
        <div className="invoice-barcode-box">
          <div className="invoice-barcode">
            <span className="invoice-barcode-lines" aria-hidden="true" />
            <strong>{quotation.quoteNumber || '—'}</strong>
          </div>
        </div>
        <div className="invoice-meta-box">
          <div className="invoice-meta-line"><span>Quotation No</span><strong>{quotation.quoteNumber || '—'}</strong></div>
          <div className="invoice-meta-line"><span>Quotation Date</span><strong>{quotationDate || '—'}</strong></div>
        </div>
      </section>

      <div className="invoice-two-col invoice-customer-only">
        <section className="invoice-panel">
          <h2><PersonOutline aria-hidden="true" /> Bill To</h2>
          <div className="invoice-panel-body">
            <strong>{customerName}</strong>
            {billingAddress && <span>{billingAddress}</span>}
            <div className="invoice-detail-row"><span>GSTIN</span><strong>{customerTaxId || '—'}</strong></div>
            <div className="invoice-detail-row"><span>Mobile</span><strong>{customerPhone || '—'}</strong></div>
            <div className="invoice-detail-row"><span>Email</span><strong>{customerEmail || '—'}</strong></div>
          </div>
        </section>

      </div>

      <section className="invoice-items-wrap">
        <table className="invoice-items-table">
          <thead>
            <tr>
              <th>No.</th>
              <th>Item Description</th>
              <th>Qty</th>
              <th>Unit Price (₹)</th>
              <th>Discount (₹)</th>
              <th>GST (%)</th>
              <th>Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {(quotation.items || []).map((item, index) => {
              const line = lineTotals(item);
              return <tr key={item.id || `${item.productName}-${index}`}>
                <td>{index + 1}</td>
                <td><strong>{item.productName || item.description || '—'}</strong>{item.description && item.description !== item.productName && <span className="invoice-item-description">{item.description}</span>}</td>
                <td>{item.quantity || 0}</td>
                <td>{amount(item.unitPrice || 0)}</td>
                <td>{amount(line.discount)}</td>
                <td>{item.taxRate != null ? `${item.taxRate}%` : '—'}</td>
                <td>{amount(line.total)}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </section>

      <div className="invoice-total-row">
        <div className="invoice-summary-box">
          <div className="invoice-summary-row"><span>Sub Total</span><strong>{currency(totals.subtotal)}</strong></div>
          <div className="invoice-summary-row"><span>Total Discount</span><strong>{currency(totals.discountAmount)}</strong></div>
          <div className="invoice-summary-row"><span>Taxable Amount</span><strong>{currency(totals.taxableAmount)}</strong></div>
          {[...taxGroups].map(([label, amount]) => <div className="invoice-summary-row" key={label}><span>{label}</span><strong>{currency(amount)}</strong></div>)}
          {!taxGroups.size && totals.taxAmount > 0 && <div className="invoice-summary-row"><span>Tax</span><strong>{currency(totals.taxAmount)}</strong></div>}
          {(quotation.charges || []).map((charge, index) => {
            const chargeAmount = charge.type === 'percentage'
              ? quotationTotals(quotation.items || [], quotation.invoiceDiscount, [charge]).chargesAmount
              : Number(charge.amount || 0);
            return <div className="invoice-summary-row" key={charge.id || `${charge.name}-${index}`}>
              <span>{charge.name || 'Additional charge'}</span><strong>{currency(chargeAmount)}</strong>
            </div>;
          })}
          {!quotation.charges?.length && totals.chargesAmount > 0 && <div className="invoice-summary-row"><span>Additional Charges</span><strong>{currency(totals.chargesAmount)}</strong></div>}
          <div className="invoice-grand-total"><span>Total Payable</span><strong>{currency(totals.totalAmount)}</strong></div>
          <div className="invoice-amount-words"><strong>Amount in Words :</strong><span>{amountInWords(totals.totalAmount)}</span></div>
        </div>
      </div>

      <div className="invoice-terms-sign-row">
        <div className="invoice-terms-box">
          <h2><DescriptionOutlined aria-hidden="true" /> Terms &amp; Conditions</h2>
          <ol className="invoice-terms-copy">{invoiceTerms.map(term => <li key={term}>{term}</li>)}</ol>
        </div>
        <div className="invoice-sign-box">
          <h2><EditOutlined aria-hidden="true" /> For {sellerName}</h2>
          {signature && <div className="invoice-signature has-saved-signature">
            <img className="invoice-saved-signature" src={signature} alt="Saved authorized signature" />
          </div>}
          <div className="invoice-signature-editor">
            <canvas
              ref={signatureCanvasRef}
              aria-label="Draw authorized signature"
              onPointerDown={startSignatureStroke}
              onPointerMove={continueSignatureStroke}
              onPointerUp={finishSignatureStroke}
              onPointerCancel={finishSignatureStroke}
              onLostPointerCapture={finishSignatureStroke}
            />
            <div className="invoice-signature-controls">
              <button className="quote-btn primary small" type="button" onClick={saveSignature} disabled={!signatureStrokes.length}><SaveOutlined /> Save</button>
              <button className="quote-btn secondary small" type="button" onClick={undoSignatureStroke} disabled={!signatureStrokes.length}><UndoOutlined /> Undo</button>
              <button className="quote-btn secondary small" type="button" onClick={clearSignature} disabled={!signatureStrokes.length && !signature}><DeleteOutline /> Clear</button>
            </div>
            {signatureError && <p className="quote-error" role="alert">{signatureError}</p>}
          </div>
          <div className="invoice-signature-caption">Authorized Signatory</div>
        </div>
      </div>

      <footer className="invoice-footer-strip">
        <div className="invoice-footer-brand"><span className="invoice-brand-mark"><span className="invoice-brand-mark-shape" /></span><span><strong>{sellerName.replace(/\s+STORE$/i, '')}</strong><b>STORE</b></span></div>
        <div className="invoice-feature"><span aria-hidden="true">▣</span>Wholesale Prices</div>
        <div className="invoice-feature"><span aria-hidden="true">◇</span>Quality Products</div>
        <div className="invoice-feature"><span aria-hidden="true">♙</span>Bulk Purchasing</div>
        <div className="invoice-thanks">Thank You<br /><span>for shopping with us!</span></div>
      </footer>
    </article>
    {preview && <div className="invoice-document-actions">
      <button className="quote-btn secondary" onClick={printInvoice}><PrintOutlined /> Print</button>
      <button className="quote-btn primary" onClick={downloadInvoice} disabled={pdfBusy}>
        <DownloadOutlined /> {pdfBusy ? 'Preparing PDF…' : 'Download PDF'}
      </button>
      {pdfError && <p className="quote-error" role="alert">{pdfError}</p>}
    </div>}
  </main>;
}
