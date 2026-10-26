import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Dropdown, Modal, Select, Table, Tooltip } from 'antd';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { eventLabel, eventOptions, notificationError, notificationService, previewPayload } from './notificationService';
import { VisibilityOutlined, EditOutlined, DeleteOutline, MoreVert } from '@mui/icons-material';
import { parseTemplateToVisualModel } from './templateVisualModel';
import { NotificationEmpty, NotificationError, NotificationPreview, NotificationShell, NotificationStatus, useNotificationFeedback } from './NotificationShared';

export function NotificationTemplates() {
  const navigate = useNavigate();
  const location = useLocation();
  const client = useQueryClient();
  const [toast, toastHolder] = useNotificationFeedback();
  useEffect(() => {
    if (location.state?.notificationSaved) {
      toast.success('Notification template saved.');
      navigate(location.pathname, { replace: true, state: { ...location.state, notificationSaved: undefined } });
    }
  }, [location, navigate, toast]);
  const [filters, setFilters] = useState({});
  const [preview, setPreview] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState(null);
  const locked = useRef(false);
  const query = useQuery({ queryKey: ['notification-templates', filters], queryFn: ({ signal }) => notificationService.getTemplates(filters, { signal }), retry: false });
  const confirm = value => { setActionError(null); setConfirmation(value); };
  const perform = async () => {
    if (locked.current) return;
    locked.current = true; setPending(true); setActionError(null);
    try {
      if (confirmation.type === 'delete') await notificationService.deleteTemplate(confirmation.template.id);
      else await notificationService.seedDefaults();
      toast.success(confirmation.type === 'delete' ? 'Template deleted.' : 'Missing default templates added.');
      setConfirmation(null);
      await client.invalidateQueries({ queryKey: ['notification-templates'] });
    } catch (error) { setActionError(error); }
    finally { locked.current = false; setPending(false); }
  };
  const columns = [
    { title: 'Template Name', dataIndex: 'name', width: 240, render: (name, row) => <div className="notification-cell"><strong>{name}</strong>{row.description && <span className="notification-secondary">{row.description}</span>}</div> },
    { title: 'Event Type', dataIndex: 'eventType', width: 175, render: eventLabel },
    { title: 'Channel', dataIndex: 'channel', width: 100 },
    { title: 'Subject Template', dataIndex: 'subjectTemplate', width: 280, render: (text, row) => <FriendlySubject text={text} eventType={row.eventType} /> },
    { title: 'Status', dataIndex: 'isActive', width: 110, render: active => <NotificationStatus status={active ? 'Active' : 'Inactive'} /> },
    { title: 'Actions', key: 'actions', width: 90, render: (_, row) => <Dropdown trigger={['click']} placement="bottomRight" classNames={{ root: 'ibms-row-actions-menu notification-actions-menu' }} menu={{ items: [{ key: 'preview', label: 'Preview', icon: <span><VisibilityOutlined /></span> }, { key: 'edit', label: 'Edit', icon: <span><EditOutlined /></span> }, { type: 'divider' }, { key: 'delete', label: 'Delete', icon: <span><DeleteOutline /></span>, danger: true }], onClick: ({ key }) => {
      if (key === 'preview') setPreview(previewPayload(row));
      if (key === 'edit') navigate(`/settings/notifications/${encodeURIComponent(row.id)}/edit`);
      if (key === 'delete') confirm({ type: 'delete', template: row });
    } }}><Button aria-label={`Actions for ${row.name}`} className="notification-more ibms-row-actions-trigger" type="text" aria-haspopup="menu" ><MoreVert fontSize="small" /></Button></Dropdown> },
  ];
  return <NotificationShell title="Notification Management" description="Manage automated customer email templates." actions={<>
    <Link to="/settings/notifications/history"><Button>Communication History</Button></Link>
    <Button onClick={() => confirm({ type: 'seed' })}>Restore Missing Defaults</Button>
    <Link to="/settings/notifications/new"><Button type="primary">Create Template</Button></Link>
  </>}>
    {toastHolder}
    {query.error ? <NotificationError error={query.error} onRetry={() => query.refetch()} /> : <section className="notification-card">
      <div className="notification-filters" role="group" aria-label="Template filters">
        <label>Event Type<Select aria-label="Event Type filter" placeholder="All events" allowClear options={eventOptions} value={filters.eventType} onChange={eventType => setFilters(previous => ({ ...previous, eventType }))} /></label>
        <label>Status<Select aria-label="Template status filter" value={filters.isActive === undefined ? 'all' : String(filters.isActive)} options={[{ value: 'all', label: 'All statuses' }, { value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]} onChange={value => setFilters(previous => ({ ...previous, isActive: value === 'all' ? undefined : value === 'true' }))} /></label>
        <Button onClick={() => query.refetch()} disabled={query.isFetching}>Refresh</Button>
      </div>
      <Table className="ibms-table-frame notification-data-table" aria-label="Notification templates" rowKey="id" columns={columns} dataSource={query.data || []} loading={query.isFetching} size="middle" scroll={{ x: 1000 }} pagination={{ pageSize: 10, showSizeChanger: false, hideOnSinglePage: true }} locale={{ emptyText: <NotificationEmpty /> }} />
    </section>}
    {preview && <NotificationPreview payload={preview} onClose={() => setPreview(null)} />}
    <Modal open={Boolean(confirmation)} title={confirmation?.type === 'delete' ? 'Delete notification template?' : 'Restore missing default templates?'} onCancel={() => { if (!locked.current) setConfirmation(null); }} closable={!pending} mask={{ closable: !pending }}
      footer={<><Button disabled={pending} onClick={() => setConfirmation(null)}>Cancel</Button><Button danger={confirmation?.type === 'delete'} type="primary" loading={pending} onClick={perform}>{confirmation?.type === 'delete' ? 'Delete Template' : 'Restore Missing Defaults'}</Button></>} className="notification-modal">
      <p>{confirmation?.type === 'delete' ? `Delete “${confirmation.template.name}”? This action cannot be undone.` : 'Restore any missing default notification templates? Existing customized templates will not be overwritten.'}</p>
      {actionError && <Alert type="error" showIcon title={notificationError(actionError)} />}
    </Modal>
  </NotificationShell>;
}

function FriendlySubject({ text, eventType }) {
  const variables = useQuery({ queryKey: ['notification-variables', eventType], queryFn: ({ signal }) => notificationService.getVariables(eventType, { signal }), enabled: Boolean(eventType), retry: false, staleTime: 60000 });
  const parts = parseTemplateToVisualModel(text, variables.data);
  const display = parts.map((part, index) => part.type === 'token' ? <span className="notification-inline-field" key={index}>{part.label}</span> : part.text);
  return <Tooltip title={<span className="notification-subject-tooltip">{display}</span>}><span className="notification-truncate">{display}</span></Tooltip>;
}
