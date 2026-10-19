import { IconButton } from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';

// The icon reflects current visibility; the accessible label describes the next action.
export function PasswordVisibilityToggle({ visible, onToggle, inputId, label = 'password', disabled = false }) {
  return <IconButton type="button" aria-label={`${visible ? 'Hide' : 'Show'} ${label}`} aria-pressed={visible}
    aria-controls={inputId} className="billing-password-toggle" onMouseDown={event => event.preventDefault()}
    onClick={onToggle} disabled={disabled} edge="end" size="small" sx={{ color: '#7D6E66' }}>
    {visible ? <Visibility fontSize="small" /> : <VisibilityOff fontSize="small" />}
  </IconButton>;
}
