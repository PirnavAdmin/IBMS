import { useRef, useState } from 'react';
import {
  Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Switch, TextField,
} from '@mui/material';

const APP_PRESETS = [
  { name: 'Slack Notifications', desc: 'Direct webhook integration to Slack workspace channel' },
  { name: 'Discord Alerts', desc: 'Direct webhook notifications to Discord channel' },
  { name: 'Microsoft Excel Sync', desc: 'Syncs invoices, payments, and customers directly to Excel workbook' },
  { name: 'Google Sheets Automation', desc: 'Appends rows into Google Sheets for live bookkeeping' },
  { name: 'Custom CRM / ERP Connector', desc: 'Custom webhook endpoint with Bearer auth for external ERP' },
  { name: 'Zapier / Make / n8n', desc: 'Automation middleware bridge for custom integrations' },
];
import { ContentCopyOutlined } from '@mui/icons-material';
import { REGISTRATION_FLAGS } from './integrationService';

export function FlagSwitches({ flags, onChange, disabled = false }) {
  return <div className="integration-flag-switches">{Object.entries(flags).map(([key, value]) =>
    <FormControlLabel key={key} label={key} labelPlacement="start" control={
      <Switch checked={value} disabled={disabled} onChange={event => onChange(key, event.target.checked)} />
    } />,
  )}</div>;
}

export function ApplicationEditor({ application, busy, error, onClose, onSave }) {
  const [name, setName] = useState(application?.name ?? '');
  const [description, setDescription] = useState(application?.description ?? '');
  const [flags, setFlags] = useState(application?.featureFlags ?? Object.fromEntries(REGISTRATION_FLAGS.map(key => [key, false])));
  const [submitted, setSubmitted] = useState(false);
  const title = application ? 'Edit Application' : 'Register New App';
  return <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="integration-editor-title" PaperProps={{ className: 'integration-dialog' }}>
    <form onSubmit={event => {
      event.preventDefault(); setSubmitted(true);
      if (!name.trim()) return;
      onSave({ name: name.trim(), description: description.trim(), featureFlags: flags,
        ...(application ? { status: application.status } : {}) });
    }}>
      <DialogTitle id="integration-editor-title">{title}</DialogTitle>
      <DialogContent className="integration-form">
        {error && <Alert severity="error">{error}</Alert>}
        {!application && <div style={{marginBottom: 12}}><p style={{fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 6px'}}>Quick Presets for External Apps:</p><div style={{display: 'flex', gap: 6, flexWrap: 'wrap'}}>{APP_PRESETS.map(p => <Chip key={p.name} size="small" label={p.name} variant="outlined" onClick={() => { setName(p.name); setDescription(p.desc); }} clickable disabled={busy} />)}</div></div>}
        <TextField autoFocus required fullWidth label="Application Name" value={name} disabled={busy}
          onChange={event => setName(event.target.value)} error={submitted && !name.trim()}
          helperText={submitted && !name.trim() ? 'Application name is required.' : undefined} />
        <TextField fullWidth multiline minRows={3} label="Description" value={description} disabled={busy} onChange={event => setDescription(event.target.value)} />
        <fieldset className="integration-flag-fieldset"><legend>Feature Flags</legend>
          <FlagSwitches flags={flags} disabled={busy} onChange={(key, value) => setFlags(previous => ({ ...previous, [key]: value }))} />
        </fieldset>
      </DialogContent>
      <DialogActions><Button disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" variant="contained" disabled={busy}>{busy ? 'Saving…' : application ? 'Save Changes' : 'Register Application'}</Button></DialogActions>
    </form>
  </Dialog>;
}

export function FeatureFlagsDialog({ application, busy, error, onClose, onSave }) {
  // PATCH replaces the entire dictionary. Keep every existing key, including custom flags.
  const [flags, setFlags] = useState({
    ...Object.fromEntries(REGISTRATION_FLAGS.map(key => [key, false])),
    ...application.featureFlags,
  });
  return <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="integration-flags-title" PaperProps={{ className: 'integration-dialog' }}>
    <DialogTitle id="integration-flags-title">Manage Feature Flags</DialogTitle>
    <DialogContent className="integration-form"><p>{application.name}</p>
      {error && <Alert severity="error">{error}</Alert>}
      <FlagSwitches flags={flags} disabled={busy} onChange={(key, value) => setFlags(previous => ({ ...previous, [key]: value }))} />
    </DialogContent>
    <DialogActions><Button disabled={busy} onClick={onClose}>Cancel</Button><Button variant="contained" disabled={busy} onClick={() => onSave(flags)}>{busy ? 'Saving…' : 'Save Feature Flags'}</Button></DialogActions>
  </Dialog>;
}

export function SecretDialog({ credentials, onClose, onCopy }) {
  const secretField = useRef(null);
  // Mask the uncontrolled field synchronously before closing; never retain it in transition children.
  const close = () => { if (secretField.current) secretField.current.value = ''; onClose(); };
  return <Dialog open onClose={close} fullWidth maxWidth="sm" aria-labelledby="integration-secret-title" PaperProps={{ className: 'integration-dialog' }}>
    <DialogTitle id="integration-secret-title">Save Your Client Secret</DialogTitle>
    <DialogContent className="integration-form">
      <Alert severity="warning">Please copy and store this secret safely. It will not be shown again.</Alert>
      <TextField fullWidth label="Client ID" value={credentials.clientId} InputProps={{ readOnly: true }} />
      <Button startIcon={<ContentCopyOutlined />} onClick={() => onCopy(credentials.clientId, 'Client ID')}>Copy Client ID</Button>
      <TextField fullWidth label="Client Secret" inputRef={secretField} defaultValue={credentials.clientSecret} InputProps={{ readOnly: true }} inputProps={{ autoComplete: 'off', spellCheck: false }} />
      <Button startIcon={<ContentCopyOutlined />} onClick={() => onCopy(credentials.clientSecret, 'Client secret')}>Copy Client Secret</Button>
    </DialogContent>
    <DialogActions><Button variant="contained" onClick={close}>I Have Saved the Secret</Button></DialogActions>
  </Dialog>;
}
