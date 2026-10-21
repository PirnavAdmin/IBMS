import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Alert, Autocomplete, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, LinearProgress, MenuItem, TextField } from '@mui/material';
import { integrationService } from '../Integrations/integrationService';
import { validateWebhook, webhookDto, webhookError } from './webhookService';

export function WebhookEditor({ webhook, tenantKey, events, busy, error, onClose, onSave }) {
  const [form, setForm] = useState(webhook ? { ...webhook, subscribedEvents: [...webhook.subscribedEvents] } : { name: '', targetUrl: '', applicationId: null, subscribedEvents: [], status: 'Active' });
  const [validation, setValidation] = useState({});
  const [application, setApplication] = useState(webhook?.applicationId ? { id: webhook.applicationId, name: webhook.applicationName || `Application #${webhook.applicationId}` } : null);
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => { const timer = setTimeout(() => setTerm(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  const apps = useInfiniteQuery({ queryKey: ['webhook-applications', tenantKey, term],
    queryFn: ({ pageParam, signal }) => integrationService.list({ pageNumber: pageParam, pageSize: 20, searchTerm: term }, signal),
    initialPageParam: 1, getNextPageParam: page => page.pageNumber < page.totalPages ? page.pageNumber + 1 : undefined,
    retry: false, staleTime: 60000 });
  const options = apps.data?.pages.flatMap(page => page.items) || [];
  if (application && !options.some(option => option.id === application.id)) options.unshift(application);
  const known = new Set((events.data || []).map(event => event.eventType));
  const catalog = [...(events.data || []), ...form.subscribedEvents.filter(event => !known.has(event)).map(event => ({ eventType: event, category: 'Existing subscriptions', description: 'Previously configured subscription; preserved unless you remove it.' }))];
  const groups = Map.groupBy ? Map.groupBy(catalog, event => event.category) : catalog.reduce((map, event) => map.set(event.category, [...(map.get(event.category) || []), event]), new Map());
  const change = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  return <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="webhook-editor-title" PaperProps={{ className: 'integration-dialog webhook-dialog' }}>
    <form noValidate onSubmit={event => { event.preventDefault(); const errors = validateWebhook(form); setValidation(errors); if (!Object.keys(errors).length && events.data && !events.isError) onSave(webhookDto(form)); }}>
      <DialogTitle id="webhook-editor-title">{webhook ? 'Edit Webhook' : 'Create Webhook'}</DialogTitle>
      <DialogContent className="integration-form">
        {error && <Alert severity="error">{error}</Alert>}
        <TextField autoFocus fullWidth required label="Webhook Name" value={form.name} disabled={busy} onChange={event => change('name', event.target.value)} error={Boolean(validation.name)} helperText={validation.name} />
        <TextField fullWidth required label="Destination URL" placeholder="https://" value={form.targetUrl} disabled={busy} onChange={event => change('targetUrl', event.target.value)} error={Boolean(validation.targetUrl)} helperText={validation.targetUrl} />
        <Autocomplete size="small" options={options} value={application} disabled={busy} loading={apps.isFetching} filterOptions={items => items}
          getOptionLabel={option => option.name} isOptionEqualToValue={(a, b) => a.id === b.id}
          onInputChange={(_event, value, reason) => { if (reason === 'input' || reason === 'clear') setSearch(value); }}
          onChange={(_event, value) => { setApplication(value); change('applicationId', value?.id ?? null); }}
          renderInput={params => <TextField {...params} label="Associated Application (optional)" />} />
        {apps.isError && <Alert severity="warning" action={<Button onClick={() => apps.refetch()}>Retry</Button>}>{webhookError(apps.error)} Existing association will be preserved.</Alert>}
        {apps.hasNextPage && <Button disabled={busy || apps.isFetchingNextPage} onClick={() => apps.fetchNextPage()}>{apps.isFetchingNextPage ? 'Loading…' : 'Load More Applications'}</Button>}
        <TextField select fullWidth label="Status" value={form.status} disabled={busy || webhook?.status === 'Suspended'} onChange={event => change('status', event.target.value)} helperText={webhook?.status === 'Suspended' ? 'Suspended is managed by the backend. Edit the endpoint without changing this status.' : undefined}>
          <MenuItem value="Active">Active</MenuItem><MenuItem value="Disabled">Disabled</MenuItem>{webhook?.status === 'Suspended' && <MenuItem value="Suspended">Suspended</MenuItem>}
        </TextField>
        <fieldset className="webhook-event-fieldset"><legend>Subscribed Events *</legend>
          {events.isPending && <div role="status"><LinearProgress />Loading event catalog…</div>}
          {events.isError && <Alert severity="error" action={<Button onClick={() => events.refetch()}>Retry</Button>}>{webhookError(events.error)}</Alert>}
          {!events.isPending && !events.isError && !catalog.length && <Alert severity="info">No supported events were returned by the backend.</Alert>}
          {[...groups].map(([category, entries]) => <section key={category} className="webhook-event-group"><h3>{category}</h3>{entries.map(event => <FormControlLabel key={event.eventType}
            control={<Checkbox disabled={busy} checked={form.subscribedEvents.includes(event.eventType)} onChange={(_event, checked) => change('subscribedEvents', checked ? [...form.subscribedEvents, event.eventType] : form.subscribedEvents.filter(value => value !== event.eventType))} />}
            label={<span><strong>{event.eventType}</strong><small>{event.description}</small></span>} />)}</section>)}
          {validation.subscribedEvents && <p className="webhook-validation" role="alert">{validation.subscribedEvents}</p>}
        </fieldset>
      </DialogContent>
      <DialogActions><Button disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" variant="contained" disabled={busy || events.isPending || events.isError || !catalog.length}>{busy ? 'Saving…' : webhook ? 'Save Webhook' : 'Create Webhook'}</Button></DialogActions>
    </form>
  </Dialog>;
}
