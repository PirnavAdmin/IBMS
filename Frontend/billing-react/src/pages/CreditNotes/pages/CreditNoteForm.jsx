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
const MIN_REASON_WORDS = 2;
const descriptiveReasonWordCount = (value) => (String(value || '').normalize('NFKC').match(/[\p{L}\p{N}]+/gu) || [])
  .filter((word) => Array.from(word).filter((character) => /\p{L}/u.test(character)).length >= 2).length;
const hasMeaningfulReasonDetails = (value) => {
  const normalized = String(value || '').normalize('NFKC').trim();
  const words = normalized.match(/[\p{L}\p{N}]+/gu) || [];
  const descriptiveWords = words.filter((word) => Array.from(word).filter((character) => /\p{L}/u.test(character)).length >= 2);
  const uniqueWords = new Set(descriptiveWords.map((word) => word.toLocaleLowerCase()));
  const uniqueLetters = new Set((normalized.match(/\p{L}/gu) || []).map((letter) => letter.toLocaleLowerCase()));
  return descriptiveWords.length >= MIN_REASON_WORDS
    && descriptiveWords.length >= 2
    && uniqueWords.size >= 2
    && uniqueLetters.size >= 3
    && !/(.)\1{2,}/u.test(normalized)
    && !/(qwerty|asdf|zxcv|12345|98765)/i.test(normalized);
};
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
  const sourceInvoiceId = !id && location.state?.invoiceId ? String(location.state.invoiceId) : '';
  const navigate = useNavigate();
  const client = useQueryClient();
  const [step, setStep] = useDraftState(draftKey, 'step', 0);
  const [error, setError] = useState('');
  const [invoiceId, setInvoiceId] = useDraftState(draftKey, 'invoiceId', () => location.state?.invoiceId ? String(location.state.invoiceId) : '');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState('');
  const [invoicePage, setInvoicePage] = useState(0);
  const [invoicePageSize, setInvoicePageSize] = useState(5);
  const [type, setType] = useDraftState(draftKey, 'type', 'Partial');
  const [reason, setReason] = useDraftState(draftKey, 'reason', '');
  const [reasonNote, setReasonNote] = useDraftState(draftKey, 'reasonNote', '');
  const [quantities, setQuantities] = useDraftState(draftKey, 'quantities', {});

  useEffect(() => {
    if (!sourceInvoiceId || String(invoiceId) === sourceInvoiceId) return;
    setInvoiceId(sourceInvoiceId);
    setType('Partial');
    setQuantities({});
    setReason('');
    setReasonNote('');
  }, [sourceInvoiceId, invoiceId, setInvoiceId, setType, setQuantities, setReason, setReasonNote]);

  const noteQuery = useQuery({ queryKey: ['creditNotes', id], queryFn: () => creditNoteService.get(id), enabled: Boolean(id) });
  useEffect(() => {
    const timer = setTimeout(() => setInvoiceSearchQuery(invoiceSearch.trim()), 250);
    return () => clearTimeout(timer);
  }, [invoiceSearch]);
  useEffect(() => { setInvoicePage(0); }, [invoiceSearchQuery]);
  const invoicesQuery = useQuery({ queryKey: ['creditNotes', 'eligibleInvoices', invoiceSearchQuery], queryFn: () => creditNoteService.getInvoices({ search: invoiceSearchQuery }) });
  const selectedSummaryQuery = useQuery({ queryKey: ['creditNotes', 'invoiceSummary', invoiceId], queryFn: () => creditNoteService.getInvoiceCreditableSummary(invoiceId), enabled: Boolean(invoiceId) });
  const sourceSummaryQuery = useQuery({ queryKey: ['creditNotes', 'invoiceSummary', sourceInvoiceId], queryFn: () => creditNoteService.getInvoiceCreditableSummary(sourceInvoiceId), enabled: Boolean(sourceInvoiceId) });
  const customerContextId = sourceSummaryQuery.data?.customerId ?? location.state?.customerId;
  const allInvoices = invoicesQuery.data || [];
  const hasCustomerContext = location.state?.customerId != null || Boolean(sourceInvoiceId);
  const invoices = !hasCustomerContext
    ? allInvoices
    : customerContextId == null
      ? []
      : allInvoices.filter((invoice) => String(invoice.customerId) === String(customerContextId));
  const visibleInvoices = invoices.slice(invoicePage * invoicePageSize, (invoicePage + 1) * invoicePageSize);
  const selectedInvoiceData = selectedSummaryQuery.data || invoices.find((invoice) => Number(invoice.id) === Number(invoiceId));
  const selectedInvoice = sourceInvoiceId && String(invoiceId) !== sourceInvoiceId
    ? null
    : hasCustomerContext && customerContextId != null && selectedInvoiceData
      && String(selectedInvoiceData.customerId) !== String(customerContextId)
      ? null
      : selectedInvoiceData;
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
  const reasonDetailsValid = hasMeaningfulReasonDetails(reasonNote);
  const reasonStepValid = Boolean(reason && reasonDetailsValid);

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
    setQuantities(Object.fromEntries(note.items.map((item) => [item.id, item.quantity])));
  }, [noteQuery.data, selectedInvoice, invoiceId, id, navigate]);

  const selectInvoice = (value) => {
    const candidate = allInvoices.find((invoice) => String(invoice.id) === String(value));
    if (customerContextId != null && candidate && String(candidate.customerId) !== String(customerContextId)) return;
    const deselect = !isEditing && Boolean(invoiceId) && String(invoiceId) === String(value);
    setInvoiceId(deselect ? '' : value);
    setType('Partial');
    setQuantities({});
    if (deselect) { setReason(''); setReasonNote(''); }
    setError('');
  };

  const setLineQuantity = (item, value, normalize = false) => {
    const validation = validateCreditQuantity(value, item.remainingQuantity);
    // Native number inputs allow typing or pasting values above `max`.
    // Clamp those immediately so the credit quantity cannot exceed the
    // invoice's remaining quantity, even before blur or submit.
    const boundedValue = validation.error.startsWith('Quantity cannot exceed')
      ? String(item.remainingQuantity)
      : value;
    const boundedValidation = validateCreditQuantity(boundedValue, item.remainingQuantity);
    const parsed = boundedValidation.quantity;
    const next = { ...quantities, [item.id]: normalize && boundedValidation.valid ? (parsed ? String(parsed) : '') : boundedValue };
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
    if (step === 2 && (!reason || !reasonDetailsValid)) return setError(`Choose a reason and enter at least ${MIN_REASON_WORDS} meaningful words. Repeated or random text is not accepted.`);
    setStep((current) => Math.min(current + 1, steps.length - 1));
  };

  const save = (submit) => {
    setError('');
    if (hasCustomerContext && (!selectedInvoice || String(selectedInvoice.customerId) !== String(customerContextId))) {
      setStep(0);
      setError('Choose an invoice belonging to the selected customer.');
      return;
    }
    if (!invoiceId || !reason || !reasonDetailsValid || hasQuantityErrors || !selectedItems.length || totals.total <= 0 || totals.total > eligibleAmount) {
      setStep(!invoiceId ? 0 : hasQuantityErrors || !selectedItems.length || totals.total > eligibleAmount ? 1 : 2);
      setError(!invoiceId ? 'Choose an issued invoice.' : hasQuantityErrors ? 'Correct the invalid credit quantities.' : !selectedItems.length || totals.total <= 0 ? 'Add a valid credit line.' : totals.total > eligibleAmount ? 'Credit total exceeds the remaining eligible amount.' : `Enter at least ${MIN_REASON_WORDS} meaningful words explaining the credit. Repeated or random text is not accepted.`);
      return;
    }
    mutation.mutate({ submit });
  };

  if (isEditing && noteQuery.isPending) return <main className="cn-page"><div className="cn-loading-card">Loading draft…</div></main>;
  if (isEditing && noteQuery.isError) return <main className="cn-page"><DashboardErrorState title="Unable to load credit note" message={noteQuery.error.message} onRetry={() => noteQuery.refetch()} /></main>;

  return (
    <main className="cn-page cn-form-page">
      <Breadcrumbs className="cn-breadcrumbs" aria-label="Breadcrumb"><Link to="/credit-notes">Credit Notes</Link><span>{isEditing ? 'Edit draft' : 'Create'}</span></Breadcrumbs>
      <header className="cn-page-heading"><div><span className="cn-eyebrow">CREDIT WORKFLOW</span><h1>{isEditing ? `Edit ${noteQuery.data?.number || 'draft'}` : 'Create Credit Note'}</h1><p>Link every credit to its original invoice and keep the reason on record.</p></div><div className="cn-heading-actions"><Button className="cn-refresh-button" variant="text" color="inherit" startIcon={<RefreshOutlined />} disabled={refreshing} onClick={refreshData}>{refreshing ? 'Refreshing…' : 'Refresh'}</Button><Button component={Link} to={isEditing ? `/credit-notes/${id}` : '/credit-notes'} variant="outlined" startIcon={<ArrowBack />}>Back</Button></div></header>

      <nav className="cn-stepper" aria-label="Credit note creation steps">{steps.map((label, index) => <button type="button" key={label} className={`cn-step ${step === index ? 'active' : ''} ${step > index ? 'complete' : ''}`} aria-current={step === index ? 'step' : undefined} onClick={() => index < step && setStep(index)}><span>{step > index ? <Check fontSize="small" /> : index + 1}</span><b>{label}</b></button>)}</nav>

      <div className={`cn-form-layout ${step === 0 ? 'cn-form-layout-invoice' : ''} ${step === 1 ? 'cn-form-layout-items' : ''}`}>
        <section className="cn-form-card">
          {step === 0 && <div className="cn-form-section"><div className="cn-section-title"><span className="cn-section-icon"><ReceiptLongOutlined /></span><div><h2>Select source invoice</h2><p>Only invoices with remaining credit eligibility are listed.</p></div></div>
            <TextField className="cn-invoice-search" size="small" label="Find an invoice" placeholder="Invoice number or customer" value={invoiceSearch} onChange={(event) => setInvoiceSearch(event.target.value)} />
            <div className="cn-invoice-options">{(invoicesQuery.isPending || (sourceInvoiceId && sourceSummaryQuery.isPending)) ? <div className="cn-loading-card">Loading eligible invoices…</div> : sourceSummaryQuery.isError ? <DashboardErrorState title="Unable to verify the selected customer" message={sourceSummaryQuery.error?.message} onRetry={() => sourceSummaryQuery.refetch()} /> : invoicesQuery.isError ? <DashboardErrorState title="Unable to load eligible invoices" message={invoicesQuery.error?.message} onRetry={() => invoicesQuery.refetch()} /> : invoices.length ? visibleInvoices.map((invoice) => { const selected = Number(invoiceId) === Number(invoice.id); return <button type="button" key={invoice.id} onClick={() => selectInvoice(invoice.id)} className={`cn-invoice-option ${selected ? 'selected' : ''}`} aria-pressed={selected} aria-label={`${invoice.number}, ${invoice.customer}${selected ? ', selected; click to deselect' : ''}`}><span className="cn-radio-mark" /><span className="cn-invoice-copy"><strong>{invoice.number}</strong><b>{invoice.customer}</b><small>{invoice.email || 'Customer email unavailable'} · {invoice.date ? new Date(invoice.date).toLocaleDateString('en-IN') : 'Invoice date unavailable'}</small>{selected && <small className="cn-deselect-hint">Selected · click again to unselect</small>}</span><span className="cn-invoice-amount"><small>Remaining creditable</small><strong>{money(eligibleCredit(invoice), invoice.currency)}</strong><small>{money(invoice.total, invoice.currency)} invoice total</small></span></button>; }) : <div className="cn-empty-inline">No eligible invoices found for this search.</div>}</div>
            {invoiceId && selectedSummaryQuery.isPending && <div className="cn-loading-card">Loading authoritative invoice eligibility…</div>}
            {selectedSummaryQuery.isError && <DashboardErrorState title="Unable to load invoice eligibility" message={selectedSummaryQuery.error.message} onRetry={() => selectedSummaryQuery.refetch()} />}
            {selectedInvoice && <>
              {Number(selectedInvoice.previousCredits) > 0 && <div className="cn-previous-credit-warning"><strong>Previous issued credits: {money(selectedInvoice.previousCredits, selectedInvoice.currency)}</strong><span>This amount is already reflected in invoice eligibility. Available additional credit: {money(eligibleAmount, selectedInvoice.currency)}.</span></div>}
            </>}
            {invoices.length > 0 && <WorkspacePagination className="cn-invoice-pagination" page={invoicePage + 1} pageSize={invoicePageSize} totalCount={invoices.length} itemLabel="invoices" onPageChange={(value) => setInvoicePage(value - 1)} onPageSizeChange={(value) => { setInvoicePageSize(value); setInvoicePage(0); }} />}
          </div>}

          {step === 1 && <div className="cn-form-section"><div className="cn-section-title"><span className="cn-section-icon"><SavingsOutlined /></span><div><h2>Choose credit scope &amp; items</h2><p>Set credit quantities within the remaining invoice quantities.</p></div></div>
            <div className="cn-credit-type-select"><span>Credit scope</span><div>{['Partial', 'Full'].map((option) => <button key={option} type="button" className={type === option ? 'selected' : ''} onClick={() => chooseCreditType(option)}><strong>{option} credit</strong><small>{option === 'Full' ? 'Credit all remaining eligible invoice quantities' : 'Choose specific items and quantities'}</small></button>)}</div></div>
            <TableContainer className="ibms-table-frame cn-lines-table"><Table size="small"><TableHead><TableRow><TableCell><span className="cn-header-label">Item / service · HSN/SAC</span></TableCell><TableCell align="center"><span className="cn-header-label">Original<br />qty</span></TableCell><TableCell align="center"><span className="cn-header-label">Previously<br />credited</span></TableCell><TableCell align="center"><span className="cn-header-label">Available<br />qty</span></TableCell><TableCell align="center"><span className="cn-header-label">Unit<br />price</span></TableCell><TableCell align="center"><span className="cn-header-label">Discount</span></TableCell><TableCell align="center"><span className="cn-header-label">Tax</span></TableCell><TableCell align="center"><span className="cn-header-label">Credit<br />qty</span></TableCell><TableCell align="center"><span className="cn-header-label">Credit<br />total</span></TableCell></TableRow></TableHead><TableBody>{(selectedInvoice?.items || []).map((item) => { const validation = quantityValidation.get(item.id) || validateCreditQuantity('', item.remainingQuantity); const quantity = validation.quantity; const selectedItem = selectedItems.find((selected) => selected.id === item.id); const lineAmounts = creditLineAmounts(item, quantity); const lineTotal = selectedItem ? displayedLineTotal(selectedItem, selectedItems, totals) : lineAmounts.total; const previousQty = Math.max(0, item.quantity - item.remainingQuantity); return <TableRow key={item.id} className={!item.remainingQuantity ? 'cn-line-fully-credited' : ''}><TableCell><strong title={item.description}>{item.description}</strong><small className="cn-sub-cell">{item.code}</small></TableCell><TableCell align="center">{item.quantity}</TableCell><TableCell align="center">{item.previouslyCreditedQuantity ?? previousQty}</TableCell><TableCell align="center">{item.remainingQuantity > 0 ? item.remainingQuantity : <span className="cn-fully-credited">Fully credited</span>}</TableCell><TableCell align="center">{money(item.unitPrice, selectedInvoice.currency)}</TableCell><TableCell align="center">{money(lineAmounts.discount || 0, selectedInvoice.currency)}</TableCell><TableCell align="center">{item.taxRate == null ? 'Unavailable' : `${item.taxRate}%`}</TableCell><TableCell align="center"><TextField disabled={!item.remainingQuantity} error={!validation.valid} helperText={!validation.valid ? validation.error : ' '} type="number" size="small" placeholder="0" value={quantities[item.id] ?? ''} inputProps={{ min: 0, max: item.remainingQuantity, step: 'any', autoComplete: 'off', name: `credit-quantity-${item.id}`, 'aria-label': `Quantity to credit for ${item.description}` }} onChange={(event) => setLineQuantity(item, event.target.value)} onBlur={(event) => setLineQuantity(item, event.target.value, true)} /></TableCell><TableCell align="right"><strong>{money(lineTotal, selectedInvoice.currency)}</strong></TableCell></TableRow>; })}</TableBody></Table></TableContainer>
            {invoiceWarnings.length > 0 && <div className="cn-tax-warning" role="alert"><strong>Invoice financial data needs review</strong><ul>{invoiceWarnings.map((item) => <li key={item.id}>{item.description}: {item.warning}</li>)}</ul></div>}
            <div className={`cn-eligibility-message ${totals.total > eligibleAmount ? 'warning' : ''}`}>
              <div className="cn-credit-balance-values">
                <div><small>Available credit</small><strong>{money(creditAmounts.availableCredit, selectedInvoice?.currency)}</strong></div>
                <div><small>Selected credit</small><strong>{money(creditAmounts.selectedCredit, selectedInvoice?.currency)}</strong></div>
                <div><small>Customer paid</small><strong>{money(selectedInvoice?.paid, selectedInvoice?.currency)}</strong></div>
                <div><small>Remaining credit</small><strong>{money(creditAmounts.remainingCredit, selectedInvoice?.currency)}</strong></div>
              </div>
              {totals.total > eligibleAmount && <span className="cn-eligibility-warning-detail">Credit exceeds invoice eligibility by {money(totals.total - eligibleAmount, selectedInvoice?.currency)}.</span>}
            </div>
          </div>}

          {step === 2 && <div className="cn-form-section"><div className="cn-section-title"><span className="cn-section-icon"><DescriptionOutlined /></span><div><h2>Reason &amp; supporting details</h2><p>Keep a clear audit explanation for the customer and finance team.</p></div></div>
            <div className="cn-form-fields"><TextField select required inputProps={{ 'aria-label': 'Credit reason' }} value={reason} onChange={(event) => setReason(event.target.value)} error={Boolean(error && !reason)} helperText={error && !reason ? 'Select a reason.' : 'Choose the closest matching reason.'} SelectProps={{ displayEmpty: true, renderValue: (value) => value || <span>Credit reason *</span>, MenuProps: { variant: 'menu', anchorOrigin: { vertical: 'bottom', horizontal: 'left' }, transformOrigin: { vertical: 'top', horizontal: 'left' }, marginThreshold: 8, PaperProps: { className: 'cn-reason-options-menu', sx: { maxHeight: 260 } } } }}>{reasons.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField><TextField required multiline minRows={4} placeholder="Reason details * — Describe what changed, why this credit is required, and any agreement with the customer." value={reasonNote} onChange={(event) => setReasonNote(event.target.value)} helperText={`${descriptiveReasonWordCount(reasonNote)}/${MIN_REASON_WORDS} words minimum.`} className="cn-notes-field" /></div>
            <div className="cn-info-callout"><strong>Financial history stays traceable</strong><span>This creates a credit record linked to {selectedInvoice?.number || 'the invoice'}. It does not itself record a cash refund.</span></div>
          </div>}

          {step === 3 && <div className="cn-form-section"><div className="cn-section-title"><span className="cn-section-icon"><Check /></span><div><h2>Review credit note</h2><p>Confirm source, value, tax and business reason before saving.</p></div></div>
            {invoiceWarnings.length > 0 && <div className="cn-tax-warning" role="alert"><strong>Invoice financial data needs review</strong><ul>{invoiceWarnings.map((item) => <li key={item.id}>{item.description}: {item.warning}</li>)}</ul></div>}
            <div className="cn-review-header"><div><small>Source invoice</small><strong>{selectedInvoice?.number}</strong><span>{selectedInvoice?.customer}</span></div><span className={`cn-type-pill ${type.toLowerCase()}`}>{type} credit</span></div>
            <TableContainer className="ibms-table-frame cn-lines-table cn-review-lines-table"><Table size="small"><TableHead><TableRow><TableCell>Description</TableCell><TableCell>Code</TableCell><TableCell align="right">Qty</TableCell><TableCell align="right">Tax rate</TableCell><TableCell align="right">Amount</TableCell></TableRow></TableHead><TableBody>{selectedItems.map((item) => <TableRow key={item.id}><TableCell><span className="cn-review-description" title={item.description} aria-label={item.description}>{item.description}</span></TableCell><TableCell>{item.code}</TableCell><TableCell align="right">{item.quantity}</TableCell><TableCell align="right">{item.taxRate == null ? 'Unavailable' : `${item.taxRate}%`}</TableCell><TableCell align="right">{money(displayedLineTotal(item, selectedItems, totals), selectedInvoice?.currency)}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
            <section className="cn-review-calculation" aria-label="Credit calculation">
              <h3>Credit calculation</h3>
              <div className="cn-review-calculation-grid">
                <div><small>Credit subtotal</small><strong>{money(totals.subtotal, selectedInvoice?.currency)}</strong></div>
                <div><small>Tax adjustment</small><strong>{money(totals.taxAmount, selectedInvoice?.currency)}</strong></div>
                {totals.rounding !== 0 && <div><small>Rounding adjustment</small><strong>{money(totals.rounding, selectedInvoice?.currency)}</strong></div>}
                <div className="cn-review-calculation-total"><small>Total credit</small><strong>{money(totals.total, selectedInvoice?.currency)}</strong></div>
                <div><small>Remaining credit</small><strong>{money(creditAmounts.remainingCredit, selectedInvoice?.currency)}</strong></div>
              </div>
            </section>
            <div className="cn-review-reason"><small>Reason · {reason}</small><span className="cn-review-reason-scope">Applies to all credited items above</span><p>{reasonNote}</p></div>
          </div>}

          {error && <div className="cn-form-error" role="alert">{error}</div>}
          {mutation.isError && !error && <div className="cn-form-error" role="alert">{mutation.error.message}</div>}
          <footer className={`cn-form-actions ${step === 3 ? 'cn-review-actions' : ''}`}><Button component={Link} to={isEditing ? `/credit-notes/${id}` : '/credit-notes'} onClick={() => draft.clear()} color="inherit">Cancel</Button><div>{step > 0 && <Button startIcon={<ArrowBack />} onClick={() => { setError(''); setStep((current) => current - 1); }}>Previous</Button>}{step < steps.length - 1 ? <Button variant="contained" endIcon={<ArrowForward />} disabled={(step === 0 && (!invoiceId || selectedSummaryQuery.isPending || selectedSummaryQuery.isError || !selectedInvoice)) || (step === 1 && (hasQuantityErrors || !selectedItems.length || totals.total <= 0 || totals.total > eligibleAmount)) || (step === 2 && !reasonStepValid)} onClick={continueStep}>Continue</Button> : <><Button variant="outlined" disabled={mutation.isPending} onClick={() => save(false)}>{mutation.isPending ? 'Saving…' : 'Save draft'}</Button><Button variant="contained" endIcon={<ArrowForward />} disabled={mutation.isPending} onClick={() => save(true)}>{mutation.isPending ? 'Submitting…' : 'Continue'}</Button></>}</div></footer>
        </section>

        {step === 0 && <aside className="cn-invoice-calculation-card">
          <div className="cn-invoice-calculation-title"><span className="cn-section-icon"><SavingsOutlined /></span><div><h2>Invoice calculation</h2><small>{selectedInvoice ? `Credit eligibility · ${selectedInvoice.currency || 'INR'}` : 'Waiting for invoice selection'}</small></div></div>
          {selectedInvoice ? <>
            <div className="cn-invoice-calc-row"><span>Invoice total</span><strong>{money(selectedInvoice.total, selectedInvoice.currency)}</strong></div>
            <div className="cn-invoice-calc-row"><span>Payments received</span><strong>{money(selectedInvoice.paid, selectedInvoice.currency)}</strong></div>
            <div className="cn-invoice-calc-row"><span>Previous credits</span><strong>{money(selectedInvoice.previousCredits, selectedInvoice.currency)}</strong></div>
            <div className="cn-invoice-calc-row"><span>Current amount due</span><strong>{money(selectedInvoice.currentDue, selectedInvoice.currency)}</strong></div>
            <div className="cn-invoice-calc-row cn-invoice-calc-available"><span>Remaining creditable</span><strong>{money(eligibleAmount, selectedInvoice.currency)}</strong></div>
          </> : <div className="cn-invoice-calc-empty">Select an invoice to view its total, payments, and remaining credit eligibility.</div>}
        </aside>}

      </div>
    </main>
  );
}

export default CreditNoteForm;
