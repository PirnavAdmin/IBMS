import { FeedbackSnackbar } from '../../../components/FeedbackSnackbar';
import { useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import { useCustomerMutation } from '../hooks/useCustomer';
import { deactivateCustomer } from '../api/customerService';
import { validateDeactivationReason } from '../validation/customerValidation';

export function DeactivateCustomerDialog({ customer }) {
  const requestLock = useRef(false);
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [open, setOpen] = useState(false);
  const [success, setSuccess] = useState(false);
  const mutation = useCustomerMutation(customer.id, deactivateCustomer);
  const close = () => { if (!mutation.isPending) setOpen(false); };
  const validation = validateDeactivationReason(reason);
  const reasonError = (touched || reason.length > 0) && !validation.valid ? validation.error : '';
  return <>
    {customer.isActive === true && <Button variant="contained" disabled={mutation.isPending} onClick={() => { mutation.reset(); setReason(''); setTouched(false); setOpen(true); }}>Deactivate Customer</Button>}
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm" aria-labelledby="deactivate-customer-title" aria-describedby="deactivate-customer-message">
      <DialogTitle id="deactivate-customer-title">Deactivate Customer</DialogTitle>
      <DialogContent><DialogContentText id="deactivate-customer-message">This customer will become inactive. Are you sure you want to continue? Existing invoices, payments, statements and audit history will be preserved.</DialogContentText><p>{customer.name} · {customer.id}</p><TextField fullWidth required multiline minRows={2} margin="normal" label="Reason for deactivation" value={reason} error={Boolean(reasonError)} helperText={reasonError} inputProps={{ maxLength: 500 }} onChange={event => { setReason(event.target.value); setTouched(true); }} onBlur={() => setTouched(true)} />{mutation.isError && <Alert severity="error">{mutation.error.message}</Alert>}</DialogContent>
      <DialogActions><Button autoFocus disabled={mutation.isPending} onClick={close}>Cancel</Button><Button variant="contained" disabled={!open || mutation.isPending || !validation.valid} onClick={() => { setTouched(true); if (!open || requestLock.current || !validation.valid) return; requestLock.current = true; mutation.mutate([reason.trim()], { onSuccess: () => { setOpen(false); setSuccess(true); }, onSettled: () => { requestLock.current = false; } }); }}>{mutation.isPending ? 'Deactivating…' : 'Deactivate Customer'}</Button></DialogActions>
    </Dialog>
    <FeedbackSnackbar message={success ? 'Customer deactivated successfully.' : ''} onClose={() => setSuccess(false)} />
  </>;
}
