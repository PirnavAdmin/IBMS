import { Alert, Snackbar } from '@mui/material';

// Shared Products & Services notification style for completed actions.
export function FeedbackSnackbar({ message, onClose, severity = 'success' }) {
  return <Snackbar
    key={message}
    open={Boolean(message)}
    autoHideDuration={4000}
    anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
    onClose={(_event, reason) => { if (reason !== 'clickaway') onClose(); }}
  >
    <Alert severity={severity} variant="filled" role="status" onClose={onClose} sx={{ width: '100%' }}>
      {message}
    </Alert>
  </Snackbar>;
}
