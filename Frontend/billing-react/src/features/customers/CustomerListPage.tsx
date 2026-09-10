import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Avatar, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, LinearProgress, Tooltip, MenuItem, Pagination, Skeleton, Snackbar, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, TextField } from '@mui/material';
import { Add, CheckCircleOutline, GroupOutlined, VisibilityOutlined, EditOutlined, ReceiptLongOutlined, PersonOffOutlined, Search, AccountBalanceWalletOutlined } from '@mui/icons-material';
import { useCustomers, useCustomerStatus, useCustomerSummary } from './useCustomers';
import type { Customer, CustomerQueryParams } from './types';
import { customerCapabilities } from './customerContract';
import { DashboardErrorState } from '../../components/dashboard/DashboardStates';
import './customers.css';

export const money = (value: number | null | undefined) => value == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
export const StatusChip = ({ status }: { status: string }) => <span className={`customer-status ${status}`}><i />{status}</span>;
const moneyWithCurrency = (value: number | null | undefined, currency = 'USD') => value == null ? money(value) : new Intl.NumberFormat('en-IN', { style: 'currency', currency: /^[A-Z]{3}$/i.test(currency) ? currency.toUpperCase() : 'USD', maximumFractionDigits: 2 }).format(value);
const filterOptions = {
  status: { label: 'Customer status', values: [['active', 'Active'], ['inactive', 'Inactive']] },
  customerType: { label: 'Customer type', values: [['Individual', 'Individual'], ['Business', 'Business']] },
  taxRegistration: { label: 'Tax registration', values: [['Registered', 'Registered'], ['Unregistered', 'Unregistered']] },
  outstanding: { label: 'Outstanding', values: [['Has Outstanding', 'Has Outstanding'], ['No Outstanding', 'No Outstanding']] },
};
const columns = [['customerCode', 'Customer code'], ['name', 'Customer'], ['customerType', 'Type'], ['', 'Tax ID / GSTIN'], ['', 'Contact'], ['outstandingBalance', 'Outstanding'], ['status', 'Status'], ['', 'Actions']];
export function CustomerListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const summaryQuery = useCustomerSummary();
  const [url, setUrl] = useSearchParams();
  const params: CustomerQueryParams = { page: Math.max(1, Number(url.get('page')) || 1), pageSize: [10, 25, 50, 100].includes(Number(url.get('pageSize'))) ? Number(url.get('pageSize')) : 10,
    taxId: url.get('taxId') || '', search: url.get('search') || '', sortBy: url.get('sortBy') || '', sortOrder: url.get('sortOrder') === 'desc' ? 'desc' : 'asc',
    ...Object.fromEntries(Object.entries(filterOptions).map(([key, option]) => [key, option.values.some(([value]) => value === url.get(key)) ? url.get(key) : ''])) };
  const [search, setSearch] = useState(params.search);
  const [taxId, setTaxId] = useState(params.taxId);
  const change = (values: Record<string, string | number>) => setUrl(previous => { const next = new URLSearchParams(previous); Object.entries(values).forEach(([key, value]) => value ? next.set(key, String(value)) : next.delete(key)); return next; }, { replace: true });
  useEffect(() => { setSearch(params.search); }, [params.search]);
  useEffect(() => { if (search === params.search) return; const timer = setTimeout(() => change({ search: search || '', page: 1 }), 450); return () => clearTimeout(timer); }, [search, params.search]);
  useEffect(() => { setTaxId(params.taxId); }, [params.taxId]);
  useEffect(() => { if (taxId === params.taxId) return; const timer = setTimeout(() => change({ taxId: taxId || '', page: 1 }), 450); return () => clearTimeout(timer); }, [taxId, params.taxId]);
  const query = useCustomers(params);
  const mutation = useCustomerStatus();
  const [confirm, setConfirm] = useState<Customer | null>(null);
  const [notice, setNotice] = useState(location.state?.customerNotice || '');
  useEffect(() => { if (location.state?.customerNotice) navigate(location.pathname + location.search, { replace: true, state: null }); }, [location.state, location.pathname, location.search, navigate]);
  const data = query.data;
  const reset = () => { setSearch(''); setTaxId(''); setUrl({}); };
  const filtered = !!params.taxId || !!params.sortBy || !!params.search || Object.keys(filterOptions).some(key => !!params[key as keyof CustomerQueryParams]);
  return <main className="customers-page">
    <nav className="customers-breadcrumb" aria-label="Breadcrumb"><strong aria-current="page">Customers</strong></nav>
    <header className="customers-heading"><div><h1>Customer Management</h1><p>Manage customers, billing information, tax details and outstanding balances.</p></div><Button variant="contained" startIcon={<Add />} onClick={() => navigate('/customers/create')}>Add Customer</Button></header>
    <section className="customer-stats" aria-label="Customer summary">{[
      { label: 'Total Customers', value: summaryQuery.data?.total, text: 'Your customer network', icon: <GroupOutlined />, tone: 'brown' },
      { label: 'Active Customers', value: summaryQuery.data?.active, text: 'Ready for new invoices', icon: <CheckCircleOutline />, tone: 'green' },
      { label: 'Inactive Customers', value: summaryQuery.data?.inactive, text: 'History safely retained', icon: <PersonOffOutlined />, tone: 'gray' },
      { label: 'Total Outstanding', value: summaryQuery.data ? moneyWithCurrency(summaryQuery.data.outstanding, summaryQuery.data.currency) : undefined, text: 'Across all customers', icon: <AccountBalanceWalletOutlined />, tone: 'orange' },
    ].map(stat => <article key={stat.label} className={`customer-stat ${stat.tone}`}><div className="customer-stat-top"><span>{stat.label}</span><span className="customer-stat-icon">{stat.icon}</span></div><strong>{summaryQuery.isLoading ? <Skeleton width="60%" /> : stat.value ?? '—'}</strong><small>{stat.text}</small></article>)}</section>
    {summaryQuery.isError && !query.isError && <DashboardErrorState title="Unable to load customer summary" message={summaryQuery.error.message} onRetry={() => summaryQuery.refetch()} />}
    <section className="customer-panel">
      <div className="customer-panel-heading"><div><h2>Customer directory <span>{data?.totalCount ?? '—'}</span></h2><p>All your customer relationships, in one place.</p></div></div>
      <div className="customer-filters"><TextField disabled={!customerCapabilities.search} className="customer-search" size="small" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by name, code, email, mobile or tax ID…" inputProps={{ 'aria-label': 'Search customers' }} InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }} />
        <div className="customer-filter-row">{Object.entries(filterOptions).map(([key, option]) => <TextField select size="small" label={option.label} key={key} InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }} value={params[key as keyof CustomerQueryParams] || ''} onChange={event => change({ [key]: event.target.value, page: 1 })}><MenuItem value="">All</MenuItem>{option.values.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>)}<TextField size="small" label="Tax ID / GST / VAT ID" value={taxId} onChange={event => setTaxId(event.target.value)} /><Button onClick={reset} disabled={!filtered && !search && !taxId && !url.toString()}>Reset filters</Button></div>
        {filtered && <div className="customer-filter-chips">{params.taxId && <Chip size="small" label={`Tax ID: ${params.taxId}`} onDelete={() => { setTaxId(''); change({ taxId: '', page: 1 }); }} />}{params.search && <Chip size="small" label={`Search: ${params.search}`} onDelete={() => { setSearch(''); change({ search: '', page: 1 }); }} />}{Object.entries(filterOptions).filter(([key]) => params[key as keyof CustomerQueryParams]).map(([key, option]) => <Chip key={key} size="small" label={`${option.label}: ${option.values.find(([v]) => v === params[key as keyof CustomerQueryParams])?.[1]}`} onDelete={() => change({ [key]: '', page: 1 })} />)}</div>}
      </div>
      <div className="customer-progress">{query.isFetching && <LinearProgress />}</div>
      {query.isError ? <DashboardErrorState title="Unable to load customers" message={query.error.message} onRetry={() => { query.refetch(); if (summaryQuery.isError) summaryQuery.refetch(); }} /> : query.isLoading ? <div className="customer-skeleton">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} height={65} />)}</div> : !data?.items.length ? <div className="customer-empty"><GroupOutlined /><h2>{filtered ? 'No matching customers' : 'No customers yet'}</h2><p>{filtered ? 'No customers match your current search or filters.' : 'Add your first customer to start billing.'}</p><Button variant="outlined" onClick={() => filtered ? reset() : navigate('/customers/create')}>{filtered ? 'Clear Filters' : 'Add Customer'}</Button></div> : <>
      <TableContainer className="customer-table"><Table size="small" aria-label="Customer directory"><TableHead><TableRow>{columns.map(([key, label], index) => <TableCell key={index} align={key === 'outstandingBalance' ? 'right' : 'left'}>{['customerCode', 'name'].includes(key) ? <TableSortLabel disabled={!customerCapabilities.sorting} active={!!params.sortBy && params.sortBy === key} direction={params.sortBy === key ? params.sortOrder : 'asc'} onClick={() => customerCapabilities.sorting && change({ sortBy: key, sortOrder: params.sortBy === key && params.sortOrder === 'asc' ? 'desc' : 'asc', page: 1 })}>{label}</TableSortLabel> : label || <span className="customer-sr-only">Actions</span>}</TableCell>)}</TableRow></TableHead><TableBody>{data.items.map(customer => <TableRow key={customer.id} hover>
        <TableCell data-label="Code"><span className="customer-code">{customer.customerCode}</span></TableCell>
        <TableCell data-label="Customer"><div className="customer-identity"><Avatar className={`customer-avatar tone-${Number(customer.customerCode.slice(-1)) % 3}`}>{customer.name.split(' ').slice(0, 2).map(n => n[0]).join('')}</Avatar><div><Link to={`/customers/${customer.id}`}>{customer.name}</Link><small>{customer.companyName || '—'}</small></div></div></TableCell>
        <TableCell data-label="Type"><span className="customer-type">{customer.customerType || '—'}</span></TableCell>
        <TableCell data-label="Tax ID"><div className="customer-tax"><small>{customer.gstin ? 'GSTIN' : customer.taxId ? 'PAN / Tax ID' : 'Not registered'}</small>{customer.gstin || customer.taxId || '—'}</div></TableCell>
        <TableCell data-label="Contact"><div className="customer-contact"><a href={`mailto:${customer.email}`}>{customer.email}</a><small>{customer.mobile}</small></div></TableCell>
        <TableCell data-label="Outstanding" align="right"><strong className={(customer.outstandingBalance ?? 0) > 0 ? 'customer-balance due' : 'customer-balance'}>{moneyWithCurrency(customer.outstandingBalance, customer.currency)}</strong></TableCell>
        <TableCell data-label="Status"><StatusChip status={customer.status} /></TableCell>
        <TableCell data-label="Actions"><div className="customer-row-actions" role="group" aria-label={`Actions for ${customer.name}`}>
          <Tooltip title="View details"><IconButton className="action-view" size="small" aria-label={`View ${customer.name}`} onClick={() => navigate(`/customers/${customer.id}`)}><VisibilityOutlined /></IconButton></Tooltip>
          <Tooltip title="Edit customer"><IconButton className="action-edit" size="small" aria-label={`Edit ${customer.name}`} onClick={() => navigate(`/customers/${customer.id}/edit`)}><EditOutlined /></IconButton></Tooltip>
          <Tooltip title={customer.status === 'inactive' ? 'Inactive customers cannot receive new invoices' : 'Create invoice'}><span><IconButton className="action-invoice" size="small" disabled={customer.status !== 'active'} aria-label={`Create invoice for ${customer.name}`} onClick={() => navigate(`/invoices/new?customerId=${customer.id}`)}><ReceiptLongOutlined /></IconButton></span></Tooltip>
          {customer.status === 'active' && <Tooltip title="Deactivate customer"><IconButton className="action-deactivate" size="small" aria-label={`Deactivate ${customer.name}`} onClick={() => { mutation.reset(); setConfirm(customer); }}><PersonOffOutlined /></IconButton></Tooltip>}
        </div></TableCell>
      </TableRow>)}</TableBody></Table></TableContainer>
      <footer className="customer-pagination"><div><span>Rows per page</span><TextField select size="small" value={params.pageSize} inputProps={{ 'aria-label': 'Rows per page' }} onChange={event => change({ pageSize: event.target.value, page: 1 })}>{[10, 25, 50, 100].map(n => <MenuItem key={n} value={n}>{n}</MenuItem>)}</TextField><span>{(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.totalCount)} of {data.totalCount}</span></div><Pagination size="small" count={data.totalPages} page={data.page} onChange={(_, page) => change({ page })} disabled={query.isPlaceholderData} shape="rounded" color="primary" /></footer>
      </>}
    </section>
    <Dialog open={!!confirm} onClose={() => !mutation.isPending && setConfirm(null)} fullWidth maxWidth="xs"><DialogTitle>Deactivate Customer</DialogTitle><DialogContent><p>Are you sure you want to deactivate “{confirm?.name}”?</p><p className="customer-dialog-note">Inactive customers cannot be selected for new invoices. Existing transaction history will be retained.</p>{mutation.isError && <Alert severity="error">Unable to update customer. {mutation.error?.message}</Alert>}</DialogContent><DialogActions><Button disabled={mutation.isPending} onClick={() => setConfirm(null)}>Cancel</Button><Button variant="contained" disabled={mutation.isPending} onClick={() => confirm && mutation.mutate(confirm, { onSuccess: () => { setNotice(`Customer deactivated successfully.`); setConfirm(null); } })}>{mutation.isPending ? 'Saving…' : 'Deactivate'}</Button></DialogActions></Dialog>
    <Snackbar open={!!notice} autoHideDuration={4000} onClose={() => setNotice('')}><Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert></Snackbar>
  </main>;
}
