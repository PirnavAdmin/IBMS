import { FilterSelectField } from '../../components/FilterSelectField';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import {
  Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, InputAdornment, LinearProgress, Menu, MenuItem, TextField, Tooltip,
} from '@mui/material';
import { Add, ContentCopyOutlined, IntegrationInstructionsOutlined, MoreVert, Refresh, Search } from '@mui/icons-material';
import { apiClient } from 'billing-api-client';
import { FeedbackSnackbar } from '../../components/FeedbackSnackbar';
import { WorkspacePagination } from '../../components/WorkspacePagination';
import { DashboardErrorState } from '../../components/dashboard/DashboardStates';
import { ApplicationEditor, FeatureFlagsDialog, SecretDialog } from './IntegrationDialogs';
import { integrationAccess, integrationError, integrationService } from './integrationService';
import './integrations.css';

const formatDate = value => {
  if (!value) return 'Not provided';
  // DTO is explicitly UTC; .NET may omit a suffix for an Unspecified DateTime.
  const parsed = new Date(/(?:Z|[+-]\d\d:\d\d)$/i.test(value) ? value : `${value}Z`);
  return Number.isNaN(parsed.getTime()) ? 'Not provided' : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(parsed);
};

export function ApplicationFacts({ application }) {
  return <dl className="integration-facts">
    <div><dt>Application Name</dt><dd>{application.name}</dd></div>
    <div><dt>Client ID</dt><dd className="integration-mono">{application.clientId}</dd></div>
    <div><dt>Description</dt><dd>{application.description || 'No description provided.'}</dd></div>
    <div><dt>Status</dt><dd>{application.status}</dd></div>
    <div><dt>Connected Webhooks</dt><dd>{application.webhooksCount ?? 'Not provided'}</dd></div>
    <div><dt>Created Date</dt><dd>{formatDate(application.createdAtUtc)}</dd></div>
    <div><dt>Feature Flags</dt><dd><Flags flags={application.featureFlags} /></dd></div>
  </dl>;
}

function Flags({ flags, compact = false }) {
  const entries = Object.entries(flags);
  if (compact) {
    const enabled = entries.filter(([, value]) => value).length;
    return entries.length ? <Tooltip title={<div>{entries.map(([key, value]) => <div key={key}>{key}: {value ? 'On' : 'Off'}</div>)}</div>}>
      <Chip size="small" variant="outlined" label={`${enabled}/${entries.length} enabled`} />
    </Tooltip> : <span className="integration-muted">No flags</span>;
  }
  return <div className="integration-flags">{entries.length ? entries.map(([key, value]) =>
    <Chip key={key} size="small" variant="outlined" label={`${key}: ${value ? 'On' : 'Off'}`} />,
  ) : <span className="integration-muted">No feature flags</span>}</div>;
}

export function Integrations() {
  const context = useOutletContext() || {};
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ status: '', searchTerm: '', pageNumber: 1, pageSize: 20 });
  const [menu, setMenu] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const locked = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const user = useQuery({ queryKey: ['auth-user'], queryFn: ({ signal }) => apiClient.get('/api/Auth/me', { signal }), retry: false, staleTime: 60000 });
  const allowed = integrationAccess(user.data);
  const profile = user.data?.data ?? user.data;
  const tenantKey = profile?.tenantId ?? profile?.tenant_id ?? 'current';
  const effectiveSearch = context.searchQuery || search;
  useEffect(() => {
    const timer = setTimeout(() => setFilters(previous => previous.searchTerm === effectiveSearch.trim()
      ? previous : { ...previous, searchTerm: effectiveSearch.trim(), pageNumber: 1 }), 300);
    return () => clearTimeout(timer);
  }, [effectiveSearch]);
  const list = useQuery({
    queryKey: ['integrations', tenantKey, filters],
    queryFn: ({ signal }) => integrationService.list(filters, signal),
    enabled: allowed, retry: false,
  });
  const detailId = dialog?.id;
  const detailAttempt = dialog?.attempt ?? 0;
  useEffect(() => {
    if (!detailId) return;
    const controller = new AbortController();
    integrationService.get(detailId, controller.signal).then(application => {
      if (!controller.signal.aborted) setDialog(previous => previous?.id === detailId ? { ...previous, application, error: '' } : previous);
    }).catch(error => {
      if (!controller.signal.aborted) setDialog(previous => previous?.id === detailId ? { ...previous, error: integrationError(error) } : previous);
    });
    return () => controller.abort();
  }, [detailId, detailAttempt]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['integrations', tenantKey] });
  const closeDialog = () => { if (!locked.current) setDialog(null); };
  const openAction = (mode, application) => { setMenu(null); setDialog({ mode, id: application.id, application: null, error: '' }); };
  const run = async (operation, successMessage, registration = false) => {
    if (locked.current || !allowed) return;
    locked.current = true; setBusy(true);
    setDialog(previous => previous ? { ...previous, error: '' } : previous);
    try {
      const result = await operation();
      if (mounted.current) {
        setDialog(null);
        if (registration) setCredentials(result);
        setNotice({ message: successMessage, severity: 'success' });
        // Invalidate only after server success; never place registration responses in caches.
        void refresh();
        if (dialog?.mode === 'delete') setFilters(previous => ({ ...previous, pageNumber: 1 }));
      }
    } catch (error) {
      if (mounted.current) {
        const message = integrationError(error);
        setDialog(previous => previous ? { ...previous, error: message } : previous);
        setNotice({ message, severity: 'error' });
      }
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const copy = async (value, label) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error();
      await navigator.clipboard.writeText(value);
      if (mounted.current) setNotice({ message: `${label} copied.`, severity: 'success' });
    } catch {
      if (mounted.current) setNotice({ message: 'Unable to copy. Select the text and copy it manually.', severity: 'error' });
    }
  };

  const application = dialog?.application;
  const page = list.data;
  const waiting = allowed && (list.isPending || list.isFetching);
  return <main className="integrations-page">
    <header className="integrations-heading">
      <div><span className="integrations-eyebrow">Configuration &amp; Administration</span><h1>Integrations &amp; Applications</h1><p>Manage application access and feature flags for your workspace.</p></div>
      {!allowed && <div className="integrations-heading-actions"><Button variant="outlined" startIcon={<Refresh />} disabled>Refresh</Button><Button variant="contained" startIcon={<Add />} disabled>Register New App</Button></div>}
    </header>
    {user.isPending ? <div className="integration-state" role="status"><LinearProgress />Checking integration access…</div>
      : user.isError ? <DashboardErrorState title="Unable to load integration settings" message={integrationError(user.error)} onRetry={() => user.refetch()} />
        : !allowed ? <Alert severity="warning">Integration access requires TenantAdmin, SuperAdmin, or User permissions.</Alert>
          : <section className="integrations-panel" aria-label="Integration applications">
            <div className="integrations-toolbar">
              <TextField size="small" type="search" label="Search applications" placeholder="Search by application name" value={search}
                onChange={event => { setSearch(event.target.value); context.onSearch?.(''); }}
                InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }} />
              <FilterSelectField select size="small" label="Status" value={filters.status} onChange={event => setFilters(previous => ({ ...previous, status: event.target.value, pageNumber: 1 }))}>
                <MenuItem value="">All statuses</MenuItem><MenuItem value="Active">Active</MenuItem><MenuItem value="Inactive">Inactive</MenuItem>
              </FilterSelectField>
              <span className="integration-result-count">{page && !list.isError ? `${page.totalCount} application${page.totalCount === 1 ? '' : 's'}` : ''}</span>
              <div className="integrations-heading-actions">
                <Button variant="outlined" startIcon={<Refresh />} disabled={!allowed || waiting} onClick={refresh}>Refresh</Button>
                <Button variant="contained" startIcon={<Add />} disabled={!allowed} onClick={() => setDialog({ mode: 'register', error: '' })}>Register New App</Button>
              </div>
            </div>
            {waiting && <div className="integration-progress" role="status" aria-label="Loading applications"><LinearProgress /></div>}
            {list.isError ? <DashboardErrorState title="Unable to load applications" message={integrationError(list.error)} onRetry={() => list.refetch()} />
              : page?.items.length ? <div className="integrations-table-scroll" role="region" aria-label="Application list" tabIndex={0}><table className="integrations-table" aria-label="Applications" aria-busy={waiting}>
                <thead><tr>{['Application Name', 'Client ID', 'Status', 'Connected Webhooks', 'Feature Flags', 'Created Date', 'Actions'].map(title => <th key={title} scope="col">{title}</th>)}</tr></thead>
                <tbody>{page.items.map(app => <tr key={app.id}>
                  <td data-label="Application Name"><Tooltip title={app.name}><strong className="integration-application-name">{app.name}</strong></Tooltip></td>
                  <td data-label="Client ID"><div className="integration-client-id"><Tooltip title={app.clientId}><code>{app.clientId}</code></Tooltip><Tooltip title="Copy Client ID"><IconButton size="small" aria-label={`Copy Client ID for ${app.name}`} onClick={() => copy(app.clientId, 'Client ID')}><ContentCopyOutlined fontSize="small" /></IconButton></Tooltip></div></td>
                  <td data-label="Status"><Chip size="small" label={app.status} className={`integration-status integration-status-${app.status.toLowerCase()}`} /></td>
                  <td data-label="Connected Webhooks">{app.webhooksCount ?? <span className="integration-muted">Not provided</span>}</td>
                  <td data-label="Feature Flags"><Flags flags={app.featureFlags} compact /></td>
                  <td data-label="Created Date">{formatDate(app.createdAtUtc)}</td>
                  <td data-label="Actions"><Tooltip title="Application actions"><IconButton aria-label={`Actions for ${app.name}`} aria-haspopup="menu" aria-expanded={menu?.application.id === app.id} aria-controls={menu?.application.id === app.id ? 'integration-actions-list' : undefined} onClick={event => setMenu({ anchor: event.currentTarget, application: app })}><MoreVert /></IconButton></Tooltip></td>
                </tr>)}</tbody>
              </table></div> : !waiting && <div className="integration-state integration-empty"><IntegrationInstructionsOutlined /><h2>No applications found</h2><p>{filters.status || filters.searchTerm ? 'Try changing your search or status filter.' : 'Register an application to get started.'}</p></div>}
            {page && !list.isError && <WorkspacePagination page={page.pageNumber} pageSize={filters.pageSize} totalCount={page.totalCount} itemLabel="applications" disabled={waiting} onPageChange={pageNumber => setFilters(previous => ({ ...previous, pageNumber }))} onPageSizeChange={pageSize => setFilters(previous => ({ ...previous, pageSize, pageNumber: 1 }))} />}
          </section>}
    <Menu
      anchorEl={menu?.anchor}
      open={Boolean(menu)}
      onClose={() => setMenu(null)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      marginThreshold={8}
      disablePortal={false}
      PaperProps={{ className: 'integration-actions-menu' }}
      MenuListProps={{ id: 'integration-actions-list', 'aria-label': 'Application actions' }}
    >
      {menu && [ ['view', 'View Details'], ['edit', 'Edit Application'], ['flags', 'Manage Feature Flags'],
        ['toggle', menu.application.status === 'Active' ? 'Disable Application' : 'Enable Application'], ['delete', 'Delete Application'],
      ].map(([mode, label]) => <MenuItem key={mode} onClick={() => openAction(mode, menu.application)}>{label}</MenuItem>)}
    </Menu>
    {dialog?.mode === 'register' && <ApplicationEditor busy={busy} error={dialog.error} onClose={closeDialog}
      onSave={dto => run(() => integrationService.register(dto), 'Application registered. Save your one-time secret.', true)} />}
    {dialog?.id && !application && <Dialog open onClose={closeDialog} fullWidth maxWidth="sm" aria-labelledby="integration-loading-title" PaperProps={{ className: 'integration-dialog' }}>
      <DialogTitle id="integration-loading-title">Application Details</DialogTitle><DialogContent>{dialog.error ? <Alert severity="error">{dialog.error}</Alert> : <div role="status"><LinearProgress />Loading application…</div>}</DialogContent>
      <DialogActions><Button onClick={closeDialog}>Close</Button>{dialog.error && <Button onClick={() => setDialog(previous => ({ ...previous, error: '', attempt: detailAttempt + 1 }))}>Retry</Button>}</DialogActions>
    </Dialog>}
    {application && dialog.mode === 'edit' && <ApplicationEditor application={application} busy={busy} error={dialog.error} onClose={closeDialog}
      onSave={dto => run(() => integrationService.update(application.id, dto), 'Application updated.')} />}
    {application && dialog.mode === 'flags' && <FeatureFlagsDialog application={application} busy={busy} error={dialog.error} onClose={closeDialog}
      onSave={flags => run(() => integrationService.flags(application.id, flags), 'Feature flags updated.')} />}
    {application && ['view', 'toggle', 'delete'].includes(dialog.mode) && <Dialog open onClose={closeDialog} fullWidth maxWidth="sm" aria-labelledby="integration-action-title" PaperProps={{ className: 'integration-dialog' }}>
      <DialogTitle id="integration-action-title">{dialog.mode === 'view' ? 'Application Details' : dialog.mode === 'delete' ? 'Delete Application?' : application.status === 'Active' ? 'Disable Application?' : 'Enable Application?'}</DialogTitle>
      <DialogContent className="integration-form">
        {dialog.error && <Alert severity="error">{dialog.error}</Alert>}
        {dialog.mode === 'view' ? <><ApplicationFacts application={application} /><Button startIcon={<ContentCopyOutlined />} onClick={() => copy(application.clientId, 'Client ID')}>Copy Client ID</Button></>
          : <p>{dialog.mode === 'delete' ? `Permanently delete ${application.name}? This cannot be undone.` : `${application.status === 'Active' ? 'Disable' : 'Enable'} ${application.name}?`}</p>}
      </DialogContent>
      <DialogActions><Button disabled={busy} onClick={closeDialog}>{dialog.mode === 'view' ? 'Close' : 'Cancel'}</Button>
        {dialog.mode !== 'view' && <Button variant="contained" color={dialog.mode === 'delete' || application.status === 'Active' ? 'error' : 'primary'} disabled={busy}
          onClick={() => dialog.mode === 'delete' ? run(() => integrationService.remove(application.id), 'Application deleted.') : run(() => integrationService.toggle(application.id), 'Application status updated.')}>
          {busy ? 'Saving…' : dialog.mode === 'delete' ? 'Delete Application' : application.status === 'Active' ? 'Disable Application' : 'Enable Application'}
        </Button>}
      </DialogActions>
    </Dialog>}
    {credentials && <SecretDialog credentials={credentials} onClose={() => setCredentials(null)} onCopy={copy} />}
    <FeedbackSnackbar message={notice?.message || ''} severity={notice?.severity} onClose={() => setNotice(null)} />
  </main>;
}
