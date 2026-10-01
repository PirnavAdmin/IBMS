import { useRef, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';
import { PaymentValues } from './PaymentShared';
import { PAYMENT_API_AVAILABLE, paymentService } from './paymentService';
import { reversalSchema, validatePayment } from './paymentValidation';

export function PaymentReversalContent({ reason, onChange, error }) {
  return <><PaymentValues values={['Payment Number', 'Payment Amount', 'Allocated Amount', 'Affected Invoice', 'Current Outstanding'].map(label => [label, null])} />
    <Alert severity="warning">Reversing this payment will update the invoice paid and outstanding balance.</Alert>
    <TextField fullWidth required multiline minRows={3} margin="normal" label="Reversal Reason" value={reason} onChange={onChange} error={Boolean(error)} helperText={error} />
  </>;
}
export function PaymentReversal({ open, onClose, paymentId }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const submit = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const result = await validatePayment(reversalSchema, { reason }); setError(result.errors.reason || '');
      if (result.errors.reason) return;
      if (!PAYMENT_API_AVAILABLE || !paymentId) { setMessage('Payment service is not available yet.'); return; }
      await paymentService.reversePayment(paymentId, result.values);
    } catch { setMessage('Payment service is not available yet.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const close = () => { if (!busy) { setReason(''); setError(''); setMessage(''); onClose(); } };
  return <Dialog open={open} onClose={busy ? undefined : close} fullWidth maxWidth="sm"><DialogTitle>Reverse Payment</DialogTitle><DialogContent>
    <Alert severity="info">Payment API is not available yet. Reversal cannot be completed.</Alert>
    <PaymentReversalContent reason={reason} onChange={event => { setReason(event.target.value); setError(''); }} error={error} />
    {message && <Alert severity="info">{message}</Alert>}
  </DialogContent><DialogActions><Button onClick={close} disabled={busy}>Cancel</Button><Button color="error" variant="contained" disabled={busy} onClick={submit}>Confirm Reversal</Button></DialogActions></Dialog>;
}
