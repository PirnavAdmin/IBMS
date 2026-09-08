import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Add, DownloadOutlined, ReceiptLongOutlined, SendOutlined, PieChartOutline, WarningAmberOutlined, CheckCircleOutline, Search, FilterList, MoreVert } from '@mui/icons-material';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';
import { DashboardHeader } from '../../components/dashboard/DashboardHeader';
import { getInvoices, formatCurrency, formatDate } from '../../data/billingStore';
import '../../styles/Invoices.css';

const statuses = ['All Invoices', 'Draft', 'Issued', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled', 'Void'];
const title = (value = 'draft') => value.replace(/[_-]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const statusOf = (invoice) => title(invoice.status);
const paymentOf = (invoice) => invoice.paymentStatus ? title(invoice.paymentStatus) : ({ Paid: 'Paid', 'Partially Paid': 'Partially Paid', Overdue: 'Overdue', Draft: 'Not Paid' }[statusOf(invoice)] || 'Pending');
const date = (value) => value ? formatDate(value.slice(0, 10)) : '—';
const initialFilters = { search: '', start: '', end: '', customer: '', status: '', application: '' };

export const Invoices = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [invoices] = useState(getInvoices);
  const [tab, setTab] = useState(() => statuses.includes(searchParams.get('status')) ? searchParams.get('status') : 'All Invoices');
  const [filters, setFilters] = useState(initialFilters);
  const [selected, setSelected] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState({ key: 'issueDate', direction: -1 });
  const [detail, setDetail] = useState(null);
  const matchesStatus = (invoice, status) => status === 'All Invoices' || statusOf(invoice) === status || (status === 'Issued' && statusOf(invoice) === 'Sent');
  const count = (status) => invoices.filter((invoice) => matchesStatus(invoice, status)).length;
  const total = (status) => formatCurrency(invoices.filter((invoice) => matchesStatus(invoice, status)).reduce((sum, invoice) => sum + Number(invoice.total || 0), 0));
  const updateFilter = (key, value) => { setFilters((current) => ({ ...current, [key]: value })); setPage(1); };
  const rows = useMemo(() => invoices.filter((invoice) => {
    const query = filters.search.toLowerCase();
    return matchesStatus(invoice, tab) && (!filters.status || matchesStatus(invoice, filters.status))
      && `${invoice.id} ${invoice.customer} ${invoice.total}`.toLowerCase().includes(query)
      && (!filters.customer || invoice.customer === filters.customer)
      && (!filters.application || (invoice.application || 'Web App') === filters.application)
      && (!filters.start || invoice.issueDate >= filters.start)
      && (!filters.end || invoice.issueDate?.slice(0, 10) <= filters.end);
  }).sort((a, b) => sort.direction * (sort.key === 'total' ? Number(a.total) - Number(b.total) : String(a[sort.key] || '').localeCompare(String(b[sort.key] || '')))), [invoices, filters, tab, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const visible = rows.slice((page - 1) * pageSize, page * pageSize);
  const toggle = (id) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const exportRows = (items) => {
    const cell = (value) => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`;
    const csv = [['Invoice #', 'Customer', 'Invoice Date', 'Due Date', 'Amount', 'Status', 'Payment Status', 'Application'], ...items.map((invoice) => [invoice.id, invoice.customer, invoice.issueDate, invoice.dueDate, invoice.total, statusOf(invoice), paymentOf(invoice), invoice.application || 'Web App'])].map((row) => row.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = 'invoices.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const cards = [ ['All Invoices', 'Total Invoices', ReceiptLongOutlined, 'sand'], ['Draft', 'Draft', ReceiptLongOutlined, 'amber'], ['Issued', 'Issued', SendOutlined, 'blue'], ['Partially Paid', 'Partially Paid', PieChartOutline, 'amber'], ['Overdue', 'Overdue', WarningAmberOutlined, 'red'], ['Paid', 'Paid', CheckCircleOutline, 'green'] ];
  return <div className="invoice-module">
    <DashboardHeader searchQuery={filters.search} onSearch={(value) => updateFilter('search', value)} onSignOut={() => { localStorage.removeItem('billing_auth_token'); localStorage.removeItem('billing_auth_user'); navigate('/login'); }} />
    <main className="inv-main">
      <div className="inv-breadcrumb"><button onClick={() => navigate('/dashboard')}>Home</button><span>›</span><strong>Invoices</strong></div>
      <div className="inv-heading"><div className="inv-heading-copy"><span className="inv-title-icon"><ReceiptLongOutlined /></span><div><h1>Invoices</h1><p>Create, manage and track all your invoices</p></div></div><div className="inv-actions"><button onClick={() => exportRows(rows)} disabled={!rows.length}><DownloadOutlined />Export</button><button className="inv-primary" onClick={() => navigate('/invoices/new')}><Add />Create Invoice</button></div></div>
      <section className="inv-summary" aria-label="Invoice summary">{cards.map(([status, label, Icon, tone]) => <button className="inv-summary-card" key={status} onClick={() => { setTab(status); setPage(1); }}><span className={`inv-summary-icon ${tone}`}><Icon /></span><span><span>{label}</span><strong>{count(status)}</strong><small>{total(status)}</small></span></button>)}</section>
      <section className="inv-panel">
        <div className="inv-tabs" aria-label="Invoice status">{statuses.map((status) => <button key={status} className={tab === status ? 'active' : ''} aria-pressed={tab === status} onClick={() => { setTab(status); setPage(1); }}>{status} ({count(status)})</button>)}</div>
        <form className="inv-filters" onSubmit={(event) => { event.preventDefault(); setPage(1); }}>
          <label className="inv-search"><Search /><input aria-label="Search invoices" placeholder="Search by invoice number, customer, amount..." value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} /></label>
          <label>From<input type="date" value={filters.start} onChange={(event) => updateFilter('start', event.target.value)} /></label><label>To<input type="date" min={filters.start} value={filters.end} onChange={(event) => updateFilter('end', event.target.value)} /></label>
          <label>Customer<select value={filters.customer} onChange={(event) => updateFilter('customer', event.target.value)}><option value="">All Customers</option>{[...new Set(invoices.map((invoice) => invoice.customer))].map((customer) => <option key={customer}>{customer}</option>)}</select></label>
          <label>Status<select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}><option value="">All Statuses</option>{statuses.slice(1).map((status) => <option key={status}>{status}</option>)}</select></label>
          <label>Application<select value={filters.application} onChange={(event) => updateFilter('application', event.target.value)}><option value="">All Applications</option>{[...new Set(invoices.map((invoice) => invoice.application || 'Web App'))].map((app) => <option key={app}>{app}</option>)}</select></label>
          <button type="button" onClick={() => { setFilters(initialFilters); setTab('All Invoices'); setPage(1); }}>Reset</button><button className="inv-primary" type="submit"><FilterList />Filter</button>
        </form>
        <div className="inv-table-scroll"><table><thead><tr><th><input type="checkbox" aria-label="Select visible invoices" checked={visible.length > 0 && visible.every((invoice) => selected.includes(invoice.id))} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, ...visible.map((invoice) => invoice.id)])] : current.filter((id) => !visible.some((invoice) => invoice.id === id)))} /></th>{[['id', 'Invoice #'], ['customer', 'Customer'], ['issueDate', 'Invoice Date'], ['dueDate', 'Due Date'], ['total', 'Amount'], ['status', 'Status']].map(([key, label]) => <th key={key} aria-sort={sort.key === key ? sort.direction === 1 ? 'ascending' : 'descending' : 'none'}><button onClick={() => setSort({ key, direction: sort.key === key ? -sort.direction : 1 })}>{label} <span>↕</span></button></th>)}<th>Payment Status</th><th>Application</th><th>Actions</th></tr></thead><tbody>{visible.map((invoice) => <tr key={invoice.id}><td><input type="checkbox" aria-label={`Select ${invoice.id}`} checked={selected.includes(invoice.id)} onChange={() => toggle(invoice.id)} /></td><td><button className="inv-link" onClick={() => setDetail(invoice)}>{invoice.id}</button></td><td>{invoice.customer}<small>{invoice.customerId || invoice.email}</small></td><td>{date(invoice.issueDate)}</td><td>{date(invoice.dueDate)}</td><td className="inv-amount">{formatCurrency(invoice.total)}</td><td><span className={`inv-badge ${statusOf(invoice).toLowerCase().replaceAll(' ', '-')}`}>{statusOf(invoice)}</span></td><td><span className={`inv-badge ${paymentOf(invoice).toLowerCase().replaceAll(' ', '-')}`}>{paymentOf(invoice)}</span></td><td>{invoice.application || 'Web App'}</td><td><button className="inv-more" aria-label={`View ${invoice.id} details`} onClick={() => setDetail(invoice)}><MoreVert fontSize="small" /></button></td></tr>)}{!visible.length && <tr><td colSpan={10} className="inv-empty">No invoices match your filters.</td></tr>}</tbody></table></div>
        <div className="inv-pagination"><span>Showing {rows.length ? (page - 1) * pageSize + 1 : 0} to {Math.min(page * pageSize, rows.length)} of {rows.length} invoices</span><div><button disabled={page === 1} onClick={() => setPage(page - 1)} aria-label="Previous page">‹</button>{Array.from({ length: Math.min(pages, 5) }, (_, index) => Math.max(1, Math.min(page - 2, pages - 4)) + index).map((number) => <button key={number} className={page === number ? 'inv-primary' : ''} aria-current={page === number ? 'page' : undefined} onClick={() => setPage(number)}>{number}</button>)}<button disabled={page === pages} onClick={() => setPage(page + 1)} aria-label="Next page">›</button><select aria-label="Invoices per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>{[10, 25, 50].map((size) => <option key={size} value={size}>{size} per page</option>)}</select></div></div>
        <div className="inv-bulk"><span>With selected ({selected.length}):</span><button disabled={!selected.length} onClick={() => exportRows(invoices.filter((invoice) => selected.includes(invoice.id)))}><DownloadOutlined />Export</button><button disabled={!selected.length} onClick={() => setSelected([])}>Clear selection</button></div>
      </section>
    </main>
    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} fullWidth maxWidth="sm"><DialogTitle>Invoice details</DialogTitle><DialogContent>{detail && <div className="inv-detail"><h2>{detail.id}</h2><p>{detail.customer}</p><p>{detail.email}</p><p>Invoice date: {date(detail.issueDate)}</p><p>Due date: {date(detail.dueDate)}</p><p>Status: {statusOf(detail)}</p><h3>{formatCurrency(detail.total)}</h3></div>}</DialogContent><DialogActions><Button onClick={() => setDetail(null)}>Close</Button></DialogActions></Dialog>
  </div>;
};
