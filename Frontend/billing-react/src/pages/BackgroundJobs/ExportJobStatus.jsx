import { FilterSelectField } from '../../components/FilterSelectField';
import { FeedbackSnackbar } from '../../components/FeedbackSnackbar';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Download from '@mui/icons-material/Download';
import Refresh from '@mui/icons-material/Refresh';
import { apiClient } from 'billing-api-client';
import { DashboardErrorState } from '../../components/dashboard/DashboardStates';
import { WorkspacePagination } from '../../components/WorkspacePagination';
import { backgroundJobError, backgroundJobService } from './backgroundJobService';
import './background-jobs.css';

const jobTypes = [
  { value: 'Invoice', label: 'Invoices' },
  { value: 'Payment', label: 'Payments' },
  { value: 'Customer', label: 'Customers' },
  { value: 'AuditLog', label: 'Audit Logs' },
  { value: 'CreditNote', label: 'Credit Notes' },
  { value: 'Quotation', label: 'Quotations' },
  { value: 'Product', label: 'Products' },
];
const jobTypeLabel = value => jobTypes.find(option => option.value === value)?.label ?? value;
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

function parseRolesAndPerms(response) {
  const user = response?.data ?? response;
  const rawRoles = user?.roles ?? user?.Roles ?? user?.role ?? user?.Role ?? [];
  const roles = (Array.isArray(rawRoles) ? rawRoles : [rawRoles])
    .flatMap(value => String(value).split(','))
    .map(role => role.trim().toLowerCase())
    .filter(Boolean);
  const rawPerms = user?.permissions ?? user?.Permissions ?? [];
  const perms = (Array.isArray(rawPerms) ? rawPerms : [rawPerms])
    .flatMap(value => String(value).split(','))
    .map(perm => perm.trim().toLowerCase())
    .filter(Boolean);
  return { roles, perms };
}

export function exportJobAccess(response) {
  const { roles, perms } = parseRolesAndPerms(response);
  if (roles.some(role => ['tenantadmin', 'superadmin', 'admin', 'billingmanager', 'accountant', 'user'].includes(role))) {
    return true;
  }
  if (roles.some(role => ['customer', 'viewer'].includes(role))) {
    return false;
  }
  if (perms.some(perm => ['exportjobs.view', 'exportjobs.create', 'billing.view', 'invoices.view', 'reports.view', 'reports.export', 'all', '*'].includes(perm))) {
    return true;
  }
  return jobTypes.some(option => canExportJobType(response, option.value));
}

export function canExportAuditLogs(response) {
  const { roles, perms } = parseRolesAndPerms(response);
  if (roles.some(role => ['tenantadmin', 'superadmin', 'admin', 'accountant'].includes(role))) {
    return true;
  }
  if (roles.some(role => ['customer', 'viewer'].includes(role))) {
    return false;
  }
  return perms.some(perm => ['audit.view', 'audit.export', 'all', '*'].includes(perm));
}

export function canExportJobType(response, type) {
  if (type === 'AuditLog') return canExportAuditLogs(response);
  const { roles, perms } = parseRolesAndPerms(response);
  if (roles.some(role => ['tenantadmin', 'superadmin', 'admin'].includes(role)) ||
      perms.some(perm => ['all', '*'].includes(perm))) {
    return true;
  }
  if (roles.some(role => ['customer', 'viewer'].includes(role)) &&
      !roles.some(role => ['billingmanager', 'accountant', 'user'].includes(role))) {
    return false;
  }
  const entityPermKeys = [
    'invoices.view', 'invoices.manage',
    'payments.view', 'payments.manage',
    'customers.view', 'customers.manage',
    'creditnotes.view', 'creditnotes.manage',
    'quotations.view', 'quotations.manage',
    'products.view', 'products.manage',
    'billing.view', 'reports.view', 'reports.export',
  ];
  if (perms.some(p => entityPermKeys.includes(p))) {
    const map = {
      Invoice: ['invoices.view', 'invoices.manage', 'billing.view', 'reports.view', 'reports.export'],
      Payment: ['payments.view', 'payments.manage', 'billing.view', 'reports.view', 'reports.export'],
      Customer: ['customers.view', 'customers.manage'],
      CreditNote: ['creditnotes.view', 'creditnotes.manage', 'billing.view', 'reports.view', 'reports.export'],
      Quotation: ['quotations.view', 'quotations.manage', 'billing.view', 'reports.view', 'reports.export'],
      Product: ['products.view', 'products.manage'],
    };
    return (map[type] || []).some(req => perms.includes(req));
  }
  if (roles.some(role => ['billingmanager', 'user'].includes(role))) return true;
  if (roles.includes('accountant')) {
    return ['Invoice', 'Payment', 'CreditNote', 'Quotation'].includes(type);
  }
  return perms.some(p => ['exportjobs.view', 'exportjobs.create'].includes(p));
}

export function ExportJobStatus() {
  const client = useQueryClient();
  const [jobType, setJobType] = useState('Invoice');
  const [filterJobType, setFilterJobType] = useState('');
  const [exportFormat, setExportFormat] = useState('CSV');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [feedback, setFeedback] = useState(null);
  const user = useQuery({
    queryKey: ['auth-user'],
    queryFn: ({ signal }) => apiClient.get('/api/Auth/me', { signal }),
    retry: false,
    staleTime: 60000,
  });
  const allowed = exportJobAccess(user.data);
  const availableJobTypes = jobTypes.filter(option => canExportJobType(user.data, option.value));
  useEffect(() => {
    if (availableJobTypes.length > 0 && !availableJobTypes.some(option => option.value === jobType)) {
      setJobType(availableJobTypes[0].value);
    }
    if (filterJobType && !availableJobTypes.some(option => option.value === filterJobType)) {
      setFilterJobType('');
    }
  }, [availableJobTypes, jobType, filterJobType]);
  const profile = user.data?.data ?? user.data;
  const tenantKey = profile?.tenantId ?? profile?.tenant_id ?? 'current';
  const manualRefresh = useRef(true);
  const query = useQuery({
    queryKey: ['export-jobs', tenantKey, page, pageSize, filterJobType, status],
    queryFn: ({ signal }) => {
      const manual = manualRefresh.current;
      manualRefresh.current = false;
      return backgroundJobService.getExports(
        { page, pageSize, jobType: filterJobType, status },
        signal,
        manual ? undefined : { backgroundPoll: true }
      );
    },
    enabled: allowed,
    retry: false,
    refetchInterval: current => current.state.data?.items.some(job => ['Pending', 'Processing'].includes(job.status)) ? 5000 : false,
  });
  const createJob = useMutation({
    mutationFn: () => backgroundJobService.createExport({ jobType, exportFormat }),
    onSuccess: () => {
      manualRefresh.current = true;
      setPage(1);
      setFilterJobType('');
      setStatus('');
      setFeedback({ severity: 'success', message: 'Export queued.' });
      void client.invalidateQueries({ queryKey: ['export-jobs'] });
    },
    onError: error => setFeedback({ severity: 'error', message: backgroundJobError(error) }),
  });
  const refresh = () => { manualRefresh.current = true; void query.refetch(); };
  const download = async job => {
    try {
      const blob = await backgroundJobService.downloadExport(job.id);
      const extension = job.exportFormat.toLowerCase();
      const contentType = extension === 'json' ? 'application/json' : 'text/csv';
      const fileBlob = blob instanceof Blob && blob.type === contentType
        ? blob
        : new Blob([blob], { type: contentType });
      const fileName = (job.fileName || `${job.jobType}_Export_${job.id}`).replace(/\.[^.]+$/, '');
      const url = URL.createObjectURL(fileBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName}.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setFeedback({ severity: 'error', message: backgroundJobError(error) });
    }
  };
  const result = query.data;
  const visibleItems = (result?.items || []).filter(job => canExportJobType(user.data, job.jobType));

  return <main className="background-jobs-page">
    <header className="background-jobs-heading">
      <div><span className="background-jobs-eyebrow">Operations</span><h1>Export Jobs</h1><p>Queue data exports, track progress, and download completed files.</p></div>
      <Button variant="outlined" startIcon={<Refresh />} onClick={refresh} disabled={!allowed || query.isFetching}>Refresh</Button>
    </header>
    <FeedbackSnackbar message={feedback?.message || ''} severity={feedback?.severity} onClose={() => setFeedback(null)} />
    {user.isPending ? <div role="status">Checking access…</div>
      : user.isError ? <DashboardErrorState title="Unable to check access" message={backgroundJobError(user.error)} onRetry={() => user.refetch()} />
        : !allowed ? <Alert severity="warning">Export jobs are available to TenantAdmin, SuperAdmin, Admin, BillingManager, Accountant, and User roles.</Alert>
          : <>
            <section className="export-job-create">
              <h2>Create an export</h2>
              <TextField select label="Data" value={jobType} onChange={event => setJobType(event.target.value)} size="small">
                {availableJobTypes.map(option => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
              </TextField>
              <TextField select label="Format" value={exportFormat} onChange={event => setExportFormat(event.target.value)} size="small">
                {formats.map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}
              </TextField>
              <Button variant="contained" disabled={createJob.isPending || !availableJobTypes.length} onClick={() => { setFeedback(null); createJob.mutate(); }}>
                {createJob.isPending ? 'Queueing…' : 'Queue export'}
              </Button>
            </section>
            <section className="export-job-list">
              <div className="export-job-list-heading">
                <h2>Export history</h2>
                <div>
                  <FilterSelectField select size="small" label="Status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
                    <MenuItem value="">All Statuses</MenuItem>
                    {statusOptions.map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}
                  </FilterSelectField>
                  <FilterSelectField select size="small" label="Data" value={filterJobType} onChange={event => { setFilterJobType(event.target.value); setPage(1); }}>
                    <MenuItem value="">All data</MenuItem>
                    {availableJobTypes.map(option => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
                  </FilterSelectField>
                </div>
              </div>
              {query.isError ? <DashboardErrorState title="Unable to load exports" message={backgroundJobError(query.error)} onRetry={refresh} />
                : query.isFetching && !result ? <div role="status">Loading export history…</div>
                  : <div className="background-jobs-table-scroll ibms-table-frame">
                    <table className="background-jobs-table" aria-label="Export job history" aria-busy={query.isFetching}>
                      <thead><tr><th>Export</th><th>Status</th><th>Progress</th><th>Requested</th><th>Started</th><th>Completed</th><th>File size</th><th>Actions</th></tr></thead>
                      <tbody>
                        {visibleItems.map(job => <tr key={job.id}>
                          <td><strong>#{job.id} · {jobTypeLabel(job.jobType)}</strong><span>{job.exportFormat} · {job.requestedBy || 'User'}</span>{job.errorMessage && <span className="export-job-error">{job.errorMessage}</span>}</td>
                          <td><span className={`export-job-status status-${job.status.toLowerCase()}`}>{job.status}</span></td>
                          <td>{job.totalRecords ? `${job.processedRecords} / ${job.totalRecords}` : job.processedRecords > 0 ? job.processedRecords : job.status === 'Pending' ? 'Queued' : job.status === 'Processing' ? 'Processing…' : 0}</td>
                          <td>{dateTime(job.createdAtUtc)}</td><td>{dateTime(job.startedAtUtc)}</td><td>{dateTime(job.completedAtUtc)}</td>
                          <td>{formatBytes(job.fileSizeBytes)}</td>
                          <td>{job.status === 'Completed' ? <Button size="small" startIcon={<Download />} onClick={() => download(job)}>Download</Button> : '—'}</td>
                        </tr>)}
                        {!query.isFetching && !visibleItems.length && <tr><td colSpan="8" className="background-jobs-empty">No export jobs found.</td></tr>}
                      </tbody>
                    </table>
                  </div>}
              {result && <WorkspacePagination page={result.page} pageSize={result.pageSize} totalCount={result.totalCount} itemLabel="exports" disabled={query.isFetching} onPageChange={setPage} onPageSizeChange={value => { setPageSize(value); setPage(1); }} />}
            </section>
          </>}
  </main>;
}
