import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Avatar, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, LinearProgress, Tooltip, MenuItem, Pagination, Skeleton, Snackbar, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, TextField } from '@mui/material';
import { Add, CheckCircleOutline, GroupOutlined, VisibilityOutlined, EditOutlined, ReceiptLongOutlined, PersonAddAltOutlined, PersonOffOutlined, Search, AccountBalanceWalletOutlined } from '@mui/icons-material';
import { useCustomers, useCustomerStatus, useCustomerSummary } from './useCustomers';
import type { Customer, CustomerQueryParams } from './types';
import { customerCapabilities } from './customerContract';
import './customers.css';

export const money = (value: number | null | undefined) => value == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
export const StatusChip = ({ status }: { status: string }) => <span className={`customer-status ${status}`}><i />{status}</span>;
const filterOptions = {
  status: { label: 'Customer status', values: [['active', 'Active'], ['inactive', 'Inactive']] },
  customerType: { label: 'Customer type', values: [['individual', 'Individual'], ['business', 'Business'], ['organization', 'Organization']] },
  taxId: { label: 'Tax registration', values: [['gst', 'GST Registered'], ['non-gst', 'Non GST'], ['available', 'Tax ID Available']] },
  outstanding: { label: 'Outstanding', values: [['yes', 'Has Outstanding'], ['no', 'No Outstanding']] },
};
const columns = [['customerCode', 'Customer code'], ['name', 'Customer'], ['customerType', 'Type'], ['', 'Tax ID / GSTIN'], ['', 'Contact'], ['outstandingBalance', 'Outstanding'], ['status', 'Status'], ['', 'Actions']];
export function CustomerListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const summaryQuery = useCustomerSummary();
  const [url, setUrl] = useSearchParams();
  const params: CustomerQueryParams = { page: Math.max(1, Number(url.get('page')) || 1), pageSize: [10, 25, 50, 100].includes(Number(url.get('pageSize'))) ? Number(url.get('pageSize')) : 10,
    search: url.get('search') || '', sortBy: url.get('sortBy') || '', sortOrder: url.get('sortOrder') === 'desc' ? 'desc' : 'asc',
    ...Object.fromEntries(Object.entries(filterOptions).map(([key, option]) => [key, option.values.some(([value]) => value === url.get(key)) ? url.get(key) : ''])) };
  const [search, setSearch] = useState(params.search);
  const change = (values: Record<string, string | number>) => setUrl(previous => { const next = new URLSearchParams(previous); Object.entries(values).forEach(([key, value]) => value ? next.set(key, String(value)) : next.delete(key)); return next; }, { replace: true });
  useEffect(() => { setSearch(params.search); }, [params.search]);
  useEffect(() => { if (search === params.search) return; const timer = setTimeout(() => change({ search: search || '', page: 1 }), 450); return () => clearTimeout(timer); }, [search, params.search]);
  const query = useCustomers(params);
  const mutation = useCustomerStatus();
  const [confirm, setConfirm] = useState<Customer | null>(null);
  const [notice, setNotice] = useState(location.state?.customerNotice || '');
  useEffect(() => { if (location.state?.customerNotice) navigate(location.pathname + location.search, { replace: true, state: null }); }, [location.state, location.pathname, location.search, navigate]);
  const data = query.data;
  const reset = () => { setSearch(''); setUrl({}); };
  const filtered = !!params.sortBy || !!params.search || Object.keys(filterOptions).some(key => !!params[key as keyof CustomerQueryParams]);
  return <main className="customers-page">
    <nav className="customers-breadcrumb" aria-label="Breadcrumb"><Link to="/dashboard">Billing</Link><span>/</span><strong>Customers</strong></nav>
    <header className="customers-heading"><div><h1>Customer Management</h1><p>Manage customers, billing information, tax details and outstanding balances.</p></div><Button variant="contained" startIcon={<Add />} onClick={() => navigate('/customers/new')}>Add Customer</Button></header>
    <section className="customer-stats" aria-label="Customer summary">{[
      { label: 'Total Customers', value: summaryQuery.data?.total, text: 'Your customer network', icon: <GroupOutlined />, tone: 'brown' },
      { label: 'Active Customers', value: summaryQuery.data?.active, text: 'Ready for new invoices', icon: <CheckCircleOutline />, tone: 'green' },
      { label: 'Inactive Customers', value: summaryQuery.data?.inactive, text: 'History safely retained', icon: <PersonOffOutlined />, tone: 'gray' },
      { label: 'Total Outstanding', value: summaryQuery.data ? money(summaryQuery.data.outstanding) : undefined, text: 'Total outstanding is not provided by the API', icon: <AccountBalanceWalletOutlined />, tone: 'orange' },
    ].map(stat => <article key={stat.label} className={`customer-stat ${stat.tone}`}><div className="customer-stat-top"><span>{stat.label}</span><span className="customer-stat-icon">{stat.icon}</span></div><strong>{summaryQuery.isLoading ? <Skeleton width="60%" /> : stat.value ?? '—'}</strong><small>{stat.text}</small></article>)}</section>
    {summaryQuery.isError && <Alert severity="warning" action={<Button onClick={() => summaryQuery.refetch()}>Retry</Button>}>Customer summary unavailable. {summaryQuery.error.message}</Alert>}
    <section className="customer-panel">
      <div className="customer-panel-heading"><div><h2>Customer directory <span>{data?.totalCount ?? '—'}</span></h2><p>All your customer relationships, in one place.</p></div></div>
      <div className="customer-filters"><TextField disabled={!customerCapabilities.search} className="customer-search" size="small" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by name, code, email, mobile or tax ID…" inputProps={{ 'aria-label': 'Search customers' }} InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }} />
        <div className="customer-search-feedback" role="status">The current API supports status and pagination. Search, other filters and sorting require backend support.</div>
        <div className="customer-filter-row">{Object.entries(filterOptions).map(([key, option]) => <TextField disabled={key !== 'status'} select size="small" label={option.label} key={key} InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }} value={params[key as keyof CustomerQueryParams] || ''} onChange={event => change({ [key]: event.target.value, page: 1 })}><MenuItem value="">All</MenuItem>{option.values.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>)}<Button onClick={reset} disabled={!filtered && !search}>Reset filters</Button></div>
        {filtered && <div className="customer-filter-chips">{params.search && <Chip size="small" label={`Search: ${params.search}`} onDelete={() => { setSearch(''); change({ search: '', page: 1 }); }} />}{Object.entries(filterOptions).filter(([key]) => params[key as keyof CustomerQueryParams]).map(([key, option]) => <Chip key={key} size="small" label={`${option.label}: ${option.values.find(([v]) => v === params[key as keyof CustomerQueryParams])?.[1]}`} onDelete={() => change({ [key]: '', page: 1 })} />)}</div>}
      </div>
      <div className="customer-progress">{query.isFetching && <LinearProgress />}</div>
      {query.isError ? <div className="customer-empty"><Alert severity="error">Unable to load customers. {query.error.message}</Alert><Button onClick={() => query.refetch()}>Retry</Button></div> : query.isLoading ? <div className="customer-skeleton">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} height={65} />)}</div> : !data?.items.length ? <div className="customer-empty"><GroupOutlined /><h2>{filtered ? 'No matching customers' : 'No customers yet'}</h2><p>{filtered ? 'No customers match your current search or filters.' : 'Add your first customer to start billing.'}</p><Button variant="outlined" onClick={() => filtered ? reset() : navigate('/customers/new')}>{filtered ? 'Clear Filters' : 'Add Customer'}</Button></div> : <>
      <TableContainer className="customer-table"><Table size="small" aria-label="Customer directory"><TableHead><TableRow>{columns.map(([key, label], index) => <TableCell key={index} align={key === 'outstandingBalance' ? 'right' : 'left'}>{key ? <TableSortLabel disabled={!customerCapabilities.sorting} active={!!params.sortBy && params.sortBy === key} direction={params.sortBy === key ? params.sortOrder : 'asc'} onClick={() => customerCapabilities.sorting && change({ sortBy: key, sortOrder: params.sortBy === key && params.sortOrder === 'asc' ? 'desc' : 'asc', page: 1 })}>{label}</TableSortLabel> : label || <span className="customer-sr-only">Actions</span>}</TableCell>)}</TableRow></TableHead><TableBody>{data.items.map(customer => <TableRow key={customer.id} hover>
        <TableCell data-label="Code"><span className="customer-code">{customer.customerCode}</span></TableCell>
        <TableCell data-label="Customer"><div className="customer-identity"><Avatar className={`customer-avatar tone-${Number(customer.customerCode.slice(-1)) % 3}`}>{customer.name.split(' ').slice(0, 2).map(n => n[0]).join('')}</Avatar><div><Link to={`/customers/${customer.id}`}>{customer.name}</Link><small>{customer.companyName || '—'}</small></div></div></TableCell>
        <TableCell data-label="Type"><span className="customer-type">{customer.customerType || '—'}</span></TableCell>
        <TableCell data-label="Tax ID"><div className="customer-tax"><small>{customer.gstin ? 'GSTIN' : customer.taxId ? 'PAN / Tax ID' : 'Not registered'}</small>{customer.gstin || customer.taxId || '—'}</div></TableCell>
        <TableCell data-label="Contact"><div className="customer-contact"><a href={`mailto:${customer.email}`}>{customer.email}</a><small>{customer.mobile}</small></div></TableCell>
        <TableCell data-label="Outstanding" align="right"><strong className={(customer.outstandingBalance ?? 0) > 0 ? 'customer-balance due' : 'customer-balance'}>{money(customer.outstandingBalance)}</strong></TableCell>
        <TableCell data-label="Status"><StatusChip status={customer.status} /></TableCell>
        <TableCell data-label="Actions"><div className="customer-row-actions" role="group" aria-label={`Actions for ${customer.name}`}>
          <Tooltip title="View details"><IconButton className="action-view" size="small" aria-label={`View ${customer.name}`} onClick={() => navigate(`/customers/${customer.id}`)}><VisibilityOutlined /></IconButton></Tooltip>
          <Tooltip title="Edit customer"><IconButton className="action-edit" size="small" aria-label={`Edit ${customer.name}`} onClick={() => navigate(`/customers/${customer.id}/edit`)}><EditOutlined /></IconButton></Tooltip>
          <Tooltip title={customer.status === 'inactive' ? 'Activate customer to create an invoice' : 'Create invoice'}><span><IconButton className="action-invoice" size="small" disabled={customer.status !== 'active'} aria-label={`Create invoice for ${customer.name}`} onClick={() => navigate(`/invoices/new?customerId=${customer.id}`)}><ReceiptLongOutlined /></IconButton></span></Tooltip>
          <Tooltip title={customer.status === 'active' ? 'Deactivate customer' : 'Activate customer'}><IconButton disabled={customer.status === 'unknown'} className={customer.status === 'active' ? 'action-deactivate' : 'action-activate'} size="small" aria-label={`${customer.status === 'active' ? 'Deactivate' : 'Activate'} ${customer.name}`} onClick={() => { mutation.reset(); setConfirm(customer); }}>{customer.status === 'active' ? <PersonOffOutlined /> : <PersonAddAltOutlined />}</IconButton></Tooltip>
        </div></TableCell>
      </TableRow>)}</TableBody></Table></TableContainer>
      <footer className="customer-pagination"><div><span>Rows per page</span><TextField select size="small" value={params.pageSize} inputProps={{ 'aria-label': 'Rows per page' }} onChange={event => change({ pageSize: event.target.value, page: 1 })}>{[10, 25, 50, 100].map(n => <MenuItem key={n} value={n}>{n}</MenuItem>)}</TextField><span>{(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.totalCount)} of {data.totalCount}</span></div><Pagination size="small" count={data.totalPages} page={data.page} onChange={(_, page) => change({ page })} disabled={query.isPlaceholderData} shape="rounded" color="primary" /></footer>
      </>}
    </section>
    <Dialog open={!!confirm} onClose={() => !mutation.isPending && setConfirm(null)} fullWidth maxWidth="xs"><DialogTitle>{confirm?.status === 'active' ? 'Deactivate' : 'Activate'} Customer</DialogTitle><DialogContent><p>Are you sure you want to {confirm?.status === 'active' ? 'deactivate' : 'activate'} “{confirm?.name}”?</p><p className="customer-dialog-note">{confirm?.status === 'active' ? 'Inactive customers cannot be selected for new invoices. Existing transaction history will be retained.' : 'This customer will be available for new invoices.'}</p>{mutation.isError && <Alert severity="error">Unable to update customer. {mutation.error?.message}</Alert>}</DialogContent><DialogActions><Button disabled={mutation.isPending} onClick={() => setConfirm(null)}>Cancel</Button><Button variant="contained" disabled={mutation.isPending} onClick={() => confirm && mutation.mutate(confirm, { onSuccess: () => { setNotice(`Customer ${confirm.status === 'active' ? 'deactivated' : 'activated'} successfully.`); setConfirm(null); } })}>{mutation.isPending ? 'Saving…' : confirm?.status === 'active' ? 'Deactivate' : 'Activate'}</Button></DialogActions></Dialog>
    <Snackbar open={!!notice} autoHideDuration={4000} onClose={() => setNotice('')}><Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert></Snackbar>
  </main>;
}
