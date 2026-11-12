import { useEffect, useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import Popover from '@mui/material/Popover';
import Snackbar from '@mui/material/Snackbar';
import NotificationsOutlined from '@mui/icons-material/NotificationsOutlined';
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined';
import Close from '@mui/icons-material/Close';
import { useExclusiveDropdown } from '../../hooks/useExclusiveDropdown';
import { notificationDestination, notificationInboxService as inbox } from '../../services/notificationInboxService';
import './NotificationBell.css';

const loadDismissedIds = (tenant, userId) => {
  if (typeof localStorage === 'undefined' || !userId || tenant === 'host') return new Set();
  try {
    const raw = localStorage.getItem(`billing_inbox_dismissed_${tenant}_${userId}`);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
};

const loadClearCutoff = (tenant, userId) => {
  if (typeof localStorage === 'undefined' || !userId || tenant === 'host') return null;
  try {
    return localStorage.getItem(`billing_inbox_clear_cutoff_${tenant}_${userId}`) || null;
  } catch {
    return null;
  }
};

export function NotificationBell({ user }) {
  const id = useId();
  const trigger = useRef(null);
  const locked = useRef(false);
  const manualCountFetch = useRef(false);
  const manualListFetch = useRef(false);
  const [open, setOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [incomingToast, setIncomingToast] = useState(null);
  const prevUnreadRef = useRef(null);
  const toastedIdsRef = useRef(new Set());
  const navigate = useNavigate();
  const client = useQueryClient();
  const tenant = user?.tenantId ?? user?.TenantId ?? user?.tenant_id ?? 'host';
  const userId = user?.userId ?? user?.UserId ?? user?.id;
  const [dismissedIds, setDismissedIds] = useState(() => loadDismissedIds(tenant, userId));
  const [clearCutoff, setClearCutoff] = useState(() => loadClearCutoff(tenant, userId));
  const scope = ['notification-inbox', tenant, userId];
  const enabled = userId != null && tenant !== 'host';
  useExclusiveDropdown(open, setOpen);
  useEffect(() => {
    setOpen(false);
    setPageNumber(1);
    setError('');
    setNotice('');
    setIncomingToast(null);
    prevUnreadRef.current = null;
    toastedIdsRef.current = new Set();
    setDismissedIds(loadDismissedIds(tenant, userId));
    setClearCutoff(loadClearCutoff(tenant, userId));
  }, [tenant, userId]);
  const count = useQuery({ queryKey: [...scope, 'count'], queryFn: ({ signal }) => {
    const manual = manualCountFetch.current; manualCountFetch.current = false;
    return inbox.unreadCount(signal, manual ? undefined : { backgroundPoll: true });
  }, enabled,
    retry: false, staleTime: 30000, refetchOnWindowFocus: true,
    refetchInterval: query => query.state.status === 'error' ? false : 60000 });
  const list = useQuery({ queryKey: [...scope, 'list', unreadOnly, pageNumber],
    queryFn: ({ signal }) => {
      const manual = manualListFetch.current; manualListFetch.current = false;
      return inbox.list({ unreadOnly, pageNumber }, signal, manual ? undefined : { backgroundPoll: true });
    }, enabled: enabled && open,
    retry: false, staleTime: 0, refetchOnWindowFocus: true,
    refetchInterval: query => query.state.status === 'error' ? false : 30000 });
  const page = list.data;
  const pages = Math.max(1, Math.ceil((page?.totalCount || 0) / 20));
  useEffect(() => { if (page && pageNumber > pages) setPageNumber(pages); }, [page, pageNumber, pages]);
  const refresh = () => { manualCountFetch.current = true; manualListFetch.current = true; void count.refetch(); void list.refetch(); };
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
  const deleteItem = async item => {
    if (locked.current) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (!item.isRead) {
        try { await inbox.markRead(item.id); } catch {}
      }
      const updated = new Set(dismissedIds);
      updated.add(String(item.id));
      setDismissedIds(updated);
      try {
        localStorage.setItem(`billing_inbox_dismissed_${tenant}_${userId}`, JSON.stringify([...updated]));
      } catch {}
      await client.invalidateQueries({ queryKey: scope });
      setNotice('Notification deleted.');
    } finally {
      setBusy(false);
    }
  };
  const clearAll = async () => {
    if (locked.current) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (page?.snapshotAtUtc) {
        try { await inbox.markAllRead(page.snapshotAtUtc); } catch {}
      }
      const cutoff = page?.snapshotAtUtc || new Date().toISOString();
      setClearCutoff(cutoff);
      try {
        localStorage.setItem(`billing_inbox_clear_cutoff_${tenant}_${userId}`, cutoff);
      } catch {}
      await client.invalidateQueries({ queryKey: scope });
      setNotice('All notifications cleared.');
    } finally {
      setBusy(false);
    }
  };
  const visibleItems = (page?.items || []).filter(item => {
    if (dismissedIds.has(String(item.id))) return false;
    if (clearCutoff && new Date(item.createdAtUtc).getTime() <= new Date(clearCutoff).getTime()) return false;
    return true;
  });
  const serverUnread = !count.isError ? count.data : undefined;
  const unread = serverUnread != null
    ? (clearCutoff && (!visibleItems.length || !visibleItems.some(item => !item.isRead))
        ? 0
        : Math.max(0, serverUnread - (page?.items || []).filter(item => !item.isRead && !visibleItems.some(v => String(v.id) === String(item.id))).length))
    : undefined;

  useEffect(() => {
    if (!enabled || serverUnread == null) return undefined;
    const prev = prevUnreadRef.current;
    prevUnreadRef.current = serverUnread;
    if (prev === null || serverUnread <= prev) return undefined;

    let active = true;
    const delta = serverUnread - prev;
    (async () => {
      try {
        const latestPage = await inbox.list({ unreadOnly: true, pageNumber: 1 }, undefined, { backgroundPoll: true });
        if (!active) return;
        const newest = (latestPage?.items || []).find(entry => {
          const entryId = String(entry.id);
          if (dismissedIds.has(entryId) || toastedIdsRef.current.has(entryId)) return false;
          if (clearCutoff && new Date(entry.createdAtUtc).getTime() <= new Date(clearCutoff).getTime()) return false;
          return true;
        });
        if (newest) {
          toastedIdsRef.current.add(String(newest.id));
          setIncomingToast({ id: String(newest.id), title: newest.title || 'New notification', message: newest.message || '' });
          return;
        }
      } catch {}
      if (active) {
        setIncomingToast({
          id: `count-${Date.now()}`,
          title: 'New notification received',
          message: delta === 1 ? 'You have 1 new unread notification.' : `You have ${delta} new unread notifications.`,
        });
      }
    })();

    return () => { active = false; };
  }, [enabled, serverUnread, dismissedIds, clearCutoff]);

  return <>
    <Snackbar
      open={Boolean(incomingToast)}
      autoHideDuration={4500}
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      onClose={(_event, reason) => { if (reason !== 'clickaway') setIncomingToast(null); }}
      sx={{ zIndex: theme => theme.zIndex.modal + 120, top: { xs: 16, sm: 20 }, right: { xs: 16, sm: 20 } }}
    >
      <div className="notification-live-toast" role="status" aria-live="polite">
        <span className="notification-live-toast-icon" aria-hidden="true">
          <NotificationsActiveOutlined fontSize="small" />
        </span>
        <div className="notification-live-toast-copy">
          <strong>{incomingToast?.title}</strong>
          {incomingToast?.message && <p>{incomingToast.message}</p>}
        </div>
        <button type="button" className="notification-live-toast-close" aria-label="Dismiss notification toast" onClick={() => setIncomingToast(null)}>
          <Close fontSize="small" />
        </button>
      </div>
    </Snackbar>
    <button type="button" ref={trigger} className="notification-bell" aria-label={`Notifications${unread == null ? '' : `, ${unread} unread`}`}
      title="Notifications" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { if (!open && enabled) { manualCountFetch.current = true; manualListFetch.current = true; void count.refetch(); } setOpen(value => !value); setPageNumber(1); setError(''); setNotice(''); }}>
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
          <button type="button" aria-pressed={!unreadOnly} onClick={() => { manualListFetch.current = true; setUnreadOnly(false); setPageNumber(1); }}>All</button>
          <button type="button" aria-pressed={unreadOnly} onClick={() => { manualListFetch.current = true; setUnreadOnly(true); setPageNumber(1); }}>Unread</button>
        </div><button type="button" disabled={busy || list.isFetching} onClick={refresh}>Refresh</button></div>
        <div className="notification-body">
          {error && <p role="alert" className="notification-error">{error}</p>}
          {notice && <p role="status" className="notification-notice">{notice}</p>}
          {!enabled || list.isError ? <div className="notification-state" role="alert"><p>Notifications are unavailable right now. Please try again later.</p><button type="button" disabled={!enabled || list.isFetching} onClick={refresh}>Try again</button></div>
            : list.isPending ? <p className="notification-state" role="status">Loading notifications…</p>
            : !visibleItems.length ? <p className="notification-state" role="status">{unreadOnly ? 'No unread notifications.' : 'You have no notifications yet.'}</p>
            : <ul className="notification-list">{visibleItems.map(item => <li key={item.id} className={item.isRead ? '' : 'is-unread'}>
              <div className="notification-item-heading"><strong>{item.title}</strong>{!item.isRead && <span className="notification-unread-dot" aria-label="Unread" />}</div>
              <p>{item.message}</p><time dateTime={item.createdAtUtc}>{new Date(item.createdAtUtc).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time>
              <div className="notification-item-actions">{notificationDestination(item.action, user) && <button type="button" disabled={busy} onClick={() => openItem(item)}>Open record</button>}
                {!item.isRead && <button type="button" disabled={busy} onClick={() => mutate(() => inbox.markRead(item.id))}>Mark as read<span className="notification-sr-only">: {item.title}</span></button>}
                <button type="button" disabled={busy} onClick={() => deleteItem(item)}>Delete<span className="notification-sr-only">: {item.title}</span></button></div>
            </li>)}</ul>}
        </div>
        {page && !list.isError && <footer className="notification-footer">
          <div className="notification-footer-actions">
            <button type="button" disabled={busy || list.isFetching || !visibleItems.length || !(unread > 0 || visibleItems.some(item => !item.isRead))}
              onClick={() => mutate(() => inbox.markAllRead(page.snapshotAtUtc))}>Mark all as read</button>
            <button type="button" disabled={busy || list.isFetching || !visibleItems.length}
              onClick={clearAll}>Clear all</button>
          </div>
          {pages > 1 && <div className="notification-pagination" aria-label="Notification pages"><button type="button" aria-label="Previous notification page" disabled={pageNumber === 1 || busy || list.isFetching} onClick={() => { manualListFetch.current = true; setPageNumber(value => value - 1); }}>Previous</button><span>{pageNumber} / {pages}</span><button type="button" aria-label="Next notification page" disabled={pageNumber >= pages || busy || list.isFetching} onClick={() => { manualListFetch.current = true; setPageNumber(value => value + 1); }}>Next</button></div>}
        </footer>}
      </section>
    </Popover>
  </>;
}
