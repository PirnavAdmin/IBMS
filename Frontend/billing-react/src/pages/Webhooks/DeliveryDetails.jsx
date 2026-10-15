import { Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress } from '@mui/material';
import { ContentCopyOutlined } from '@mui/icons-material';

export function DeliveryTime({ value }) {
  if (!value) return <span className="integration-muted">Not provided</span>;
  const date = new Date(/(?:Z|[+-]\d\d:\d\d)$/i.test(value) ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return 'Not provided';
  return <time dateTime={date.toISOString()} className="delivery-time"><span>{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(date)}</span><small>{new Intl.DateTimeFormat('en-IN', { timeStyle: 'short', timeZone: 'UTC' }).format(date)} UTC</small></time>;
}
export function DeliveryBadge({ status }) {
  return <Chip size="small" label={status} className={`delivery-status delivery-status-${status.toLowerCase()}`} />;
}
export function DeliveryDetails({ dialog, busy, onClose, onRetry, onReplay, onCopy }) {
  const data = dialog.delivery;
  return <Dialog open fullWidth maxWidth="md" onClose={busy ? undefined : onClose} aria-labelledby="delivery-details-title" PaperProps={{ className: 'integration-dialog delivery-dialog' }}>
    <DialogTitle id="delivery-details-title">{dialog.mode === 'replay' ? 'Replay Delivery?' : 'Delivery Details'}</DialogTitle>
    <DialogContent className="integration-form">
      {dialog.error && <Alert severity="error">{dialog.error}</Alert>}
      {!data && !dialog.error && <div role="status"><LinearProgress />Loading delivery details…</div>}
      {data && <>
        {dialog.mode === 'replay' && <Alert severity="warning">Replaying this delivery will send the webhook request again to the configured destination.</Alert>}
        {dialog.mode === 'replay' && dialog.checking && <div role="status"><LinearProgress />Checking destination status…</div>}
        {dialog.mode === 'replay' && !dialog.checking && !dialog.eligible && !dialog.error && !dialog.result && <Alert severity="warning">The webhook must be Active before this delivery can be replayed.</Alert>}
        {dialog.result && <Alert severity={dialog.result.success ? 'success' : dialog.result.status === 'Retrying' ? 'warning' : 'error'}>{dialog.result.message} Status: {dialog.result.status}</Alert>}
        <dl className="integration-facts delivery-facts">
          {[['Event ID', data.eventId], ['Webhook ID / Name', `${data.webhookId} / ${data.webhookName || 'Name not provided'}`], ['Event Type', data.eventType], ['Delivery Status', <DeliveryBadge status={data.status} />], ['Created Timestamp', <DeliveryTime value={data.createdAtUtc} />], ['Delivered Timestamp', <DeliveryTime value={data.deliveredAtUtc} />], ['Next Retry Timestamp', <DeliveryTime value={data.nextRetryUtc} />], ['Attempt Number', data.attemptNumber], ['Maximum Attempts', data.maxAttempts ?? 'Not provided'], ['HTTP Response Status', data.responseStatusCode ?? 'Not provided'], ['Latency', data.executionDurationMs == null ? 'Not provided' : `${data.executionDurationMs} ms`], ['Failure Reason', data.failureReason || 'Not provided']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        <p className="delivery-note">The backend does not supply a last-attempt timestamp. Delivered Timestamp is supplied only for successful delivery. Attempt Number is the backend value, not a calculated count.</p>
        {dialog.mode === 'view' && <><Alert severity="info">Sensitive fields are redacted. Copy Payload copies this sanitized view only. Non-JSON content is omitted for security.</Alert>
          {[['Request Headers', data.requestHeadersJson], ['Request Payload', data.payloadJson], ['Response Body', data.responseBody]].map(([label, value]) => <section key={label} className="delivery-document"><h3>{label}</h3><pre tabIndex={0} aria-label={label}>{value}</pre></section>)}
          <Button startIcon={<ContentCopyOutlined />} onClick={() => onCopy(data.payloadJson)}>Copy Payload</Button>
        </>}
      </>}
    </DialogContent>
    <DialogActions><Button disabled={busy} onClick={onClose}>{dialog.mode === 'replay' && !dialog.result ? 'Cancel' : 'Close'}</Button>
      {dialog.error && <Button disabled={busy} onClick={onRetry}>Retry Details</Button>}
      {dialog.mode === 'replay' && data && !dialog.result && <Button variant="contained" disabled={busy || dialog.checking || !dialog.eligible || Boolean(dialog.error)} onClick={onReplay}>{busy ? 'Replaying…' : 'Confirm Replay'}</Button>}
    </DialogActions>
  </Dialog>;
}
