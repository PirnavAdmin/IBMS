import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';

export function DeactivateCategoryDialog({ open, onClose, onConfirm, busy = false, error = '', activating = false }) {
  return <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs" aria-labelledby="deactivate-category-title" aria-describedby="deactivate-category-description">
    <DialogTitle id="deactivate-category-title">{activating ? 'Activate Category?' : 'Deactivate Category?'}</DialogTitle>
    <DialogContent><DialogContentText id="deactivate-category-description">{activating ? 'This category will become available for new product selection.' : 'This category will no longer be available for new product selection. Existing products using this category will remain unchanged.'}</DialogContentText>{error && <Alert severity="error">{error}</Alert>}</DialogContent>
    <DialogActions><Button disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy} variant="contained" onClick={onConfirm}>{busy ? 'Saving...' : activating ? 'Activate' : 'Deactivate'}</Button></DialogActions>
  </Dialog>;
}
