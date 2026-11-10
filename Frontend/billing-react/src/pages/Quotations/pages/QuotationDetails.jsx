import VerifiedOutlined from '@mui/icons-material/VerifiedOutlined';
import CalendarTodayOutlined from '@mui/icons-material/CalendarTodayOutlined';
import EventAvailableOutlined from '@mui/icons-material/EventAvailableOutlined';
import LinkOutlined from '@mui/icons-material/LinkOutlined';
import NotesOutlined from '@mui/icons-material/NotesOutlined';
import GavelOutlined from '@mui/icons-material/GavelOutlined';
import LocalOfferOutlined from '@mui/icons-material/LocalOfferOutlined';
import PercentOutlined from '@mui/icons-material/PercentOutlined';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';
import AccountBalanceWalletOutlined from '@mui/icons-material/AccountBalanceWalletOutlined';
import ArrowBack from '@mui/icons-material/ArrowBack';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import PersonOutline from '@mui/icons-material/PersonOutline';
import PrintOutlined from '@mui/icons-material/PrintOutlined';
import SaveOutlined from '@mui/icons-material/SaveOutlined';
import UndoOutlined from '@mui/icons-material/UndoOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { displayDate } from '../../../utils/localDate';
import { formatQuotationTimestamp } from '../utils/quotationDates';
import { apiClient } from 'billing-api-client/apiClient.js';
import { hasPermission } from '../../../utils/permissionUtils';
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

const formatCommunicationDate = value => formatQuotationTimestamp(value);

const amount = value => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
const exportWidthPx = Math.round((196 / 25.4) * 96);
const createBarcodePattern = value => `101${Array.from(String(value || 'QUOTATION'), character => character.charCodeAt(0).toString(2).padStart(8, '0')).join('0')}101`;
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
export function QuotationDetails({ quotation, tenantProfile = {}, onBack, onAction, onEdit }) {
  const canManageQuotes = typeof hasPermission === 'function' ? hasPermission('quotations.manage') : true;
  const canApproveQuotes = typeof hasPermission === 'function' ? hasPermission('quotations.approve') || canManageQuotes : true;
  const canEditQuotes = typeof hasPermission === 'function' ? hasPermission('quotations.edit') || canManageQuotes : true;
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
  const sellerName = tenantProfile.name || quotation.companyName || quotation.businessName || quotation.company?.name || quotation.business?.name || 'ACME ADMIN STORE';
  const sellerBrandName = sellerName
    .replace(/\btechnologies\b/gi, '')
    .replace(/\s+STORE$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const sellerInitial = Array.from(sellerBrandName.trim())[0]?.toLocaleUpperCase() || 'S';
  const sellerCompanyName = `${sellerBrandName} STORE`;
  const sellerAddress = makeAddress(tenantProfile.address || quotation.companyAddress || quotation.businessAddress || quotation.company?.address || quotation.business?.address || '12, Green Park Main Road, Kondapur, Hyderabad - 500084, Telangana, India');
  const sellerPhone = tenantProfile.phone || quotation.companyPhone || quotation.businessPhone || quotation.company?.phone || quotation.business?.phone || '1800 123 4567 | +91 98765 43210';
  const sellerEmail = tenantProfile.companyEmail || quotation.companyEmail || quotation.businessEmail || quotation.company?.email || quotation.business?.email || 'support@acmeadmin.com';
  const sellerTaxId = tenantProfile.taxId || quotation.companyTaxId || quotation.businessTaxId || quotation.company?.taxId || quotation.business?.taxId || '';
  const sellerWebsite = tenantProfile.website || quotation.companyWebsite || quotation.businessWebsite || quotation.company?.website || quotation.business?.website || 'www.acmeadmin.com';
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
  const quotationDate = displayDate(quotation.quotationDate);
  const invoiceTerms = [
    'Goods once sold are subject to store policy.',
    'Please check quantity and products before leaving the store.',
    'GST is applicable as per product category.',
    'Keep this invoice for returns and warranty claims.',
    'No exchange or refund on opened products.',
  ];
  const barcodePattern = createBarcodePattern(quotation.quoteNumber);
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
    setPdfBusy(true);
    setPdfError('');
    const fileName = `${String(quotation.quoteNumber || 'quotation').replace(/[^a-zA-Z0-9-_]/g, '-')}.pdf`;

    if (quotation.id) {
      try {
        const response = await apiClient.get(`/api/v1/quotations/${quotation.id}/pdf`, { responseType: 'blob' });
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        setPdfBusy(false);
        return;
      } catch (err) {
        console.warn('Server PDF download failed, falling back to client-side renderer', err);
      }
    }

    if (!invoiceRef.current) {
      setPdfError('The invoice is not ready to download.');
      setPdfBusy(false);
      return;
    }

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
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: 816 },
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
    window.print();
  };
  const actions = <div className="quote-header-actions">
    <button className="quote-btn secondary" aria-pressed={preview} onClick={() => setPreview(value => !value)}>{preview ? <><ArrowBack /> Back to details</> : <><VisibilityOutlined /> View quotation</>}</button>
    {quotation.status === 'Draft' && canEditQuotes && <><button className="quote-btn secondary" onClick={() => onEdit(quotation)}>Edit</button><button className="quote-btn primary" onClick={() => onAction('send', quotation)}>Send</button></>}
    {quotation.status === 'Sent' && canApproveQuotes && <button className="quote-btn primary" onClick={() => onAction('approve', quotation)}>Approve</button>}
    {quotation.status === 'Approved' && <button className="quote-btn primary" onClick={() => onAction('convert', quotation)}>Convert to Invoice</button>}
    {['Draft', 'Sent', 'Approved'].includes(quotation.status) && <button className="quote-btn danger" onClick={() => onAction('cancel', quotation)}>Cancel</button>}
  </div>;

  return <main className={`quotation-page quotation-details-page${preview ? ' is-preview' : ''}`}>
    <button className="quote-back workspace-back-button" onClick={onBack}><ArrowBack /> Back to quotations</button>
    <header className="quotation-header">
      <div><span className="quote-eyebrow">QUOTATION</span><h1>{quotation.quoteNumber} <QuotationStatusBadge status={quotation.status} /></h1></div>
      {actions}
    </header>
    <div className="quote-tabs">{['Details', 'Items', 'Communication'].map(name => <button className={tab === name ? 'active' : ''} key={name} onClick={() => setTab(name)}>{name}</button>)}</div>
    {tab === 'Details' && <section className="quote-card quote-details-combined" aria-label="Quotation overview">
      <section className="quote-card quote-details-content quote-overview-card" aria-label="Quotation details">
        <header className="quote-overview-heading"><span className="quote-overview-icon" aria-hidden="true"><DescriptionOutlined /></span><h2>Quotation details</h2></header>
        <dl className="quote-detail-list">
          <div><dt><DescriptionOutlined aria-hidden="true" />Quote number</dt><dd className="quote-detail-number">{quotation.quoteNumber || '\u2014'}</dd></div>
          <div><dt><VerifiedOutlined aria-hidden="true" />Status</dt><dd><QuotationStatusBadge status={quotation.status} /></dd></div>
          <div><dt><PersonOutline aria-hidden="true" />Customer</dt><dd>{customerName}{customer.code && <small>{customer.code}</small>}</dd></div>
          <div><dt><LinkOutlined aria-hidden="true" />Reference</dt><dd>{quotation.reference || 'Not provided'}</dd></div>
          <div><dt><CalendarTodayOutlined aria-hidden="true" />Quote date</dt><dd>{displayDate(quotation.quotationDate)}</dd></div>
          <div><dt><EventAvailableOutlined aria-hidden="true" />Valid until</dt><dd>{displayDate(quotation.validUntil)}</dd></div>
          {quotation.status === 'Converted' && quotation.convertedInvoiceId != null && <div className="quote-converted-reference"><dt><ReceiptLongOutlined aria-hidden="true" />Invoice reference</dt><dd>{hasPermission('invoices.view') ? <Link to={`/invoices/${quotation.convertedInvoiceId}`}>Invoice #{quotation.convertedInvoiceId} <span aria-hidden="true">&#8599;</span></Link> : `Invoice #${quotation.convertedInvoiceId}`}</dd></div>}
        </dl>
      </section>
      <section className="quote-card quotation-financial-summary" aria-label="Financial summary">
        <header className="quote-overview-heading"><span className="quote-overview-icon" aria-hidden="true"><ReceiptLongOutlined /></span><h2>Financial summary</h2></header>
        <dl className="quote-financial-rows">{[['Subtotal', totals.subtotal], ['Discount', -totals.discountAmount], ['Taxable Amount', totals.taxableAmount], ['Tax', totals.taxAmount], ['Charges', totals.chargesAmount]].map(([label, value]) => { const Icon = { Subtotal: ReceiptLongOutlined, Discount: LocalOfferOutlined, 'Taxable Amount': DescriptionOutlined, Tax: PercentOutlined, Charges: PaymentsOutlined }[label]; return <div key={label}><dt><Icon aria-hidden="true" />{label}</dt><dd>{currency(value)}</dd></div>; })}</dl>
        <div className="quote-grand-total"><span><AccountBalanceWalletOutlined aria-hidden="true" />Grand Total</span><strong>{currency(totals.totalAmount)}</strong></div>
      </section>
      <div className="quote-details-notes">
        <section className="quote-card quote-note-card"><h2><span className="quote-overview-icon" aria-hidden="true"><NotesOutlined /></span>Notes</h2><p>{quotation.notes || 'No notes added.'}</p></section>
        <section className="quote-card quote-note-card"><h2><span className="quote-overview-icon" aria-hidden="true"><GavelOutlined /></span>Terms &amp; Conditions</h2><p>{quotation.termsAndConditions || 'No terms added.'}</p></section>
      </div>
    </section>}
    {tab === 'Items' && <section className="quote-card"><div className="quote-table-wrap ibms-table-frame"><table className="quote-list-table"><thead><tr><th>Product</th><th>Description</th><th>Quantity</th><th>Unit Price</th><th>Discount</th><th>Tax</th><th>Total</th></tr></thead><tbody>{quotation.items.map(item => <tr key={item.id}><td>{item.productName}</td><td>{item.description}</td><td>{item.quantity}</td><td>{currency(item.unitPrice)}</td><td>{currency(item.discountAmount)}</td><td>{item.taxType} {item.taxRate}% ({currency(item.taxAmount)})</td><td>{currency(item.totalAmount)}</td></tr>)}</tbody></table></div>{quotation.charges?.length > 0 && <div className="quote-item-charges"><h2>Additional charges</h2><div className="quote-table-wrap ibms-table-frame"><table className="quote-list-table"><thead><tr><th>Charge</th><th>Type</th><th>Amount</th></tr></thead><tbody>{quotation.charges.map((charge, index) => { const amount = Number(charge.amount || 0); const total = charge.type === 'percentage' ? quotationTotals(quotation.items, quotation.invoiceDiscount, [charge]).chargesAmount : amount; return <tr key={charge.id || `${charge.name}-${index}`}><td>{charge.name || 'Additional charge'}</td><td>{charge.type === 'percentage' ? 'Percentage' : 'Fixed'}</td><td>{charge.type === 'percentage' ? `${amount}% (${currency(total)})` : currency(total)}</td></tr>; })}</tbody></table></div></div>}</section>}
    {tab === 'Communication' && <section className="quote-card"><h2>Communication history</h2>{quotation.communications?.length ? <div className="quote-table-wrap ibms-table-frame"><table className="quote-list-table"><thead><tr><th>Date</th><th>Type</th><th>Recipient</th><th>Subject</th><th>Status</th><th>Sent By</th><th>Message</th></tr></thead><tbody>{quotation.communications.map((entry, index) => <tr key={index}><td style={{ whiteSpace: 'nowrap' }}>{formatCommunicationDate(entry.date)}</td><td>{entry.type}</td><td>{entry.recipient}</td><td>{entry.subject}</td><td><QuotationStatusBadge status={entry.status} /></td><td>{entry.sentBy}</td><td>{entry.message}</td></tr>)}</tbody></table></div> : <p className="quote-state">No communication has been sent yet.</p>}</section>}
    <article ref={invoiceRef} className="quotation-print-sheet invoice-design-sheet" aria-label="Quotation document">
      <header className="invoice-brand-header">
        <div className="invoice-brand-block">
          <div className="invoice-brand-mark" role="img" aria-label={`${sellerBrandName} initial`}>{sellerInitial}</div>
          <div className="invoice-brand-copy">
            <div className="invoice-brand-title">{sellerBrandName}</div>
            <div className="invoice-brand-subtitle">STORE</div>
            <div className="invoice-brand-tagline">Wholesale&nbsp; • &nbsp;Retail&nbsp; • &nbsp;Bulk Supply</div>
          </div>
        </div>
        <div className="invoice-brand-contact">
          <strong>{sellerCompanyName}</strong>
          {sellerAddress && <div className="invoice-contact-row"><span className="invoice-contact-symbol">●</span>{sellerAddress}</div>}
          {sellerPhone && <div className="invoice-contact-row"><span className="invoice-contact-symbol">☎</span>Ph: {sellerPhone}</div>}
          {sellerEmail && <div className="invoice-contact-row"><span className="invoice-contact-symbol">✉</span>Email: {sellerEmail}</div>}
          {sellerTaxId && <div className="invoice-contact-row"><span className="invoice-contact-symbol">▣</span>GSTIN: {sellerTaxId}</div>}
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
            <svg className="invoice-barcode-lines" viewBox={`0 0 ${barcodePattern.length} 38`} preserveAspectRatio="none" aria-hidden="true">
              {[...barcodePattern].map((bit, index) => bit === '1' && <rect key={index} x={index} y="0" width="1" height="38" />)}
            </svg>
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
              <th>Tax (%)</th>
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
          <h2>For {sellerBrandName}</h2>
          {signature && <div className="invoice-signature has-saved-signature">
            <img className="invoice-saved-signature" src={signature} alt="Saved authorized signature" />
          </div>}
          {signature ? <div className="invoice-signature-controls">
            <button className="quote-btn secondary small" type="button" onClick={clearSignature}><DeleteOutline /> Clear</button>
          </div> : <div className="invoice-signature-editor">
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
              <button className="quote-btn secondary small" type="button" onClick={clearSignature} disabled={!signatureStrokes.length}><DeleteOutline /> Clear</button>
            </div>
          </div>}
          {signatureError && <p className="quote-error" role="alert">{signatureError}</p>}
          <div className="invoice-signature-caption">Authorized Signatory</div>
        </div>
      </div>

      <footer className="invoice-footer-strip">
        <div className="invoice-footer-brand"><span className="invoice-brand-mark" aria-hidden="true">{sellerInitial}</span><span><strong>{sellerBrandName}</strong><b>STORE</b></span></div>
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
