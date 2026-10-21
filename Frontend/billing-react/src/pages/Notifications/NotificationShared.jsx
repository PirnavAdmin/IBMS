import { Button, ConfigProvider, Empty, Modal, Spin, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { FeedbackSnackbar } from '../../components/FeedbackSnackbar';
import { DashboardErrorState } from '../../components/dashboard/DashboardStates';
import { notificationError, notificationService } from './notificationService';
import './notifications.css';

const theme = {
  token: { colorPrimary: '#795137', colorPrimaryBg: '#F0E2D0', colorPrimaryBgHover: '#E6D3BC', controlOutline: 'rgba(152,116,85,.14)', colorLink: '#795137', colorLinkHover: '#987455', colorInfo: '#795137', colorText: '#35231C', colorTextSecondary: '#806B5B', colorBgContainer: '#FFFDF9', colorBgElevated: '#FFFDF9', colorBorder: '#DCCEBF', colorBgLayout: '#F9F5EF', borderRadius: 8, controlHeight: 40, fontFamily: 'inherit' },
  components: { Table: { headerBg: '#F6F1EA', headerColor: '#68462F', rowHoverBg: '#FAF5ED' }, Select: { optionSelectedBg: '#F0E2D0', activeBorderColor: '#987455', activeOutlineColor: 'rgba(152,116,85,.14)' }, Input: { activeBorderColor: '#987455', activeShadow: '0 0 0 3px rgba(152,116,85,.12)' }, DatePicker: { activeBorderColor: '#987455', activeShadow: '0 0 0 3px rgba(152,116,85,.12)' }, Modal: { contentBg: '#FFFDF9', headerBg: '#FFFDF9' } },
};
export function useNotificationFeedback() {
  const [feedback, setFeedback] = useState({ message: '', severity: 'success' });
  const api = useMemo(() => ({ success: message => setFeedback({ message, severity: 'success' }), error: message => setFeedback({ message, severity: 'error' }) }), []);
  return [api,
    <FeedbackSnackbar key="notification-feedback" {...feedback} onClose={() => setFeedback(previous => ({ ...previous, message: '' }))} />];
}
export function NotificationShell({ title, description, actions, children }) {
  return <ConfigProvider theme={theme}><main className="notification-page">
    <nav className="notification-breadcrumb" aria-label="Breadcrumb"><Link to="/settings">Settings</Link><span>/</span><Link to="/settings/notifications">Notifications</Link></nav>
    <header className="notification-heading"><div><span className="notification-eyebrow">Configuration & administration</span><h1>{title}</h1><p>{description}</p></div><div className="notification-actions">{actions}</div></header>
    {children}
  </main></ConfigProvider>;
}
export function NotificationError({ error, onRetry }) {
  return <DashboardErrorState message={notificationError(error)} onRetry={onRetry} />;
}
export const NotificationEmpty = ({ text = 'No templates found' }) => <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={text} />;
export function NotificationStatus({ status }) {
  return <Tag className="notification-status" data-status={status} color={{ Sent: 'success', Failed: 'error', Queued: 'warning', Active: 'success', Inactive: 'default' }[status] || 'default'}>{status || '—'}</Tag>;
}
export function NotificationPreview({ payload, onClose }) {
  const query = useQuery({ queryKey: ['notification-preview', payload], queryFn: ({ signal }) => notificationService.previewTemplate(payload, { signal }), retry: false, staleTime: 0, gcTime: 0 });
  // Sandbox blocks scripts, forms, popups, top navigation and access to the parent.
  // CSP additionally prevents external resources from transmitting preview content.
  const srcDoc = query.data && `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><meta charset="utf-8"><style>body{font:14px/1.6 Arial,sans-serif;color:#35231c;padding:16px;overflow-wrap:anywhere}img{max-width:100%}</style></head><body>${query.data.renderedBody}</body></html>`;
  return <Modal open title="Email Preview" onCancel={onClose} footer={<Button onClick={onClose}>Close</Button>} width={820} className="notification-modal">
    {query.isPending ? <div className="notification-loading" role="status"><Spin />Rendering preview…</div> : query.error ? <NotificationError error={query.error} onRetry={() => query.refetch()} /> : <>
      <div className="notification-preview-subject"><span>Subject</span><strong>{query.data.renderedSubject}</strong></div>
      <iframe title="Rendered email body" sandbox="" referrerPolicy="no-referrer" srcDoc={srcDoc} className="notification-preview-frame" />
    </>}
  </Modal>;
}
