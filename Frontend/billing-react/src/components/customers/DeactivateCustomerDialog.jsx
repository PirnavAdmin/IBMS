import { useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Snackbar } from '@mui/material';
import { authApi } from 'billing-api-client';
import { getDisplayName } from '../../utils/userDisplay';
import { useCustomerMutation } from '../../hooks/useCustomer';
import { deactivateCustomer } from '../../services/customerService';

export function DeactivateCustomerDialog({ customer }) {
  const [open, setOpen] = useState(false);
  const [success, setSuccess] = useState(false);
  const mutation = useCustomerMutation(customer.id, deactivateCustomer);
  const close = () => { if (!mutation.isPending) setOpen(false); };
  return <>
    <Button variant="contained" disabled={customer.status === 'Inactive' || mutation.isPending} onClick={() => { mutation.reset(); setOpen(true); }}>Deactivate Customer</Button>
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm" aria-labelledby="deactivate-customer-title" aria-describedby="deactivate-customer-message">
      <DialogTitle id="deactivate-customer-title">Deactivate Customer</DialogTitle>
      <DialogContent><DialogContentText id="deactivate-customer-message">Are you sure you want to deactivate this customer? Existing invoices, payments, statements and audit history will be preserved.</DialogContentText><p>{customer.name} · {customer.id}</p>{mutation.isError && <Alert severity="error">{mutation.error.message}</Alert>}</DialogContent>
      <DialogActions><Button autoFocus disabled={mutation.isPending} onClick={close}>Cancel</Button><Button variant="contained" disabled={!open || mutation.isPending} onClick={() => { if (open && !mutation.isPending) mutation.mutate([getDisplayName(authApi.getCurrentUser())], { onSuccess: () => { setOpen(false); setSuccess(true); } }); }}>{mutation.isPending ? 'Deactivating…' : 'Deactivate Customer'}</Button></DialogActions>
    </Dialog>
    <Snackbar open={success} autoHideDuration={5000} onClose={() => setSuccess(false)}><Alert severity="success" onClose={() => setSuccess(false)}>Customer deactivated successfully.</Alert></Snackbar>
  </>;
}
