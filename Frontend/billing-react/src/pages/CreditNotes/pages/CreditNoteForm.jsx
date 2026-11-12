import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import ArrowBack from '@mui/icons-material/ArrowBack';
import ArrowForward from '@mui/icons-material/ArrowForward';
import Check from '@mui/icons-material/Check';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import RefreshOutlined from '@mui/icons-material/RefreshOutlined';
import SavingsOutlined from '@mui/icons-material/SavingsOutlined';
import { creditNoteService } from '../services/creditNoteService';
import { calculateCredit, creditBalance, creditLineAmounts, creditQuantitiesForScope, eligibleCredit, invoiceLineWarnings, money, reconcileFullCredit, roundCurrency, validateCreditQuantity } from '../utils/creditNoteCalculations';
import { CreditNoteStatusBadge } from '../components/CreditNoteStatusBadge';
import { DashboardErrorState } from '../../../components/dashboard/DashboardStates';
import { WorkspacePagination } from '../../../components/WorkspacePagination';
import '../styles/credit-notes.css';
import { useDraftState, useFormDraft } from '../../../context/FormDraftContext';

const steps = ['Invoice', 'Credit items', 'Reason', 'Review'];
const reasons = ['Goods returned', 'Service cancellation', 'Incorrect quantity', 'Incorrect price', 'Duplicate billing', 'Excess billing', 'Tax correction', 'Service deficiency', 'Commercial adjustment', 'Other'];
const displayedLineTotal = (item, selectedItems, totals) => {
  const lineTotal = creditLineAmounts(item).total;
  const lastSelected = selectedItems[selectedItems.length - 1];
  return Number(totals.rounding || 0) !== 0 && lastSelected?.id === item.id ? roundCurrency(lineTotal + Number(totals.rounding || 0)) : lineTotal;
};

export function CreditNoteForm() {
  const { id } = useParams();
  const draftKey = `credit-note:${id || 'new'}`;
  const draft = useFormDraft(draftKey);
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [step, setStep] = useDraftState(draftKey, 'step', 0);
  const [error, setError] = useState('');
  const [invoiceId, setInvoiceId] = useDraftState(draftKey, 'invoiceId', () => location.state?.invoiceId ? String(location.state.invoiceId) : '');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState('');
  const [invoicePage, setInvoicePage] = useState(0);
  const [invoicePageSize, setInvoicePageSize] = useState(5);
  const [activeEligibilityCard, setActiveEligibilityCard] = useState('');
  const [type, setType] = useDraftState(draftKey, 'type', 'Partial');
  const [reason, setReason] = useDraftState(draftKey, 'reason', '');
  const [reasonNote, setReasonNote] = useDraftState(draftKey, 'reasonNote', '');
  const [reference, setReference] = useDraftState(draftKey, 'reference', '');
  const [quantities, setQuantities] = useDraftState(draftKey, 'quantities', {});

  const noteQuery = useQuery({ queryKey: ['creditNotes', id], queryFn: () => creditNoteService.get(id), enabled: Boolean(id) });
  useEffect(() => {
    const timer = setTimeout(() => setInvoiceSearchQuery(invoiceSearch.trim()), 250);
    return () => clearTimeout(timer);
  }, [invoiceSearch]);
  useEffect(() => { setInvoicePage(0); }, [invoiceSearchQuery]);
  const invoicesQuery = useQuery({ queryKey: ['creditNotes', 'eligibleInvoices', invoiceSearchQuery], queryFn: () => creditNoteService.getInvoices({ search: invoiceSearchQuery }) });
  const selectedSummaryQuery = useQuery({ queryKey: ['creditNotes', 'invoiceSummary', invoiceId], queryFn: () => creditNoteService.getInvoiceCreditableSummary(invoiceId), enabled: Boolean(invoiceId) });
  const invoices = invoicesQuery.data || [];
  const visibleInvoices = invoices.slice(invoicePage * invoicePageSize, (invoicePage + 1) * invoicePageSize);
  const selectedInvoice = selectedSummaryQuery.data || invoices.find((invoice) => Number(invoice.id) === Number(invoiceId));
  const [refreshing, setRefreshing] = useState(false);
  const refreshData = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([
        invoicesQuery.refetch(),
        ...(invoiceId ? [selectedSummaryQuery.refetch()] : []),
        ...(id ? [noteQuery.refetch()] : []),
      ]);
    } finally {
      setRefreshing(false);
    }
  };
  const quantityValidation = useMemo(() => new Map((selectedInvoice?.items || []).map((item) => [
    item.id,
    validateCreditQuantity(quantities[item.id] ?? '', item.remainingQuantity),
  ])), [selectedInvoice, quantities]);
  const hasQuantityErrors = [...quantityValidation.values()].some((result) => !result.valid);
  const selectedItems = useMemo(() => (selectedInvoice?.items || [])
    .map((item) => ({ ...item, quantity: quantityValidation.get(item.id)?.quantity || 0 }))
    .filter((item) => item.quantity > 0), [selectedInvoice, quantityValidation]);
  const eligibleAmount = eligibleCredit(selectedInvoice);
  const totals = reconcileFullCredit(
    calculateCredit(selectedItems),
    selectedItems,
    eligibleAmount,
    type === 'Full',
    selectedInvoice?.items || [],
    { charges: selectedInvoice?.charges, rounding: selectedInvoice?.rounding },
  );
  const creditAmounts = creditBalance(eligibleAmount, totals.total);
  const invoiceWarnings = useMemo(() => selectedItems
    .flatMap((item) => invoiceLineWarnings(item, selectedInvoice?.currency).map((warning, index) => ({ id: `${item.id}-${index}`, description: item.description, warning }))), [selectedItems, selectedInvoice?.currency]);
  const isEditing = Boolean(id);
  const reasonStepValid = Boolean(reason && reasonNote.trim().length >= 8);

  useEffect(() => {
    const note = noteQuery.data;
    if (!note) return;
    if (note.status !== 'Draft') {
      navigate(`/credit-notes/${id}`, { replace: true });
      return;
    }
    if (draft.has('reason')) return;
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
    const deselect = !isEditing && Boolean(invoiceId) && String(invoiceId) === String(value);
    setInvoiceId(deselect ? '' : value);
    setActiveEligibilityCard('');
    setType('Partial');
    setQuantities({});
    if (deselect) { setReason(''); setReasonNote(''); setReference(''); }
    setError('');
  };

  const setLineQuantity = (item, value, normalize = false) => {
    const validation = validateCreditQuantity(value, item.remainingQuantity);
    const parsed = validation.quantity;
    const next = { ...quantities, [item.id]: normalize && validation.valid ? (parsed ? String(parsed) : '') : value };
    if (type === 'Full' && selectedInvoice?.items?.length) {
      const allFull = selectedInvoice.items.every((invItem) => {
        const rem = Number(invItem.remainingQuantity) || 0;
        if (rem <= 0) return true;
        const current = validateCreditQuantity(next[invItem.id] ?? '', rem);
        return current.valid && current.quantity >= rem;
      });
      if (!allFull) setType('Partial');
    }
    setQuantities(next);
    setError('');
  };

  const chooseCreditType = (nextType) => {
    setType(nextType);
    if (selectedInvoice) setQuantities(creditQuantitiesForScope(selectedInvoice.items, nextType));
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
      draft.clear();
      await client.invalidateQueries({ queryKey: ['creditNotes'] });
      navigate(`/credit-notes/${note.id}`, { state: { notice: note.status === 'Pending Approval' ? 'Submitted for approval.' : 'Draft saved.' } });
    },
    onError: (err) => setError(err.message || 'Unable to save this credit note.'),
  });

  const continueStep = () => {
    setError('');
    if (step === 0 && !invoiceId) return setError('Choose an issued invoice before continuing.');
    if (step === 1) {
      if (hasQuantityErrors) return setError('Correct the invalid credit quantities before continuing.');
      if (!selectedItems.length || totals.total <= 0) return setError('Select at least one credit line with a quantity greater than zero.');
      if (totals.total > eligibleAmount) return setError('Credit total exceeds the invoice’s remaining eligible credit. Reduce the selected quantities.');
    }
    if (step === 2 && (!reason || reasonNote.trim().length < 8)) return setError('Choose a reason and enter at least 8 characters of supporting detail.');
    setStep((current) => Math.min(current + 1, steps.length - 1));
  };

  const save = (submit) => {
    setError('');
    if (!invoiceId || !reason || reasonNote.trim().length < 8 || hasQuantityErrors || !selectedItems.length || totals.total <= 0 || totals.total > eligibleAmount) {
      setStep(!invoiceId ? 0 : hasQuantityErrors || !selectedItems.length || totals.total > eligibleAmount ? 1 : 2);
      setError(!invoiceId ? 'Choose an issued invoice.' : hasQuantityErrors ? 'Correct the invalid credit quantities.' : !selectedItems.length || totals.total <= 0 ? 'Add a valid credit line.' : totals.total > eligibleAmount ? 'Credit total exceeds the remaining eligible amount.' : 'Add a reason and supporting detail before saving.');
      return;
    }
    mutation.mutate({ submit });
  };

  if (isEditing && noteQuery.isPending) return <main className="cn-page"><div className="cn-loading-card">Loading draft…</div></main>;
  if (isEditing && noteQuery.isError) return <main className="cn-page"><DashboardErrorState title="Unable to load credit note" message={noteQuery.error.message} onRetry={() => noteQuery.refetch()} /><Button component={Link} to="/credit-notes" variant="outlined" className="workspace-back-button">Back to Credit Notes</Button></main>;

  return (
    <main className="cn-page cn-form-page">
      <Breadcrumbs className="cn-breadcrumbs" aria-label="Breadcrumb"><Link to="/credit-notes">Credit Notes</Link><span>{isEditing ? 'Edit draft' : 'Create'}</span></Breadcrumbs>
      <header className="cn-page-heading"><div><span className="cn-eyebrow">CREDIT WORKFLOW</span><h1>{isEditing ? `Edit ${noteQuery.data?.number || 'draft'}` : 'Create Credit Note'}</h1><p>Link every credit to its original invoice and keep the reason on record.</p></div><div className="cn-heading-actions"><Button className="cn-refresh-button" variant="text" color="inherit" startIcon={<RefreshOutlined />} disabled={refreshing} onClick={refreshData}>{refreshing ? 'Refreshing…' : 'Refresh'}</Button><Button component={Link} to={isEditing ? `/credit-notes/${id}` : '/credit-notes'} variant="outlined" startIcon={<ArrowBack />}>Back</Button></div></header>

      <nav className="cn-stepper" aria-label="Credit note creation steps">{steps.map((label, index) => <button type="button" key={label} className={`cn-step ${step === index ? 'active' : ''} ${step > index ? 'complete' : ''}`} aria-current={step === index ? 'step' : undefined} onClick={() => index < step && setStep(index)}><span>{step > index ? <Check fontSize="small" /> : index + 1}</span><b>{label}</b></button>)}</nav>

      <div className={`cn-form-layout ${step === 1 ? 'cn-form-layout-items' : ''}`}>
        <section className="cn-form-card">
          {step === 0 && <div className="cn-form-section"><div className="cn-section-title"><span className="cn-section-icon"><ReceiptLongOutlined /></span><div><h2>Select source invoice</h2><p>Only invoices with remaining credit eligibility are listed.</p></div></div>
            <TextField className="cn-invoice-search" size="small" label="Find an invoice" placeholder="Invoice number or customer" value={invoiceSearch} onChange={(event) => setInvoiceSearch(event.target.value)} />
            <div className="cn-invoice-options">{invoicesQuery.isPending ? <div className="cn-loading-card">Loading eligible invoices…</div> : invoicesQuery.isError ? <DashboardErrorState title="Unable to load eligible invoices" message={invoicesQuery.error?.message} onRetry={() => invoicesQuery.refetch()} /> : invoices.length ? visibleInvoices.map((invoice) => { const selected = Number(invoiceId) === Number(invoice.id); return <button type="button" key={invoice.id} onClick={() => selectInvoice(invoice.id)} className={`cn-invoice-option ${selected ? 'selected' : ''}`} aria-pressed={selected} aria-label={`${invoice.number}, ${invoice.customer}${selected ? ', selected; click to deselect' : ''}`}><span className="cn-radio-mark" /><span className="cn-invoice-copy"><strong>{invoice.number}</strong><b>{invoice.customer}</b><small>{invoice.email || 'Customer email unavailable'} · {invoice.date ? new Date(invoice.date).toLocaleDateString('en-IN') : 'Invoice date unavailable'}</small>{selected && <small className="cn-deselect-hint">Selected · click again to unselect</small>}</span><span className="cn-invoice-amount"><small>Remaining creditable</small><strong>{money(eligibleCredit(invoice), invoice.currency)}</strong><small>{money(invoice.total, invoice.currency)} invoice total</small></span></button>; }) : <div className="cn-empty-inline">No eligible invoices found for this search.</div>}</div>
            {invoiceId && selectedSummaryQuery.isPending && <div className="cn-loading-card">Loading authoritative invoice eligibility…</div>}
            {selectedSummaryQuery.isError && <DashboardErrorState title="Unable to load invoice eligibility" message={selectedSummaryQuery.error.message} onRetry={() => selectedSummaryQuery.refetch()} />}
            {selectedInvoice && <>
              {Number(selectedInvoice.previousCredits) > 0 && <div className="cn-previous-credit-warning"><strong>Previous issued credits: {money(selectedInvoice.previousCredits, selectedInvoice.currency)}</strong><span>This amount is already reflected in invoice eligibility. Available additional credit: {money(eligibleAmount, selectedInvoice.currency)}.</span></div>}
              <div className="cn-eligibility-summary"><button type="button" className={`cn-eligibility-choice ${activeEligibilityCard === 'invoiceTotal' ? 'selected' : ''}`} aria-pressed={activeEligibilityCard === 'invoiceTotal'} onClick={() => setActiveEligibilityCard((current) => current === 'invoiceTotal' ? '' : 'invoiceTotal')}><small>Original invoice total</small><strong>{money(selectedInvoice.total, selectedInvoice.currency)}</strong></button><button type="button" className={`cn-eligibility-choice ${activeEligibilityCard === 'payments' ? 'selected' : ''}`} aria-pressed={activeEligibilityCard === 'payments'} onClick={() => setActiveEligibilityCard((current) => current === 'payments' ? '' : 'payments')}><small>Payments received</small><strong>{money(selectedInvoice.paid, selectedInvoice.currency)}</strong></button><button type="button" className={`cn-eligibility-choice ${activeEligibilityCard === 'previousCredits' ? 'selected' : ''}`} aria-pressed={activeEligibilityCard === 'previousCredits'} onClick={() => setActiveEligibilityCard((current) => current === 'previousCredits' ? '' : 'previousCredits')}><small>Previous issued credits</small><strong>{money(selectedInvoice.previousCredits, selectedInvoice.currency)}</strong></button><button type="button" className={`cn-eligibility-choice ${activeEligibilityCard === 'currentDue' ? 'selected' : ''}`} aria-pressed={activeEligibilityCard === 'currentDue'} onClick={() => setActiveEligibilityCard((current) => current === 'currentDue' ? '' : 'currentDue')}><small>Current amount due</small><strong>{money(selectedInvoice.currentDue, selectedInvoice.currency)}</strong></button><button type="button" className={`cn-eligibility-choice cn-eligibility-highlight ${activeEligibilityCard === 'remainingCredit' ? 'selected' : ''}`} aria-pressed={activeEligibilityCard === 'remainingCredit'} onClick={() => setActiveEligibilityCard((current) => current === 'remainingCredit' ? '' : 'remainingCredit')}><small>Remaining creditable</small><strong>{money(eligibleAmount, selectedInvoice.currency)}</strong></button></div>
            </>}
            {invoices.length > 0 && <WorkspacePagination className="cn-invoice-pagination" page={invoicePage + 1} pageSize={invoicePageSize} totalCount={invoices.length} itemLabel="invoices" onPageChange={(value) => setInvoicePage(value - 1)} onPageSizeChange={(value) => { setInvoicePageSize(value); setInvoicePage(0); }} />}
          </div>}

          {step === 1 && <div className="cn-form-section"><div className="cn-section-title"><span className="cn-section-icon"><SavingsOutlined /></span><div><h2>Choose credit scope &amp; items</h2><p>Set credit quantities within the remaining invoice quantities.</p></div></div>
            <div className="cn-credit-type-select"><span>Credit scope</span><div>{['Partial', 'Full'].map((option) => <button key={option} type="button" className={type === option ? 'selected' : ''} onClick={() => chooseCreditType(option)}><strong>{option} credit</strong><small>{option === 'Full' ? 'Credit all remaining eligible invoice quantities' : 'Choose specific items and quantities'}</small></button>)}</div></div>
            <TableContainer className="ibms-table-frame cn-lines-table"><Table size="small"><TableHead><TableRow><TableCell><span className="cn-header-label">Item / service · HSN/SAC</span></TableCell><TableCell align="right"><span className="cn-header-label">Original<br />qty</span></TableCell><TableCell align="right"><span className="cn-header-label">Previously<br />credited</span></TableCell><TableCell align="right"><span className="cn-header-label">Available<br />qty</span></TableCell><TableCell align="right"><span className="cn-header-label">Unit<br />price</span></TableCell><TableCell align="right"><span className="cn-header-label">Tax</span></TableCell><TableCell align="right"><span className="cn-header-label">Credit<br />qty</span></TableCell><TableCell align="right"><span className="cn-header-label">Credit<br />total</span></TableCell></TableRow></TableHead><TableBody>{(selectedInvoice?.items || []).map((item) => { const validation = quantityValidation.get(item.id) || validateCreditQuantity('', item.remainingQuantity); const quantity = validation.quantity; const selectedItem = selectedItems.find((selected) => selected.id === item.id); const lineTotal = selectedItem ? displayedLineTotal(selectedItem, selectedItems, totals) : creditLineAmounts(item, quantity).total; const previousQty = Math.max(0, item.quantity - item.remainingQuantity); return <TableRow key={item.id} className={!item.remainingQuantity ? 'cn-line-fully-credited' : ''}><TableCell><strong title={item.description}>{item.description}</strong><small className="cn-sub-cell">{item.code}</small></TableCell><TableCell align="right">{item.quantity}</TableCell><TableCell align="right">{item.previouslyCreditedQuantity ?? previousQty}</TableCell><TableCell align="right">{item.remainingQuantity > 0 ? item.remainingQuantity : <span className="cn-fully-credited">Fully credited</span>}</TableCell><TableCell align="right">{money(item.unitPrice, selectedInvoice.currency)}</TableCell><TableCell align="right">{item.taxRate == null ? 'Unavailable' : `${item.taxRate}%`}</TableCell><TableCell align="right"><TextField disabled={!item.remainingQuantity} error={!validation.valid} helperText={!validation.valid ? validation.error : ' '} type="number" size="small" placeholder="0" value={quantities[item.id] ?? ''} inputProps={{ min: 0, max: item.remainingQuantity, step: 'any', 'aria-label': `Quantity to credit for ${item.description}` }} onChange={(event) => setLineQuantity(item, event.target.value)} onBlur={(event) => setLineQuantity(item, event.target.value, true)} /></TableCell><TableCell align="right"><strong>{money(lineTotal, selectedInvoice.currency)}</strong></TableCell></TableRow>; })}</TableBody></Table></TableContainer>
            {invoiceWarnings.length > 0 && <div className="cn-tax-warning" role="alert"><strong>Invoice financial data needs review</strong><ul>{invoiceWarnings.map((item) => <li key={item.id}>{item.description}: {item.warning}</li>)}</ul></div>}
            <div className={`cn-eligibility-message ${totals.total > eligibleAmount ? 'warning' : ''}`}>
              <div className="cn-credit-balance-values">
                <div><small>Available credit</small><strong>{money(creditAmounts.availableCredit, selectedInvoice?.currency)}</strong></div>
                <div><small>Selected credit</small><strong>{money(creditAmounts.selectedCredit, selectedInvoice?.currency)}</strong></div>
                <div><small>Remaining credit</small><strong>{money(creditAmounts.remainingCredit, selectedInvoice?.currency)}</strong></div>
              </div>
              {totals.total > eligibleAmount && <span className="cn-eligibility-warning-detail">Credit exceeds invoice eligibility by {money(totals.total - eligibleAmount, selectedInvoice?.currency)}.</span>}
            </div>
          </div>}

          {step === 2 && <div className="cn-form-section"><div className="cn-section-title"><span className="cn-section-icon"><DescriptionOutlined /></span><div><h2>Reason &amp; supporting details</h2><p>Keep a clear audit explanation for the customer and finance team.</p></div></div>
            <div className="cn-form-fields"><TextField select required label="Credit reason" value={reason} onChange={(event) => setReason(event.target.value)} error={Boolean(error && !reason)} helperText={error && !reason ? 'Select a reason.' : 'Choose the closest matching reason.'}>{reasons.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField><TextField label="Internal reference (optional)" placeholder="e.g. RMA-2026-1048" value={reference} onChange={(event) => setReference(event.target.value)} className="cn-reference-field" /><TextField required multiline minRows={4} label="Reason details" placeholder="Describe what changed, why this credit is required, and any agreement with the customer." value={reasonNote} onChange={(event) => setReasonNote(event.target.value)} inputProps={{ maxLength: 600 }} helperText={`${reasonNote.length}/600 · minimum 8 characters`} className="cn-notes-field" /></div>
            <div className="cn-info-callout"><strong>Financial history stays traceable</strong><span>This creates a credit record linked to {selectedInvoice?.number || 'the invoice'}. It does not itself record a cash refund.</span></div>
          </div>}

          {step === 3 && <div className="cn-form-section"><div className="cn-section-title"><span className="cn-section-icon"><Check /></span><div><h2>Review credit note</h2><p>Confirm source, value, tax and business reason before saving.</p></div></div>
            {invoiceWarnings.length > 0 && <div className="cn-tax-warning" role="alert"><strong>Invoice financial data needs review</strong><ul>{invoiceWarnings.map((item) => <li key={item.id}>{item.description}: {item.warning}</li>)}</ul></div>}
            <div className="cn-review-header"><div><small>Source invoice</small><strong>{selectedInvoice?.number}</strong><span>{selectedInvoice?.customer}</span></div><span className={`cn-type-pill ${type.toLowerCase()}`}>{type} credit</span></div>
            <TableContainer className="ibms-table-frame cn-lines-table cn-review-lines-table"><Table size="small"><TableHead><TableRow><TableCell>Description</TableCell><TableCell>Code</TableCell><TableCell align="right">Qty</TableCell><TableCell align="right">Tax rate</TableCell><TableCell align="right">Amount</TableCell></TableRow></TableHead><TableBody>{selectedItems.map((item) => <TableRow key={item.id}><TableCell><span className="cn-review-description" title={item.description} aria-label={item.description}>{item.description}</span></TableCell><TableCell>{item.code}</TableCell><TableCell align="right">{item.quantity}</TableCell><TableCell align="right">{item.taxRate == null ? 'Unavailable' : `${item.taxRate}%`}</TableCell><TableCell align="right">{money(displayedLineTotal(item, selectedItems, totals), selectedInvoice?.currency)}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
            <div className="cn-review-reason"><small>Reason · {reason}</small><span className="cn-review-reason-scope">Applies to all credited items above</span><p>{reasonNote}</p></div>
          </div>}

          {error && <div className="cn-form-error" role="alert">{error}</div>}
          {mutation.isError && !error && <div className="cn-form-error" role="alert">{mutation.error.message}</div>}
          <footer className={`cn-form-actions ${step === 3 ? 'cn-review-actions' : ''}`}><Button component={Link} to={isEditing ? `/credit-notes/${id}` : '/credit-notes'} onClick={() => draft.clear()} color="inherit">Cancel</Button><div>{step > 0 && <Button startIcon={<ArrowBack />} onClick={() => { setError(''); setStep((current) => current - 1); }}>Previous</Button>}{step < steps.length - 1 ? <Button variant="contained" endIcon={<ArrowForward />} disabled={(step === 0 && (!invoiceId || selectedSummaryQuery.isPending || selectedSummaryQuery.isError || !selectedInvoice)) || (step === 1 && (hasQuantityErrors || !selectedItems.length || totals.total <= 0 || totals.total > eligibleAmount)) || (step === 2 && !reasonStepValid)} onClick={continueStep}>Continue</Button> : <><Button variant="outlined" disabled={mutation.isPending} onClick={() => save(false)}>{mutation.isPending ? 'Saving…' : 'Save draft'}</Button><Button variant="contained" endIcon={<ArrowForward />} disabled={mutation.isPending} onClick={() => save(true)}>{mutation.isPending ? 'Submitting…' : 'Continue'}</Button></>}</div></footer>
        </section>

        <aside className="cn-calculation-card"><div className="cn-calc-title"><span className="cn-section-icon"><SavingsOutlined /></span><div><h2>Credit calculation</h2><small>{selectedInvoice ? `Live preview · ${selectedInvoice.currency || 'INR'}` : 'Waiting for invoice selection'}</small></div></div>{selectedInvoice ? <><div className="cn-calc-row"><span>Credit subtotal</span><strong>{money(totals.subtotal, selectedInvoice.currency)}</strong></div><div className="cn-calc-row"><span>Tax adjustment</span><strong>{money(totals.taxAmount, selectedInvoice.currency)}</strong></div>{totals.rounding !== 0 && <div className="cn-calc-row"><span>Rounding adjustment</span><strong>{money(totals.rounding, selectedInvoice.currency)}</strong></div>}<div className="cn-calc-row cn-calc-total"><span>Total credit</span><strong>{money(totals.total, selectedInvoice.currency)}</strong></div><div className="cn-calc-balance"><small>Available credit</small><strong>{money(creditAmounts.availableCredit, selectedInvoice.currency)}</strong><span>Selected credit: {money(creditAmounts.selectedCredit, selectedInvoice.currency)}</span><span>Remaining credit: {money(creditAmounts.remainingCredit, selectedInvoice.currency)}</span></div><div className="cn-calc-lock"><span>✓</span><p>Credit total is capped by the selected invoice’s remaining eligibility.</p></div></> : <div className="cn-calc-empty-state" role="status"><strong>Select a source invoice</strong><p>Your eligible credit, adjustments, and total will appear here after you choose an invoice.</p></div>}</aside>
      </div>
    </main>
  );
}

export default CreditNoteForm;
