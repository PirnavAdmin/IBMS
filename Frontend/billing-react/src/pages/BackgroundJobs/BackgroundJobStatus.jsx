import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Chip, LinearProgress } from '@mui/material';
import { Refresh } from '@mui/icons-material';
import { apiClient } from 'billing-api-client';
import { DashboardErrorState } from '../../components/dashboard/DashboardStates';
import { backgroundJobError, backgroundJobService } from './backgroundJobService';
import './background-jobs.css';

const dateTime = (value, emptyLabel) => value
  ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(value))
  : emptyLabel;
function backgroundJobAccess(response) {
  const user = response?.data ?? response;
  const raw = user?.roles ?? user?.Roles ?? user?.role ?? user?.Role ?? [];
  return (Array.isArray(raw) ? raw : [raw]).flatMap(value => String(value).split(','))
    .some(role => ['tenantadmin', 'superadmin'].includes(role.trim().toLowerCase()));
}
const statusColor = status => ({ Running: 'info', Succeeded: 'success', Failed: 'error', Idle: 'default' }[status] || 'default');

export function BackgroundJobStatus() {
  const user = useQuery({
    queryKey: ['auth-user'],
    queryFn: ({ signal }) => apiClient.get('/api/Auth/me', { signal }),
    retry: false,
    staleTime: 60000,
  });
  const allowed = backgroundJobAccess(user.data);
  const query = useQuery({
    queryKey: ['background-job-status'],
    queryFn: ({ signal }) => backgroundJobService.getStatuses(signal),
    enabled: allowed,
    retry: false,
    refetchInterval: 10000,
  });
  const refresh = () => { void query.refetch(); };

  return <main className="background-jobs-page">
    <header className="background-jobs-heading">
      <div><span className="background-jobs-eyebrow">Operations</span><h1>Background Jobs</h1><p>Review scheduled worker job status and recent execution details.</p></div>
      <Button variant="outlined" startIcon={<Refresh />} onClick={refresh} disabled={!allowed || query.isFetching}>Refresh</Button>
    </header>
    {user.isPending ? <div role="status"><LinearProgress />Checking access…</div>
      : user.isError ? <DashboardErrorState title="Unable to check access" message={backgroundJobError(user.error)} onRetry={() => user.refetch()} />
        : !allowed ? <Alert severity="warning">Background job status is available to TenantAdmin and SuperAdmin roles.</Alert>
          : query.isError ? <DashboardErrorState title="Unable to load background jobs" message={backgroundJobError(query.error)} onRetry={refresh} />
            : <>
              {query.isFetching && <LinearProgress aria-label="Refreshing background job status" />}
              <section className="background-jobs-grid" aria-label="Background job status list">
                {(query.data || []).map(job => <article className="background-job-card" key={job.jobName}>
                  <div className="background-job-card-heading"><div><h2>{job.jobName}</h2><p>{job.description}</p></div><Chip size="small" label={job.status} color={statusColor(job.status)} /></div>
                  <dl className="background-job-facts">
                    <div><dt>Last run</dt><dd>{dateTime(job.lastRunAtUtc, 'Never run')}</dd></div>
                    <div><dt>Next scheduled run</dt><dd>{dateTime(job.nextScheduledRunUtc, 'Not provided')}</dd></div>
                    <div><dt>Processed</dt><dd>{job.lastProcessedCount}</dd></div>
                    <div><dt>Duration</dt><dd>{job.lastExecutionDurationMs ? `${Math.round(job.lastExecutionDurationMs)} ms` : '—'}</dd></div>
                  </dl>
                  {job.lastRunMessage && <p className={`background-job-message ${job.lastRunSuccess ? '' : 'is-error'}`}>{job.lastRunMessage}</p>}
                </article>)}
              </section>
              {!query.isFetching && query.data?.length === 0 && <p className="background-jobs-empty">No background jobs are registered.</p>}
            </>}
  </main>;
}
