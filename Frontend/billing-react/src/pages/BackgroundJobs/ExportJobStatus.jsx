import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, MenuItem, TextField } from '@mui/material';
import { Download, Refresh } from '@mui/icons-material';
import { apiClient } from 'billing-api-client';
import { integrationAccess } from '../Integrations/integrationService';
import { DashboardErrorState } from '../../components/dashboard/DashboardStates';
import { backgroundJobError, backgroundJobService } from './backgroundJobService';
import './background-jobs.css';

const jobTypes = ['Invoice', 'Payment', 'Customer', 'AuditLog'];
const formats = ['CSV', 'JSON'];
const statusOptions = ['Pending', 'Processing', 'Completed', 'Failed'];
const dateTime = value => value
  ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(value))
  : '—';
const formatBytes = value => {
  if (value == null) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

export function ExportJobStatus() {
  const client = useQueryClient();
  const [jobType, setJobType] = useState('Invoice');
  const [filterJobType, setFilterJobType] = useState('');
  const [exportFormat, setExportFormat] = useState('CSV');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [feedback, setFeedback] = useState(null);
  useEffect(() => {
    if (!feedback) return undefined;
    const timeoutId = window.setTimeout(() => setFeedback(null), 2000);
    return () => window.clearTimeout(timeoutId);
  }, [feedback]);
  const user = useQuery({
    queryKey: ['auth-user'],
    queryFn: ({ signal }) => apiClient.get('/api/Auth/me', { signal }),
    retry: false,
    staleTime: 60000,
  });
  const allowed = integrationAccess(user.data);
  const profile = user.data?.data ?? user.data;
  const tenantKey = profile?.tenantId ?? profile?.tenant_id ?? 'current';
  const query = useQuery({
    queryKey: ['export-jobs', tenantKey, page, filterJobType, status],
    queryFn: ({ signal }) => backgroundJobService.getExports({ page, pageSize: 20, jobType: filterJobType, status }, signal),
    enabled: allowed,
    retry: false,
    refetchInterval: current => current.state.data?.items.some(job => ['Pending', 'Processing'].includes(job.status)) ? 5000 : false,
  });
  const createJob = useMutation({
    mutationFn: () => backgroundJobService.createExport({ jobType, exportFormat }),
    onSuccess: job => {
      setPage(1);
      setFilterJobType('');
      setStatus('');
      setFeedback({ severity: 'success', message: `Export #${job.id} queued.` });
      void client.invalidateQueries({ queryKey: ['export-jobs'] });
    },
    onError: error => setFeedback({ severity: 'error', message: backgroundJobError(error) }),
  });
  const refresh = () => { void query.refetch(); };
  const download = async job => {
    try {
      const blob = await backgroundJobService.downloadExport(job.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = job.fileName || `${job.jobType}_Export_${job.id}.${job.exportFormat.toLowerCase()}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setFeedback({ severity: 'error', message: backgroundJobError(error) });
    }
  };
  const result = query.data;

  return <main className="background-jobs-page">
    <header className="background-jobs-heading">
      <div><span className="background-jobs-eyebrow">Operations</span><h1>Export Jobs</h1><p>Queue data exports, track progress, and download completed files.</p></div>
      <Button variant="outlined" startIcon={<Refresh />} onClick={refresh} disabled={!allowed || query.isFetching}>Refresh</Button>
    </header>
    {feedback && <Alert severity={feedback.severity} onClose={() => setFeedback(null)}>{feedback.message}</Alert>}
    {user.isPending ? <div role="status">Checking access…</div>
      : user.isError ? <DashboardErrorState title="Unable to check access" message={backgroundJobError(user.error)} onRetry={() => user.refetch()} />
        : !allowed ? <Alert severity="warning">Export jobs are available to TenantAdmin, SuperAdmin, and User roles.</Alert>
          : <>
            <section className="export-job-create">
              <h2>Create an export</h2>
              <TextField select label="Data" value={jobType} onChange={event => setJobType(event.target.value)} size="small">
                {jobTypes.map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}
              </TextField>
              <TextField select label="Format" value={exportFormat} onChange={event => setExportFormat(event.target.value)} size="small">
                {formats.map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}
              </TextField>
              <Button variant="contained" disabled={createJob.isPending} onClick={() => { setFeedback(null); createJob.mutate(); }}>
                {createJob.isPending ? 'Queueing…' : 'Queue export'}
              </Button>
            </section>
            <section className="export-job-list">
              <div className="export-job-list-heading">
                <h2>Export history</h2>
                <div>
                  <TextField select size="small" label="Status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
                    <MenuItem value="">All statuses</MenuItem>
                    {statusOptions.map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}
                  </TextField>
                  <TextField select size="small" label="Data" value={filterJobType} onChange={event => { setFilterJobType(event.target.value); setPage(1); }}>
                    <MenuItem value="">All data</MenuItem>
                    {jobTypes.map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}
                  </TextField>
                </div>
              </div>
              {query.isError ? <DashboardErrorState title="Unable to load exports" message={backgroundJobError(query.error)} onRetry={refresh} />
                : query.isFetching && !result ? <div role="status">Loading export history…</div>
                  : <div className="background-jobs-table-scroll">
                    <table className="background-jobs-table" aria-label="Export job history" aria-busy={query.isFetching}>
                      <thead><tr><th>Export</th><th>Status</th><th>Progress</th><th>Requested</th><th>Started</th><th>Completed</th><th>File size</th><th>Actions</th></tr></thead>
                      <tbody>
                        {(result?.items || []).map(job => <tr key={job.id}>
                          <td><strong>#{job.id} · {job.jobType}</strong><span>{job.exportFormat} · {job.requestedBy || 'User'}</span>{job.errorMessage && <span className="export-job-error">{job.errorMessage}</span>}</td>
                          <td><span className={`export-job-status status-${job.status.toLowerCase()}`}>{job.status}</span></td>
                          <td>{job.processedRecords}{job.totalRecords ? ` / ${job.totalRecords}` : ''}</td>
                          <td>{dateTime(job.createdAtUtc)}</td><td>{dateTime(job.startedAtUtc)}</td><td>{dateTime(job.completedAtUtc)}</td>
                          <td>{formatBytes(job.fileSizeBytes)}</td>
                          <td>{job.status === 'Completed' ? <Button size="small" startIcon={<Download />} onClick={() => download(job)}>Download</Button> : '—'}</td>
                        </tr>)}
                        {!query.isFetching && !result?.items.length && <tr><td colSpan="8" className="background-jobs-empty">No export jobs found.</td></tr>}
                      </tbody>
                    </table>
                  </div>}
              {result && <footer className="background-jobs-pagination">
                <span>{result.totalCount} exports · Page {result.page} of {Math.max(1, Math.ceil(result.totalCount / result.pageSize))}</span>
                <div><Button disabled={query.isFetching || page <= 1} onClick={() => setPage(value => value - 1)}>Previous</Button>
                  <Button disabled={query.isFetching || page >= Math.max(1, Math.ceil(result.totalCount / result.pageSize))} onClick={() => setPage(value => value + 1)}>Next</Button></div>
              </footer>}
            </section>
          </>}
  </main>;
}
