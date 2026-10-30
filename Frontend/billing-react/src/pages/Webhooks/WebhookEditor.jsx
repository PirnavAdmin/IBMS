import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  Alert, Autocomplete, Button, Checkbox, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, IconButton, LinearProgress, MenuItem, TextField, Tooltip
} from '@mui/material';
import { Add, DeleteOutline, KeyOutlined, LockOutlined } from '@mui/icons-material';
import { integrationService } from '../Integrations/integrationService';
import { PAYLOAD_FORMATS, validateWebhook, webhookDto, webhookError } from './webhookService';

export function WebhookEditor({ webhook, tenantKey, events, busy, error, onClose, onSave }) {
  const [form, setForm] = useState(() => {
    if (webhook) {
      return {
        ...webhook,
        subscribedEvents: [...(webhook.subscribedEvents || [])],
        payloadFormat: webhook.payloadFormat || 'Standard',
        customTemplate: webhook.customTemplate || '',
        customHeaders: webhook.customHeaders || {}
      };
    }
    return {
      name: '',
      targetUrl: '',
      applicationId: null,
      subscribedEvents: [],
      payloadFormat: 'Standard',
      customTemplate: '',
      customHeaders: {},
      status: 'Active'
    };
  });

  const [headersList, setHeadersList] = useState(() => {
    const raw = webhook?.customHeaders || {};
    const entries = Object.entries(raw);
    return entries.length > 0
      ? entries.map(([key, value], idx) => ({ id: idx + 1, key, value }))
      : [];
  });

  const [validation, setValidation] = useState({});
  const [application, setApplication] = useState(webhook?.applicationId ? { id: webhook.applicationId, name: webhook.applicationName || `Application #${webhook.applicationId}` } : null);
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const apps = useInfiniteQuery({
    queryKey: ['webhook-applications', tenantKey, term],
    queryFn: ({ pageParam, signal }) => integrationService.list({ pageNumber: pageParam, pageSize: 20, searchTerm: term }, signal),
    initialPageParam: 1,
    getNextPageParam: page => page.pageNumber < page.totalPages ? page.pageNumber + 1 : undefined,
    retry: false,
    staleTime: 60000
  });

  const options = apps.data?.pages.flatMap(page => page.items) || [];
  if (application && !options.some(option => option.id === application.id)) options.unshift(application);

  const known = new Set((events.data || []).map(event => event.eventType));
  const catalog = [
    ...(events.data || []),
    ...form.subscribedEvents.filter(event => !known.has(event)).map(event => ({
      eventType: event,
      category: 'Existing subscriptions',
      description: 'Previously configured subscription; preserved unless you remove it.'
    }))
  ];

  const groups = Map.groupBy ? Map.groupBy(catalog, event => event.category) : catalog.reduce((map, event) => map.set(event.category, [...(map.get(event.category) || []), event]), new Map());
  const change = (key, value) => setForm(previous => ({ ...previous, [key]: value }));

  const addHeader = (defaultKey = '', defaultValue = '') => {
    setHeadersList(prev => [...prev, { id: Date.now() + Math.random(), key: defaultKey, value: defaultValue }]);
  };

  const updateHeader = (id, field, val) => {
    setHeadersList(prev => prev.map(h => h.id === id ? { ...h, [field]: val } : h));
  };

  const removeHeader = id => {
    setHeadersList(prev => prev.filter(h => h.id !== id));
  };

  const handleSubmit = event => {
    event.preventDefault();
    const finalHeaders = {};
    headersList.forEach(h => {
      const k = h.key.trim();
      if (k) finalHeaders[k] = h.value.trim();
    });

    const candidate = {
      ...form,
      customHeaders: finalHeaders
    };

    const errors = validateWebhook(candidate);
    setValidation(errors);

    if (!Object.keys(errors).length && events.data && !events.isError) {
      onSave(webhookDto(candidate));
    }
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="md" aria-labelledby="webhook-editor-title" PaperProps={{ className: 'integration-dialog webhook-dialog' }}>
      <form noValidate onSubmit={handleSubmit}>
        <DialogTitle id="webhook-editor-title">{webhook ? 'Edit Webhook Endpoint' : 'Create Webhook Endpoint'}</DialogTitle>
        <DialogContent className="integration-form">
          {error && <Alert severity="error">{error}</Alert>}

          <TextField autoFocus fullWidth required label="Webhook Name" placeholder="e.g. Slack Billing Alerts, Custom CRM Sync, Zapier" value={form.name} disabled={busy} onChange={event => change('name', event.target.value)} error={Boolean(validation.name)} helperText={validation.name} />

          <TextField fullWidth required label="Destination URL" placeholder="https://hooks.slack.com/... or https://api.yourcompany.com/webhooks" value={form.targetUrl} disabled={busy} onChange={event => change('targetUrl', event.target.value)} error={Boolean(validation.targetUrl)} helperText={validation.targetUrl} />

          <Autocomplete size="small" options={options} value={application} disabled={busy} loading={apps.isFetching} filterOptions={items => items}
            getOptionLabel={option => option.name} isOptionEqualToValue={(a, b) => a.id === b.id}
            onInputChange={(_event, value, reason) => { if (reason === 'input' || reason === 'clear') setSearch(value); }}
            onChange={(_event, value) => { setApplication(value); change('applicationId', value?.id ?? null); }}
            renderInput={params => <TextField {...params} label="Associated Application (optional)" placeholder="Link to an integrated app" />} />

          {apps.isError && <Alert severity="warning" action={<Button onClick={() => apps.refetch()}>Retry</Button>}>{webhookError(apps.error)} Existing association will be preserved.</Alert>}
          {apps.hasNextPage && <Button disabled={busy || apps.isFetchingNextPage} onClick={() => apps.fetchNextPage()}>{apps.isFetchingNextPage ? 'Loading…' : 'Load More Applications'}</Button>}

          <TextField select fullWidth label="Status" value={form.status} disabled={busy || webhook?.status === 'Suspended'} onChange={event => change('status', event.target.value)} helperText={webhook?.status === 'Suspended' ? 'Suspended is managed by the backend. Edit the endpoint without changing this status.' : undefined}>
            <MenuItem value="Active">Active</MenuItem>
            <MenuItem value="Disabled">Disabled</MenuItem>
            {webhook?.status === 'Suspended' && <MenuItem value="Suspended">Suspended</MenuItem>}
          </TextField>

          <fieldset className="webhook-section">
            <legend>Payload Format &amp; Target App</legend>
            <TextField select fullWidth label="Format Preset" value={form.payloadFormat} disabled={busy} onChange={event => change('payloadFormat', event.target.value)}>
              {PAYLOAD_FORMATS.map(opt => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
            </TextField>

            {form.payloadFormat === 'Custom' && (
              <div style={{ marginTop: 12 }}>
                <TextField fullWidth multiline minRows={4} label="Custom JSON Template" placeholder='{"event":"{{event}}","reference":"{{number}}","client":"{{customer}}","balance":"{{amount}}"}' value={form.customTemplate} disabled={busy} onChange={event => change('customTemplate', event.target.value)} error={Boolean(validation.customTemplate)} helperText={validation.customTemplate || 'Write a custom JSON template. Available placeholders: {{event}}, {{number}}, {{customer}}, {{amount}}, {{date}}, {{rawPayload}}'} />
                <p className="webhook-template-hint">
                  Available tags: <code>{'{{event}}'}</code>, <code>{'{{number}}'}</code>, <code>{'{{customer}}'}</code>, <code>{'{{amount}}'}</code>, <code>{'{{date}}'}</code>, <code>{'{{rawPayload}}'}</code>
                </p>
              </div>
            )}
          </fieldset>

          <fieldset className="webhook-section">
            <legend>Custom HTTP Headers &amp; Authentication (Optional)</legend>
            <p className="webhook-template-hint" style={{ marginBottom: 8 }}>
              Configure custom authorization headers, API keys, or custom tokens for your external app or server.
            </p>

            {headersList.map(h => (
              <div key={h.id} className="webhook-header-row">
                <TextField size="small" label="Header Name" placeholder="e.g. Authorization or x-api-key" value={h.key} disabled={busy} onChange={e => updateHeader(h.id, 'key', e.target.value)} />
                <TextField size="small" label="Header Value" placeholder="e.g. Bearer your_token_here" value={h.value} disabled={busy} onChange={e => updateHeader(h.id, 'value', e.target.value)} />
                <Tooltip title="Remove header">
                  <IconButton size="small" color="error" disabled={busy} onClick={() => removeHeader(h.id)}>
                    <DeleteOutline fontSize="small" />
                  </IconButton>
                </Tooltip>
              </div>
            ))}

            <div className="webhook-header-actions">
              <Button size="small" variant="outlined" startIcon={<LockOutlined />} disabled={busy} onClick={() => addHeader('Authorization', 'Bearer ')}>
                + Bearer Token
              </Button>
              <Button size="small" variant="outlined" startIcon={<KeyOutlined />} disabled={busy} onClick={() => addHeader('x-api-key', '')}>
                + API Key (x-api-key)
              </Button>
              <Button size="small" variant="text" startIcon={<Add />} disabled={busy} onClick={() => addHeader('', '')}>
                + Custom Header
              </Button>
            </div>
          </fieldset>

          <fieldset className="webhook-event-fieldset">
            <legend>Subscribed Events *</legend>
            {events.isPending && <div role="status"><LinearProgress />Loading event catalog…</div>}
            {events.isError && <Alert severity="error" action={<Button onClick={() => events.refetch()}>Retry</Button>}>{webhookError(events.error)}</Alert>}
            {!events.isPending && !events.isError && !catalog.length && <Alert severity="info">No supported events were returned by the backend.</Alert>}
            {[...groups].map(([category, entries]) => (
              <section key={category} className="webhook-event-group">
                <h3>{category}</h3>
                {entries.map(event => (
                  <FormControlLabel key={event.eventType}
                    control={<Checkbox disabled={busy} checked={form.subscribedEvents.includes(event.eventType)} onChange={(_event, checked) => change('subscribedEvents', checked ? [...form.subscribedEvents, event.eventType] : form.subscribedEvents.filter(value => value !== event.eventType))} />}
                    label={<span><strong>{event.eventType}</strong><small>{event.description}</small></span>} />
                ))}
              </section>
            ))}
            {validation.subscribedEvents && <p className="webhook-validation" role="alert">{validation.subscribedEvents}</p>}
          </fieldset>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={busy || events.isPending || events.isError || !catalog.length}>
            {busy ? 'Saving…' : webhook ? 'Save Webhook' : 'Create Webhook'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
