import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, LinearProgress, ListItemIcon, Menu, MenuItem, TextField, Tooltip } from '@mui/material';
import { Add, Block, CheckCircleOutline, ContentCopyOutlined, DeleteOutline, EditOutlined, HistoryOutlined, MoreVert, PauseCircleOutline, PowerSettingsNew, Refresh, Search, SendOutlined, VisibilityOutlined, VpnKeyOutlined, Webhook } from '@mui/icons-material';
import { apiClient } from 'billing-api-client';
import { FeedbackSnackbar } from '../../components/FeedbackSnackbar';
import { WorkspacePagination } from '../../components/WorkspacePagination';
import { DashboardErrorState } from '../../components/dashboard/DashboardStates';
import { integrationAccess } from '../Integrations/integrationService';
import { WebhookEditor } from './WebhookEditor';
import { webhookError, webhookService, WEBHOOK_STATUSES } from './webhookService';
import '../Integrations/integrations.css';
import './webhooks.css';

const webhookActionIcons = {
  view: VisibilityOutlined,
  edit: EditOutlined,
  toggle: PowerSettingsNew,
  ping: SendOutlined,
  rotate: VpnKeyOutlined,
  delete: DeleteOutline,
  deliveries: HistoryOutlined,
};

function Timestamp({ value }) {
  if (!value) return <span className="integration-muted">Never triggered</span>;
  const date = new Date(/(?:Z|[+-]\d\d:\d\d)$/i.test(value) ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? 'Not provided' : <time className="webhook-time" dateTime={date.toISOString()}><span>{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(date)}</span><small>{new Intl.DateTimeFormat('en-IN', { timeStyle: 'short' }).format(date)}</small></time>;
}
function Subscriptions({ events, full = false }) {
  if (full) return <div className="integration-flags">{events.map(event => <Chip key={event} size="small" label={event} variant="outlined" />)}</div>;
  return <Tooltip title={events.join(', ') || 'No subscriptions'}><span className="webhook-event-summary">{events.length === 1 ? events[0] : `${events.length} events`}</span></Tooltip>;
}
function WebhookSecret({ secret, onClose, onCopy }) {
  const field = useRef(null);
  const close = () => { if (field.current) field.current.value = ''; onClose(); };
  return <Dialog open onClose={close} fullWidth maxWidth="sm" aria-labelledby="webhook-secret-title" PaperProps={{ className: 'integration-dialog' }}>
    <DialogTitle id="webhook-secret-title">Save Your Webhook Secret</DialogTitle>
    <DialogContent className="integration-form"><Alert severity="warning">Please copy and store this secret safely. It will not be shown again.</Alert>
      <TextField fullWidth label="New Secret Key" defaultValue={secret} inputRef={field} InputProps={{ readOnly: true }} inputProps={{ autoComplete: 'off', spellCheck: false }} />
      <Button startIcon={<ContentCopyOutlined />} onClick={onCopy}>Copy Secret</Button>
    </DialogContent><DialogActions><Button variant="contained" onClick={close}>I Have Saved the Secret</Button></DialogActions>
  </Dialog>;
}
export function Webhooks() {
  const context = useOutletContext() || {}, navigate = useNavigate(), client = useQueryClient();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ status: '', eventType: '', searchTerm: '', pageNumber: 1, pageSize: 20 });
  const [menu, setMenu] = useState(null), [dialog, setDialog] = useState(null), [secret, setSecret] = useState(null);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(null);
  const locked = useRef(false), mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const user = useQuery({ queryKey: ['auth-user'], queryFn: ({ signal }) => apiClient.get('/api/Auth/me', { signal }), retry: false, staleTime: 60000 });
  const allowed = integrationAccess(user.data), profile = user.data?.data ?? user.data;
  const tenantKey = profile?.tenantId ?? profile?.tenant_id ?? 'current';
  const effectiveSearch = context.searchQuery || search;
  useEffect(() => { const timer = setTimeout(() => setFilters(previous => previous.searchTerm === effectiveSearch.trim() ? previous : { ...previous, searchTerm: effectiveSearch.trim(), pageNumber: 1 }), 300); return () => clearTimeout(timer); }, [effectiveSearch]);
  const list = useQuery({ queryKey: ['webhooks', tenantKey, 'list', filters], queryFn: ({ signal }) => webhookService.list(filters, signal), enabled: allowed, retry: false });
  const summary = useQuery({ queryKey: ['webhooks', tenantKey, 'summary'], queryFn: ({ signal }) => webhookService.summary(signal), enabled: allowed, retry: false, staleTime: 60000 });
  const events = useQuery({ queryKey: ['webhook-events', tenantKey], queryFn: ({ signal }) => webhookService.events(signal), enabled: allowed, retry: false, staleTime: 300000 });
  const detailId = dialog?.id, attempt = dialog?.attempt ?? 0;
  useEffect(() => {
    if (!detailId) return;
    const controller = new AbortController();
    webhookService.get(detailId, controller.signal).then(webhook => {
      if (!controller.signal.aborted) setDialog(previous => previous?.id === detailId ? { ...previous, webhook, error: '' } : previous);
    }).catch(error => { if (!controller.signal.aborted) setDialog(previous => previous?.id === detailId ? { ...previous, error: webhookError(error) } : previous); });
    return () => controller.abort();
  }, [detailId, attempt]);
  const refresh = () => client.invalidateQueries({ queryKey: ['webhooks', tenantKey] });
  const close = () => { if (!locked.current) setDialog(null); };
  const open = (mode, webhook) => { setMenu(null); setDialog({ mode, id: webhook.id, webhook: null, error: '' }); };
  const run = async (operation, message, mode) => {
    if (locked.current || !allowed) return;
    locked.current = true; setBusy(true); setDialog(previous => previous ? { ...previous, error: '', ...(mode === 'ping' ? { ping: null } : {}) } : previous);
    try {
      const result = await operation();
      if (!mounted.current) return;
      if (mode === 'ping') {
        setDialog(previous => ({ ...previous, ping: result }));
        setNotice({ message: result.success ? 'Test ping delivered successfully.' : 'Test ping failed. See the response details.', severity: result.success ? 'success' : 'error' });
      } else {
        setDialog(null);
        if (mode === 'rotate') setSecret(result);
        setNotice({ message, severity: 'success' });
        if (mode === 'delete') setFilters(previous => ({ ...previous, pageNumber: 1 }));
      }
      void refresh();
    } catch (error) {
      if (mounted.current) { const message = webhookError(error); setDialog(previous => previous ? { ...previous, error: message } : previous); setNotice({ message, severity: 'error' }); }
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  };
  const copySecret = async () => {
    try { if (!navigator.clipboard?.writeText) throw new Error(); await navigator.clipboard.writeText(secret); if (mounted.current) setNotice({ message: 'Secret copied.', severity: 'success' }); }
    catch { if (mounted.current) setNotice({ message: 'Unable to copy. Select the secret and copy it manually.', severity: 'error' }); }
  };
  const webhook = dialog?.webhook, page = list.data, waiting = allowed && (list.isPending || list.isFetching);
  const changeFilter = (key, value) => setFilters(previous => ({ ...previous, [key]: value, pageNumber: 1 }));
  const selectSummaryCard = status => {
    const selectedStatus = status && filters.status !== status ? status : '';
    setSearch('');
    context.onSearch?.('');
    setFilters(previous => ({ ...previous, status: selectedStatus, eventType: '', searchTerm: '', pageNumber: 1 }));
    window.requestAnimationFrame(() => document.querySelector('.integrations-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  return <main className="integrations-page webhooks-page">
    <header className="integrations-heading"><div><span className="integrations-eyebrow">Configuration &amp; Administration</span><h1>Webhook Configuration</h1><p>Manage webhook endpoints and event subscriptions</p></div>
      <div className="integrations-heading-actions"><Button variant="outlined" startIcon={<Refresh />} disabled={!allowed || waiting} onClick={refresh}>Refresh</Button><Button variant="contained" startIcon={<Add />} disabled={!allowed} onClick={() => setDialog({ mode: 'create', error: '' })}>Create Webhook</Button></div>
    </header>
    {user.isPending ? <div role="status"><LinearProgress />Checking webhook access…</div> : user.isError ? <DashboardErrorState title="Unable to load webhook configuration" message={webhookError(user.error)} onRetry={() => user.refetch()} /> : !allowed ? <Alert severity="warning">Webhook access requires TenantAdmin, SuperAdmin, or User permissions.</Alert> : <>
      {summary.data && !summary.isError && <section className="webhook-summary" aria-label="Webhook totals">{Object.entries(summary.data).map(([key, count]) => {
        const selected = (key === 'Total' && !filters.status && !filters.eventType && !filters.searchTerm) || (key !== 'Total' && filters.status === key);
        const description = { Total: 'Configured endpoints', Active: 'Ready to receive events', Disabled: 'Paused delivery endpoints', Suspended: 'Needs attention' }[key] || 'Webhook endpoints';
        return <button type="button" key={key} aria-pressed={selected} onClick={() => selectSummaryCard(key === 'Total' ? '' : key)} className={`webhook-summary-card webhook-summary-${key.toLowerCase()} ${selected ? 'selected' : ''}`}>
          <span className="webhook-summary-top"><span>{key} Webhooks</span><span className="webhook-summary-icon" aria-hidden="true">{key === 'Active' ? <CheckCircleOutline /> : key === 'Disabled' ? <Block /> : key === 'Suspended' ? <PauseCircleOutline /> : <Webhook />}</span></span>
          <strong>{count}</strong><small>{description}</small>
        </button>;
      })}</section>}
      {summary.isError && <Alert severity="warning" action={<Button onClick={() => summary.refetch()}>Retry Summary</Button>}>Summary counts are unavailable. {webhookError(summary.error)}</Alert>}
      <section className="integrations-panel" aria-label="Configured webhooks">
        <div className="integrations-toolbar webhook-toolbar">
          <TextField size="small" type="search" label="Search webhooks" placeholder="Search by name or URL" value={search} onChange={event => { setSearch(event.target.value); context.onSearch?.(''); }} InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }} />
          <TextField select size="small" label="Status" value={filters.status} onChange={event => changeFilter('status', event.target.value)}><MenuItem value="">All statuses</MenuItem>{WEBHOOK_STATUSES.map(status => <MenuItem key={status} value={status}>{status}</MenuItem>)}</TextField>
          <TextField select size="small" label="Event Type" InputLabelProps={{ shrink: true }} value={filters.eventType} disabled={events.isPending || events.isError} onChange={event => changeFilter('eventType', event.target.value)} SelectProps={{ displayEmpty: true, renderValue: selected => selected || 'All events', MenuProps: { variant: 'menu', anchorOrigin: { vertical: 'bottom', horizontal: 'left' }, transformOrigin: { vertical: 'top', horizontal: 'left' }, marginThreshold: 8, PaperProps: { className: 'webhook-event-options-menu', sx: { maxHeight: 260 } } } }}><MenuItem value="">All events</MenuItem>{(events.data || []).filter(event => event.eventType !== '*').map(event => <MenuItem key={event.eventType} value={event.eventType}>{event.eventType}</MenuItem>)}</TextField>
          <span className="integration-result-count">{page && !list.isError ? `${page.totalCount} webhook${page.totalCount === 1 ? '' : 's'}` : ''}</span>
        </div>
        {events.isError && <Alert severity="warning" action={<Button onClick={() => events.refetch()}>Retry Events</Button>}>{webhookError(events.error)}</Alert>}
        {waiting && <div className="integration-progress" role="status" aria-label="Loading webhooks"><LinearProgress /></div>}
        {list.isError ? <DashboardErrorState title="Unable to load webhooks" message={webhookError(list.error)} onRetry={() => list.refetch()} /> : page?.items.length ?
          <div className="integrations-table-scroll" role="region" aria-label="Webhook list" tabIndex={0}><table className="integrations-table webhooks-table" aria-label="Webhooks" aria-busy={waiting}>
            <thead><tr>{['Webhook Name', 'Target URL', 'Associated Application', 'Subscribed Events', 'Status', 'Consecutive Failures', 'Last Triggered At', 'Actions'].map(title => <th scope="col" key={title}>{title}</th>)}</tr></thead>
            <tbody>{page.items.map(item => <tr key={item.id}>
              <td><Tooltip title={item.name}><strong className="webhook-truncated">{item.name}</strong></Tooltip></td>
              <td><Tooltip title={item.targetUrl}><span className="webhook-truncated webhook-url">{item.targetUrl}</span></Tooltip></td>
              <td><Tooltip title={item.applicationName || (item.applicationId ? `Application #${item.applicationId}` : 'No application')}><span className="webhook-truncated">{item.applicationName || (item.applicationId ? `Application #${item.applicationId}` : 'None')}</span></Tooltip></td>
              <td><Subscriptions events={item.subscribedEvents} /></td>
              <td><Chip size="small" className={`webhook-status-${item.status.toLowerCase()}`} label={item.status} /></td>
              <td>{item.consecutiveFailureCount}</td><td><Timestamp value={item.lastTriggeredAtUtc} /></td>
              <td><IconButton aria-label={`Actions for ${item.name}`} aria-haspopup="menu" aria-expanded={menu?.webhook.id === item.id} aria-controls={menu?.webhook.id === item.id ? 'webhook-actions-list' : undefined} disabled={busy} onClick={event => setMenu({ anchor: event.currentTarget, webhook: item })}><MoreVert /></IconButton></td>
            </tr>)}</tbody>
          </table></div> : !waiting && <div className="integration-state integration-empty"><h2>No webhooks found</h2><p>{filters.status || filters.searchTerm || filters.eventType ? 'Try changing your search or filters.' : 'Create a webhook to subscribe to billing events.'}</p></div>}
        {page && !list.isError && <WorkspacePagination page={page.pageNumber} pageSize={filters.pageSize} totalCount={page.totalCount} itemLabel="webhooks" disabled={waiting} onPageChange={pageNumber => setFilters(previous => ({ ...previous, pageNumber }))} onPageSizeChange={pageSize => changeFilter('pageSize', pageSize)} />}
      </section>
    </>}
    <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={() => setMenu(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }} marginThreshold={8} PaperProps={{ className: 'integration-actions-menu' }} MenuListProps={{ id: 'webhook-actions-list', 'aria-label': 'Webhook actions' }}>
      {menu && ['view', 'edit', 'toggle', 'ping', 'rotate', 'delete', 'deliveries'].map(mode => {
        const ActionIcon = webhookActionIcons[mode];
        const label = { view: 'View Details', edit: 'Edit Webhook', toggle: menu.webhook.status === 'Suspended' ? 'Suspended (backend managed)' : menu.webhook.status === 'Active' ? 'Disable Webhook' : 'Enable Webhook', ping: 'Test Ping', rotate: 'Rotate Secret', delete: 'Delete Webhook', deliveries: 'View Delivery History' }[mode];
        return <MenuItem key={mode} className={mode === 'delete' ? 'integration-action-destructive' : ''} disabled={busy || (mode === 'toggle' && menu.webhook.status === 'Suspended')}
          onClick={() => mode === 'deliveries' ? (setMenu(null), navigate(`/webhooks/deliveries?webhookId=${menu.webhook.id}`)) : open(mode, menu.webhook)}>
          <ListItemIcon><ActionIcon fontSize="small" /></ListItemIcon>{label}
        </MenuItem>;
      })}
    </Menu>
    {dialog?.mode === 'create' && <WebhookEditor tenantKey={tenantKey} events={events} busy={busy} error={dialog.error} onClose={close} onSave={dto => run(() => webhookService.create(dto), 'Webhook created.')} />}
    {dialog?.id && !webhook && <Dialog open onClose={close} fullWidth maxWidth="sm" PaperProps={{ className: 'integration-dialog' }} aria-labelledby="webhook-loading-title"><DialogTitle id="webhook-loading-title">Webhook Details</DialogTitle><DialogContent>{dialog.error ? <Alert severity="error">{dialog.error}</Alert> : <div role="status"><LinearProgress />Loading webhook…</div>}</DialogContent><DialogActions><Button onClick={close}>Close</Button>{dialog.error && <Button onClick={() => setDialog(previous => ({ ...previous, error: '', attempt: attempt + 1 }))}>Retry</Button>}</DialogActions></Dialog>}
    {webhook && dialog.mode === 'edit' && <WebhookEditor webhook={webhook} tenantKey={tenantKey} events={events} busy={busy} error={dialog.error} onClose={close} onSave={dto => run(() => webhookService.update(webhook.id, dto), 'Webhook updated.')} />}
    {webhook && dialog.mode !== 'edit' && <Dialog open onClose={busy ? undefined : close} fullWidth maxWidth="sm" PaperProps={{ className: 'integration-dialog' }} aria-labelledby="webhook-action-title">
      <DialogTitle id="webhook-action-title">{{ view: 'Webhook Details', ping: 'Test Ping', rotate: 'Rotate Webhook Secret?', delete: 'Delete Webhook?', toggle: webhook.status === 'Active' ? 'Disable Webhook?' : 'Enable Webhook?' }[dialog.mode]}</DialogTitle>
      <DialogContent className="integration-form">
        {dialog.error && <Alert severity="error">{dialog.error}</Alert>}
        {dialog.mode === 'view' ? <dl className="integration-facts"><div><dt>Webhook Name</dt><dd>{webhook.name}</dd></div><div><dt>Target URL</dt><dd>{webhook.targetUrl}</dd></div><div><dt>Associated Application</dt><dd>{webhook.applicationName || (webhook.applicationId ? `Application #${webhook.applicationId}` : 'None')}</dd></div><div><dt>Subscribed Events</dt><dd><Subscriptions events={webhook.subscribedEvents} full /></dd></div><div><dt>Status</dt><dd>{webhook.status}</dd></div><div><dt>Consecutive Failures</dt><dd>{webhook.consecutiveFailureCount}</dd></div><div><dt>Last Triggered At</dt><dd><Timestamp value={webhook.lastTriggeredAtUtc} /></dd></div><div><dt>Payload Format</dt><dd>{webhook.payloadFormat || 'Standard'}</dd></div><div><dt>Custom Headers</dt><dd>{Object.keys(webhook.customHeaders || {}).length ? Object.entries(webhook.customHeaders).map(([k, v]) => <div key={k}><code>{k}: {v.length > 20 ? v.slice(0, 16) + '...' : v}</code></div>) : 'None'}</dd></div>{webhook.customTemplate && <div><dt>Custom Template</dt><dd><pre style={{fontSize: 11, background: '#f9f6f0', padding: 6, borderRadius: 4, margin: 0}}>{webhook.customTemplate}</pre></dd></div>}<div><dt>Secret Preview</dt><dd>{webhook.secretKeyPreview || 'Not provided'}</dd></div></dl>
          : <p>{dialog.mode === 'rotate' ? `Rotate the signing secret for ${webhook.name}? Receivers using the old secret must be updated.` : dialog.mode === 'delete' ? `Permanently delete ${webhook.name}? This cannot be undone.` : dialog.mode === 'ping' ? `Send a test request to ${webhook.targetUrl}?` : `${webhook.status === 'Active' ? 'Disable' : 'Enable'} ${webhook.name}?`}</p>}
        {dialog.mode === 'toggle' && webhook.status === 'Suspended' && <Alert severity="warning">Suspended is managed by the backend and cannot be changed here.</Alert>}
        {dialog.ping && <><Alert severity={dialog.ping.success ? 'success' : 'error'}>{dialog.ping.success ? 'Ping succeeded' : 'Ping failed'}</Alert><dl className="integration-facts"><div><dt>HTTP Status Code</dt><dd>{dialog.ping.statusCode || 'No HTTP response'}</dd></div><div><dt>Latency</dt><dd>{dialog.ping.latencyMs} ms</dd></div><div><dt>Response Message</dt><dd>{dialog.ping.message}</dd></div>{dialog.ping.responseBody && <div><dt>Target Response Body</dt><dd><pre style={{maxHeight: 140, overflow: 'auto', fontSize: 11, background: '#f7f4ee', padding: 6, borderRadius: 4, margin: 0}}>{dialog.ping.responseBody}</pre></dd></div>}</dl></>}
      </DialogContent>
      <DialogActions><Button disabled={busy} onClick={close}>{dialog.mode === 'view' || dialog.ping ? 'Close' : 'Cancel'}</Button>
        {dialog.mode !== 'view' && <Button variant="contained" color={['delete', 'rotate'].includes(dialog.mode) ? 'error' : 'primary'} disabled={busy || (dialog.mode === 'toggle' && webhook.status === 'Suspended')}
          onClick={() => dialog.mode === 'ping' ? run(() => webhookService.ping(webhook.id), '', 'ping') : dialog.mode === 'rotate' ? run(() => webhookService.rotate(webhook.id), 'Webhook secret rotated. Save the new secret.', 'rotate') : dialog.mode === 'delete' ? run(() => webhookService.remove(webhook.id), 'Webhook deleted.', 'delete') : run(() => webhookService.toggle(webhook.id), 'Webhook status updated.')}>
          {busy ? 'Please wait…' : { ping: dialog.ping ? 'Send Again' : 'Send Test Ping', rotate: 'Rotate Secret', delete: 'Delete Webhook', toggle: webhook.status === 'Active' ? 'Disable Webhook' : 'Enable Webhook' }[dialog.mode]}
        </Button>}
      </DialogActions>
    </Dialog>}
    {secret && <WebhookSecret secret={secret} onClose={() => setSecret(null)} onCopy={copySecret} />}
    <FeedbackSnackbar message={notice?.message || ''} severity={notice?.severity} onClose={() => setNotice(null)} />
  </main>;
}
