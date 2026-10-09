import { useState, useEffect, useRef } from 'react';
import { Button, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { Link, useParams, useLocation } from 'react-router-dom';
import {
  LocalPrintshopOutlined,
  AccessTimeOutlined,
  PersonOutline,
  AddCircleOutline,
  UndoOutlined,
  HistoryOutlined,
  SwapHorizOutlined,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { FeedbackSnackbar } from '../../components/FeedbackSnackbar';
import { PaymentShell, PaymentState, PaymentValues, PaymentStatus, usePaymentUser } from './PaymentShared';
import { paymentService, money, displayDate, formatIndianDateTime } from './paymentService';
import { PaymentReversal } from './PaymentReversal';
import { buildPaymentReceiptReport, printPaymentDocument } from './paymentReports';

function parseAuditChanges(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function humanizeAction(action) {
  if (!action) return 'Audit Event';
  const map = {
    PaymentCreated: 'Payment Created',
    PaymentStatusChanged: 'Payment Status Changed',
    PaymentReversed: 'Payment Reversed',
    PaymentUpdated: 'Payment Updated',
    PaymentAllocated: 'Invoice Allocated',
  };
  return map[action] || action.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function getActionType(action) {
  if (action === 'PaymentCreated') return 'created';
  if (action === 'PaymentStatusChanged') return 'status';
  if (action === 'PaymentReversed') return 'reversed';
  return 'default';
}

function AuditChangesView({ changes, currency }) {
  const parsed = parseAuditChanges(changes);
  if (!parsed) {
    if (!changes) return null;
    return <div className="payment-changes-card"><p className="payment-change-raw-text">{String(changes)}</p></div>;
  }

  const ignoredKeys = new Set(['eventType', 'tenantId', 'paymentId', 'idempotencyKey', 'timestampUtc', 'changedBy', 'createdBy']);
  const isCreated = parsed.eventType === 'PaymentCreated' || Boolean(parsed.amount && parsed.method);
  const isStatus = parsed.eventType === 'PaymentStatusChanged' || Boolean(parsed.newStatus);
  const isReversal = parsed.eventType === 'PaymentReversed' || Boolean(parsed.reversalReason);

  return (
    <div className="payment-changes-card">
      {isCreated && (
        <div className="payment-changes-grid">
          {parsed.paymentNumber && (
            <div className="payment-change-item">
              <span className="payment-change-label">Payment ID</span>
              <strong className="payment-change-val">{parsed.paymentNumber}</strong>
            </div>
          )}
          {parsed.amount != null && (
            <div className="payment-change-item">
              <span className="payment-change-label">Amount</span>
              <strong className="payment-change-val payment-amount-highlight">{money(parsed.amount, parsed.currency || currency)}</strong>
            </div>
          )}
          {parsed.allocatedAmount != null && (
            <div className="payment-change-item">
              <span className="payment-change-label">Allocated</span>
              <strong className="payment-change-val">{money(parsed.allocatedAmount, parsed.currency || currency)}</strong>
            </div>
          )}
          {parsed.method && (
            <div className="payment-change-item">
              <span className="payment-change-label">Method</span>
              <strong className="payment-change-val">{parsed.method}</strong>
            </div>
          )}
          {parsed.status && (
            <div className="payment-change-item">
              <span className="payment-change-label">Initial Status</span>
              <div><PaymentStatus status={parsed.status} /></div>
            </div>
          )}
          {parsed.maskedReference && (
            <div className="payment-change-item">
              <span className="payment-change-label">Reference</span>
              <strong className="payment-change-val">{parsed.maskedReference}</strong>
            </div>
          )}
        </div>
      )}

      {isStatus && !isCreated && (
        <div className="payment-changes-grid">
          <div className="payment-change-item">
            <span className="payment-change-label">Status Update</span>
            <div className="payment-status-transition">
              {parsed.previousStatus ? (
                <>
                  <span className="payment-status-from">{parsed.previousStatus}</span>
                  <span className="payment-status-arrow">&rarr;</span>
                  <PaymentStatus status={parsed.newStatus} />
                </>
              ) : (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <span>Set to:</span>
                  <PaymentStatus status={parsed.newStatus} />
                </div>
              )}
            </div>
          </div>
          {parsed.paymentNumber && (
            <div className="payment-change-item">
              <span className="payment-change-label">Payment #</span>
              <strong className="payment-change-val">{parsed.paymentNumber}</strong>
            </div>
          )}
        </div>
      )}

      {isReversal && (
        <div className="payment-changes-grid">
          <div className="payment-change-item">
            <span className="payment-change-label">Reversal Reason</span>
            <strong className="payment-change-val">{parsed.reason || parsed.reversalReason || 'No reason specified'}</strong>
          </div>
        </div>
      )}

      {!isCreated && !isStatus && !isReversal && (
        <div className="payment-changes-grid">
          {Object.entries(parsed).filter(([k]) => !ignoredKeys.has(k)).map(([key, val]) => (
            <div className="payment-change-item" key={key}>
              <span className="payment-change-label">{key.replace(/([a-z])([A-Z])/g, '$1 $2')}</span>
              <strong className="payment-change-val">{typeof val === 'object' ? JSON.stringify(val) : String(val ?? '\u2014')}</strong>
            </div>
          ))}
        </div>
      )}

      {Array.isArray(parsed.allocations) && parsed.allocations.length > 0 && (
        <div className="payment-allocations-mini">
          <strong>Allocated Invoices</strong>
          <div className="payment-allocations-tags">
            {parsed.allocations.map((a, i) => (
              <span key={i} className="payment-alloc-tag">
                Invoice #{a.invoiceNumber || a.invoiceId}: {money(a.allocatedAmount || a.amount, parsed.currency || currency)}
              </span>
            ))}
          </div>
        </div>
      )}

      <details className="payment-raw-details">
        <summary>View raw event JSON</summary>
        <pre className="payment-raw-json">{typeof changes === 'string' ? changes : JSON.stringify(changes, null, 2)}</pre>
      </details>
    </div>
  );
}

function PaymentAuditTimeline({ history = [], currency }) {
  if (!history.length) {
    return <p className="payment-audit-empty">No audit history available for this payment.</p>;
  }

  return (
    <div className="payment-timeline-wrapper">
      <ul className="payment-timeline-list">
        {history.map((event, index) => {
          const type = getActionType(event.action);
          return (
            <li key={event.id || index} className={`payment-timeline-item badge-${type}`}>
              <div className="payment-timeline-node">
                {type === 'created' ? <AddCircleOutline fontSize="small" /> :
                 type === 'reversed' ? <UndoOutlined fontSize="small" /> :
                 type === 'status' ? <SwapHorizOutlined fontSize="small" /> :
                 <HistoryOutlined fontSize="small" />}
              </div>
              <div className="payment-timeline-content">
                <div className="payment-timeline-head">
                  <div className="payment-timeline-title-wrap">
                    <strong className="payment-timeline-action">{humanizeAction(event.action)}</strong>
                    <span className={`payment-timeline-chip chip-${type}`}>{event.action}</span>
                  </div>
                  <div className="payment-timeline-time" title={event.timestamp}>
                    <AccessTimeOutlined fontSize="inherit" />
                    <span>{formatIndianDateTime(event.timestamp)}</span>
                  </div>
                </div>
                <div className="payment-timeline-actor">
                  <PersonOutline fontSize="inherit" />
                  <span>Performed by: <strong>{event.userName || 'System'}</strong></span>
                </div>
                {event.changes && <AuditChangesView changes={event.changes} currency={currency} />}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PaymentDetails() {
  const [invoiceId, setInvoiceId] = useState(null);
  const invoice = useQuery({ queryKey: ['payment-balance', invoiceId], queryFn: ({ signal }) => paymentService.getInvoiceBalance(invoiceId, { signal }), enabled: Boolean(invoiceId), retry: false });
  const { id } = useParams();
  const location = useLocation();
  const [notice, setNotice] = useState(location.state?.paymentNotice || '');
  const [reversal, setReversal] = useState(false);
  const user = usePaymentUser();
  const query = useQuery({ queryKey: ['payments', 'detail', id], queryFn: ({ signal }) => paymentService.getPaymentById(id, { signal }), retry: false });
  const p = query.data;
  const printedReceipt = useRef(null);

  useEffect(() => {
    if (p && new URLSearchParams(location.search).get('print') === 'true' && printedReceipt.current !== id) {
      printedReceipt.current = id;
      printPaymentDocument(buildPaymentReceiptReport(p));
    }
  }, [p, id, location.search]);

  return <PaymentShell title="Payment Details" subtitle="Review payment information, allocations and print receipt." actions={<>
    <Button component={Link} to="/payments">Back to Payments</Button>
    <Button disabled={query.isFetching} onClick={() => query.refetch()}>Refresh</Button>
    <Button variant="contained" startIcon={<LocalPrintshopOutlined />} onClick={() => printPaymentDocument(buildPaymentReceiptReport(p))} disabled={!p || query.isFetching}>Print Receipt</Button>
    {p?.isReversible && p.status !== 'Reversed' && user.permissions.reverse && <Button onClick={() => setReversal(true)}>Reverse Payment</Button>}
  </>}>
    <FeedbackSnackbar message={notice} onClose={() => setNotice('')} />
    <PaymentState loading={query.isPending} error={query.error || user.error} empty={!query.isPending && !p ? 'No payment details available.' : ''} onRetry={() => { query.refetch(); user.refetch(); }} />
    {p && <>
      <section className="payment-panel payment-summary-card" aria-labelledby="payment-summary-title">
        <header className="payment-detail-heading"><div><h2 id="payment-summary-title">Payment Summary</h2><p>{p.paymentNumber || p.id}</p></div><PaymentStatus status={p.status} /></header>
        <div className="payment-summary-content">
          <dl className="payment-summary-totals">
            <div><dt>Payment Amount</dt><dd>{money(p.amount, p.currency)}</dd></div>
            <div><dt>Allocated Amount</dt><dd>{money(p.allocatedAmount, p.currency)}</dd></div>
          </dl>
          <PaymentValues values={[
            ['Customer', p.customerName],
            ['Payment Date', displayDate(p.paymentDate)],
            ['Method', p.methodDisplay],
            ['Reference', p.reference || p.providerTransactionId || p.chequeNumber],
            ['Created By', p.createdBy],
            ['Created At', formatIndianDateTime(p.createdAtUtc)],
            ...[
              ['Bank', p.bankName],
              ['Provider', p.providerName],
              ['Cheque Status', p.clearingStatus],
            ].filter(([, value]) => value != null && value !== ''),
          ]} />
        </div>
        <div className="payment-summary-notes"><h3>Notes</h3><p>{p.notes || '\u2014'}</p></div>
      </section>
      <section className="payment-panel payment-allocation-card" aria-labelledby="payment-allocation-title">
        <header className="payment-detail-heading"><div><h2 id="payment-allocation-title">Invoice Allocation</h2><p>Payment allocation and current invoice balances</p></div></header>
        {p.allocations.length ? <div className="payment-allocation-scroll" role="region" aria-label="Invoice allocations" tabIndex={0}>
          <table className="payment-allocation-table"><thead><tr>{['Invoice', 'Allocated Amount', 'Paid Total', 'Outstanding', 'Invoice Status', 'Actions'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody>{p.allocations.map(a => <tr key={a.id}>
              <td><strong>{a.invoiceNumber || a.invoiceId}</strong></td>
              <td>{money(a.allocatedAmount, p.currency)}</td><td>{money(a.invoicePaidAmount, p.currency)}</td><td>{money(a.invoiceBalanceAmount, p.currency)}</td>
              <td>{a.invoiceStatus || '\u2014'}</td>
              <td><Button size="small" variant="outlined" className="payment-view-invoice-btn" onClick={() => setInvoiceId(a.invoiceId)}>View Invoice</Button></td>
            </tr>)}</tbody>
          </table>
        </div> : <p className="payment-allocation-empty">No invoice allocations available.</p>}
      </section>
      {p.status === 'Reversed' && (
        <section className="payment-panel">
          <h2>Reversal Information</h2>
          <PaymentValues values={[
            ['Reversal status', p.status],
            ['Reversal Date', formatIndianDateTime(p.reversedAtUtc)],
            ['Reversal Reason', p.reversalReason],
            ['Reversed By', p.reversedBy],
          ]} />
        </section>
      )}
      <section className="payment-panel payment-audit-panel">
        <div className="payment-audit-header">
          <div>
            <h2>Audit Timeline</h2>
            <p>System activity, status changes and event history</p>
          </div>
          {p.auditHistory.length > 0 && (
            <span className="payment-audit-badge">{p.auditHistory.length} events</span>
          )}
        </div>
        <PaymentAuditTimeline history={p.auditHistory} currency={p.currency} />
      </section>
    </>}
    <Dialog className="payment-dialog" open={Boolean(invoiceId)} onClose={() => setInvoiceId(null)} fullWidth maxWidth="sm">
      <DialogTitle>Invoice Details</DialogTitle>
      <DialogContent>
        <PaymentState loading={invoice.isFetching} error={invoice.error} onRetry={() => invoice.refetch()} />
        {invoice.data && (
          <PaymentValues values={[
            ['Invoice Number', invoice.data.invoiceNumber],
            ['Customer', invoice.data.customerName],
            ['Invoice Date', displayDate(invoice.data.invoiceDate)],
            ['Due Date', displayDate(invoice.data.dueDate)],
            ['Invoice Total', money(invoice.data.invoiceTotal, invoice.data.currency)],
            ['Paid Total', money(invoice.data.previouslyPaid, invoice.data.currency)],
            ['Current Outstanding', money(invoice.data.currentOutstanding, invoice.data.currency)],
            ['Status', invoice.data.status],
          ]} />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setInvoiceId(null)}>Close</Button>
      </DialogActions>
    </Dialog>
    <PaymentReversal open={reversal} onClose={() => setReversal(false)} paymentId={id} />
  </PaymentShell>;
}
export default PaymentDetails;
