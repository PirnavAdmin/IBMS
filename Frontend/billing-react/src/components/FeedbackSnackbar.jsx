import { Alert, Portal, Snackbar } from '@mui/material';

// One presentation for completed actions across every module, including dialogs.
export function FeedbackSnackbar({ message, onClose, severity = 'success' }) {
  return <Portal><Snackbar
    key={message}
    open={Boolean(message)}
    autoHideDuration={4000}
    anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
    onClose={(_event, reason) => { if (reason !== 'clickaway') onClose?.(); }}
    sx={{
      zIndex: theme => theme.zIndex.modal + 100,
      maxWidth: { xs: 'calc(100vw - 32px)', sm: 420 },
      top: { xs: 16, sm: 24 },
      right: { xs: 16, sm: 24 },
      left: { xs: 'auto', sm: 'auto' },
      '@media print': { display: 'none' },
    }}
  >
    <Alert severity={severity} variant="filled" role={severity === 'error' ? 'alert' : 'status'}
      onClose={onClose} sx={{
        width: '100%', alignItems: 'center', borderRadius: '8px',
        fontSize: '14px', lineHeight: 1.5, padding: '6px 16px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.16)',
        ...(severity === 'success' && { backgroundColor: '#2e7d32', color: '#fff' }),
        '& .MuiAlert-icon': { color: 'inherit' },
        '& .MuiAlert-message': { overflowWrap: 'anywhere', minWidth: 0 },
        '& .MuiAlert-action': { alignItems: 'center', paddingTop: 0 },
      }}>
      {message}
    </Alert>
  </Snackbar></Portal>;
}
