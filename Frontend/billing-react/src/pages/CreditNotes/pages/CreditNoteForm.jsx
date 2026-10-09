import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Breadcrumbs, Button, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField } from '@mui/material';
import { ArrowBack, ArrowForward, Check, DescriptionOutlined, ReceiptLongOutlined, SavingsOutlined } from '@mui/icons-material';
import { creditNoteService } from '../services/creditNoteService';
import { calculateCredit, creditLineAmounts, eligibleCredit, money, reconcileFullCredit } from '../utils/creditNoteCalculations';
import { CreditNoteStatusBadge } from '../components/CreditNoteStatusBadge';
import { DashboardErrorState } from '../../../components/dashboard/DashboardStates';
import '../styles/credit-notes.css';

const steps = ['Invoice', 'Credit items', 'Reason', 'Review'];
const reasons = ['Goods returned', 'Service cancellation', 'Incorrect quantity', 'Incorrect price', 'Duplicate billing', 'Excess billing', 'Tax correction', 'Service deficiency', 'Commercial adjustment', 'Other'];
const displayedLineTotal = (item, selectedItems, totals, isFull) => {
  const lineTotal = creditLineAmounts(item).total;
  const lastSelected = selectedItems[selectedItems.length - 1];
  return isFull && lastSelected?.id === item.id ? lineTotal + Number(totals.rounding || 0) : lineTotal;
};

export function CreditNoteForm() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [invoiceId, setInvoiceId] = useState(() => location.state?.invoiceId ? String(location.state.invoiceId) : '');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState('');
  const [type, setType] = useState('Partial');
  const [reason, setReason] = useState('');
  const [reasonNote, setReasonNote] = useState('');
  const [reference, setReference] = useState('');
  const [quantities, setQuantities] = useState({});

  const noteQuery = useQuery({ queryKey: ['creditNotes', id], queryFn: () => creditNoteService.get(id), enabled: Boolean(id) });
  useEffect(() => {
    const timer = setTimeout(() => setInvoiceSearchQuery(invoiceSearch.trim()), 250);
    return () => clearTimeout(timer);
  }, [invoiceSearch]);
  const invoicesQuery = useQuery({ queryKey: ['creditNotes', 'eligibleInvoices', invoiceSearchQuery], queryFn: () => creditNoteService.getInvoices({ search: invoiceSearchQuery }) });
  const selectedSummaryQuery = useQuery({ queryKey: ['creditNotes', 'invoiceSummary', invoiceId], queryFn: () => creditNoteService.getInvoiceCreditableSummary(invoiceId), enabled: Boolean(invoiceId) });
  const invoices = invoicesQuery.data || [];
  const selectedInvoice = selectedSummaryQuery.data || invoices.find((invoice) => Number(invoice.id) === Number(invoiceId));
  const selectedItems = useMemo(() => (selectedInvoice?.items || [])
    .map((item) => {
      const enteredQuantity = Number(quantities[item.id]) || 0;
      const quantity = Math.max(0, Math.min(enteredQuantity, Number(item.remainingQuantity) || 0));
      return { ...item, quantity };
    })
    .filter((item) => item.quantity > 0), [selectedInvoice, quantities]);
  const eligibleAmount = eligibleCredit(selectedInvoice);
  const totals = reconcileFullCredit(calculateCredit(selectedItems), selectedItems, eligibleAmount, type === 'Full', selectedInvoice?.items || []);
  const isEditing = Boolean(id);

  useEffect(() => {
    if (isEditing && noteQuery.data) return;
    if (!selectedInvoice?.items?.length || Object.keys(quantities).length) return;
    const firstEligible = selectedInvoice.items.find((item) => Number(item.remainingQuantity) > 0);
    if (firstEligible) {
      setQuantities({ [firstEligible.id]: Math.min(1, Number(firstEligible.remainingQuantity)) });
    }
  }, [selectedInvoice, quantities, isEditing, noteQuery.data]);

  useEffect(() => {
    const note = noteQuery.data;
    if (!note) return;
    if (note.status !== 'Draft') {
      navigate(`/credit-notes/${id}`, { replace: true });
      return;
    }
    if (Number(invoiceId) !== Number(note.invoiceId)) {
      setInvoiceId(note.invoiceId);
      return;
    }
    if (!selectedInvoice) return;
    setInvoiceId(note.invoiceId);
    setType(note.type);
    setReason(note.reason);
    setReasonNote(note.reasonNote || '');
    setReference(note.reference || '');
      setQuantities(Object.fromEntries(note.items.map((item) => [item.id, item.quantity])));
  }, [noteQuery.data, selectedInvoice, invoiceId, id, navigate]);

  const selectInvoice = (value) => {
    setInvoiceId(value);
    setType('Partial');
    setQuantities({});
    setError('');
  };

  const setLineQuantity = (item, value, normalize = false) => {
    const enteredQuantity = Number(value) || 0;
    const parsed = Math.max(0, Math.min(enteredQuantity, Number(item.remainingQuantity) || 0));
    setQuantities((previous) => ({ ...previous, [item.id]: normalize ? (parsed ? String(parsed) : '') : value }));
    setError('');
  };

  const chooseCreditType = (nextType) => {
    setType(nextType);
    if (nextType === 'Full' && selectedInvoice) {
      setQuantities(Object.fromEntries(selectedInvoice.items.map((item) => [item.id, item.remainingQuantity])));
    } else if (nextType === 'Partial' && selectedInvoice) {
      const first = selectedInvoice.items.find((item) => item.remainingQuantity > 0);
      setQuantities(first ? { [first.id]: Math.min(1, first.remainingQuantity) } : {});
    }
  };

  const mutation = useMutation({
    mutationFn: ({ submit }) => creditNoteService.save({
      invoiceId,
      type,
      reason,
      reasonNote: reasonNote.trim(),
      reference: reference.trim(),
      items: selectedItems,
      ...totals,
      submit,
    }, id),
    onSuccess: async (note) => {
      await client.invalidateQueries({ queryKey: ['creditNotes'] });
      navigate(`/credit-notes/${note.id}`, { state: { notice: note.status === 'Pending Approval' ? 'Submitted for approval.' : 'Draft saved.' } });
    },
    onError: (err) => setError(err.message || 'Unable to save this credit note.'),
  });

  const continueStep = () => {
    setError('');
    if (step === 0 && !invoiceId) return setError('Choose an issued invoice before continuing.');
    if (step === 1) {
      if (!selectedItems.length || totals.total <= 0) return setError('Select at least one credit line with a quantity greater than zero.');
      if (totals.total > eligibleAmount) return setError('Credit total exceeds the invoice’s remaining eligible credit. Reduce the selected quantities.');
    }
    if (step === 2 && (!reason || reasonNote.trim().length < 8)) return setError('Choose a reason and enter at least 8 characters of supporting detail.');
    setStep((current) => Math.min(current + 1, steps.length - 1));
  };

  const save = (submit) => {
    setError('');
    if (!invoiceId || !reason || reasonNote.trim().length < 8 || !selectedItems.length || totals.total <= 0 || totals.total > eligibleAmount) {
      setStep(!invoiceId ? 0 : !selectedItems.length || totals.total > eligibleAmount ? 1 : 2);
      setError(!invoiceId ? 'Choose an issued invoice.' : !selectedItems.length || totals.total <= 0 ? 'Add a valid credit line.' : totals.total > eligibleAmount ? 'Credit total exceeds the remaining eligible amount.' : 'Add a reason and supporting detail before saving.');
      return;
    }
    mutation.mutate({ submit });
  };

  if (isEditing && noteQuery.isPending) return <main className="cn-page"><div className="cn-loading-card">Loading draft…</div></main>;
  if (isEditing && noteQuery.isError) return <main className="cn-page"><DashboardErrorState title="Unable to load credit note" message={noteQuery.error.message} onRetry={() => noteQuery.refetch()} /><Button component={Link} to="/credit-notes">Back to Credit Notes</Button></main>;

  return (
    <main className="cn-page cn-form-page">
      <Breadcrumbs className="cn-breadcrumbs" aria-label="Breadcrumb"><Link to="/credit-notes">Credit Notes</Link><span>{isEditing ? 'Edit draft' : 'Create'}</span></Breadcrumbs>
      <header className="cn-page-heading"><div><span className="cn-eyebrow">CREDIT WORKFLOW</span><h1>{isEditing ? `Edit ${noteQuery.data?.number || 'draft'}` : 'Create Credit Note'}</h1><p>Link every credit to its original invoice and keep the reason on record.</p></div><Button component={Link} to={isEditing ? `/credit-notes/${id}` : '/credit-notes'} variant="outlined" startIcon={<ArrowBack />}>Back to register</Button></header>

      <nav className="cn-stepper" aria-label="Credit note creation steps">{steps.map((label, index) => <button type="button" key={label} className={`cn-step ${step === index ? 'active' : ''} ${step > index ? 'complete' : ''}`} onClick={() => index < step && setStep(index)}><span>{step > index ? <Check fontSize="small" /> : index + 1}</span><b>{label}</b></button>)}</nav>

      <div className="cn-form-layout">
        <section className="cn-form-card">
          {step === 0 && <div className="cn-form-section"><div className="cn-section-title"><span className="cn-section-icon"><ReceiptLongOutlined /></span><div><h2>Select source invoice</h2><p>Only invoices with remaining credit eligibility are listed.</p></div></div>
            <TextField className="cn-invoice-search" size="small" label="Find an invoice" placeholder="Invoice number or customer" value={invoiceSearch} onChange={(event) => setInvoiceSearch(event.target.value)} />
            <div className="cn-invoice-options">{invoicesQuery.isPending ? <div className="cn-loading-card">Loading eligible invoices…</div> : invoicesQuery.isError ? <DashboardErrorState title="Unable to load eligible invoices" message={invoicesQuery.error?.message} onRetry={() => invoicesQuery.refetch()} /> : invoices.length ? invoices.map((invoice) => <button type="button" key={invoice.id} onClick={() => selectInvoice(invoice.id)} className={`cn-invoice-option ${Number(invoiceId) === Number(invoice.id) ? 'selected' : ''}`}><span className="cn-radio-mark" /><span className="cn-invoice-copy"><strong>{invoice.number}</strong><b>{invoice.customer}</b><small>{invoice.email || 'Customer email unavailable'} · {invoice.date ? new Date(invoice.date).toLocaleDateString('en-IN') : 'Invoice date unavailable'}</small></span><span className="cn-invoice-amount"><small>Remaining creditable</small><strong>{money(eligibleCredit(invoice), invoice.currency)}</strong><small>{money(invoice.total, invoice.currency)} invoice total</small></span></button>) : <div className="cn-empty-inline">No eligible invoices found for this search.</div>}</div>
            {invoiceId && selectedSummaryQuery.isPending && <div className="cn-loading-card">Loading authoritative invoice eligibility…</div>}
            {selectedSummaryQuery.isError && <DashboardErrorState title="Unable to load invoice eligibility" message={selectedSummaryQuery.error.message} onRetry={() => selectedSummaryQuery.refetch()} />}
            {selectedInvoice && <>
              {Number(selectedInvoice.previousCredits) > 0 && <div className="cn-previous-credit-warning"><strong>Previous issued credits: {money(selectedInvoice.previousCredits, selectedInvoice.currency)}</strong><span>This amount is already reflected in invoice eligibility. Available additional credit: {money(eligibleAmount, selectedInvoice.currency)}.</span></div>}
              <div className="cn-eligibility-summary"><div><small>Original invoice total</small><strong>{money(selectedInvoice.total, selectedInvoice.currency)}</strong></div><div><small>Payments received</small><strong>{money(selectedInvoice.paid, selectedInvoice.currency)}</strong></div><div><small>Previous issued credits</small><strong>{money(selectedInvoice.previousCredits, selectedInvoice.currency)}</strong></div><div><small>Current amount due</small><strong>{money(selectedInvoice.currentDue, selectedInvoice.currency)}</strong></div><div className="cn-eligibility-highlight"><small>Remaining creditable</small><strong>{money(eligibleAmount, selectedInvoice.currency)}</strong></div></div>
            </>}
          </div>}

          {step === 1 && <div className="cn-form-section"><div className="cn-section-title"><span className="cn-section-icon"><SavingsOutlined /></span><div><h2>Choose credit scope &amp; items</h2><p>Set credit quantities within the remaining invoice quantities.</p></div></div>
            <div className="cn-credit-type-select"><span>Credit scope</span><div>{['Partial', 'Full'].map((option) => <button key={option} type="button" className={type === option ? 'selected' : ''} onClick={() => chooseCreditType(option)}><strong>{option} credit</strong><small>{option === 'Full' ? 'Credit all remaining eligible invoice quantities' : 'Choose specific items and quantities'}</small></button>)}</div></div>
            <TableContainer className="cn-lines-table"><Table size="small"><TableHead><TableRow><TableCell>Item / service · HSN/SAC</TableCell><TableCell align="right">Original qty</TableCell><TableCell align="right">Previously credited</TableCell><TableCell align="right">Available qty</TableCell><TableCell align="right">Unit price</TableCell><TableCell align="right">Tax</TableCell><TableCell align="right">Credit qty</TableCell><TableCell align="right">Credit total</TableCell></TableRow></TableHead><TableBody>{(selectedInvoice?.items || []).map((item) => { const quantity = Number(quantities[item.id]) || 0; const selectedItem = selectedItems.find((selected) => selected.id === item.id); const lineTotal = selectedItem ? displayedLineTotal(selectedItem, selectedItems, totals, type === 'Full') : creditLineAmounts(item, quantity).total; const previousQty = Math.max(0, item.quantity - item.remainingQuantity); return <TableRow key={item.id} className={!item.remainingQuantity ? 'cn-line-fully-credited' : ''}><TableCell><strong>{item.description}</strong><small className="cn-sub-cell">{item.code}</small></TableCell><TableCell align="right">{item.quantity}</TableCell><TableCell align="right">{previousQty}</TableCell><TableCell align="right">{item.remainingQuantity > 0 ? item.remainingQuantity : <span className="cn-fully-credited">Fully credited</span>}</TableCell><TableCell align="right">{money(item.unitPrice, selectedInvoice.currency)}</TableCell><TableCell align="right">{item.taxRate}%</TableCell><TableCell align="right"><TextField disabled={!item.remainingQuantity} type="number" size="small" value={quantities[item.id] ?? ''} inputProps={{ min: 0, max: item.remainingQuantity, step: 0.01, 'aria-label': `Quantity to credit for ${item.description}` }} onChange={(event) => setLineQuantity(item, event.target.value)} onBlur={(event) => setLineQuantity(item, event.target.value, true)} /></TableCell><TableCell align="right"><strong>{money(lineTotal, selectedInvoice.currency)}</strong></TableCell></TableRow>; })}</TableBody></Table></TableContainer>
            <div className={`cn-eligibility-message ${totals.total > eligibleAmount ? 'warning' : ''}`}><span>{totals.total > eligibleAmount ? `Credit exceeds remaining eligibility by ${money(totals.total - eligibleAmount, selectedInvoice?.currency)}` : 'Remaining invoice credit'}</span><strong>{money(eligibleAmount, selectedInvoice?.currency)}</strong></div>
          </div>}

          {step === 2 && <div className="cn-form-section"><div className="cn-section-title"><span className="cn-section-icon"><DescriptionOutlined /></span><div><h2>Reason &amp; supporting details</h2><p>Keep a clear audit explanation for the customer and finance team.</p></div></div>
            <div className="cn-form-fields"><TextField select required label="Credit reason" value={reason} onChange={(event) => setReason(event.target.value)} error={Boolean(error && !reason)} helperText={error && !reason ? 'Select a reason.' : 'Choose the closest matching reason.'}>{reasons.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField><TextField label="Internal reference (optional)" placeholder="e.g. RMA-2026-1048" value={reference} onChange={(event) => setReference(event.target.value)} className="cn-reference-field" /><TextField required multiline minRows={4} label="Reason details" placeholder="Describe what changed, why this credit is required, and any agreement with the customer." value={reasonNote} onChange={(event) => setReasonNote(event.target.value)} inputProps={{ maxLength: 600 }} helperText={`${reasonNote.length}/600 · minimum 8 characters`} className="cn-notes-field" /></div>
            <div className="cn-attachments-pending"><DescriptionOutlined /><div><strong>Supporting documents</strong><span>Document uploads are not supported by the current Credit Notes API.</span></div><b>NOT AVAILABLE</b></div>
            <div className="cn-info-callout"><strong>Financial history stays traceable</strong><span>This creates a credit record linked to {selectedInvoice?.number || 'the invoice'}. It does not itself record a cash refund.</span></div>
          </div>}

          {step === 3 && <div className="cn-form-section"><div className="cn-section-title"><span className="cn-section-icon"><Check /></span><div><h2>Review credit note</h2><p>Confirm source, value, tax and business reason before saving.</p></div></div>
            <div className="cn-review-header"><div><small>Source invoice</small><strong>{selectedInvoice?.number}</strong><span>{selectedInvoice?.customer}</span></div><span className={`cn-type-pill ${type.toLowerCase()}`}>{type} credit</span></div>
            <TableContainer className="cn-lines-table"><Table size="small"><TableHead><TableRow><TableCell>Description</TableCell><TableCell>Code</TableCell><TableCell align="right">Qty</TableCell><TableCell align="right">Tax rate</TableCell><TableCell align="right">Amount</TableCell></TableRow></TableHead><TableBody>{selectedItems.map((item) => <TableRow key={item.id}><TableCell>{item.description}</TableCell><TableCell>{item.code}</TableCell><TableCell align="right">{item.quantity}</TableCell><TableCell align="right">{item.taxRate}%</TableCell><TableCell align="right">{money(displayedLineTotal(item, selectedItems, totals, type === 'Full'))}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
            <div className="cn-review-reason"><small>Reason · {reason}</small><p>{reasonNote}</p></div>
          </div>}

          {error && <div className="cn-form-error" role="alert">{error}</div>}
          {mutation.isError && !error && <div className="cn-form-error" role="alert">{mutation.error.message}</div>}
          <footer className="cn-form-actions"><Button component={Link} to={isEditing ? `/credit-notes/${id}` : '/credit-notes'} color="inherit">Cancel</Button><div>{step > 0 && <Button startIcon={<ArrowBack />} onClick={() => { setError(''); setStep((current) => current - 1); }}>Previous</Button>}{step < steps.length - 1 ? <Button variant="contained" endIcon={<ArrowForward />} onClick={continueStep}>Continue</Button> : <><Button variant="outlined" disabled={mutation.isPending} onClick={() => save(false)}>{mutation.isPending ? 'Saving…' : 'Save draft'}</Button><Button variant="contained" disabled={mutation.isPending} onClick={() => save(true)}>{mutation.isPending ? 'Submitting…' : 'Submit for approval'}</Button></>}</div></footer>
        </section>

        <aside className="cn-calculation-card"><div className="cn-calc-title"><span className="cn-section-icon"><SavingsOutlined /></span><div><h2>Credit calculation</h2><small>Live preview · {selectedInvoice?.currency || 'INR'}</small></div></div><div className="cn-calc-row"><span>Credit subtotal</span><strong>{money(totals.subtotal, selectedInvoice?.currency)}</strong></div><div className="cn-calc-row"><span>Tax adjustment</span><strong>{money(totals.taxAmount, selectedInvoice?.currency)}</strong></div><div className="cn-calc-row cn-calc-total"><span>Total credit</span><strong>{money(totals.total, selectedInvoice?.currency)}</strong></div><div className="cn-calc-balance"><small>Eligible invoice credit</small><strong>{money(eligibleAmount, selectedInvoice?.currency)}</strong><span>{eligibleAmount ? `${Math.max(0, (eligibleAmount - totals.total) / eligibleAmount * 100).toFixed(0)}% remains after this credit` : 'Choose an invoice to see eligibility'}</span></div><div className="cn-calc-lock"><span>✓</span><p>Credit total is capped by the selected invoice’s remaining eligibility.</p></div></aside>
      </div>
    </main>
  );
}

export default CreditNoteForm;
