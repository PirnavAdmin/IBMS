import React from 'react';
import {
  Verified,
  AccountBalance,
  QrCode2,
  ContentCopy,
  CheckCircle,
  EmailOutlined,
  PhoneOutlined,
  LocationOnOutlined,
} from '@mui/icons-material';
import '../../../styles/InvoiceDocument.css';

/**
 * Format monetary amount with standard Indian formatting and 2 decimal places.
 */
export const formatCurrency = (val, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(val || 0));

/**
 * Convert numerical amount into words (Indian Currency System).
 */
export const numberToWords = (num) => {
  const n = Number(num);
  if (isNaN(n) || n <= 0) return 'Zero Rupees Only';

  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convertLessThanOneThousand = (val) => {
    let str = '';
    if (val >= 100) {
      str += a[Math.floor(val / 100)] + ' Hundred ';
      val %= 100;
    }
    if (val >= 20) {
      str += b[Math.floor(val / 10)] + (val % 10 ? ' ' + a[val % 10] : '');
    } else if (val > 0) {
      str += a[val];
    }
    return str.trim();
  };

  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);

  let result = '';
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const remainder = rupees % 1000;

  if (crore) result += convertLessThanOneThousand(crore) + ' Crore ';
  if (lakh) result += convertLessThanOneThousand(lakh) + ' Lakh ';
  if (thousand) result += convertLessThanOneThousand(thousand) + ' Thousand ';
  if (remainder) result += convertLessThanOneThousand(remainder) + ' ';

  result = result.trim() ? result.trim() + ' Rupees' : '';
  if (paise > 0) {
    const paiseStr = convertLessThanOneThousand(paise);
    result = result ? `${result} and ${paiseStr} Paise` : `${paiseStr} Paise`;
  }
  return result ? `${result} Only` : 'Zero Rupees Only';
};

/**
 * Format Date to standard corporate DD MMM YYYY.
 */
export const formatDocDate = (val) => {
  if (!val) return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val).slice(0, 10);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return String(val).slice(0, 10);
  }
};

/**
 * Safely resolve customer name whether customer is an object or string.
 */
export const resolveCustomerName = (inv) => {
  if (typeof inv?.customerName === 'string' && inv.customerName.trim()) return inv.customerName.trim();
  if (typeof inv?.customer === 'string' && inv.customer.trim()) return inv.customer.trim();
  if (inv?.customer && typeof inv.customer === 'object') {
    return (
      inv.customer.companyName ||
      inv.customer.name ||
      inv.customer.displayName ||
      `${inv.customer.firstName || ''} ${inv.customer.lastName || ''}`.trim() ||
      'Unnamed Customer'
    );
  }
  return 'Unnamed Customer';
};

/**
 * High-End Executive Invoice Document Component
 */
export const InvoiceDocument = ({ invoice, showControls = false, onPrint }) => {
  const [copied, setCopied] = React.useState(false);

  if (!invoice) return null;

  const invNumber = invoice.invoiceNumber || invoice.id || 'INV-DRAFT';
  const customerName = resolveCustomerName(invoice);
  const customerEmail =
    typeof invoice.customerEmail === 'string'
      ? invoice.customerEmail
      : typeof invoice.customer === 'object' && typeof invoice.customer?.email === 'string'
      ? invoice.customer.email
      : '';
  const customerPhone =
    typeof invoice.customerPhone === 'string'
      ? invoice.customerPhone
      : typeof invoice.customer === 'object' && typeof invoice.customer?.phone === 'string'
      ? invoice.customer.phone
      : '';
  const customerGstin =
    typeof invoice.customerGstin === 'string'
      ? invoice.customerGstin
      : typeof invoice.customer === 'object'
      ? invoice.customer?.taxId || invoice.customer?.gstin || ''
      : '';
  const billingAddress =
    typeof invoice.billingAddress === 'string'
      ? invoice.billingAddress
      : typeof invoice.customer === 'object'
      ? typeof invoice.customer?.billingAddress === 'string'
        ? invoice.customer.billingAddress
        : invoice.customer?.billingAddress?.addressLine1 || invoice.customer?.address || ''
      : '';

  const issueDate = invoice.invoiceDate || invoice.issueDate;
  const dueDate = invoice.dueDate;
  const currency = invoice.currency || 'INR';
  const status = (invoice.status || 'Draft').toLowerCase();

  // Financial Figures
  const items = Array.isArray(invoice.items) && invoice.items.length > 0 ? invoice.items : [];
  const calculatedSubtotal = items.reduce((acc, i) => {
    const q = Number(i.quantity || 1);
    const r = Number(i.unitPrice || i.rate || 0);
    return acc + q * r;
  }, 0);

  const subtotal = Number(invoice.subtotal ?? (calculatedSubtotal > 0 ? calculatedSubtotal : Number(invoice.total || 0)));
  const discountAmount = Number(invoice.discountAmount ?? invoice.discount ?? 0);
  const taxAmount = Number(invoice.taxAmount ?? invoice.tax ?? 0);
  const chargesAmount = Number(invoice.chargesAmount ?? invoice.charges ?? invoice.shippingFee ?? 0);
  const grandTotal = Number(
    invoice.totalAmount ?? invoice.total ?? invoice.grandTotal ?? Math.max(0, subtotal - discountAmount + taxAmount + chargesAmount)
  );
  const paidAmount = Number(invoice.paidAmount || 0);
  const balanceAmount = Number(invoice.balanceAmount ?? Math.max(0, grandTotal - paidAmount));

  // Statutory Tax Split (CGST + SGST for intrastate, or unified GST)
  const taxableBase = Math.max(0, subtotal - discountAmount);
  const cgstAmount = taxAmount > 0 ? taxAmount / 2 : 0;
  const sgstAmount = taxAmount > 0 ? taxAmount / 2 : 0;

  const handleCopyNumber = () => {
    navigator.clipboard?.writeText(invNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <article className="executive-invoice-sheet" id="printable-invoice-sheet">
      {/* Visual Watermark for Status */}
      {status === 'paid' && (
        <div className="inv-watermark-stamp">
          ✓ Paid in Full
        </div>
      )}
      {status === 'overdue' && (
        <div className="inv-watermark-stamp overdue">
          Overdue
        </div>
      )}
      {status === 'draft' && (
        <div className="inv-watermark-stamp draft">
          Draft Copy
        </div>
      )}

      {/* 1. Header & Brand Identity */}
      <header className="inv-doc-header">
        <div className="inv-brand-lockup">
          <div className="inv-brand-crest" aria-hidden="true">
            IB
          </div>
          <div>
            <h1 className="inv-company-name">IBMS Enterprise Financial Systems Ltd.</h1>
            <div className="inv-company-subtitle">Global Cloud, Technology &amp; Treasury Infrastructure</div>
            <p className="inv-company-coords">
              Tower 4, Cyber Gateway, Madhurawada, Visakhapatnam, AP 530048, India<br />
              <strong>CIN:</strong> U72200AP2026PTC099881 • <strong>GSTIN:</strong> 37AAACB2026A1Z5 • <strong>PAN:</strong> AACB2026A<br />
              Email: <em>finance@ibms-enterprise.com</em> • Desk: +91 (891) 400-8800
            </p>
          </div>
        </div>

        <div className="inv-tax-badge-block">
          <div className="inv-doc-type-pill">
            <Verified sx={{ fontSize: 16, color: '#d4a373' }} />
            TAX INVOICE
          </div>
          <div className="inv-doc-copy-tag">ORIGINAL FOR RECIPIENT</div>
          <div style={{ fontSize: '0.75rem', color: '#7a6e64' }}>Issued under Rule 48, CGST Rules</div>
        </div>
      </header>

      {/* 2. Structured 4-Column Metadata Ribbon */}
      <section className="inv-meta-ribbon" aria-label="Invoice Metadata">
        <div className="inv-meta-col">
          <span className="inv-meta-label">Invoice Number</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="inv-meta-val mono">{invNumber}</span>
            <button
              onClick={handleCopyNumber}
              className="no-print"
              title="Copy Invoice Number"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px',
                color: copied ? '#00814d' : '#8c7d71',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {copied ? <CheckCircle sx={{ fontSize: 15 }} /> : <ContentCopy sx={{ fontSize: 15 }} />}
            </button>
          </div>
        </div>

        <div className="inv-meta-col">
          <span className="inv-meta-label">Date of Issue</span>
          <span className="inv-meta-val">{formatDocDate(issueDate)}</span>
        </div>

        <div className="inv-meta-col">
          <span className="inv-meta-label">Payment Due Date</span>
          <span className="inv-meta-val" style={{ color: status === 'overdue' ? '#c93b2b' : '#211915' }}>
            {formatDocDate(dueDate)}
          </span>
        </div>

        <div className="inv-meta-col">
          <span className="inv-meta-label">PO / Reference No.</span>
          <span className="inv-meta-val mono">
            {invoice.poNumber || invoice.reference || 'PO-2026-STD'}
          </span>
        </div>
      </section>

      {/* 3. Client & Remittance Cards */}
      <section className="inv-parties-grid" aria-label="Parties Information">
        {/* Billed To */}
        <div className="inv-party-card">
          <div className="inv-party-label">
            <LocationOnOutlined sx={{ fontSize: 15 }} />
            Billed To (Client Recipient)
          </div>
          <h2 className="inv-party-name">{customerName}</h2>
          <p className="inv-party-address">
            {billingAddress || 'Corporate Address on record with Finance Department'}
          </p>
          {customerEmail && (
            <div className="inv-party-detail">
              <EmailOutlined sx={{ fontSize: 14, color: '#8c7d71' }} />
              <span>{customerEmail}</span>
            </div>
          )}
          {customerPhone && (
            <div className="inv-party-detail">
              <PhoneOutlined sx={{ fontSize: 14, color: '#8c7d71' }} />
              <span>{customerPhone}</span>
            </div>
          )}
          {customerGstin && (
            <div className="inv-gstin-chip">
              GSTIN: {customerGstin}
            </div>
          )}
        </div>

        {/* Remittance & Bank Coordinates */}
        <div className="inv-party-card">
          <div className="inv-party-label">
            <AccountBalance sx={{ fontSize: 15 }} />
            Payment Destination &amp; Remittance
          </div>
          <h2 className="inv-party-name" style={{ fontSize: '1.02rem' }}>
            IBMS Enterprise Financial Systems Ltd.
          </h2>
          <div style={{ fontSize: '0.82rem', color: '#594d44', lineHeight: 1.6, marginTop: '4px' }}>
            <div><strong>Bank:</strong> HDFC Bank Ltd. (Corporate Banking Branch)</div>
            <div><strong>A/C No.:</strong> <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>50200084929842</span> (Current Account)</div>
            <div><strong>IFSC / RTGS:</strong> <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>HDFC0000429</span> • <strong>SWIFT:</strong> HDFCINBBXXX</div>
            <div><strong>Payment Terms:</strong> {invoice.paymentTerms || 'Net 30 Days'}</div>
            <div style={{ marginTop: '4px' }}>
              <span className="inv-gstin-chip" style={{ background: '#e9f5ee', color: '#00663d', borderColor: '#c4e8d3' }}>
                UPI: ibms.treasury@hdfcbank
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Executive Line Items Table */}
      <section className="inv-table-container" aria-label="Invoice Line Items">
        <table className="inv-doc-table">
          <thead>
            <tr>
              <th style={{ width: '40px', textAlign: 'center' }}>#</th>
              <th>Description &amp; Specifications</th>
              <th style={{ textAlign: 'center', width: '90px' }}>HSN/SAC</th>
              <th style={{ textAlign: 'right', width: '60px' }}>Qty</th>
              <th style={{ textAlign: 'right', width: '120px' }}>Rate (₹)</th>
              <th style={{ textAlign: 'right', width: '90px' }}>Tax (%)</th>
              <th style={{ textAlign: 'right', width: '140px' }}>Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const qty = Number(item.quantity || 1);
              const rate = Number(item.unitPrice || item.rate || 0);
              const taxP = Number(item.taxPercent || item.taxRate || 18);
              const gross = qty * rate;
              const disc =
                item.discountType === 'percentage'
                  ? (gross * Number(item.discountValue || 0)) / 100
                  : Number(item.discountValue || 0);
              const taxable = Math.max(0, gross - disc);
              const lineTax = (taxable * taxP) / 100;
              const lineTotal = taxable + lineTax;

              return (
                <tr key={item.id || index}>
                  <td style={{ textAlign: 'center' }}>
                    <div className="inv-item-num" style={{ margin: '0 auto' }}>
                      {String(index + 1).padStart(2, '0')}
                    </div>
                  </td>
                  <td>
                    <div className="inv-item-title">{item.description || item.name || 'Enterprise Service Deliverable'}</div>
                    {(item.specification || item.details) && (
                      <div className="inv-item-spec">{item.specification || item.details}</div>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="inv-hsn-tag">{item.hsnSac || item.hsn || '998313'}</span>
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
                    {qty}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                    {formatCurrency(rate, currency)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="inv-tax-tag">{taxP}% GST</span>
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: '#1c1815' }}>
                    {formatCurrency(lineTotal, currency)}
                  </td>
                </tr>
              );
            })}

            {items.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#8c7d71' }}>
                  No itemized lines in this invoice record.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* 5. Statutory Tax Breakdown, QR Remittance & Grand Totals */}
      <section className="inv-bottom-section">
        {/* Left Column: Words, GST Schedule & QR code */}
        <div>
          {/* Amount In Words */}
          <div className="inv-words-card">
            <div className="inv-words-title">Total Amount In Words</div>
            <div className="inv-words-text">"{numberToWords(grandTotal)}"</div>
          </div>

          {/* Statutory GST Matrix */}
          <table className="inv-gst-schedule" aria-label="Statutory Tax Matrix">
            <thead>
              <tr>
                <th>Tax Category</th>
                <th>Taxable Value</th>
                <th>Rate</th>
                <th>Tax Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Central GST (CGST)</td>
                <td>{formatCurrency(taxableBase, currency)}</td>
                <td>9.0%</td>
                <td>{formatCurrency(cgstAmount, currency)}</td>
              </tr>
              <tr>
                <td>State GST (SGST)</td>
                <td>{formatCurrency(taxableBase, currency)}</td>
                <td>9.0%</td>
                <td>{formatCurrency(sgstAmount, currency)}</td>
              </tr>
              <tr>
                <td>Total Statutory Tax</td>
                <td>{formatCurrency(taxableBase, currency)}</td>
                <td>18.0%</td>
                <td>{formatCurrency(taxAmount, currency)}</td>
              </tr>
            </tbody>
          </table>

          {/* Instant QR Code Remittance Card */}
          <div className="inv-qr-bank-card">
            <div className="inv-qr-box">
              {/* Scalable Vector QR Code Graphic */}
              <svg viewBox="0 0 80 80" width="72" height="72" fill="#2b1c14">
                <rect x="0" y="0" width="24" height="24" fill="#2b1c14" />
                <rect x="3" y="3" width="18" height="18" fill="#ffffff" />
                <rect x="6" y="6" width="12" height="12" fill="#2b1c14" />

                <rect x="56" y="0" width="24" height="24" fill="#2b1c14" />
                <rect x="59" y="3" width="18" height="18" fill="#ffffff" />
                <rect x="62" y="6" width="12" height="12" fill="#2b1c14" />

                <rect x="0" y="56" width="24" height="24" fill="#2b1c14" />
                <rect x="3" y="59" width="18" height="18" fill="#ffffff" />
                <rect x="6" y="62" width="12" height="12" fill="#2b1c14" />

                {/* Simulated QR data modules */}
                <rect x="30" y="4" width="6" height="6" />
                <rect x="42" y="4" width="6" height="6" />
                <rect x="30" y="16" width="12" height="6" />
                <rect x="4" y="30" width="6" height="12" />
                <rect x="16" y="34" width="10" height="6" />
                <rect x="32" y="30" width="16" height="16" />
                <rect x="54" y="32" width="8" height="6" />
                <rect x="68" y="32" width="8" height="14" />
                <rect x="34" y="54" width="6" height="16" />
                <rect x="46" y="58" width="14" height="6" />
                <rect x="66" y="54" width="10" height="12" />
              </svg>
            </div>
            <div className="inv-bank-info">
              <div style={{ fontWeight: 700, color: '#2b1c14', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <QrCode2 sx={{ fontSize: 16, color: '#70472f' }} />
                Instant UPI Settlement
              </div>
              Scan with GPay, PhonePe, Paytm, or BHIM to remit directly to corporate treasury.<br />
              Remittance Tag: <strong>{invNumber}</strong>
            </div>
          </div>
        </div>

        {/* Right Column: Financial Totals Block */}
        <div className="inv-totals-card">
          <table className="inv-totals-table">
            <tbody>
              <tr>
                <td>Taxable Subtotal</td>
                <td>{formatCurrency(subtotal, currency)}</td>
              </tr>
              {discountAmount > 0 && (
                <tr>
                  <td style={{ color: '#00814d', fontWeight: 600 }}>Contractual Discount</td>
                  <td style={{ color: '#00814d' }}>-{formatCurrency(discountAmount, currency)}</td>
                </tr>
              )}
              <tr>
                <td>Central GST (CGST 9%)</td>
                <td>{formatCurrency(cgstAmount, currency)}</td>
              </tr>
              <tr>
                <td>State GST (SGST 9%)</td>
                <td>{formatCurrency(sgstAmount, currency)}</td>
              </tr>
              {chargesAmount > 0 && (
                <tr>
                  <td>Logistics &amp; Surcharge</td>
                  <td>{formatCurrency(chargesAmount, currency)}</td>
                </tr>
              )}
              <tr className="inv-total-highlight-row">
                <td>TOTAL AMOUNT DUE</td>
                <td>{formatCurrency(grandTotal, currency)}</td>
              </tr>
              {paidAmount > 0 && (
                <tr>
                  <td style={{ color: '#00814d', fontWeight: 600, paddingTop: '10px' }}>Amount Paid (Settled)</td>
                  <td style={{ color: '#00814d', paddingTop: '10px' }}>{formatCurrency(paidAmount, currency)}</td>
                </tr>
              )}
              {balanceAmount !== grandTotal && (
                <tr>
                  <td style={{ color: '#c93b2b', fontWeight: 700, paddingTop: '8px' }}>Balance Outstanding</td>
                  <td style={{ color: '#c93b2b', fontWeight: 700, paddingTop: '8px' }}>
                    {formatCurrency(balanceAmount, currency)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Notes & Terms snippet */}
          <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #eee5dc', fontSize: '0.78rem', color: '#6e6157' }}>
            <strong>Notes:</strong> {invoice.notes || 'Payment is appreciated within terms. Remit via NEFT/RTGS/UPI.'}
          </div>
        </div>
      </section>

      {/* 6. Authentication, Verification Seal & Signatory */}
      <section className="inv-seal-section">
        <div className="inv-digital-verification">
          <div className="inv-crest-icon">
            <Verified sx={{ fontSize: 24 }} />
          </div>
          <div className="inv-verification-text">
            <strong>Digitally Authenticated Document</strong><br />
            This invoice is electronically certified under Section 65B of the Indian Evidence Act, 1872.<br />
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.68rem', color: '#8c7d71' }}>
              SHA-256 HASH: 8f4b2e9c1a0d774f...{invNumber.replace(/[^0-9]/g, '') || '9821'}
            </span>
          </div>
        </div>

        <div className="inv-signatory-block">
          <div className="inv-signature-graphic">
            S. R. Ramachandran
          </div>
          <div className="inv-signatory-line" />
          <div className="inv-signatory-title">Authorized Signatory</div>
          <div className="inv-signatory-company">IBMS Enterprise Financial Systems Ltd.</div>
        </div>
      </section>

      {/* 7. Legal Disclaimer Footer */}
      <footer className="inv-doc-legal-footer">
        <div>
          Registered Office: IBMS Tower, Financial District, Madhurawada, Visakhapatnam, AP 530048 • Tel: 1800-425-IBMS
        </div>
        <div>
          Computer Generated Tax Document • Page 1 of 1
        </div>
      </footer>
    </article>
  );
};

export default InvoiceDocument;
