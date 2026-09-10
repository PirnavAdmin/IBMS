import { useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Snackbar } from '@mui/material';
import { useCustomerMutation } from '../../hooks/useCustomer';
import { deactivateCustomer } from '../../services/customerService';

export function DeactivateCustomerDialog({ customer }) {
  const [open, setOpen] = useState(false);
  const [success, setSuccess] = useState(false);
  const mutation = useCustomerMutation(customer.id, deactivateCustomer);
  const close = () => { if (!mutation.isPending) setOpen(false); };
  return <>
    {customer.isActive === true && <Button variant="contained" disabled={mutation.isPending} onClick={() => { mutation.reset(); setOpen(true); }}>Deactivate Customer</Button>}
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm" aria-labelledby="deactivate-customer-title" aria-describedby="deactivate-customer-message">
      <DialogTitle id="deactivate-customer-title">Deactivate Customer</DialogTitle>
      <DialogContent><DialogContentText id="deactivate-customer-message">This customer will become inactive. Are you sure you want to continue? Existing invoices, payments, statements and audit history will be preserved.</DialogContentText><p>{customer.name} · {customer.id}</p>{mutation.isError && <Alert severity="error">{mutation.error.message}</Alert>}</DialogContent>
      <DialogActions><Button autoFocus disabled={mutation.isPending} onClick={close}>Cancel</Button><Button variant="contained" disabled={!open || mutation.isPending} onClick={() => { if (open && !mutation.isPending) mutation.mutate([], { onSuccess: () => { setOpen(false); setSuccess(true); } }); }}>{mutation.isPending ? 'Deactivating…' : 'Deactivate Customer'}</Button></DialogActions>
    </Dialog>
    <Snackbar open={success} autoHideDuration={5000} onClose={() => setSuccess(false)}><Alert severity="success" onClose={() => setSuccess(false)}>Customer deactivated successfully.</Alert></Snackbar>
  </>;
}
