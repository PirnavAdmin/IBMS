import { useState } from 'react';
import { History, Search, PersonOutline } from '@mui/icons-material';

const events = ['Created', 'Edited', 'Sent', 'Approved', 'Cancelled', 'Converted', 'Discount Override', 'Status Changes'];
const eventKey = value => String(value || '').toLowerCase().replace(/[^a-z]/g, '');
function eventLabel(action) {
  const key = eventKey(action);
  if (['statuschange', 'statuschanged', 'statuschanges'].includes(key)) return 'Status Changes';
  return events.find(event => eventKey(event) === key) || action || 'Activity';
}
function timestamp(value) {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}
function dateLabel(value) {
  if (!timestamp(value)) return 'Date unavailable';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });
}
function userLabel(user) {
  if (user == null || user === '') return 'Unknown user';
  return /^\d+$/.test(String(user)) ? `User #${user}` : String(user);
}

export function QuotationAudit({ entries = [] }) {
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState('newest');
  const rows = entries.map(entry => ({ ...entry, label: eventLabel(entry.action) }));
  const query = search.trim().toLowerCase();
  const visible = rows.filter(entry => (filter === 'All' || entry.label === filter)
    && `${entry.label} ${userLabel(entry.user)} ${entry.description || ''}`.toLowerCase().includes(query))
    .sort((a, b) => order === 'newest' ? timestamp(b.date) - timestamp(a.date) : timestamp(a.date) - timestamp(b.date));

  return <section className="quote-card quote-audit-panel" aria-labelledby="quote-audit-title">
    <div className="quote-audit-heading">
      <div className="quote-audit-title"><span className="quote-audit-symbol"><History /></span><div>
        <h2 id="quote-audit-title">Audit trail <span className="quote-audit-count">{entries.length}</span></h2>
        <p>A record of activity and changes to this quotation.</p>
      </div></div>
      <span className="quote-audit-timezone">Times in {Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
    </div>
    <div className="quote-audit-filters" aria-label="Filter audit events">
      {['All', ...events].map(event => <button key={event} type="button" aria-pressed={filter === event}
        className={filter === event ? 'active' : ''} onClick={() => setFilter(event)}>
        {event}<span>{event === 'All' ? rows.length : rows.filter(row => row.label === event).length}</span>
      </button>)}
    </div>
    <div className="quote-audit-toolbar">
      <label className="quote-audit-search"><Search aria-hidden="true" /><input type="search" aria-label="Search audit history"
        placeholder="Search activity, user or description…" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label className="quote-audit-sort">Sort by <select value={order} onChange={event => setOrder(event.target.value)}>
        <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
      </select></label>
    </div>
    {visible.length ? <div className="quote-table-wrap"><table className="quote-audit-table">
      <caption className="quote-audit-sr-only">Quotation activity history</caption>
      <thead><tr><th scope="col">Event</th><th scope="col">Date & time</th><th scope="col">Performed by</th><th scope="col">Description</th></tr></thead>
      <tbody>{visible.map((entry, index) => <tr key={entry.id || `${entry.date}-${entry.action}-${index}`}>
        <td><span className={`quote-audit-badge ${eventKey(entry.label)}`}><span aria-hidden="true" />{entry.label}</span></td>
        <td>{timestamp(entry.date) ? <time dateTime={new Date(entry.date).toISOString()}>{dateLabel(entry.date)}</time> : 'Date unavailable'}</td>
        <td><span className="quote-audit-user"><PersonOutline aria-hidden="true" />{userLabel(entry.user)}</span></td>
        <td className="quote-audit-description">{entry.description || 'No additional details recorded.'}</td>
      </tr>)}</tbody>
    </table></div> : <div className="quote-audit-empty"><History aria-hidden="true" />
      <strong>{entries.length ? 'No matching activity' : 'No audit history yet'}</strong>
      <p>{entries.length ? 'Try another event type or search term.' : 'Recorded quotation events will appear here.'}</p>
      {(filter !== 'All' || search) && <button className="quote-btn secondary" onClick={() => { setFilter('All'); setSearch(''); }}>Clear filters</button>}
    </div>}
    <p className="quote-audit-footer" role="status">Showing {visible.length} of {entries.length} recorded events</p>
  </section>;
}
