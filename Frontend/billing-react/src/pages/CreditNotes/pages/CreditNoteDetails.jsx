import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowBack, CheckCircleOutline, Close, ContentCopy, EditOutlined, LocalPrintshopOutlined,
  PaymentsOutlined, ReceiptLongOutlined, SendOutlined, TaskAltOutlined,
} from '@mui/icons-material';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Table,
  TableBody, TableCell, TableHead, TableRow, TextField,
} from '@mui/material';
import { creditNoteService } from '../services/creditNoteService';
import { CreditNoteStatusBadge } from '../components/CreditNoteStatusBadge';
import { DashboardErrorState } from '../../../components/dashboard/DashboardStates';
import { FeedbackSnackbar } from '../../../components/FeedbackSnackbar';
import { formatDate, formatDateTime, money, refundableBalance } from '../utils/creditNoteCalculations';
import '../styles/credit-notes.css';

const actionLabels = { submit: 'Submit for approval', approve: 'Approve credit', reject: 'Reject credit', issue: 'Issue credit note', cancel: 'Cancel credit note', refund: 'Record refund' };

export function CreditNoteDetails() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['creditNotes', id], queryFn: () => creditNoteService.get(id) });
  const [action, setAction] = useState('');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Original payment method');
  const [reference, setReference] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(location.state?.notice || '');
  const note = query.data;
  const isPreview = location.pathname.endsWith('/preview');
  const balance = refundableBalance(note);
  const taxBreakdown = (note?.items || []).reduce((sum, item) => {
    const taxable = Math.max(0, Number(item.quantity || 0) * Number(item.unitPrice || 0) - Number(item.discountAmount || 0));
    const tax = Number(item.taxAmount || taxable * Number(item.taxRate || 0) / 100);
    sum.taxable += taxable;
    if (item.taxMode === 'inter-state') sum.igst += tax;
    else { sum.cgst += tax / 2; sum.sgst += tax / 2; }
    return sum;
  }, { taxable: 0, cgst: 0, sgst: 0, igst: 0 });

  useEffect(() => {
    if (!query.isSuccess) return;
    if (location.pathname.endsWith('/approve') && note.status === 'Pending Approval') setAction('approve');
    if (location.pathname.endsWith('/refund') && ['Issued', 'Partially Refunded'].includes(note.status)) {
      setAmount(String(refundableBalance(note)));
      setAction('refund');
    }
  }, [location.pathname, note, query.isSuccess]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (action === 'issue') {
        const latest = await query.refetch();
        if (latest.isError) throw latest.error;
        if (latest.data?.status !== 'Approved') throw new Error('This credit note is no longer approved for issue. Refresh the page and review its current status.');
      }
      return creditNoteService.transition(id, action, { amount: Number(amount), method, reference: reference.trim(), reason: (action === 'refund' ? refundReason : reason).trim() });
    },
    onSuccess: async (updated) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['creditNotes'] }),
        client.invalidateQueries({ queryKey: ['creditNotes', id] }),
        client.invalidateQueries({ queryKey: ['creditNotes', 'eligibleInvoices'] }),
      ]);
      setAction(''); setReason(''); setError(''); setNotice(`${actionLabels[action]} complete · ${updated.status}`);
      if (location.pathname.endsWith('/approve') || location.pathname.endsWith('/refund')) {
        navigate(`/credit-notes/${id}`, { replace: true });
      }
    },
    onError: (err) => setError(err.message || 'This action could not be completed.'),
  });

  const confirmAction = () => {
    setError('');
    if (['reject', 'cancel'].includes(action) && reason.trim().length < 5) return setError('Add a reason with at least 5 characters.');
    if (action === 'refund' && (!(Number(amount) > 0) || Number(amount) > balance)) return setError(`Enter a refund greater than zero and no more than ${money(balance)}.`);
    if (action === 'refund' && refundReason.trim().length < 5) return setError('Add a refund reason with at least 5 characters.');
    mutation.mutate();
  };

  if (query.isPending) return <main className="cn-page"><div className="cn-loading-card">Loading credit note…</div></main>;
  if (query.isError) return <main className="cn-page"><DashboardErrorState title="Unable to load credit note" message={query.error.message} onRetry={() => query.refetch()} /><Button component={Link} to="/credit-notes">Back to Credit Notes</Button></main>;

  const canSubmit = note.status === 'Draft';
  const canReview = note.status === 'Pending Approval';
  const canIssue = note.status === 'Approved';
  const canRefund = ['Issued', 'Partially Refunded'].includes(note.status) && balance > 0;
  const canCancel = ['Draft', 'Pending Approval', 'Approved'].includes(note.status);

  return (
    <main className={`cn-page cn-details-page ${isPreview ? 'cn-preview-page' : ''}`}>
      {!isPreview && <><div className="cn-detail-toolbar"><Button component={Link} to="/credit-notes" startIcon={<ArrowBack />}>Credit Notes</Button><div><Button variant="outlined" startIcon={<LocalPrintshopOutlined />} onClick={() => navigate(`/credit-notes/${id}/preview`)}>Preview / Print</Button>{canSubmit && <Button component={Link} to={`/credit-notes/${id}/edit`} variant="outlined" startIcon={<EditOutlined />}>Edit draft</Button>}</div></div></>}
      {isPreview && <div className="cn-preview-toolbar"><Button onClick={() => navigate(`/credit-notes/${id}`)} startIcon={<ArrowBack />}>Back to details</Button><Button variant="contained" startIcon={<LocalPrintshopOutlined />} onClick={() => window.print()}>Print credit note</Button></div>}

      <header className="cn-document-header">
        <div className="cn-document-brand"><span className="cn-brand-mark"><ReceiptLongOutlined /></span><div><small>INVOICE.BILLING</small><strong>Credit note</strong></div></div>
        <div className="cn-document-title"><div><span className="cn-eyebrow">CUSTOMER CREDIT</span><h1>{note.number}</h1><p>Credit note for invoice <span>{note.invoiceNumber}</span></p></div><CreditNoteStatusBadge status={note.status} /></div>
        <div className="cn-document-meta"><div><small>Credit note date</small><strong>{formatDate(note.date)}</strong></div><div><small>Created by</small><strong>{note.createdBy || '—'}</strong></div><div><small>Credit type</small><strong>{note.type}</strong></div><button type="button" className="cn-copy-link" onClick={() => { navigator.clipboard?.writeText(note.number || ''); setNotice('Reference copied.'); }}><ContentCopy fontSize="small" /> Copy reference</button></div>
      </header>

      <section className="cn-status-stepper" aria-label="Credit note lifecycle">{['Draft', 'Pending Approval', 'Approved', 'Issued', 'Refunded'].map((status, index) => { const sequence = ['Draft', 'Pending Approval', 'Approved', 'Issued', 'Partially Refunded', 'Refunded']; const current = sequence.indexOf(note.status); const reached = note.status === 'Partially Refunded' ? index <= 3 : current >= 0 && current >= sequence.indexOf(status); return <div key={status} className={reached ? 'reached' : ''}><i>{reached ? '✓' : index + 1}</i><span>{status}</span>{index < 4 && <b />}</div>; })}</section>

      {!isPreview && <section className="cn-action-strip" aria-label="Credit note actions">
        <div><strong>{note.status === 'Pending Approval' ? 'Review required' : note.status === 'Approved' ? 'Ready to issue' : canRefund ? 'Refund available' : 'Credit workflow'}</strong><span>{note.status === 'Pending Approval' ? 'Approval does not change invoice balances.' : note.status === 'Approved' ? 'Issue the approved credit to recognize it financially.' : canRefund ? `${money(balance, note.currency)} remains refundable.` : 'Actions follow the current credit note status.'}</span></div>
        <div className="cn-action-buttons">
          {canSubmit && <Button variant="contained" startIcon={<SendOutlined />} onClick={() => { setAction('submit'); setError(''); }}>Submit</Button>}
          {canReview && <><Button variant="outlined" color="inherit" startIcon={<Close />} onClick={() => { setAction('reject'); setReason(''); setError(''); }}>Reject</Button><Button variant="contained" startIcon={<CheckCircleOutline />} onClick={() => { setAction('approve'); setError(''); }}>Approve</Button></>}
          {canIssue && <Button variant="contained" startIcon={<TaskAltOutlined />} onClick={() => { setAction('issue'); setError(''); }}>Issue credit note</Button>}
          {canRefund && <Button variant="contained" startIcon={<PaymentsOutlined />} onClick={() => { setAmount(String(balance)); setAction('refund'); setError(''); }}>Record refund</Button>}
          {canCancel && <Button className="cn-text-action" onClick={() => { setAction('cancel'); setError(''); }}>Cancel</Button>}
        </div>
      </section>}

      <div className="cn-detail-grid">
        <div className="cn-detail-main">
          <section className="cn-detail-card"><div className="cn-detail-card-heading"><div><h2>Credit summary</h2><p>Credit and tax amounts from the linked invoice lines.</p></div></div>
            <div className="cn-amount-summary"><div><small>Credit subtotal</small><strong>{money(note.subtotal, note.currency)}</strong></div><div><small>Tax adjustment</small><strong>{money(note.taxAmount, note.currency)}</strong></div><div className="emphasis"><small>Total credit</small><strong>{money(note.total, note.currency)}</strong></div></div>
            <div className="cn-detail-table-wrap"><Table size="small"><TableHead><TableRow><TableCell>Description</TableCell><TableCell>Code</TableCell><TableCell align="right">Qty</TableCell><TableCell align="right">Unit price</TableCell><TableCell align="right">Tax</TableCell><TableCell align="right">Total</TableCell></TableRow></TableHead><TableBody>{note.items.map((item, index) => <TableRow key={`${item.id}-${index}`}><TableCell><strong>{item.description}</strong></TableCell><TableCell>{item.code}</TableCell><TableCell align="right">{item.quantity}</TableCell><TableCell align="right">{money(item.unitPrice, note.currency)}</TableCell><TableCell align="right">{item.taxRate}%</TableCell><TableCell align="right">{money(item.totalAmount, note.currency)}</TableCell></TableRow>)}</TableBody></Table></div>
            <div className="cn-detail-tax-breakdown"><span>Taxable credit <strong>{money(taxBreakdown.taxable, note.currency)}</strong></span>{taxBreakdown.cgst > 0 && <span>CGST <strong>{money(taxBreakdown.cgst, note.currency)}</strong></span>}{taxBreakdown.sgst > 0 && <span>SGST <strong>{money(taxBreakdown.sgst, note.currency)}</strong></span>}{taxBreakdown.igst > 0 && <span>IGST <strong>{money(taxBreakdown.igst, note.currency)}</strong></span>}<span>Tax adjustment <strong>{money(note.taxAmount, note.currency)}</strong></span></div>
            <div className="cn-detail-total"><span>Total credit</span><strong>{money(note.total, note.currency)}</strong></div>
          </section>

          <section className="cn-detail-card"><div className="cn-detail-card-heading"><div><h2>Reason &amp; notes</h2><p>Business context recorded for this adjustment.</p></div></div><div className="cn-reason-content"><span className="cn-reason-pill">{note.reason}</span><p>{note.reasonNote || 'No additional details recorded.'}</p>{note.reference && <small>Internal reference: {note.reference}</small>}{note.rejectionReason && <Alert severity="error"><strong>Rejection reason:</strong> {note.rejectionReason}</Alert>}</div></section>

          <section className="cn-detail-card"><div className="cn-detail-card-heading"><div><h2>Approval information</h2><p>Review and decision details returned by the billing API.</p></div></div><div className="cn-approval-grid"><div><small>Created by / at</small><strong>{note.createdBy || 'Not available'}</strong><span>{note.createdAt ? formatDateTime(note.createdAt) : 'Not recorded'}</span></div><div><small>Approved by / at</small><strong>{note.approvedBy || '—'}</strong><span>{note.approvedAt ? formatDateTime(note.approvedAt) : '—'}</span></div><div><small>Rejected by / at</small><strong>{note.rejectedBy || '—'}</strong><span>{note.rejectedAt ? formatDateTime(note.rejectedAt) : '—'}</span></div><div><small>Issued by / at</small><strong>{note.issuedBy || '—'}</strong><span>{note.issuedAt ? formatDateTime(note.issuedAt) : '—'}</span></div></div></section>

          <section className="cn-detail-card"><div className="cn-detail-card-heading"><div><h2>Refund history</h2><p>Refund transactions are tracked separately from issuing the credit.</p></div><span className="cn-refund-total">{money(note.refunded, note.currency)} refunded</span></div>{note.refundHistory?.length ? <div className="cn-detail-table-wrap"><Table size="small"><TableHead><TableRow><TableCell>Refund date</TableCell><TableCell>Method</TableCell><TableCell>Reference</TableCell><TableCell>Processed by</TableCell><TableCell align="right">Amount</TableCell></TableRow></TableHead><TableBody>{note.refundHistory.map((refund) => <TableRow key={refund.id || refund.reference || refund.date}><TableCell>{formatDate(refund.date)}</TableCell><TableCell>{refund.method || '—'}</TableCell><TableCell>{refund.reference || refund.refundNumber || '—'}</TableCell><TableCell>{refund.processedBy || '—'}</TableCell><TableCell align="right">{money(refund.amount, note.currency)}</TableCell></TableRow>)}</TableBody></Table></div> : <div className="cn-empty-inline"><PaymentsOutlined /><span>No refunds recorded for this credit note.</span></div>}</section>
        </div>

        <aside className="cn-detail-aside">
          <section className="cn-detail-card cn-linked-invoice"><div className="cn-detail-card-heading"><div><h2>Customer &amp; invoice</h2><p>Original billing record</p></div></div><small>Customer</small><strong>{note.customer}</strong>{note.email && <a href={`mailto:${note.email}`}>{note.email}</a>}<hr /><div><small>Invoice</small><span>{note.invoiceNumber}</span></div><div><small>Credit note date</small><strong>{formatDate(note.date)}</strong></div><div><small>Original invoice total</small><strong>{money(note.invoiceTotal || 0, note.currency)}</strong></div></section>
          <section className="cn-detail-card cn-refund-balance"><div className="cn-refund-balance-icon"><PaymentsOutlined /></div><small>Remaining refundable</small><strong>{money(balance, note.currency)}</strong><span>{money(note.refunded, note.currency)} of {money(note.total, note.currency)} refunded</span><div className="cn-refund-progress"><i style={{ width: `${note.total ? Math.min(100, note.refunded / note.total * 100) : 0}%` }} /></div></section>
          <section className="cn-detail-card"><div className="cn-detail-card-heading"><div><h2>Activity</h2><p>Lifecycle events provided by the billing API</p></div></div><div className="cn-timeline">{[...(note.timeline || [])].reverse().map((entry, index) => <div className="cn-timeline-item" key={`${entry.label}-${index}`}><span className="cn-timeline-dot" /><div><strong>{entry.label}</strong><small>{entry.timestamp ? formatDateTime(entry.timestamp) : entry.date}</small><small>{entry.actor || ''}{entry.previousStatus || entry.newStatus ? ` · ${entry.previousStatus || '—'} → ${entry.newStatus || '—'}` : ''}</small>{(entry.reason || entry.referenceId) && <small>{entry.reason}{entry.referenceId ? ` · Ref ${entry.referenceId}` : ''}</small>}</div></div>)}</div></section>
        </aside>
      </div>

      <Dialog open={Boolean(action)} onClose={() => !mutation.isPending && setAction('')} fullWidth maxWidth={action === 'refund' ? 'sm' : 'xs'}>
        <DialogTitle>{actionLabels[action] || 'Confirm action'}</DialogTitle>
        <DialogContent className="cn-dialog-content">
          {action === 'refund' ? <><Alert severity="info">Issued credit: {money(note.total, note.currency)} · Already refunded: {money(note.refunded, note.currency)} · Remaining refundable: <strong>{money(balance, note.currency)}</strong>. A credit note changes the invoice ledger; a refund returns money separately.</Alert><TextField required type="number" label="Refund amount" value={amount} onChange={(event) => setAmount(event.target.value)} inputProps={{ min: 0.01, max: balance, step: 0.01 }} /><TextField select label="Refund method" value={method} onChange={(event) => setMethod(event.target.value)}>{['Original payment method', 'Bank transfer', 'UPI', 'Cheque', 'Other'].map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField><TextField label="Refund reference" placeholder="Bank / gateway reference" value={reference} onChange={(event) => setReference(event.target.value)} /><TextField required multiline minRows={2} label="Refund notes" value={refundReason} onChange={(event) => setRefundReason(event.target.value)} helperText="At least 5 characters required." /></> : ['reject', 'cancel'].includes(action) ? <TextField required multiline minRows={3} label={action === 'reject' ? 'Rejection reason' : 'Cancellation reason'} value={reason} onChange={(event) => setReason(event.target.value)} helperText="At least 5 characters required." /> : <p className="cn-dialog-copy">{action === 'issue' ? 'Issuing this credit recognizes the adjustment against the invoice.' : action === 'approve' ? 'Approval records the review decision. Invoice totals change when the credit note is issued.' : action === 'submit' ? 'Submit this draft to the approval queue?' : `Confirm ${actionLabels[action]?.toLowerCase()}?`}</p>}
          {error && <Alert severity="error">{error}</Alert>}
        </DialogContent>
        <DialogActions><Button onClick={() => setAction('')} disabled={mutation.isPending}>Keep as is</Button><Button variant="contained" onClick={confirmAction} disabled={mutation.isPending}>{mutation.isPending ? 'Processing…' : action === 'refund' ? 'Record refund' : 'Confirm'}</Button></DialogActions>
      </Dialog>
      {!isPreview && <FeedbackSnackbar message={notice} onClose={() => setNotice('')} />}
    </main>
  );
}

export default CreditNoteDetails;
