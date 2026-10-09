import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem,
  Pagination, Skeleton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip } from '@mui/material';
import { FilterAltOutlined, HistoryOutlined, Refresh, VisibilityOutlined } from '@mui/icons-material';
import { DashboardErrorState } from '../../components/dashboard/DashboardStates';
import { getAuditActivity } from './auditApi.js';
import { auditDate, auditQuery, auditSnapshot, emptyAuditFilters, searchAuditPage } from './auditModel.js';
import './audit-activity.css';

export function AuditActivity() {
  const { searchQuery = '' } = useOutletContext() || {};
  const [draft, setDraft] = useState({ ...emptyAuditFilters });
  const [filters, setFilters] = useState({ ...emptyAuditFilters });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [validation, setValidation] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true); setError(null); setData(null);
    getAuditActivity(filters, page, pageSize, controller.signal).then(result => {
      if (!active) return;
      if (page > Math.max(1, result.totalPages)) { setPage(Math.max(1, result.totalPages)); return; }
      setData(result);
    }).catch(requestError => {
      if (active && !controller.signal.aborted) setError(requestError);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [filters, page, pageSize, refresh]);

  const apply = event => {
    event.preventDefault();
    try { auditQuery(draft, 1, pageSize); }
    catch (invalid) { setValidation(invalid.message); return; }
    setValidation(''); setPage(1); setFilters({ ...draft });
  };
  const reset = () => { setDraft({ ...emptyAuditFilters }); setFilters({ ...emptyAuditFilters }); setValidation(''); setPage(1); };
  const field = key => ({ value: draft[key], onChange: event => setDraft(current => ({ ...current, [key]: event.target.value })) });
  const rows = searchAuditPage(data?.items || [], searchQuery);
  const forbidden = error?.response?.status === 403;
  const unauthorized = error?.response?.status === 401;
  const filtered = Object.values(filters).some(Boolean);
  const first = data?.totalCount ? (data.pageNumber - 1) * data.pageSize + 1 : 0;
  const last = data ? Math.min(data.pageNumber * data.pageSize, data.totalCount) : 0;

  return <main className="audit-page">
    <header className="audit-heading"><div><p className="audit-eyebrow">Activity & accountability</p><h1>Audit Activity</h1>
      <p>Review activity across your organization. Audit records are read-only.</p></div>
      <Button variant="outlined" startIcon={<Refresh />} disabled={loading} onClick={() => setRefresh(value => value + 1)}>Refresh</Button>
    </header>
    <section className="audit-card" aria-labelledby="audit-filters-title">
      <div className="audit-section-heading"><FilterAltOutlined /><h2 id="audit-filters-title">Filter activity</h2></div>
      <form onSubmit={apply}>
        <div className="audit-filter-grid">
          <TextField size="small" label="Module / entity" helperText="Exact entity name, such as Invoice" {...field('entityName')} />
          <TextField size="small" label="Event name" helperText="Exact action recorded by the backend" {...field('action')} />
          <TextField size="small" label="Performed by" helperText="Exact user or system actor name" {...field('userName')} />
          <TextField size="small" type="date" label="From date" helperText="Start of day (IST)" InputLabelProps={{ shrink: true }} {...field('startDate')} />
          <TextField size="small" type="date" label="To date" helperText="End of day (IST)" InputLabelProps={{ shrink: true }} inputProps={{ min: draft.startDate || undefined }} {...field('endDate')} />
        </div>
        {validation && <Alert severity="error">{validation}</Alert>}
        <div className="audit-filter-actions"><span>Filters apply to the full activity history.</span><Button onClick={reset} disabled={loading}>Clear filters</Button><Button type="submit" variant="contained" disabled={loading}>Apply filters</Button></div>
      </form>
    </section>
    <section className="audit-card audit-results" aria-labelledby="audit-results-title" aria-busy={loading}>
      <div className="audit-results-heading"><div><h2 id="audit-results-title">Activity history</h2><p>Date and time shown in Indian Standard Time (IST).</p></div>
        <div className="audit-result-badges">{data && <Chip label={`${data.totalCount.toLocaleString('en-IN')} ${filtered ? 'matching' : 'total'} records`} variant="outlined" />}<Chip size="small" label="Newest first" /></div>
      </div>
      {searchQuery.trim() && <Alert severity="info">Header search shows matches on the current page only. Use the filters above to search the full history.</Alert>}
      {error ? <DashboardErrorState title={forbidden ? 'Access denied' : unauthorized ? 'Sign-in required' : 'Unable to load audit activity'}
        message={forbidden ? 'Your account does not have access to this tenant’s audit history.' : unauthorized ? 'Please sign in again to view audit activity.' : error.userMessage || error.message}
        onRetry={forbidden || unauthorized ? undefined : () => setRefresh(value => value + 1)} /> : <>
        <TableContainer><Table aria-label="Audit activity history">
          <TableHead><TableRow>{['Event', 'Date and time (IST)', 'Performed by', 'Module / entity', 'Changes / result', 'Details'].map(label => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead>
          <TableBody>{loading ? Array.from({ length: 6 }, (_, index) => <TableRow key={index}>{Array.from({ length: 6 }, (_, cell) => <TableCell key={cell}><Skeleton /></TableCell>)}</TableRow>)
            : rows.map(row => <TableRow key={row.id} hover><TableCell><Chip size="small" label={row.action || '—'} className="audit-event" /></TableCell>
              <TableCell className="audit-date">{auditDate(row.timestamp)}</TableCell><TableCell>{row.userName || '—'}</TableCell>
              <TableCell><strong>{row.entityName || '—'}</strong>{row.entityId && <span className="audit-entity-id">Record #{row.entityId}</span>}</TableCell>
              <TableCell><span className="audit-changes">{row.changes || 'No description recorded'}</span></TableCell>
              <TableCell><Tooltip title="View audit details"><IconButton size="small" aria-label={`View audit event ${row.id}`} onClick={() => setSelected(row)}><VisibilityOutlined fontSize="small" /></IconButton></Tooltip></TableCell></TableRow>)}
            {!loading && !rows.length && <TableRow><TableCell colSpan={6}><div className="audit-empty"><HistoryOutlined /><h3>{searchQuery.trim() ? 'No matches on this page' : filtered ? 'No matching activity' : 'No audit activity yet'}</h3>
              <p>{searchQuery.trim() ? 'Try another header search or move to another page.' : filtered ? 'Adjust or clear the filters to see more activity.' : 'Recorded activity will appear here when available.'}</p></div></TableCell></TableRow>}
          </TableBody>
        </Table></TableContainer>
        {data && <footer className="audit-pagination"><span role="status">Showing {first}–{last} of {data.totalCount.toLocaleString('en-IN')} records{searchQuery.trim() ? ` (${rows.length} matches on this page)` : ''}</span>
          <TextField select size="small" label="Rows per page" value={pageSize} disabled={loading} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[10, 20, 50].map(size => <MenuItem key={size} value={size}>{size}</MenuItem>)}</TextField>
          <Pagination count={Math.max(1, data.totalPages)} page={page} disabled={loading} onChange={(_, value) => setPage(value)} shape="rounded" color="primary" aria-label="Audit activity pages" />
        </footer>}
        {loading && <span className="sr-only" role="status">Loading audit activity…</span>}
      </>}
    </section>
    <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} maxWidth="md" fullWidth PaperProps={{ className: 'audit-detail-dialog' }}>
      <DialogTitle>Audit event details{selected && <span className="audit-detail-number">#{selected.id}</span>}</DialogTitle>
      <DialogContent dividers>{selected && <><dl className="audit-detail-fields">{[
        ['Event', selected.action], ['Date and time (IST)', auditDate(selected.timestamp)], ['Performed by', selected.userName],
        ['Module / entity', selected.entityName], ['Record ID', selected.entityId], ['Changes / result', selected.changes],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>
        <div className="audit-snapshots"><section><h3>Previous values</h3><pre>{auditSnapshot(selected.oldValues)}</pre></section><section><h3>New values</h3><pre>{auditSnapshot(selected.newValues)}</pre></section></div>
      </>}</DialogContent><DialogActions><Button onClick={() => setSelected(null)}>Close</Button></DialogActions>
    </Dialog>
  </main>;
}
