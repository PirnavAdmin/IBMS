import { useEffect, useRef, useState } from 'react';
import { Button, Input, Select, Table, Tooltip } from 'antd';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { WorkspacePagination } from '../../components/WorkspacePagination';
import { auditDate } from '../AuditActivity/auditModel';
import { eventLabel, eventOptions, HISTORY_STATUSES, notificationError, notificationService } from './notificationService';
import { NotificationEmpty, NotificationError, NotificationShell, NotificationStatus, useNotificationFeedback } from './NotificationShared';

const emptyFilters = { eventType: undefined, status: undefined, searchTerm: '', startDate: '', endDate: '' };
export function NotificationHistory() {
  const client = useQueryClient();
  const [toast, toastHolder] = useNotificationFeedback();
  const [draft, setDraft] = useState(emptyFilters);
  const [filters, setFilters] = useState({ ...emptyFilters, pageNumber: 1, pageSize: 20 });
  const [retrying, setRetrying] = useState([]);
  const locks = useRef(new Set());
  const query = useQuery({ queryKey: ['notification-history', filters], queryFn: ({ signal }) => notificationService.getHistory(filters, { signal }), retry: false });
  useEffect(() => {
    if (query.data && filters.pageNumber > Math.max(1, query.data.totalPages)) setFilters(previous => ({ ...previous, pageNumber: Math.max(1, query.data.totalPages) }));
  }, [query.data, filters.pageNumber]);
  const changeDraft = patch => setDraft(previous => ({ ...previous, ...patch }));
  const retry = async row => {
    if (row.status !== 'Failed' || locks.current.has(row.id)) return;
    locks.current.add(row.id); setRetrying([...locks.current]);
    try {
      await notificationService.retryNotification(row.id);
      toast.success('Retry processed. History will show the latest delivery status.');
    } catch (error) { toast.error(notificationError(error)); }
    finally {
      // A failed retry can still increment retryCount and update failureReason on the server.
      await client.invalidateQueries({ queryKey: ['notification-history'] });
      locks.current.delete(row.id); setRetrying([...locks.current]);
    }
  };
  const columns = [
    { title: 'Recipient', dataIndex: 'recipient', width: 220, render: text => <span className="notification-recipient">{text || '—'}</span> },
    { title: 'Event & Subject', dataIndex: 'eventType', width: 280, render: (event, row) => <div className="notification-cell"><strong>{eventLabel(event)}</strong><Tooltip title={row.subject}><span className="notification-truncate notification-secondary">{row.subject || '—'}</span></Tooltip></div> },
    { title: 'Sent Date (IST)', dataIndex: 'sentAtUtc', width: 225, render: value => <span className="notification-date">{auditDate(value)}</span> },
    { title: 'Status', dataIndex: 'status', width: 100, render: status => <NotificationStatus status={status} /> },
    { title: 'Retry Count', dataIndex: 'retryCount', width: 100, render: count => count ?? '—' },
    { title: 'Failure Reason', dataIndex: 'failureReason', width: 240, render: (text, row) => row.status === 'Failed' && text?.trim() ? <Tooltip title={text}><span className="notification-truncate">{text}</span></Tooltip> : '—' },
    { title: 'Actions', key: 'actions', width: 100, render: (_, row) => row.status === 'Failed' ? <Button size="small" loading={retrying.includes(row.id)} disabled={retrying.includes(row.id)} onClick={() => retry(row)} aria-label={`Retry notification ${row.id}`}>Retry</Button> : '—' },
  ];
  return <NotificationShell title="Communication History" description="Track email delivery, review failures and retry failed notifications. Dates are shown in IST." actions={<>
    <Link to="/settings/notifications"><Button>Manage Templates</Button></Link><Button onClick={() => query.refetch()} disabled={query.isFetching}>Refresh</Button>
  </>}>
    {toastHolder}{query.error ? <NotificationError error={query.error} onRetry={() => query.refetch()} /> : <section className="notification-card">
      <form className="notification-filters notification-history-filters" aria-label="Communication history filters" onSubmit={event => { event.preventDefault(); setFilters(previous => ({ ...previous, ...draft, pageNumber: 1 })); }}>
        <label>Event Type<Select aria-label="History event filter" placeholder="All events" allowClear options={eventOptions} value={draft.eventType} onChange={eventType => changeDraft({ eventType })} /></label>
        <label>Status<Select aria-label="History status filter" placeholder="All statuses" allowClear options={HISTORY_STATUSES.map(value => ({ value, label: value }))} value={draft.status} onChange={status => changeDraft({ status })} /></label>
        <label className="notification-search">Search<Input aria-label="Search history" placeholder="Recipient, subject or failure reason" value={draft.searchTerm} onChange={event => changeDraft({ searchTerm: event.target.value })} allowClear /></label>
        <div className="notification-range">Date Range (IST)<DateRangeFilter startDate={draft.startDate} endDate={draft.endDate} onApply={changeDraft} /></div>
        <div className="notification-actions"><Button onClick={() => { setDraft(emptyFilters); setFilters(previous => ({ ...previous, ...emptyFilters, pageNumber: 1 })); }}>Clear</Button><Button type="primary" htmlType="submit">Apply Filters</Button></div>
      </form>
      <Table className="ibms-table-frame notification-data-table" aria-label="Communication history" rowKey="id" columns={columns} dataSource={query.data?.items || []} loading={query.isFetching} size="middle" scroll={{ x: 1265 }} locale={{ emptyText: <NotificationEmpty text="No communications found" /> }} pagination={false} />
      {query.data && <WorkspacePagination page={filters.pageNumber} pageSize={filters.pageSize} totalCount={query.data.totalCount} itemLabel="notifications" disabled={query.isFetching} onPageChange={pageNumber => setFilters(previous => ({ ...previous, pageNumber }))} onPageSizeChange={pageSize => setFilters(previous => ({ ...previous, pageNumber: 1, pageSize }))} />}
    </section>}
  </NotificationShell>;
}
