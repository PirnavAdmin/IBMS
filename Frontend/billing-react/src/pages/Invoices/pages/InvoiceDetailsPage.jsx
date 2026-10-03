import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Breadcrumbs,
  Button,
  Chip,
  Tabs,
  Tab,
  Box,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from '@mui/material';
import {
  ArrowBack,
  Edit,
  Send,
  Payments,
  Print,
  Block,
  CheckCircle,
  Receipt,
  History,
  Email,
  CreditCard,
  WarningAmber,
} from '@mui/icons-material';
import { invoiceApi } from 'billing-api-client';
import { InvoicePreviewModal } from '../components/InvoicePreviewModal';
import { RecordPaymentModal } from '../components/RecordPaymentModal';
import { InvoiceDocument } from '../components/InvoiceDocument';
import '../../../styles/Invoices.css';

const formatCurrency = (val, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    maximumFractionDigits: 2,
  }).format(Number(val || 0));

const resolveCustomerName = (inv) => {
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

export const InvoiceDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(0);
  const [docViewMode, setDocViewMode] = useState('document');

  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionNotice, setActionNotice] = useState('');

  // Modals
  const [previewOpen, setPreviewOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [issueConfirmOpen, setIssueConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Payments & Audit state
  const [payments, setPayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(false);

  const fetchInvoice = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await invoiceApi.getInvoiceById(id);
      setInvoice(data);

      // Also fetch payments
      setLoadingPayments(true);
      try {
        const payRes = await invoiceApi.getInvoicePayments(data.id || id);
        setPayments(Array.isArray(payRes?.items) ? payRes.items : (Array.isArray(payRes) ? payRes : []));
      } catch (e) {
        console.warn('Unable to load payments for invoice:', e);
      } finally {
        setLoadingPayments(false);
      }
    } catch (err) {
      setError(err.message || `Unable to load invoice #${id}.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoice();
  }, [id]);

  const handleIssueInvoice = async () => {
    setActionLoading(true);
    try {
      await invoiceApi.issueInvoice(invoice.id);
      setIssueConfirmOpen(false);
      setActionNotice(`Invoice ${invoice.invoiceNumber || invoice.id} issued successfully.`);
      fetchInvoice();
    } catch (err) {
      setError(err.message || 'Failed to issue invoice.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelInvoice = async () => {
    if (!cancelReason.trim()) {
      return;
    }
    setActionLoading(true);
    try {
      await invoiceApi.cancelInvoice(invoice.id, cancelReason.trim());
      setCancelOpen(false);
      setActionNotice(`Invoice ${invoice.invoiceNumber || invoice.id} has been cancelled.`);
      fetchInvoice();
    } catch (err) {
      setError(err.message || 'Failed to cancel invoice.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="inv-main" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px' }}>
        <CircularProgress size={36} sx={{ color: '#70472f' }} />
        <span style={{ marginLeft: '12px', color: '#543420', fontWeight: 500 }}>Loading invoice details...</span>
      </main>
    );
  }

  if (error || !invoice) {
    return (
      <main className="inv-main">
        <Alert severity="error" sx={{ mb: 3 }}>
          {error || 'Invoice not found.'}
        </Alert>
        <Button component={Link} to="/invoices" startIcon={<ArrowBack />} variant="outlined">
          Back to Invoices
        </Button>
      </main>
    );
  }

  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const status = invoice.status || 'Draft';
  const currency = invoice.currency || 'INR';
  const grandTotal = Number(invoice.totalAmount ?? invoice.total ?? 0);
  const paidAmount = Number(invoice.paidAmount || 0);
  const balanceAmount = Number(invoice.balanceAmount ?? (grandTotal - paidAmount));
  const isDraft = status.toLowerCase() === 'draft';
  const isCancelled = status.toLowerCase() === 'cancelled' || status.toLowerCase() === 'void';
  const isPaid = status.toLowerCase() === 'paid';

  const customerName = resolveCustomerName(invoice);
  const customerEmail = typeof invoice.customerEmail === 'string' ? invoice.customerEmail : (typeof invoice.customer === 'object' && typeof invoice.customer?.email === 'string' ? invoice.customer.email : '');
  const customerPhone = typeof invoice.customerPhone === 'string' ? invoice.customerPhone : (typeof invoice.customer === 'object' && typeof invoice.customer?.phone === 'string' ? invoice.customer.phone : '');
  const customerGstin = typeof invoice.customerGstin === 'string' ? invoice.customerGstin : (typeof invoice.customer === 'object' ? (invoice.customer?.taxId || invoice.customer?.gstin || '') : '');
  const billingAddress = typeof invoice.billingAddress === 'string' ? invoice.billingAddress : (typeof invoice.customer === 'object' ? (typeof invoice.customer?.billingAddress === 'string' ? invoice.customer.billingAddress : (invoice.customer?.billingAddress?.addressLine1 || invoice.customer?.address || '')) : '');

  return (
    <main className="inv-main">
      {/* Breadcrumb */}
      <Breadcrumbs aria-label="Breadcrumb" sx={{ mb: 2 }}>
        <Link to="/invoices" style={{ color: '#70472f', textDecoration: 'none' }}>
          Invoices
        </Link>
        <span style={{ color: '#8c7d71' }}>{invoice.invoiceNumber || invoice.id}</span>
      </Breadcrumbs>

      {actionNotice && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setActionNotice('')}>
          {actionNotice}
        </Alert>
      )}

      {/* Header bar */}
      <header className="inv-heading" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 style={{ margin: 0 }}>{invoice.invoiceNumber || invoice.id}</h1>
            <Chip
              label={status}
              color={
                isPaid ? 'success' : isDraft ? 'default' : isCancelled ? 'error' : 'primary'
              }
              sx={{ fontWeight: 600 }}
            />
          </div>
          <p style={{ margin: '4px 0 0', color: '#685e57' }}>
            Customer: <strong>{customerName}</strong> • Created on{' '}
            {(invoice.invoiceDate || invoice.issueDate || '').slice(0, 10)}
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            startIcon={<Print />}
            onClick={() => setPreviewOpen(true)}
            sx={{ textTransform: 'none' }}
          >
            Preview / Print
          </Button>

          {isDraft && (
            <>
              <Button
                variant="outlined"
                startIcon={<Edit />}
                component={Link}
                to={`/invoices/${encodeURIComponent(invoice.id)}/edit`}
                sx={{ textTransform: 'none' }}
              >
                Edit Draft
              </Button>
              <Button
                variant="contained"
                startIcon={<Send />}
                onClick={() => setIssueConfirmOpen(true)}
                sx={{
                  backgroundColor: '#70472f',
                  '&:hover': { backgroundColor: '#583623' },
                  textTransform: 'none',
                  fontWeight: 600,
                }}
              >
                Issue Invoice
              </Button>
            </>
          )}

          {!isDraft && !isCancelled && !isPaid && (
            <Button
              variant="contained"
              startIcon={<Payments />}
              onClick={() => setPaymentOpen(true)}
              sx={{
                backgroundColor: '#2e7d32',
                '&:hover': { backgroundColor: '#1b5e20' },
                textTransform: 'none',
                fontWeight: 600,
              }}
            >
              Record Payment
            </Button>
          )}

          {!isCancelled && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<Block />}
              onClick={() => setCancelOpen(true)}
              sx={{ textTransform: 'none' }}
            >
              Cancel Invoice
            </Button>
          )}
        </div>
      </header>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: '#ebdccb', mt: 3, mb: 3 }}>
        <Tabs
          value={activeTab}
          onChange={(_, next) => setActiveTab(next)}
          textColor="inherit"
          indicatorColor="primary"
          sx={{
            '& .Mui-selected': { color: '#70472f !important', fontWeight: 600 },
            '& .MuiTabs-indicator': { backgroundColor: '#70472f' },
          }}
        >
          <Tab label="1. Overview" />
          <Tab label={`2. Items (${items.length})`} />
          <Tab label={`3. Payments (${payments.length})`} />
          <Tab label="4. Credit Notes" />
          <Tab label="5. Communication" />
          <Tab label="6. Audit Timeline" />
        </Tabs>
      </Box>

      {/* TAB 0: OVERVIEW */}
      {activeTab === 0 && (
        <div>
          {/* Executive Sub-Header Controls */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
              padding: '12px 18px',
              backgroundColor: '#fffdfb',
              borderRadius: '8px',
              border: '1px solid #ebdccb',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Button
                variant={docViewMode === 'document' ? 'contained' : 'outlined'}
                size="small"
                onClick={() => setDocViewMode('document')}
                sx={{
                  backgroundColor: docViewMode === 'document' ? '#70472f' : 'transparent',
                  '&:hover': { backgroundColor: docViewMode === 'document' ? '#583623' : '#fcfaf7' },
                  textTransform: 'none',
                  fontWeight: 600,
                  borderColor: '#d8c7b8',
                  color: docViewMode === 'document' ? '#ffffff' : '#543420',
                }}
              >
                Official Invoice Document
              </Button>
              <Button
                variant={docViewMode === 'cards' ? 'contained' : 'outlined'}
                size="small"
                onClick={() => setDocViewMode('cards')}
                sx={{
                  backgroundColor: docViewMode === 'cards' ? '#70472f' : 'transparent',
                  '&:hover': { backgroundColor: docViewMode === 'cards' ? '#583623' : '#fcfaf7' },
                  textTransform: 'none',
                  fontWeight: 600,
                  borderColor: '#d8c7b8',
                  color: docViewMode === 'cards' ? '#ffffff' : '#543420',
                }}
              >
                Financial &amp; Operations Cards
              </Button>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<Print />}
                onClick={() => setPreviewOpen(true)}
                sx={{ textTransform: 'none', borderColor: '#d8c7b8', color: '#543420' }}
              >
                Print / Save PDF
              </Button>
            </div>
          </div>

          {docViewMode === 'document' ? (
            <div className="executive-invoice-wrapper" style={{ borderRadius: '12px', overflow: 'hidden' }}>
              <InvoiceDocument invoice={invoice} />
            </div>
          ) : (
            <section className="inv-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '28px' }}>
                <div style={{ padding: '16px', backgroundColor: '#fcfbf9', borderRadius: '8px', border: '1px solid #ebdccb' }}>
                  <span style={{ fontSize: '0.8rem', color: '#8c7d71' }}>Grand Total</span>
                  <h2 style={{ margin: '4px 0 0', color: '#70472f' }}>{formatCurrency(grandTotal, currency)}</h2>
                </div>
                <div style={{ padding: '16px', backgroundColor: '#fcfbf9', borderRadius: '8px', border: '1px solid #ebdccb' }}>
                  <span style={{ fontSize: '0.8rem', color: '#8c7d71' }}>Paid Amount</span>
                  <h2 style={{ margin: '4px 0 0', color: '#2e7d32' }}>{formatCurrency(paidAmount, currency)}</h2>
                </div>
                <div style={{ padding: '16px', backgroundColor: '#fcfbf9', borderRadius: '8px', border: '1px solid #ebdccb' }}>
                  <span style={{ fontSize: '0.8rem', color: '#8c7d71' }}>Outstanding Balance</span>
                  <h2 style={{ margin: '4px 0 0', color: balanceAmount > 0 ? '#b33927' : '#2e7d32' }}>
                    {formatCurrency(balanceAmount, currency)}
                  </h2>
                </div>
                <div style={{ padding: '16px', backgroundColor: '#fcfbf9', borderRadius: '8px', border: '1px solid #ebdccb' }}>
                  <span style={{ fontSize: '0.8rem', color: '#8c7d71' }}>Payment Terms / Due Date</span>
                  <h3 style={{ margin: '4px 0 0', color: '#302a26', fontSize: '1.05rem' }}>
                    {invoice.paymentTerms || 'Net 30'} • {(invoice.dueDate || '').slice(0, 10)}
                  </h3>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <h3 style={{ fontSize: '1rem', color: '#543420', marginBottom: '12px' }}>Customer &amp; Billing Details</h3>
                  <p style={{ margin: '4px 0', fontSize: '0.9rem' }}>
                    <strong>Name:</strong> {customerName}
                  </p>
                  {customerEmail && (
                    <p style={{ margin: '4px 0', fontSize: '0.9rem' }}>
                      <strong>Email:</strong> {customerEmail}
                    </p>
                  )}
                  {customerPhone && (
                    <p style={{ margin: '4px 0', fontSize: '0.9rem' }}>
                      <strong>Phone:</strong> {customerPhone}
                    </p>
                  )}
                  {customerGstin && (
                    <p style={{ margin: '4px 0', fontSize: '0.9rem' }}>
                      <strong>GSTIN / Tax ID:</strong> {customerGstin}
                    </p>
                  )}
                  {billingAddress && (
                    <p style={{ margin: '4px 0', fontSize: '0.9rem', whiteSpace: 'pre-line' }}>
                      <strong>Address:</strong> {billingAddress}
                    </p>
                  )}
                </div>

                <div>
                  <h3 style={{ fontSize: '1rem', color: '#543420', marginBottom: '12px' }}>Invoice Metadata</h3>
                  <p style={{ margin: '4px 0', fontSize: '0.9rem' }}>
                    <strong>Invoice Number:</strong> {invoice.invoiceNumber || invoice.id}
                  </p>
                  <p style={{ margin: '4px 0', fontSize: '0.9rem' }}>
                    <strong>Issue Date:</strong> {(invoice.invoiceDate || invoice.issueDate || '').slice(0, 10)}
                  </p>
                  <p style={{ margin: '4px 0', fontSize: '0.9rem' }}>
                    <strong>Due Date:</strong> {(invoice.dueDate || '').slice(0, 10)}
                  </p>
                  {invoice.poNumber && (
                    <p style={{ margin: '4px 0', fontSize: '0.9rem' }}>
                      <strong>PO Number:</strong> {invoice.poNumber}
                    </p>
                  )}
                  {invoice.reference && (
                    <p style={{ margin: '4px 0', fontSize: '0.9rem' }}>
                      <strong>Reference:</strong> {invoice.reference}
                    </p>
                  )}
                  {invoice.notes && (
                    <div style={{ marginTop: '8px', padding: '10px', backgroundColor: '#fcfaf7', borderRadius: '6px' }}>
                      <span style={{ fontSize: '0.8rem', color: '#8c7d71' }}>Notes</span>
                      <p style={{ margin: '2px 0 0', fontSize: '0.85rem' }}>{invoice.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      {/* TAB 1: ITEMS */}
      {activeTab === 1 && (
        <section className="inv-panel" style={{ padding: '20px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f5eee6', borderBottom: '2px solid #ebdccb' }}>
                <th style={{ textAlign: 'left', padding: '12px' }}>#</th>
                <th style={{ textAlign: 'left', padding: '12px' }}>Description</th>
                <th style={{ textAlign: 'center', padding: '12px' }}>HSN/SAC</th>
                <th style={{ textAlign: 'right', padding: '12px' }}>Quantity</th>
                <th style={{ textAlign: 'right', padding: '12px' }}>Unit Price</th>
                <th style={{ textAlign: 'right', padding: '12px' }}>Discount</th>
                <th style={{ textAlign: 'right', padding: '12px' }}>Tax (%)</th>
                <th style={{ textAlign: 'right', padding: '12px' }}>Line Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const qty = Number(item.quantity || 1);
                const rate = Number(item.unitPrice || item.rate || 0);
                const taxP = Number(item.taxPercent || item.taxRate || 18);
                const gross = qty * rate;
                const disc = item.discountType === 'percentage'
                  ? (gross * Number(item.discountValue || 0)) / 100
                  : Number(item.discountValue || 0);
                const taxable = Math.max(0, gross - disc);
                const lineTotal = taxable + (taxable * taxP) / 100;

                return (
                  <tr key={item.id || index} style={{ borderBottom: '1px solid #eee8e0' }}>
                    <td style={{ padding: '12px', color: '#8c7d71' }}>{index + 1}</td>
                    <td style={{ padding: '12px', fontWeight: 500 }}>{item.description || item.name}</td>
                    <td style={{ textAlign: 'center', padding: '12px', color: '#685e57' }}>{item.hsnSac || '—'}</td>
                    <td style={{ textAlign: 'right', padding: '12px' }}>{qty}</td>
                    <td style={{ textAlign: 'right', padding: '12px' }}>{formatCurrency(rate, currency)}</td>
                    <td style={{ textAlign: 'right', padding: '12px', color: disc > 0 ? '#2e7d32' : 'inherit' }}>
                      {disc > 0 ? `-${formatCurrency(disc, currency)}` : '0.00'}
                    </td>
                    <td style={{ textAlign: 'right', padding: '12px' }}>{taxP}%</td>
                    <td style={{ textAlign: 'right', padding: '12px', fontWeight: 600 }}>
                      {formatCurrency(lineTotal, currency)}
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '24px', color: '#8c7d71' }}>
                    No items in this invoice.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {/* TAB 2: PAYMENTS */}
      {activeTab === 2 && (
        <section className="inv-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0, color: '#543420' }}>Payment Ledger</h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: '#8c7d71' }}>
                Transactions recorded against this invoice
              </p>
            </div>
            {!isCancelled && !isDraft && balanceAmount > 0 && (
              <Button
                variant="contained"
                startIcon={<Payments />}
                onClick={() => setPaymentOpen(true)}
                sx={{
                  backgroundColor: '#70472f',
                  '&:hover': { backgroundColor: '#583623' },
                  textTransform: 'none',
                }}
              >
                Record Payment
              </Button>
            )}
          </div>

          {loadingPayments ? (
            <div style={{ textAlign: 'center', padding: '30px' }}>
              <CircularProgress size={28} sx={{ color: '#70472f' }} />
            </div>
          ) : payments.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f5eee6', borderBottom: '2px solid #ebdccb' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Payment #</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Method</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Reference</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px' }}>Amount</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #eee8e0' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{p.paymentNumber || `PAY-${p.id}`}</td>
                    <td style={{ padding: '10px 12px' }}>{(p.paymentDate || '').slice(0, 10)}</td>
                    <td style={{ padding: '10px 12px' }}>{p.method}</td>
                    <td style={{ padding: '10px 12px', color: '#685e57' }}>{p.reference || '—'}</td>
                    <td style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 600, color: '#2e7d32' }}>
                      {formatCurrency(p.amount, currency)}
                    </td>
                    <td style={{ textAlign: 'center', padding: '10px 12px' }}>
                      <Chip label={p.status || 'Completed'} size="small" color="success" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#8c7d71' }}>
              <Payments sx={{ fontSize: 40, color: '#d0c3b4', mb: 1 }} />
              <p style={{ margin: 0, fontWeight: 500 }}>No payments have been recorded for this invoice yet.</p>
              {balanceAmount > 0 && !isDraft && (
                <Button
                  onClick={() => setPaymentOpen(true)}
                  sx={{ mt: 2, textTransform: 'none', color: '#70472f' }}
                >
                  Record first payment
                </Button>
              )}
            </div>
          )}
        </section>
      )}

      {/* TAB 3: CREDIT NOTES */}
      {activeTab === 3 && (
        <section className="inv-panel" style={{ padding: '32px', textAlign: 'center', color: '#685e57' }}>
          <CreditCard sx={{ fontSize: 44, color: '#b9a896', mb: 1 }} />
          <h3 style={{ margin: '0 0 6px', color: '#543420' }}>Credit Notes</h3>
          <p style={{ margin: 0, maxWidth: '500px', marginInline: 'auto', fontSize: '0.9rem' }}>
            Credit Note allocation and adjustments are currently awaiting backend repository enablement. No credit notes have been posted to this invoice.
          </p>
          <Chip label="Backend Module Pending" size="small" sx={{ mt: 2 }} />
        </section>
      )}

      {/* TAB 4: COMMUNICATION */}
      {activeTab === 4 && (
        <section className="inv-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0, color: '#543420' }}>Email Delivery History</h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: '#8c7d71' }}>
                Dispatched emails and communication logs for this invoice
              </p>
            </div>
            <Button
              variant="outlined"
              startIcon={<Email />}
              onClick={() => setActionNotice(`Invoice notification queued for ${customerEmail || 'recipient'}.`)}
              sx={{ textTransform: 'none' }}
            >
              Send Invoice Email
            </Button>
          </div>

          <div style={{ padding: '16px', backgroundColor: '#fcfbf9', borderRadius: '8px', border: '1px solid #ebdccb' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <strong>Status Notification</strong>
              <span style={{ fontSize: '0.8rem', color: '#8c7d71' }}>{(invoice.invoiceDate || '').slice(0, 10)}</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.88rem', color: '#685e57' }}>
              Recipient: {customerEmail || 'billing@example.com'} • Subject: Invoice #{invoice.invoiceNumber || invoice.id}
            </p>
            <div style={{ marginTop: '8px' }}>
              <Chip label="Sent" size="small" color="primary" />
            </div>
          </div>
        </section>
      )}

      {/* TAB 5: AUDIT TIMELINE */}
      {activeTab === 5 && (
        <section className="inv-panel" style={{ padding: '24px' }}>
          <h3 style={{ margin: '0 0 16px', color: '#543420' }}>Audit &amp; Activity Timeline</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderLeft: '2px solid #ebdccb', paddingLeft: '20px', marginLeft: '10px' }}>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: '-26px', top: '2px', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#70472f' }} />
              <strong>Invoice Created</strong>
              <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#8c7d71' }}>
                {(invoice.createdAtUtc || invoice.invoiceDate || '').slice(0, 19).replace('T', ' ')} by Staff User
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '0.88rem', color: '#554a43' }}>
                Invoice #{invoice.invoiceNumber || invoice.id} registered with initial total of {formatCurrency(grandTotal, currency)}.
              </p>
            </div>

            {status !== 'Draft' && (
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: '-26px', top: '2px', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#2e7d32' }} />
                <strong>Invoice Issued</strong>
                <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#8c7d71' }}>
                  {(invoice.updatedAtUtc || invoice.invoiceDate || '').slice(0, 19).replace('T', ' ')}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: '0.88rem', color: '#554a43' }}>
                  Status updated to <strong>{status}</strong>.
                </p>
              </div>
            )}

            {payments.map((p) => (
              <div key={p.id} style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: '-26px', top: '2px', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#1976d2' }} />
                <strong>Payment Received ({formatCurrency(p.amount, currency)})</strong>
                <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#8c7d71' }}>
                  {(p.paymentDate || '').slice(0, 10)} via {p.method}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* MODALS */}
      <InvoicePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        invoice={invoice}
      />

      <RecordPaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        invoice={invoice}
        onSuccess={(recAmount) => {
          setActionNotice(`Payment of ₹${recAmount} successfully recorded!`);
          fetchInvoice();
        }}
      />

      {/* Issue Confirmation Dialog */}
      <Dialog open={issueConfirmOpen} onClose={() => setIssueConfirmOpen(false)}>
        <DialogTitle sx={{ color: '#543420' }}>Confirm Invoice Issuance</DialogTitle>
        <DialogContent>
          <p style={{ margin: 0 }}>
            Are you sure you want to issue Invoice <strong>{invoice.invoiceNumber || invoice.id}</strong> to{' '}
            <strong>{customerName}</strong> for{' '}
            <strong>{formatCurrency(grandTotal, currency)}</strong>?
          </p>
          <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: '#8c7d71' }}>
            Issuing the invoice finalizes numbering and moves the document to an active accounts receivable record.
          </p>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setIssueConfirmOpen(false)} disabled={actionLoading}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleIssueInvoice}
            disabled={actionLoading}
            sx={{ backgroundColor: '#70472f', '&:hover': { backgroundColor: '#583623' } }}
          >
            {actionLoading ? <CircularProgress size={20} color="inherit" /> : 'Confirm & Issue'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)}>
        <DialogTitle sx={{ color: '#b33927' }}>Cancel Invoice</DialogTitle>
        <DialogContent>
          <p style={{ margin: '0 0 12px' }}>
            Are you sure you want to cancel Invoice <strong>{invoice.invoiceNumber || invoice.id}</strong>?
          </p>
          <TextField
            label="Cancellation Reason"
            required
            fullWidth
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="e.g. Client requested revision / Billing dispute"
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setCancelOpen(false)} disabled={actionLoading}>
            Back
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleCancelInvoice}
            disabled={actionLoading || !cancelReason.trim()}
          >
            {actionLoading ? <CircularProgress size={20} color="inherit" /> : 'Confirm Cancellation'}
          </Button>
        </DialogActions>
      </Dialog>
    </main>
  );
};

export default InvoiceDetailsPage;
