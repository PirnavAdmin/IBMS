import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowBack,
  Add,
  DeleteOutline,
  Receipt,
  Send,
  Save,
  CheckCircle,
  AccountBalance,
  PersonOutline,
  Business,
} from '@mui/icons-material';
import '../../styles/CreateInvoice.css';

const CLIENT_PRESETS = [
  {
    name: 'Bill winter',
    company: 'Winter Global Enterprises',
    email: 'billing@winterglobal.com',
    phone: '+1 (555) 349-8201',
    address: '420 North Avenue, Suite 800, New York, NY 10001',
    gstin: '29AAACW1234F1Z8',
  },
  {
    name: 'Nick summer',
    company: 'Summer Logistics & Freight',
    email: 'accounts@summerfreight.com',
    phone: '+1 (555) 782-9912',
    address: '108 Industrial Parkway, Chicago, IL 60607',
    gstin: '27AAACS5678B1Z3',
  },
  {
    name: 'Bill mayor',
    company: 'Mayor Infrastructure Corp',
    email: 'finance@mayorinfra.com',
    phone: '+1 (555) 234-8890',
    address: '77 Capitol Boulevard, Austin, TX 78701',
    gstin: '33AAACM9012C1Z4',
  },
  {
    name: 'ABC Traders Logistics',
    company: 'ABC Traders Logistics LLC',
    email: 'invoicing@abctraders.com',
    phone: '+1 (555) 441-2099',
    address: '88 Commerce Highway, Atlanta, GA 30303',
    gstin: '07AAACA3456D1Z1',
  },
];

export const CreateInvoice = () => {
  const navigate = useNavigate();

  // Invoice Meta
  const [invoiceNumber, setInvoiceNumber] = useState('INV-2026-0042');
  const [poNumber, setPoNumber] = useState('PO-9941');
  const [invoiceDate, setInvoiceDate] = useState('2026-09-03');
  const [dueDate, setDueDate] = useState('2026-09-18');
  const [paymentTerms, setPaymentTerms] = useState('Net 15');
  const [currency, setCurrency] = useState('₹');

  // Client Info
  const [selectedClientIndex, setSelectedClientIndex] = useState(0);
  const [clientName, setClientName] = useState(CLIENT_PRESETS[0].name);
  const [clientCompany, setClientCompany] = useState(CLIENT_PRESETS[0].company);
  const [clientEmail, setClientEmail] = useState(CLIENT_PRESETS[0].email);
  const [clientPhone, setClientPhone] = useState(CLIENT_PRESETS[0].phone);
  const [clientAddress, setClientAddress] = useState(CLIENT_PRESETS[0].address);
  const [clientGstin, setClientGstin] = useState(CLIENT_PRESETS[0].gstin);

  // Line Items
  const [lineItems, setLineItems] = useState([
    {
      id: 1,
      description: 'Landscape Architectural Design & Site Blueprint',
      hsn: '998311',
      qty: 16,
      rate: 95,
      taxPercent: 18,
    },
    {
      id: 2,
      description: 'Automated Drip Irrigation Infrastructure Installation',
      hsn: '995421',
      qty: 1,
      rate: 1450,
      taxPercent: 18,
    },
    {
      id: 3,
      description: 'Organic Soil Conditioning & Horticultural Maintenance',
      hsn: '998611',
      qty: 8,
      rate: 65,
      taxPercent: 18,
    },
  ]);

  // Discount & Shipping
  const [discountPercent, setDiscountPercent] = useState(5);
  const [shippingFee, setShippingFee] = useState(45);
  const [notes, setNotes] = useState(
    'Thank you for your business! Please make payment within 15 days via wire transfer or UPI.'
  );
  const [terms, setTerms] = useState(
    '1. Late payments are subject to a 1.5% monthly interest fee.\n2. Invoices disputed after 7 business days cannot be adjusted.'
  );

  // Feedback State
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleClientSelect = (e) => {
    const idx = parseInt(e.target.value, 10);
    setSelectedClientIndex(idx);
    if (CLIENT_PRESETS[idx]) {
      const c = CLIENT_PRESETS[idx];
      setClientName(c.name);
      setClientCompany(c.company);
      setClientEmail(c.email);
      setClientPhone(c.phone);
      setClientAddress(c.address);
      setClientGstin(c.gstin);
    }
  };

  const updateLineItem = (id, field, value) => {
    setLineItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]: field === 'description' || field === 'hsn' ? value : Number(value) || 0,
            }
          : item
      )
    );
  };

  const addLineItem = () => {
    const newItem = {
      id: Date.now(),
      description: '',
      hsn: '998311',
      qty: 1,
      rate: 100,
      taxPercent: 18,
    };
    setLineItems((prev) => [...prev, newItem]);
  };

  const removeLineItem = (id) => {
    if (lineItems.length <= 1) {
      showToast('Invoice must contain at least one line item.');
      return;
    }
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Computations
  const subtotal = lineItems.reduce((acc, item) => acc + item.qty * item.rate, 0);
  const discountAmount = (subtotal * discountPercent) / 100;
  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxAmount = lineItems.reduce((acc, item) => {
    const itemSub = item.qty * item.rate;
    const itemTax = itemSub * (item.taxPercent / 100);
    return acc + itemTax;
  }, 0);
  const grandTotal = taxableAmount + taxAmount + Number(shippingFee || 0);

  const handleSaveDraft = () => {
    showToast(`Invoice ${invoiceNumber} saved as draft successfully!`);
  };

  const handleSendInvoice = () => {
    showToast(`Invoice ${invoiceNumber} issued and sent to ${clientEmail}!`);
    setTimeout(() => navigate('/dashboard'), 1500);
  };

  return (
    <div className="ci-page-wrapper">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="ci-toast-alert">
          <CheckCircle sx={{ fontSize: 18, color: '#9A4F2F' }} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Navigation Bar */}
      <header className="ci-navbar glass-card">
        <div className="ci-nav-left">
          <button className="ci-back-btn" onClick={() => navigate('/dashboard')}>
            <ArrowBack sx={{ fontSize: 18 }} />
            <span>Dashboard</span>
          </button>
          <div className="ci-brand-badge">
            <span className="ci-brand-symbol">◈</span>
            <span className="ci-brand-title">invoice.billing</span>
          </div>
          <span className="ci-nav-divider">/</span>
          <span className="ci-nav-current">New Invoice</span>
        </div>

        <div className="ci-nav-right">
          <button className="ci-btn-discard" onClick={() => navigate('/dashboard')}>
            Discard
          </button>
          <button className="ci-btn-draft" onClick={handleSaveDraft}>
            <Save sx={{ fontSize: 16 }} />
            <span>Save Draft</span>
          </button>
          <button className="ci-btn-send" onClick={handleSendInvoice}>
            <Send sx={{ fontSize: 16 }} />
            <span>Issue &amp; Send</span>
          </button>
        </div>
      </header>

      {/* Main Grid Content Canvas */}
      <main className="ci-container">
        <div className="ci-grid-layout">
          {/* LEFT MAJOR SECTION: INVOICE FORM */}
          <div className="ci-form-column">
            {/* Card 1: Invoice Header & Dates (Glassmorphic) */}
            <div className="ci-card glass-card">
              <div className="ci-card-top-row">
                <div className="ci-title-group">
                  <div className="ci-icon-box">
                    <Receipt sx={{ fontSize: 22, color: '#9A4F2F' }} />
                  </div>
                  <div>
                    <h2 className="ci-heading">Invoice Details</h2>
                    <p className="ci-subheading">Configure invoice numbering, issue dates, and terms</p>
                  </div>
                </div>
                <div className="ci-badge-draft">DRAFT</div>
              </div>

              <div className="ci-form-row four-col">
                <div className="ci-field-group">
                  <label className="ci-label">Invoice Number</label>
                  <input
                    type="text"
                    className="ci-input"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                  />
                </div>
                <div className="ci-field-group">
                  <label className="ci-label">P.O. / Ref Number</label>
                  <input
                    type="text"
                    className="ci-input"
                    value={poNumber}
                    onChange={(e) => setPoNumber(e.target.value)}
                  />
                </div>
                <div className="ci-field-group">
                  <label className="ci-label">Invoice Date</label>
                  <input
                    type="date"
                    className="ci-input"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                  />
                </div>
                <div className="ci-field-group">
                  <label className="ci-label">Due Date</label>
                  <input
                    type="date"
                    className="ci-input"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="ci-form-row two-col mt-3">
                <div className="ci-field-group">
                  <label className="ci-label">Payment Terms</label>
                  <select
                    className="ci-select"
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                  >
                    <option value="Due on Receipt">Due on Receipt</option>
                    <option value="Net 15">Net 15 (15 Days)</option>
                    <option value="Net 30">Net 30 (30 Days)</option>
                    <option value="Net 60">Net 60 (60 Days)</option>
                  </select>
                </div>
                <div className="ci-field-group">
                  <label className="ci-label">Billing Currency</label>
                  <select
                    className="ci-select"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    <option value="₹">INR (₹) - Indian Rupee</option>
                    <option value="$">USD ($)</option>
                    <option value="€">EUR (€)</option>
                    <option value="£">GBP (£)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Card 2: Billed From & Billed To (Glassmorphic) */}
            <div className="ci-card glass-card">
              <div className="ci-parties-grid">
                {/* Billed From (Seller) */}
                <div className="ci-party-box">
                  <div className="ci-party-header">
                    <Business sx={{ fontSize: 18, color: '#9A4F2F' }} />
                    <span className="ci-party-title">Bill From (Your Business)</span>
                  </div>
                  <div className="ci-seller-card">
                    <span className="ci-seller-name">David's Landscaping &amp; Supply</span>
                    <span className="ci-seller-info">742 Evergreen Terrace, Springfield</span>
                    <span className="ci-seller-info">GSTIN: 29ABCDE1234F1Z5</span>
                    <span className="ci-seller-info">billing@davidslandscaping.com</span>
                    <span className="ci-seller-info">+1 (555) 602-8819</span>
                  </div>
                </div>

                {/* Billed To (Client) */}
                <div className="ci-party-box">
                  <div className="ci-party-header">
                    <PersonOutline sx={{ fontSize: 18, color: '#9A4F2F' }} />
                    <span className="ci-party-title">Bill To (Customer Information)</span>
                  </div>

                  <div className="ci-field-group mb-2">
                    <label className="ci-label">Select Saved Client</label>
                    <select
                      className="ci-select"
                      value={selectedClientIndex}
                      onChange={handleClientSelect}
                    >
                      {CLIENT_PRESETS.map((client, idx) => (
                        <option key={idx} value={idx}>
                          {client.name} — {client.company}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="ci-form-row two-col">
                    <div className="ci-field-group">
                      <label className="ci-label">Customer Name</label>
                      <input
                        type="text"
                        className="ci-input"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                      />
                    </div>
                    <div className="ci-field-group">
                      <label className="ci-label">Company Name</label>
                      <input
                        type="text"
                        className="ci-input"
                        value={clientCompany}
                        onChange={(e) => setClientCompany(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="ci-form-row two-col mt-2">
                    <div className="ci-field-group">
                      <label className="ci-label">Email Address</label>
                      <input
                        type="email"
                        className="ci-input"
                        value={clientEmail}
                        onChange={(e) => setClientEmail(e.target.value)}
                      />
                    </div>
                    <div className="ci-field-group">
                      <label className="ci-label">Phone Number</label>
                      <input
                        type="text"
                        className="ci-input"
                        value={clientPhone}
                        onChange={(e) => setClientPhone(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="ci-field-group mt-2">
                    <label className="ci-label">Billing Address</label>
                    <input
                      type="text"
                      className="ci-input"
                      value={clientAddress}
                      onChange={(e) => setClientAddress(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Line Items Table (Glassmorphic) */}
            <div className="ci-card glass-card">
              <div className="ci-items-header">
                <div>
                  <h3 className="ci-section-title">Itemized Line Items</h3>
                  <p className="ci-section-sub">Detail all billable products, hours, and rates</p>
                </div>
                <button className="ci-btn-add-item" onClick={addLineItem}>
                  <Add sx={{ fontSize: 16 }} />
                  <span>Add Line Item</span>
                </button>
              </div>

              <div className="ci-table-wrap">
                <table className="ci-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40%' }}>Description</th>
                      <th style={{ width: '12%' }}>HSN/SAC</th>
                      <th style={{ width: '10%' }}>Qty / Hrs</th>
                      <th style={{ width: '14%' }}>Rate ({currency})</th>
                      <th style={{ width: '10%' }}>Tax (%)</th>
                      <th style={{ width: '10%', textAlign: 'right' }}>Amount</th>
                      <th style={{ width: '4%' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item) => {
                      const itemTotal = item.qty * item.rate;
                      return (
                        <tr key={item.id}>
                          <td>
                            <input
                              type="text"
                              className="ci-table-input desc-input"
                              placeholder="Service or product description..."
                              value={item.description}
                              onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="ci-table-input"
                              value={item.hsn}
                              onChange={(e) => updateLineItem(item.id, 'hsn', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              className="ci-table-input center"
                              min="1"
                              value={item.qty}
                              onChange={(e) => updateLineItem(item.id, 'qty', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              className="ci-table-input right"
                              min="0"
                              value={item.rate}
                              onChange={(e) => updateLineItem(item.id, 'rate', e.target.value)}
                            />
                          </td>
                          <td>
                            <select
                              className="ci-table-select"
                              value={item.taxPercent}
                              onChange={(e) => updateLineItem(item.id, 'taxPercent', e.target.value)}
                            >
                              <option value="0">0%</option>
                              <option value="5">5%</option>
                              <option value="12">12%</option>
                              <option value="18">18%</option>
                              <option value="28">28%</option>
                            </select>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <span className="ci-item-amt">
                              {currency}{itemTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          </td>
                          <td>
                            <button
                              className="ci-btn-del"
                              onClick={() => removeLineItem(item.id)}
                              title="Delete Item"
                            >
                              <DeleteOutline sx={{ fontSize: 17 }} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Card 4: Notes & Terms (Glassmorphic) */}
            <div className="ci-card glass-card">
              <div className="ci-form-row two-col">
                <div className="ci-field-group">
                  <label className="ci-label">Customer Notes</label>
                  <textarea
                    rows={3}
                    className="ci-textarea"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
                <div className="ci-field-group">
                  <label className="ci-label">Terms &amp; Conditions</label>
                  <textarea
                    rows={3}
                    className="ci-textarea"
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: CALCULATIONS & SUMMARY PREVIEW */}
          <div className="ci-summary-column">
            {/* Glassmorphic Calculation Card */}
            <div className="ci-card glass-card ci-summary-card">
              <h3 className="ci-section-title">Invoice Summary</h3>
              <p className="ci-section-sub">Dynamic financial totals calculation</p>

              <div className="ci-summary-lines">
                <div className="ci-sum-row">
                  <span className="ci-sum-label">Subtotal</span>
                  <span className="ci-sum-val">
                    {currency}{subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="ci-sum-row">
                  <div className="ci-sum-inline-input">
                    <span className="ci-sum-label">Discount</span>
                    <div className="ci-disc-pill">
                      <input
                        type="number"
                        className="ci-pill-input"
                        min="0"
                        max="100"
                        value={discountPercent}
                        onChange={(e) => setDiscountPercent(Number(e.target.value) || 0)}
                      />
                      <span>%</span>
                    </div>
                  </div>
                  <span className="ci-sum-val discount">
                    -{currency}{discountAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="ci-sum-row">
                  <span className="ci-sum-label">Estimated Tax (GST 18%)</span>
                  <span className="ci-sum-val">
                    +{currency}{taxAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="ci-sum-row">
                  <div className="ci-sum-inline-input">
                    <span className="ci-sum-label">Shipping / Logistics</span>
                    <div className="ci-disc-pill">
                      <span>{currency}</span>
                      <input
                        type="number"
                        className="ci-pill-input"
                        min="0"
                        value={shippingFee}
                        onChange={(e) => setShippingFee(Number(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                  <span className="ci-sum-val">
                    +{currency}{Number(shippingFee || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="ci-sum-divider" />

                <div className="ci-sum-row total-row">
                  <span className="ci-grand-label">Grand Total</span>
                  <span className="ci-grand-val">
                    {currency}{grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Payment Details Box */}
              <div className="ci-bank-details-box">
                <div className="ci-bank-header">
                  <AccountBalance sx={{ fontSize: 16, color: '#9A4F2F' }} />
                  <span>Wire / Direct Deposit</span>
                </div>
                <div className="ci-bank-row">
                  <span>Bank:</span> <strong>Chase Commercial Banking</strong>
                </div>
                <div className="ci-bank-row">
                  <span>A/C No:</span> <strong>•••• •••• 9924</strong>
                </div>
                <div className="ci-bank-row">
                  <span>IFSC / Routing:</span> <strong>CHASUS33XX</strong>
                </div>
              </div>

              {/* Instant Action CTA */}
              <div className="ci-summary-actions">
                <button className="ci-btn-send-full" onClick={handleSendInvoice}>
                  <Send sx={{ fontSize: 16 }} />
                  <span>Finalize &amp; Send Invoice</span>
                </button>
                <button className="ci-btn-draft-full" onClick={handleSaveDraft}>
                  <Save sx={{ fontSize: 16 }} />
                  <span>Save as Draft</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default CreateInvoice;
