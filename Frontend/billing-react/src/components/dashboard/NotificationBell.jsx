import { useEffect, useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import Popover from '@mui/material/Popover';
import NotificationsOutlined from '@mui/icons-material/NotificationsOutlined';
import Close from '@mui/icons-material/Close';
import { useExclusiveDropdown } from '../../hooks/useExclusiveDropdown';
import { notificationDestination, notificationInboxService as inbox } from '../../services/notificationInboxService';
import './NotificationBell.css';

export function NotificationBell({ user }) {
  const id = useId();
  const trigger = useRef(null);
  const locked = useRef(false);
  const [open, setOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const navigate = useNavigate();
  const client = useQueryClient();
  const tenant = user?.tenantId ?? user?.TenantId ?? user?.tenant_id ?? 'host';
  const userId = user?.userId ?? user?.UserId ?? user?.id;
  const scope = ['notification-inbox', tenant, userId];
  const enabled = userId != null && tenant !== 'host';
  useExclusiveDropdown(open, setOpen);
  useEffect(() => { setOpen(false); setPageNumber(1); setError(''); setNotice(''); }, [tenant, userId]);
  const count = useQuery({ queryKey: [...scope, 'count'], queryFn: ({ signal }) => inbox.unreadCount(signal), enabled,
    retry: false, staleTime: 30000, refetchOnWindowFocus: true,
    refetchInterval: query => query.state.status === 'error' ? false : 60000 });
  const list = useQuery({ queryKey: [...scope, 'list', unreadOnly, pageNumber],
    queryFn: ({ signal }) => inbox.list({ unreadOnly, pageNumber }, signal), enabled: enabled && open,
    retry: false, staleTime: 0, refetchOnWindowFocus: true,
    refetchInterval: query => query.state.status === 'error' ? false : 30000 });
  const page = list.data;
  const pages = Math.max(1, Math.ceil((page?.totalCount || 0) / 20));
  useEffect(() => { if (page && pageNumber > pages) setPageNumber(pages); }, [page, pageNumber, pages]);
  const refresh = () => { void count.refetch(); void list.refetch(); };
  const mutate = async operation => {
    if (locked.current) return false;
    locked.current = true; setBusy(true); setError(''); setNotice('');
    try {
      await operation();
      await client.invalidateQueries({ queryKey: scope });
      setNotice('Notifications updated.');
      return true;
    } catch { setError('Could not update notifications. Please try again.'); return false; }
    finally { locked.current = false; setBusy(false); }
  };
  const openItem = async item => {
    const destination = notificationDestination(item.action, user);
    if (!destination || busy) return;
    if (!item.isRead && !await mutate(() => inbox.markRead(item.id))) return;
    setOpen(false); navigate(destination);
  };
  const unread = !count.isError ? count.data : undefined;
  return <>
    <button type="button" ref={trigger} className="notification-bell" aria-label={`Notifications${unread == null ? '' : `, ${unread} unread`}`}
      title="Notifications" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { if (!open && enabled) void count.refetch(); setOpen(value => !value); setPageNumber(1); setError(''); setNotice(''); }}>
      <NotificationsOutlined aria-hidden="true" />
      {unread > 0 && <span className="notification-badge" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
    </button>
    <Popover open={open} anchorEl={trigger.current} onClose={() => setOpen(false)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      marginThreshold={8} PaperProps={{ className: 'notification-popover' }}>
      <section id={id} role="dialog" aria-labelledby={`${id}-title`} className="notification-panel" aria-busy={busy || list.isFetching}>
        <header className="notification-panel-heading"><h2 id={`${id}-title`}>Notifications</h2>
          <button type="button" className="notification-close" autoFocus onClick={() => setOpen(false)} aria-label="Close notifications"><Close /></button></header>
        <div className="notification-toolbar"><div role="group" aria-label="Filter notifications">
          <button type="button" aria-pressed={!unreadOnly} onClick={() => { setUnreadOnly(false); setPageNumber(1); }}>All</button>
          <button type="button" aria-pressed={unreadOnly} onClick={() => { setUnreadOnly(true); setPageNumber(1); }}>Unread</button>
        </div><button type="button" disabled={busy || list.isFetching} onClick={refresh}>Refresh</button></div>
        {error && <p role="alert" className="notification-error">{error}</p>}
        {notice && <p role="status" className="notification-notice">{notice}</p>}
        {!enabled || list.isError ? <div className="notification-state" role="alert"><p>Notifications are unavailable right now. Please try again later.</p><button type="button" disabled={!enabled || list.isFetching} onClick={refresh}>Try again</button></div>
          : list.isPending ? <p className="notification-state" role="status">Loading notifications…</p>
          : !page?.items.length ? <p className="notification-state" role="status">{unreadOnly ? 'No unread notifications.' : 'You have no notifications yet.'}</p>
          : <ul className="notification-list">{page.items.map(item => <li key={item.id} className={item.isRead ? '' : 'is-unread'}>
            <div className="notification-item-heading"><strong>{item.title}</strong>{!item.isRead && <span className="notification-unread-dot" aria-label="Unread" />}</div>
            <p>{item.message}</p><time dateTime={item.createdAtUtc}>{new Date(item.createdAtUtc).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time>
            <div className="notification-item-actions">{notificationDestination(item.action, user) && <button type="button" disabled={busy} onClick={() => openItem(item)}>Open record</button>}
              {!item.isRead && <button type="button" disabled={busy} onClick={() => mutate(() => inbox.markRead(item.id))}>Mark as read<span className="notification-sr-only">: {item.title}</span></button>}</div>
          </li>)}</ul>}
        {page && !list.isError && <footer className="notification-footer">
          <button type="button" disabled={busy || list.isFetching || !page.items.length || !(unread > 0 || page.items.some(item => !item.isRead))}
            onClick={() => mutate(() => inbox.markAllRead(page.snapshotAtUtc))}>Mark all as read</button>
          {pages > 1 && <div className="notification-pagination" aria-label="Notification pages"><button type="button" aria-label="Previous notification page" disabled={pageNumber === 1 || busy || list.isFetching} onClick={() => setPageNumber(value => value - 1)}>Previous</button><span>{pageNumber} / {pages}</span><button type="button" aria-label="Next notification page" disabled={pageNumber >= pages || busy || list.isFetching} onClick={() => setPageNumber(value => value + 1)}>Next</button></div>}
        </footer>}
      </section>
    </Popover>
  </>;
}
