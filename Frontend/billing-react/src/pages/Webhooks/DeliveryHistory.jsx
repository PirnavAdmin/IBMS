import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Autocomplete, Button, IconButton, LinearProgress, Menu, MenuItem, Tab, Tabs, TextField, Tooltip } from '@mui/material';
import { MoreVert, Refresh, RestartAlt } from '@mui/icons-material';
import { apiClient } from 'billing-api-client';
import { FeedbackSnackbar } from '../../components/FeedbackSnackbar';
import { integrationAccess } from '../Integrations/integrationService';
import { webhookService } from './webhookService';
import { DELIVERY_STATUSES, deliveryError, deliveryService } from './deliveryService';
import { DeliveryBadge, DeliveryDetails, DeliveryTime } from './DeliveryDetails';
import { DeliveryDateRange } from './DeliveryDateRange';
import '../Integrations/integrations.css';
import './deliveries.css';

const positive = value => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
const validDate = value => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value);
export function DeliveryHistory() {
  const [params, setParams] = useSearchParams(), client = useQueryClient();
  const [menu, setMenu] = useState(null), [dialog, setDialog] = useState(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState(null);
  const [webhookSearch, setWebhookSearch] = useState(''), [webhookTerm, setWebhookTerm] = useState('');
  const mounted = useRef(false), locked = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { const timer = setTimeout(() => setWebhookTerm(webhookSearch.trim()), 300); return () => clearTimeout(timer); }, [webhookSearch]);
  const filters = { webhookId: params.get('webhookId') || '', eventType: params.get('eventType') || '', status: params.get('status') || '', startDate: params.get('startDate') || '', endDate: params.get('endDate') || '', pageNumber: positive(params.get('pageNumber')) ? Number(params.get('pageNumber')) : 1, pageSize: [10, 20, 50].includes(Number(params.get('pageSize'))) ? Number(params.get('pageSize')) : 20 };
  const invalidFilters = (filters.webhookId && !positive(filters.webhookId)) || (filters.status && !DELIVERY_STATUSES.includes(filters.status)) || !validDate(filters.startDate) || !validDate(filters.endDate);
  const invalidDates = filters.startDate && filters.endDate && filters.startDate > filters.endDate;
  const setFilter = (key, value) => setParams(previous => { const next = new URLSearchParams(previous); if (value === '' || value == null) next.delete(key); else next.set(key, String(value)); if (key !== 'pageNumber') next.delete('pageNumber'); return next; });
  const user = useQuery({ queryKey: ['auth-user'], queryFn: ({ signal }) => apiClient.get('/api/Auth/me', { signal }), retry: false, staleTime: 60000 });
  const allowed = integrationAccess(user.data), profile = user.data?.data ?? user.data, tenantKey = profile?.tenantId ?? profile?.tenant_id ?? 'current';
  const enabled = allowed && !invalidFilters && !invalidDates;
  const list = useQuery({ queryKey: ['deliveries', tenantKey, 'list', filters], queryFn: ({ signal }) => deliveryService.list(filters, signal), enabled, retry: false });
  const summary = useQuery({ queryKey: ['deliveries', tenantKey, 'summary'], queryFn: ({ signal }) => deliveryService.summary(signal), enabled: allowed, retry: false, staleTime: 60000 });
  const events = useQuery({ queryKey: ['webhook-events', tenantKey], queryFn: ({ signal }) => webhookService.events(signal), enabled: allowed, retry: false, staleTime: 300000 });
  // Test pings are delivery events, not part of the subscription event catalog.
  const deliveryEvents = [...(events.data || []).filter(event => event.eventType !== 'endpoint.ping'), { eventType: 'endpoint.ping' }];
  const hooks = useInfiniteQuery({ queryKey: ['delivery-webhooks', tenantKey, webhookTerm], queryFn: ({ pageParam, signal }) => webhookService.list({ searchTerm: webhookTerm, pageNumber: pageParam, pageSize: 20 }, signal), initialPageParam: 1, getNextPageParam: page => page.pageNumber < page.totalPages ? page.pageNumber + 1 : undefined, enabled: allowed, retry: false, staleTime: 60000 });
  const selectedHook = useQuery({ queryKey: ['delivery-webhook', tenantKey, filters.webhookId], queryFn: ({ signal }) => webhookService.get(Number(filters.webhookId), signal), enabled: Boolean(allowed && filters.webhookId && positive(filters.webhookId)), retry: false, staleTime: 60000 });
  const options = hooks.data?.pages.flatMap(page => page.items) || [];
  const selected = filters.webhookId && positive(filters.webhookId) ? options.find(item => item.id === Number(filters.webhookId)) || selectedHook.data || { id: Number(filters.webhookId), name: `Webhook #${filters.webhookId}` } : null;
  if (selected && !options.some(item => item.id === selected.id)) options.unshift(selected);
  const detailId = dialog?.id, detailAttempt = dialog?.attempt ?? 0, mode = dialog?.mode;
  useEffect(() => {
    if (!detailId) return;
    const controller = new AbortController();
    const update = changes => { if (!controller.signal.aborted) setDialog(previous => previous?.id === detailId ? { ...previous, ...changes } : previous); };
    (async () => {
      try {
        const delivery = await deliveryService.get(detailId, controller.signal);
        update({ delivery, error: '', checking: mode === 'replay', eligible: false });
        if (mode === 'replay') {
          const webhook = await webhookService.get(delivery.webhookId, controller.signal);
          // Backend ReplayDeliveryAsync supports all statuses (including Success) for Active destinations.
          update({ checking: false, eligible: webhook.status === 'Active' && DELIVERY_STATUSES.includes(delivery.status) });
        }
      } catch (error) { update({ checking: false, eligible: false, error: deliveryError(error) }); }
    })();
    return () => controller.abort();
  }, [detailId, detailAttempt, mode]);
  const refresh = () => { void client.invalidateQueries({ queryKey: ['deliveries', tenantKey] }); if (dialog) setDialog(previous => ({ ...previous, attempt: (previous.attempt || 0) + 1 })); };
  const close = () => { if (!locked.current) setDialog(null); };
  const open = (mode, row) => { setMenu(null); setDialog({ mode, id: row.id, delivery: null, checking: mode === 'replay', eligible: false, error: '' }); };
  const replay = async () => {
    if (locked.current || !allowed || !dialog?.eligible || !dialog.delivery) return;
    locked.current = true; setBusy(true); const id = dialog.id;
    setDialog(previous => ({ ...previous, error: '' }));
    try {
      const result = await deliveryService.replay(id);
      if (!mounted.current) return;
      setDialog(previous => previous?.id === id ? { ...previous, result, eligible: false } : previous);
      setNotice({ message: result.message, severity: result.success ? 'success' : result.status === 'Retrying' ? 'warning' : 'error' });
      void client.invalidateQueries({ queryKey: ['deliveries', tenantKey] });
      // Always refetch authoritative detail; the POST can report Retrying or DeadLetter, not just Success.
      try {
        const delivery = await deliveryService.get(id);
        if (mounted.current) setDialog(previous => previous?.id === id ? { ...previous, delivery } : previous);
      } catch (error) { if (mounted.current) setDialog(previous => previous?.id === id ? { ...previous, error: `Replay completed, but details could not be refreshed. ${deliveryError(error)}` } : previous); }
    } catch (error) {
      if (mounted.current) { const message = deliveryError(error); setDialog(previous => previous?.id === id ? { ...previous, error: message } : previous); setNotice({ message, severity: 'error' }); }
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  };
  const copy = async value => {
    try { if (!navigator.clipboard?.writeText) throw new Error(); await navigator.clipboard.writeText(value); if (mounted.current) setNotice({ message: 'Sanitized payload copied.', severity: 'success' }); }
    catch { if (mounted.current) setNotice({ message: 'Unable to copy. Select the sanitized payload and copy it manually.', severity: 'error' }); }
  };
  const page = list.data, waiting = enabled && (list.isPending || list.isFetching), dlq = filters.status === 'DeadLetter';
  return <main className="integrations-page delivery-page">
    <header className="integrations-heading"><div><span className="integrations-eyebrow">Webhook Monitoring</span><h1>Webhook Delivery History</h1><p>Monitor webhook delivery attempts, failures, retries, and dead-letter records.</p></div><div className="integrations-heading-actions"><Button component={Link} to="/webhooks" variant="outlined">Back to Webhook Configuration</Button><Button variant="outlined" startIcon={<Refresh />} disabled={!allowed || waiting || busy} onClick={refresh}>Refresh</Button></div></header>
    {user.isPending ? <div role="status"><LinearProgress />Checking delivery access…</div> : user.isError ? <Alert severity="error" action={<Button onClick={() => user.refetch()}>Retry</Button>}>{deliveryError(user.error)}</Alert> : !allowed ? <Alert severity="warning">Delivery access requires TenantAdmin, SuperAdmin, or User permissions.</Alert> : <>
      {summary.data && !summary.isError && <section className="delivery-summary" aria-label="Global delivery totals">{Object.entries(summary.data).map(([key, count]) => <div key={key}><span>{{ Total: 'Total Deliveries', Success: 'Successful Deliveries', Retrying: 'Retrying Deliveries', Failed: 'Failed Deliveries', DeadLetter: 'Dead-Letter Deliveries' }[key]}</span><strong>{count}</strong></div>)}</section>}
      {summary.isError && <Alert severity="warning" action={<Button onClick={() => summary.refetch()}>Retry Totals</Button>}>Global status totals unavailable. {deliveryError(summary.error)}</Alert>}
      <section className="integrations-panel">
        <Tabs value={dlq ? 'dlq' : 'all'} onChange={(_event, value) => setFilter('status', value === 'dlq' ? 'DeadLetter' : '')} aria-label="Delivery queue" variant="scrollable" scrollButtons="auto"><Tab value="all" label="Delivery History" /><Tab value="dlq" label="Dead-Letter Queue" /></Tabs>
        <div className="delivery-filters">
          <TextField select size="small" label="Event Type" value={filters.eventType} disabled={events.isPending || events.isError} onChange={event => setFilter('eventType', event.target.value)}><MenuItem value="">All events</MenuItem>{filters.eventType && !deliveryEvents.some(event => event.eventType === filters.eventType) && <MenuItem value={filters.eventType}>{filters.eventType}</MenuItem>}{deliveryEvents.map(event => <MenuItem key={event.eventType} value={event.eventType}>{event.eventType === 'endpoint.ping' ? 'Test Ping (endpoint.ping)' : event.eventType}</MenuItem>)}</TextField>
          <TextField select size="small" label="Status" value={DELIVERY_STATUSES.includes(filters.status) ? filters.status : ''} onChange={event => setFilter('status', event.target.value)}><MenuItem value="">All statuses</MenuItem>{DELIVERY_STATUSES.map(status => <MenuItem key={status} value={status}>{status}</MenuItem>)}</TextField>
          <Autocomplete size="small" options={options} value={selected} filterOptions={items => items} loading={hooks.isFetching || selectedHook.isFetching} getOptionLabel={item => item.name} isOptionEqualToValue={(a, b) => a.id === b.id} onInputChange={(_event, value, reason) => { if (reason === 'input' || reason === 'clear') setWebhookSearch(value); }} onChange={(_event, value) => setFilter('webhookId', value?.id ?? '')} renderInput={props => <TextField {...props} label="Webhook" />} />
          <DeliveryDateRange startDate={validDate(filters.startDate) ? filters.startDate : ''} endDate={validDate(filters.endDate) ? filters.endDate : ''}
            onChange={dates => setParams(previous => { const next = new URLSearchParams(previous); for (const [key, value] of Object.entries(dates)) { if (value) next.set(key, value); else next.delete(key); } next.delete('pageNumber'); return next; })} />
          <Button variant="outlined" startIcon={<RestartAlt />} onClick={() => { setParams({}); setWebhookSearch(''); }}>Reset Filters</Button>
        </div>
        <div className="delivery-filter-notes"><span>Dates filter creation time (UTC). {filters.webhookId && positive(filters.webhookId) ? `Selected webhook: #${filters.webhookId}` : ''}</span>{hooks.hasNextPage && <Button size="small" disabled={hooks.isFetchingNextPage} onClick={() => hooks.fetchNextPage()}>Load More Webhooks</Button>}</div>
        {events.isError && <Alert severity="warning" action={<Button onClick={() => events.refetch()}>Retry Events</Button>}>{deliveryError(events.error)}</Alert>}
        {(hooks.isError || selectedHook.isError) && <Alert severity="warning" action={<Button onClick={() => { if (hooks.isError) void hooks.refetch(); if (selectedHook.isError) void selectedHook.refetch(); }}>Retry Webhooks</Button>}>Webhook choices could not be loaded. The selected webhook filter is retained.</Alert>}
        {(invalidFilters || invalidDates) && <Alert severity="error">{invalidDates ? 'To Date must be on or after From Date.' : 'Invalid filter in the URL. Reset the filters or select a valid value.'}</Alert>}
        {waiting && <div role="status" className="integration-progress" aria-label="Loading deliveries"><LinearProgress /></div>}
        {enabled && list.isError ? <div className="integration-state"><Alert severity="error" action={<Button onClick={() => list.refetch()}>Retry</Button>}>{deliveryError(list.error)}</Alert></div> : enabled && page?.items.length ? <div className="integrations-table-scroll" role="region" aria-label="Delivery list" tabIndex={0}>
          <table className={`integrations-table deliveries-table${dlq ? ' deliveries-table-dlq' : ''}`} aria-label={dlq ? 'Dead-letter deliveries' : 'Webhook deliveries'} aria-busy={waiting}>
            <thead><tr>{(dlq ? ['Event ID', 'Event Type', 'Webhook Name', 'Delivery Status', 'Failure Reason', 'Attempt #', 'Next Retry At', 'Actions'] : ['Event ID', 'Event Type', 'Webhook Name', 'Delivery Status', 'HTTP Status', 'Attempt #', 'Delivered At', 'Next Retry At', 'Actions']).map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody>{page.items.map(row => <tr key={row.id}><td><Tooltip title={row.eventId}><code className="delivery-truncated">{row.eventId}</code></Tooltip></td><td><Tooltip title={row.eventType}><span className="delivery-truncated">{row.eventType}</span></Tooltip></td><td><Tooltip title={row.webhookName}><span className="delivery-truncated">{row.webhookName || `Webhook #${row.webhookId}`}</span></Tooltip></td><td><DeliveryBadge status={row.status} /></td><td>{dlq ? <Tooltip title={row.failureReason}><span className="delivery-truncated">{row.failureReason || 'Not provided'}</span></Tooltip> : row.responseStatusCode ?? 'Not provided'}</td><td>{row.attemptNumber}</td>{!dlq && <td><DeliveryTime value={row.deliveredAtUtc} /></td>}<td><DeliveryTime value={row.nextRetryUtc} /></td><td><IconButton aria-label={`Actions for delivery ${row.id}`} aria-haspopup="menu" aria-expanded={menu?.delivery.id === row.id} disabled={busy} onClick={event => setMenu({ anchor: event.currentTarget, delivery: row })}><MoreVert /></IconButton></td></tr>)}</tbody>
          </table>
        </div> : enabled && !waiting && !list.isError && <div className="integration-state integration-empty"><h2>{dlq ? 'No dead-letter deliveries found' : 'No deliveries found'}</h2><p>Try changing your filters or refresh to check for new records.</p></div>}
        {enabled && page && !list.isError && <footer className="integrations-pagination"><TextField select size="small" label="Rows per page" value={filters.pageSize} onChange={event => setFilter('pageSize', event.target.value)}>{[10, 20, 50].map(size => <MenuItem key={size} value={size}>{size}</MenuItem>)}</TextField><span>{page.totalCount} deliveries · Page {page.pageNumber} of {Math.max(1, page.totalPages)}</span><div><Button disabled={waiting || page.pageNumber <= 1} onClick={() => setFilter('pageNumber', page.pageNumber - 1)}>Previous</Button><Button disabled={waiting || page.pageNumber >= page.totalPages} onClick={() => setFilter('pageNumber', page.pageNumber + 1)}>Next</Button></div></footer>}
      </section>
    </>}
    <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={() => setMenu(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }} marginThreshold={8} PaperProps={{ className: 'integration-actions-menu' }}>
      {menu && <MenuItem onClick={() => open('view', menu.delivery)}>View Details</MenuItem>}
      {menu && allowed && DELIVERY_STATUSES.includes(menu.delivery.status) && <MenuItem onClick={() => open('replay', menu.delivery)}>Replay Delivery</MenuItem>}
    </Menu>
    {dialog && <DeliveryDetails dialog={dialog} busy={busy} onClose={close} onRetry={() => setDialog(previous => ({ ...previous, error: '', checking: previous.mode === 'replay', attempt: (previous.attempt || 0) + 1 }))} onReplay={replay} onCopy={copy} />}
    <FeedbackSnackbar message={notice?.message || ''} severity={notice?.severity} onClose={() => setNotice(null)} />
  </main>;
}
