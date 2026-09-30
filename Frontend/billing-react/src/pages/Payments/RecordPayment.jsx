import { useRef, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField } from '@mui/material';
import { Link } from 'react-router-dom';
import { PaymentShell, PaymentState, PaymentValues, usePaymentRequest } from './PaymentShared';
import { PAYMENT_API_AVAILABLE, paymentService } from './paymentService';
import { paymentSchema, validatePayment } from './paymentValidation';

export function PaymentConfirmation({ open, onClose, onConfirm, busy, values }) {
  return <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm"><DialogTitle>Confirm Payment</DialogTitle><DialogContent>
    <PaymentValues values={values} /><Alert severity="info">Payment service is not available yet.</Alert>
  </DialogContent><DialogActions><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="contained" disabled={busy || !PAYMENT_API_AVAILABLE} onClick={onConfirm}>Confirm Payment</Button></DialogActions></Dialog>;
}
export function RecordPayment() {
  const [form, setForm] = useState({ invoice: '', date: '', amount: '', method: '', reference: '', notes: '' });
  const [search, setSearch] = useState('');
  const [errors, setErrors] = useState({});
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const request = usePaymentRequest();
  const change = key => event => { setForm(previous => ({ ...previous, [key]: event.target.value })); setErrors(previous => ({ ...previous, [key]: '' })); setConfirm(false); };
  const review = async event => {
    event.preventDefault();
    const result = await validatePayment(paymentSchema, form); setErrors(result.errors);
    if (!Object.keys(result.errors).length) setConfirm(true);
    if (!PAYMENT_API_AVAILABLE) setMessage('Payment service is not available yet.');
  };
  const submit = async () => {
    if (lock.current) return;
    if (!PAYMENT_API_AVAILABLE) { setMessage('Payment service is not available yet.'); return; }
    lock.current = true; setBusy(true);
    try { await paymentService.createPayment(form); }
    catch { setMessage('Payment service is not available yet.'); }
    finally { lock.current = false; setBusy(false); setConfirm(false); }
  };
  return <PaymentShell title="Record Payment" actions={<Button component={Link} to="/payments">Back to Payments</Button>}>
    <PaymentState {...request} onRetry={() => request.run(() => paymentService.getEligibleInvoices({ search }))} />
    <form className="payment-panel" onSubmit={review} noValidate>
      <h2>Invoice &amp; balance</h2><div className="payment-form-grid">
        <TextField label="Invoice Search" value={search} onChange={event => setSearch(event.target.value)} helperText="Search by invoice number or customer" />
        <Button onClick={() => request.run(() => paymentService.getEligibleInvoices({ search }))} disabled={request.loading}>Search Invoices</Button>
        <TextField select label="Invoice" value="" disabled required error={Boolean(errors.invoice)} helperText={errors.invoice || 'No eligible invoices available.'} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}><MenuItem value="">No eligible invoices available.</MenuItem></TextField>
        {['Customer', 'Invoice Total', 'Previously Paid', 'Current Outstanding'].map(label => <TextField key={label} label={label} value="" placeholder="Select an eligible invoice" InputProps={{ readOnly: true }} InputLabelProps={{ shrink: true }} />)}
      </div><h2>Payment information</h2><div className="payment-form-grid">
        <TextField required type="date" label="Payment Date" value={form.date} onChange={change('date')} InputLabelProps={{ shrink: true }} error={Boolean(errors.date)} helperText={errors.date} />
        <TextField required type="number" label="Payment Amount" value={form.amount} onChange={change('amount')} inputProps={{ min: 0, step: 'any' }} error={Boolean(errors.amount)} helperText={errors.amount} />
        <TextField select disabled required label="Payment Method" value="" SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }} helperText={errors.method || 'Supported methods will be supplied by the backend.'}><MenuItem value="">Payment methods unavailable</MenuItem></TextField>
        <TextField label="Method Reference" value={form.reference} onChange={change('reference')} helperText="Transaction reference only. Do not enter card numbers, CVV, PIN or OTP." />
        <TextField className="payment-full" label="Notes" multiline minRows={3} value={form.notes} onChange={change('notes')} error={Boolean(errors.notes)} helperText={errors.notes || 'Maximum 1000 characters.'} />
      </div>{message && <Alert severity="info">{message}</Alert>}<div className="payment-actions"><Button component={Link} to="/payments">Cancel</Button><Button onClick={() => setConfirm(true)} disabled={busy}>Preview Confirmation</Button><Button type="submit" variant="contained" disabled={busy || request.loading}>Review Payment</Button></div>
    </form>
    <PaymentConfirmation open={confirm} busy={busy} onClose={() => setConfirm(false)} onConfirm={submit} values={[
      ['Invoice Number', form.invoice], ['Customer', null], ['Current Outstanding', null], ['Payment Amount', form.amount], ['Payment Method', form.method], ['Payment Date', form.date], ['Reference', form.reference],
    ]} />
  </PaymentShell>;
}
