# Complete Customer integration source
These are full files, not snippets. See INTEGRATION.md for contract limitations, configuration and testing instructions.

## Frontend/billing-react/src/features/customers/customerApi.ts
```typescript
import { apiClient } from 'billing-api-client';
import { customerPayload, customerQuery, mapCustomer, mapCustomerPage, unwrapCustomerResponse } from './customerContract';
import type { Customer, CustomerQueryParams, CustomerSummary } from './types';

const endpoint = '/api/v1/customers';
const config = { headers: { Accept: 'application/json' } };
// One-time cleanup of the obsolete Customer demo store only. Never read it as API data.
try { if (typeof localStorage !== 'undefined') localStorage.removeItem('ibms.customers.demo.v1'); } catch { /* Browser storage may be unavailable; backend requests still work. */ }
const customerPath = (id: string) => {
  if (!/^\d+$/.test(id) || Number(id) < 1) throw new Error('A valid backend customer ID is required.');
  return `${endpoint}/${encodeURIComponent(id)}`;
};
async function request<T>(operation: () => Promise<T>): Promise<T> {
  try { const result = await operation(); unwrapCustomerResponse(result); return result; }
  catch (error: any) {
    if (error?.response?.status === 401) throw new Error('Your session is missing or expired. Sign in and retry.');
    if (error?.response?.status === 403) throw new Error('Your account does not have access to these customer records.');
    if (error?.message === 'Network Error') throw new Error('Unable to reach the customer service. Check backend availability, your connection and the backend CORS configuration.');
    throw error;
  }
}
export async function getCustomers(params: CustomerQueryParams, signal?: AbortSignal) {
  const query = customerQuery(params);
  return request(async () => mapCustomerPage(await apiClient.get(endpoint, { ...config, params: query, signal }), params));
}
export async function getCustomerById(id: string, signal?: AbortSignal): Promise<Customer> {
  return request(async () => mapCustomer(await apiClient.get(customerPath(id), { ...config, signal })));
}
export async function getCustomerDetails(id: string, signal?: AbortSignal): Promise<Customer> {
  return request(async () => mapCustomer(await apiClient.get(`${customerPath(id)}/details`, { ...config, signal })));
}
export async function createCustomer(values: Partial<Customer>): Promise<void> {
  await request(() => apiClient.post(endpoint, customerPayload(values), config));
}
export async function updateCustomer(id: string, values: Partial<Customer>, original?: Customer): Promise<void> {
  const existing = original ?? await getCustomerById(id);
  await request(() => apiClient.put(customerPath(id), customerPayload(values, existing), config));
}
export async function deactivateCustomer(id: string): Promise<void> {
  await request(() => apiClient.patch(`${customerPath(id)}/deactivate`, undefined, config));
}
// Existing activation action uses documented PUT fields, not an invented PATCH endpoint.
export async function activateCustomer(id: string): Promise<void> {
  const existing = await getCustomerById(id);
  await request(() => apiClient.put(customerPath(id), { ...customerPayload({}, existing), status: 'Active', isActive: true }, config));
}
export async function deleteCustomer(id: string): Promise<void> {
  await request(() => apiClient.delete(customerPath(id), config));
}
export async function getCustomerSummary(signal?: AbortSignal): Promise<CustomerSummary> {
  const [all, active, inactive] = await Promise.all(['', 'active', 'inactive'].map(status => getCustomers({ page: 1, pageSize: 10, status }, signal)));
  // No aggregate financial endpoint is documented; a page sum is not a tenant total.
  return { total: all.totalCount, active: active.totalCount, inactive: inactive.totalCount, outstanding: null };
}

```

## Frontend/billing-react/src/features/customers/customerContract.ts
```typescript
import type { Customer, CustomerQueryParams, CustomerWriteRequest, PaginatedCustomerResponse } from './types';

export const customerCapabilities = {
  search: false, customerType: false, taxId: false, outstanding: false, sorting: false,
} as const;

const object = (value: unknown): Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const string = (value: unknown) => typeof value === 'string' ? value : '';
const amount = (value: unknown): number | null => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;

export function unwrapCustomerResponse(response: unknown): Record<string, any> {
  const envelope = object(response);
  if (envelope.success === false || envelope.isSuccess === false) throw new Error(string(envelope.message) || 'The customer request was rejected.');
  return Object.keys(object(envelope.data)).length ? object(envelope.data) : envelope;
}

export function customerQuery(params: CustomerQueryParams) {
  if (params.search || params.customerType || params.taxId || params.outstanding || params.sortBy) {
    throw new Error('Search, type/tax/outstanding filters and sorting are not supported by the current Customer API. Reset filters to load customers.');
  }
  if (!Number.isInteger(params.page) || params.page < 1 || ![10, 25, 50, 100].includes(params.pageSize)) throw new Error('Invalid customer page or page size.');
  if (params.status && !['active', 'inactive'].includes(params.status)) throw new Error('Invalid customer status filter.');
  return { pageNumber: params.page, pageSize: params.pageSize, status: params.status === 'active' ? 'Active' : params.status === 'inactive' ? 'Inactive' : 'All' };
}

/** Swagger omits response schemas. These defensive mappings require authenticated verification. */
export function mapCustomer(response: unknown): Customer {
  const data = unwrapCustomerResponse(response);
  const row = Object.keys(object(data.customer)).length ? object(data.customer) : Object.keys(object(data.profile)).length ? object(data.profile) : data;
  const id = row.id ?? row.customerId;
  if (id === undefined || id === null || !/^\d+$/.test(String(id)) || Number(id) < 1) throw new Error('Customer API response is missing a valid numeric id/customerId. Confirm the backend response contract.');
  const tax = string(row.taxId);
  const gst = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i.test(tax);
  const status = string(row.status).toLowerCase();
  return {
    id: String(id), customerCode: string(row.customerCode), name: string(row.name), companyName: string(row.companyName),
    email: string(row.email), mobile: string(row.phone), taxId: gst ? '' : tax, gstin: gst ? tax : '',
    customerType: ['individual', 'business', 'organization'].includes(string(row.customerType).toLowerCase()) ? row.customerType.toLowerCase() : '',
    currency: string(row.currency), outstandingBalance: amount(object(data.financialSummary).outstandingBalance ?? row.outstandingBalance),
    creditLimit: amount(row.creditLimit), paymentTerms: string(row.paymentTerms),
    status: typeof row.isActive === 'boolean' ? row.isActive ? 'active' : 'inactive' : status === 'active' || status === 'inactive' ? status : 'unknown',
    createdAt: string(row.createdAt), notes: string(row.notes), backend: { ...row, ...(Array.isArray(data.addresses) ? { addresses: data.addresses } : {}) },
  };
}

export function mapCustomerPage(response: unknown, params: CustomerQueryParams): PaginatedCustomerResponse {
  const data = unwrapCustomerResponse(response);
  if (!Array.isArray(data.items) || !Number.isInteger(data.totalCount) || data.totalCount < 0) {
    throw new Error('Customer API must return items and totalCount (optionally inside data). Its Swagger does not define a response schema; confirm the authenticated response.');
  }
  const page = data.pageNumber ?? params.page;
  const pageSize = data.pageSize ?? params.pageSize;
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1) throw new Error('Customer API returned invalid pagination metadata.');
  return { items: data.items.map(mapCustomer), page, pageSize, totalCount: data.totalCount, totalPages: Math.max(1, Math.ceil(data.totalCount / pageSize)) };
}

const preserved = ['customerCode', 'address', 'city', 'state', 'postalCode', 'country', 'website', 'addresses', 'rowVersion', 'status', 'isActive'] as const;
export function customerPayload(values: Partial<Customer>, existing?: Customer): CustomerWriteRequest {
  if (values.gstin && values.taxId && values.gstin !== values.taxId) throw new Error('The backend supports one Tax ID. Enter either GSTIN or PAN / Registration ID, not both.');
  const payload: Record<string, unknown> = {};
  if (existing) preserved.forEach(key => { if (existing.backend[key] !== undefined) payload[key] = existing.backend[key]; });
  for (const key of ['name', 'companyName', 'email', 'notes', 'currency', 'paymentTerms'] as const) {
    const value = values[key] ?? existing?.[key];
    if (value !== undefined) payload[key] = value;
  }
  if (values.mobile !== undefined) payload.phone = values.mobile;
  else if (existing) payload.phone = existing.mobile;
  if (values.gstin !== undefined || values.taxId !== undefined) payload.taxId = values.gstin || values.taxId || null;
  else if (existing) payload.taxId = existing.gstin || existing.taxId || null;
  return payload as CustomerWriteRequest;
}

```

## Frontend/billing-react/src/features/customers/types.ts
```typescript
export interface Customer {
  id: string; customerCode: string; customerType: 'individual' | 'business' | 'organization' | '';
  name: string; companyName: string; email: string; mobile: string; taxId: string; gstin: string;
  currency: string; outstandingBalance: number | null; creditLimit: number | null; paymentTerms: string;
  status: 'active' | 'inactive' | 'unknown'; createdAt: string; notes: string;
  backend: Record<string, unknown>;
}
export interface CustomerQueryParams {
  page: number; pageSize: number; search?: string; status?: string; customerType?: string;
  taxId?: string; outstanding?: string; sortBy?: string; sortOrder?: 'asc' | 'desc';
}
export interface PaginatedCustomerResponse {
  items: Customer[]; page: number; pageSize: number; totalCount: number; totalPages: number;
}
export interface CustomerSummary {
  total: number; active: number; inactive: number; outstanding: number | null;
}
/** Live Swagger DTO fields; unsupported UI fields must not be sent. */
export interface CustomerWriteRequest {
  customerCode?: string | null; name?: string | null; email?: string | null; phone?: string | null;
  companyName?: string | null; taxId?: string | null; address?: string | null; city?: string | null;
  state?: string | null; postalCode?: string | null; country?: string | null; website?: string | null;
  notes?: string | null; currency?: string | null; paymentTerms?: string | null; addresses?: unknown[] | null;
  status?: string | null; isActive?: boolean | null; rowVersion?: string | null;
}

```

## Frontend/billing-react/src/features/customers/useCustomers.ts
```typescript
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { activateCustomer, deactivateCustomer, getCustomers, getCustomerSummary } from './customerApi';
import type { Customer, CustomerQueryParams } from './types';
export const useCustomers = (params: CustomerQueryParams) => useQuery({ queryKey: ['customers', 'list', params], queryFn: ({ signal }) => getCustomers(params, signal), placeholderData: keepPreviousData, retry: false });
export const useCustomerSummary = () => useQuery({ queryKey: ['customers', 'summary'], queryFn: ({ signal }) => getCustomerSummary(signal), staleTime: 60000, retry: false });
export function useCustomerStatus() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (customer: Customer) => customer.status === 'active' ? deactivateCustomer(customer.id) : activateCustomer(customer.id),
    onSuccess: () => client.invalidateQueries({ queryKey: ['customers'] }) });
}

```

## Frontend/billing-react/src/features/customers/CustomerListPage.tsx
```tsx
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

```

## Frontend/billing-react/src/features/customers/CustomerRecordPage.tsx
```tsx
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Alert, Avatar, Button, MenuItem, Skeleton, TextField } from '@mui/material';
import { ArrowBack, EditOutlined, ReceiptLongOutlined, PersonOutline, BusinessOutlined, AccountBalanceWalletOutlined, DescriptionOutlined, CheckCircleOutline, MailOutline, PhoneOutlined } from '@mui/icons-material';
import { createCustomer, getCustomerById, getCustomerDetails, updateCustomer } from './customerApi';
import { money, StatusChip } from './CustomerListPage';
import type { Customer } from './types';

const schema = yup.object({
  name: yup.string().trim().required('Customer name is required'),
  customerType: yup.string().default(''),
  companyName: yup.string().trim().default(''), email: yup.string().trim().email('Enter a valid email').required('Email is required'),
  mobile: yup.string().matches(/^\+?[\d\s()-]{10,18}$/, 'Enter a valid phone number').required(),
  gstin: yup.string().uppercase().matches(/^([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])?$/, 'Enter a valid 15-character GSTIN').default(''),
  taxId: yup.string().trim().default(''), creditLimit: yup.number().transform((value, original) => original === '' ? 0 : value).min(0).typeError('Enter a valid amount').default(0),
  paymentTerms: yup.string().required().default('Net 30'), currency: yup.string().oneOf(['INR']).default('INR'), notes: yup.string().default(''),
});
type FormValues = yup.InferType<typeof schema>;
export function CustomerRecordPage({ mode }: { mode: 'new' | 'edit' | 'view' }) {
  const { customerId = '' } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['customers', mode === 'view' ? 'details' : 'detail', customerId], queryFn: ({ signal }) => mode === 'view' ? getCustomerDetails(customerId, signal) : getCustomerById(customerId, signal), enabled: mode !== 'new', retry: false });
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<FormValues>({ resolver: yupResolver(schema), defaultValues: { name: '', companyName: '', customerType: '', email: '', mobile: '', gstin: '', taxId: '', creditLimit: 0, paymentTerms: 'Net 30', currency: 'INR', notes: '' } });
  useEffect(() => { if (query.data) reset({ ...query.data, creditLimit: query.data.creditLimit ?? 0, currency: query.data.currency || 'INR', paymentTerms: query.data.paymentTerms || 'Net 30' }); }, [query.data, reset]);
  const mutation = useMutation({ mutationFn: (values: FormValues) => mode === 'new' ? createCustomer(values as Partial<Customer>) : updateCustomer(customerId, values as Partial<Customer>, query.data), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['customers'] }); navigate('/customers', { state: { customerNotice: mode === 'new' ? 'Customer created successfully.' : 'Customer updated successfully.' } }); } });
  if (mode !== 'new' && query.isLoading) return <main className="customers-page"><Skeleton height={100} /><Skeleton height={400} /></main>;
  if (mode !== 'new' && query.isError) return <main className="customers-page"><Link to="/customers">Back to customers</Link><Alert severity="error">{query.error.message}</Alert><Button onClick={() => query.refetch()}>Retry</Button></main>;
  const customer = query.data;
  const preview = mode === 'view' && customer ? customer : watch();
  const initials = (preview.name || 'New Customer').split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('');
  const field = (key: keyof FormValues, label: string, required = false, placeholder = '') => <TextField fullWidth size="small" disabled={key === 'creditLimit'} label={label} required={required} placeholder={placeholder} {...register(key)} error={!!errors[key]} helperText={errors[key]?.message || (key === 'creditLimit' ? 'Not supported by the current API' : undefined)} type={key === 'creditLimit' ? 'number' : key === 'email' ? 'email' : key === 'mobile' ? 'tel' : 'text'} InputLabelProps={{ shrink: true }} />;
  const details = (values: Record<string, string | undefined>) => <dl className="cr-details">{Object.entries(values).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not provided'}</dd></div>)}</dl>;
  const sectionTitle = (icon: ReactNode, title: string, subtitle: string) => <div className="cr-section-title"><span>{icon}</span><div><h2>{title}</h2><p>{subtitle}</p></div></div>;
  return <main className="customers-page customer-record-page">
    <nav className="customers-breadcrumb" aria-label="Breadcrumb"><Link to="/dashboard">Billing</Link><span>/</span><Link to="/customers">Customers</Link><span>/</span><strong>{mode === 'new' ? 'Add customer' : mode === 'edit' ? 'Edit customer' : 'Customer details'}</strong></nav>
    <header className="customers-heading"><div><span className="cr-eyebrow">CUSTOMER WORKSPACE</span><h1>{mode === 'new' ? 'Add a new customer' : mode === 'edit' ? 'Edit customer' : 'Customer overview'}</h1><p>{mode === 'view' ? 'Contact details, billing preferences and account information.' : 'A few details now. Smoother billing from here.'}</p></div><Button variant="outlined" startIcon={<ArrowBack />} onClick={() => navigate('/customers')}>Back to customers</Button></header>
    <div className="cr-layout">
      <aside className="cr-sidebar">
        <section className="customer-panel cr-profile">
          <div className="cr-profile-cover" /><Avatar className="cr-profile-avatar">{initials}</Avatar>
          <div className="cr-profile-copy"><span className="cr-eyebrow">{mode === 'new' ? 'NEW CUSTOMER' : customer?.customerCode}</span><h2>{preview.name || 'Your new customer'}</h2><p>{preview.companyName || 'Customer account'}</p><div className="cr-profile-badges"><span className="customer-type">{preview.customerType || 'Not provided'}</span>{customer && <StatusChip status={customer.status} />}</div></div>
          <div className="cr-profile-contact"><div><MailOutline /><span>{preview.email || 'Email address'}</span></div><div><PhoneOutlined /><span>{preview.mobile || 'Mobile number'}</span></div></div>
          {mode === 'view' && customer && <div className="cr-profile-actions"><Button fullWidth variant="contained" startIcon={<ReceiptLongOutlined />} disabled={customer.status !== 'active'} onClick={() => navigate(`/invoices/new?customerId=${customerId}`)}>Create Invoice</Button><Button fullWidth variant="outlined" startIcon={<EditOutlined />} onClick={() => navigate(`/customers/${customerId}/edit`)}>Edit Customer</Button></div>}
        </section>
        <section className="cr-help"><CheckCircleOutline /><div><h3>{mode === 'view' ? 'A complete customer record' : 'Good details. Better billing.'}</h3><p>{mode === 'view' ? 'Keep contact and tax information current for accurate invoices.' : 'Use the billing contact’s email and registered tax details to keep invoices accurate.'}</p>{mode === 'new' && <small>Customer codes are managed by the billing service.</small>}</div></section>
      </aside>
      {mode === 'view' && customer ? <div className="cr-content">
        <section className="cr-account-stats" aria-label="Account summary"><article><span>Outstanding balance</span><strong className={(customer.outstandingBalance ?? 0) > 0 ? 'due' : ''}>{money(customer.outstandingBalance)}</strong><small>{customer.outstandingBalance == null ? 'Not provided by the API' : customer.outstandingBalance > 0 ? 'Pending collection' : 'No balance outstanding'}</small></article><article><span>Credit limit</span><strong>{money(customer.creditLimit)}</strong><small>Approved account limit</small></article><article><span>Payment terms</span><strong>{customer.paymentTerms || 'Not set'}</strong><small>Billed in {customer.currency}</small></article></section>
        <section className="customer-panel cr-section">{sectionTitle(<PersonOutline />, 'Contact information', 'The people and business behind this account.')}{details({ 'Customer name': customer.name, 'Company name': customer.companyName, 'Email address': customer.email, 'Mobile number': customer.mobile })}</section>
        <section className="customer-panel cr-section">{sectionTitle(<BusinessOutlined />, 'Tax & registration', 'Registered details for accurate billing.')}{details({ 'GSTIN': customer.gstin, 'PAN / Registration ID': customer.taxId, 'Customer type': customer.customerType, 'Currency': customer.currency })}</section>
        <section className="customer-panel cr-section">{sectionTitle(<DescriptionOutlined />, 'Account notes', 'Additional context for your billing team.')}<p className="cr-notes">{customer.notes || 'No notes added for this customer yet.'}</p></section>
      </div> : <form className="cr-content" onSubmit={handleSubmit(values => mutation.mutate(values))} noValidate>
        <section className="customer-panel cr-section">{sectionTitle(<PersonOutline />, 'Basic information', 'Start with your customer’s contact details.')}<div className="cr-fields">{field('name', 'Customer name', true, 'e.g. Priya Sharma')}{field('companyName', 'Company name', false, 'e.g. Acme Technologies Pvt Ltd')}<TextField disabled helperText="Not supported by the current API" select size="small" label="Customer type" value={watch('customerType')} {...register('customerType')}><MenuItem value="">Not provided</MenuItem>{['business', 'individual', 'organization'].map(value => <MenuItem key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</MenuItem>)}</TextField>{field('email', 'Email address', true, 'name@company.com')}{field('mobile', 'Mobile number', true, '+91 98765 43210')}</div></section>
        <section className="customer-panel cr-section">{sectionTitle(<BusinessOutlined />, 'Tax & registration', 'Add applicable tax details for customer invoices.')}<div className="cr-fields">{field('gstin', 'GSTIN', false, '15-character GST number')}{field('taxId', 'PAN / Registration ID', false, 'Enter tax or registration ID')}</div></section>
        <section className="customer-panel cr-section">{sectionTitle(<AccountBalanceWalletOutlined />, 'Billing preferences', 'Set the default terms for this customer.')}<div className="cr-fields">{field('creditLimit', 'Credit limit (INR)')}<TextField select size="small" label="Payment terms" value={watch('paymentTerms')} {...register('paymentTerms')}>{['Due on receipt', 'Net 15', 'Net 30', 'Net 60'].map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField><TextField size="small" label="Currency" value="INR — Indian Rupee" InputProps={{ readOnly: true }} /></div></section>
        <section className="customer-panel cr-section">{sectionTitle(<DescriptionOutlined />, 'Additional notes', 'Useful context for your team. Optional.')}<div className="cr-fields"><TextField className="customer-form-notes" fullWidth label="Notes" placeholder="Add billing instructions or other customer details…" multiline rows={3} {...register('notes')} InputLabelProps={{ shrink: true }} /></div></section>
        {mutation.isError && <Alert severity="error">Unable to save customer. {mutation.error.message}</Alert>}
        <div className="cr-save-bar"><span><CheckCircleOutline />{mode === 'new' ? 'Ready to start a new relationship' : 'Keep your customer details up to date'}</span><div><Button disabled={mutation.isPending} onClick={() => navigate('/customers')}>Cancel</Button><Button variant="contained" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : mode === 'new' ? 'Add Customer' : 'Save Changes'}</Button></div></div>
      </form>}
    </div>
  </main>;
}

```

## Frontend/billing-react/src/features/customers/customerApi.test.mjs
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { customerPayload, customerQuery, mapCustomer, mapCustomerPage, unwrapCustomerResponse } from './customerContract.ts';

// Synthetic contract fixtures only; these are never imported by the application.
const record = { id: 7, customerCode: 'TEST-7', name: 'Contract Test', phone: '9000000000', email: 'contract@example.invalid', taxId: '29ABCDE1234F1Z5', isActive: true };
const params = { page: 2, pageSize: 10 };

test('uses only Swagger pagination and status parameters', () => {
  assert.deepEqual(customerQuery({ ...params, status: 'inactive' }), { pageNumber: 2, pageSize: 10, status: 'Inactive' });
  assert.equal(customerQuery(params).status, 'All');
  for (const unsupported of ['search', 'customerType', 'taxId', 'outstanding', 'sortBy']) {
    assert.throws(() => customerQuery({ ...params, [unsupported]: 'value' }), /not supported/);
  }
  assert.throws(() => customerQuery({ page: -1, pageSize: 10 }), /Invalid/);
});

test('maps wrapped server pages without slicing, sorting or inventing totals', () => {
  const result = mapCustomerPage({ data: { items: [record], totalCount: 31, pageNumber: 2, pageSize: 10 } }, params);
  assert.equal(result.totalPages, 4);
  assert.equal(result.page, 2);
  assert.equal(result.items[0].id, '7');
  assert.equal(result.items[0].mobile, record.phone);
  assert.equal(result.items[0].gstin, record.taxId);
  assert.equal(result.items[0].status, 'active');
  assert.equal(result.items[0].outstandingBalance, null);
  assert.equal(result.items[0].customerType, '');
  assert.throws(() => mapCustomerPage([record], params), /totalCount/);
  assert.throws(() => mapCustomerPage({ items: [record] }, params), /totalCount/);
  assert.throws(() => mapCustomer({ name: 'Missing ID' }), /valid numeric/);
  assert.equal(mapCustomerPage({ items: [], totalCount: 0 }, params).items.length, 0);
});

test('does not invent status or financial values and reads detail envelopes', () => {
  const result = mapCustomer({ data: { profile: { id: 8, taxId: 'ABCDE1234F' }, financialSummary: { outstandingBalance: 25 } } });
  assert.equal(result.status, 'unknown');
  assert.equal(result.taxId, 'ABCDE1234F');
  assert.equal(result.outstandingBalance, 25);
  assert.equal(result.creditLimit, null);
  assert.throws(() => unwrapCustomerResponse({ success: false, message: 'Rejected' }), /Rejected/);
});

test('POST/PUT DTO maps phone and tax, excludes unsupported fields, preserves addresses and concurrency', () => {
  const existing = mapCustomer({ ...record, addresses: [{ id: 12, addressLine1: 'Existing address' }], rowVersion: '2026-09-09T00:00:00Z', city: 'Existing city' });
  const update = customerPayload({ name: 'Edited', mobile: '9111111111', gstin: '', taxId: 'ABCDE1234F', customerType: 'business', creditLimit: 20 }, existing);
  assert.equal(update.phone, '9111111111');
  assert.equal(update.taxId, 'ABCDE1234F');
  assert.deepEqual(update.addresses, existing.backend.addresses);
  assert.equal(update.rowVersion, existing.backend.rowVersion);
  assert.equal(update.customerCode, 'TEST-7');
  assert.ok(!('creditLimit' in update));
  assert.ok(!('customerType' in update));
  assert.ok(!('mobile' in update));
  const create = customerPayload({ name: 'New', mobile: '9222222222', gstin: record.taxId });
  assert.ok(!('rowVersion' in create));
  assert.ok(!('customerCode' in create));
  assert.throws(() => customerPayload({ gstin: record.taxId, taxId: 'ABCDE1234F' }), /one Tax ID/);
});

```

## Frontend/billing-react/src/features/customers/backend-contract.json
```json
{
    "source":  "https://pediatric-astrology-outrank.ngrok-free.dev/swagger/v1/swagger.json",
    "inspectedAt":  "2026-09-09",
    "paths":  {
                  "/api/v1/customers":  {
                                            "post":  {
                                                         "tags":  [
                                                                      "Customers"
                                                                  ],
                                                         "summary":  "Create a new customer record scoped to current tenant.",
                                                         "requestBody":  {
                                                                             "content":  {
                                                                                             "application/json":  {
                                                                                                                      "schema":  {
                                                                                                                                     "$ref":  "#/components/schemas/CreateCustomerRequest"
                                                                                                                                 }
                                                                                                                  }
                                                                                         }
                                                                         },
                                                         "responses":  {
                                                                           "200":  {
                                                                                       "description":  "OK"
                                                                                   }
                                                                       }
                                                     },
                                            "get":  {
                                                        "tags":  [
                                                                     "Customers"
                                                                 ],
                                                        "summary":  "Retrieve a paginated list of customers.",
                                                        "parameters":  [
                                                                           {
                                                                               "name":  "pageNumber",
                                                                               "in":  "query",
                                                                               "schema":  {
                                                                                              "type":  "integer",
                                                                                              "format":  "int32",
                                                                                              "default":  1
                                                                                          }
                                                                           },
                                                                           {
                                                                               "name":  "pageSize",
                                                                               "in":  "query",
                                                                               "schema":  {
                                                                                              "type":  "integer",
                                                                                              "format":  "int32",
                                                                                              "default":  10
                                                                                          }
                                                                           },
                                                                           {
                                                                               "name":  "status",
                                                                               "in":  "query",
                                                                               "schema":  {
                                                                                              "$ref":  "#/components/schemas/CustomerStatus"
                                                                                          }
                                                                           }
                                                                       ],
                                                        "responses":  {
                                                                          "200":  {
                                                                                      "description":  "OK"
                                                                                  }
                                                                      }
                                                    }
                                        },
                  "/api/v1/customers/{id}":  {
                                                 "get":  {
                                                             "tags":  [
                                                                          "Customers"
                                                                      ],
                                                             "summary":  "Retrieve customer details and profile by customer ID.",
                                                             "parameters":  [
                                                                                {
                                                                                    "name":  "id",
                                                                                    "in":  "path",
                                                                                    "required":  true,
                                                                                    "schema":  {
                                                                                                   "type":  "integer",
                                                                                                   "format":  "int32"
                                                                                               }
                                                                                }
                                                                            ],
                                                             "responses":  {
                                                                               "200":  {
                                                                                           "description":  "OK"
                                                                                       }
                                                                           }
                                                         },
                                                 "put":  {
                                                             "tags":  [
                                                                          "Customers"
                                                                      ],
                                                             "summary":  "Update existing customer profile information.",
                                                             "parameters":  [
                                                                                {
                                                                                    "name":  "id",
                                                                                    "in":  "path",
                                                                                    "required":  true,
                                                                                    "schema":  {
                                                                                                   "type":  "integer",
                                                                                                   "format":  "int32"
                                                                                               }
                                                                                }
                                                                            ],
                                                             "requestBody":  {
                                                                                 "content":  {
                                                                                                 "application/json":  {
                                                                                                                          "schema":  {
                                                                                                                                         "$ref":  "#/components/schemas/UpdateCustomerRequest"
                                                                                                                                     }
                                                                                                                      }
                                                                                             }
                                                                             },
                                                             "responses":  {
                                                                               "200":  {
                                                                                           "description":  "OK"
                                                                                       }
                                                                           }
                                                         },
                                                 "delete":  {
                                                                "tags":  [
                                                                             "Customers"
                                                                         ],
                                                                "summary":  "Deactivate customer record to preserve business and transaction history.",
                                                                "parameters":  [
                                                                                   {
                                                                                       "name":  "id",
                                                                                       "in":  "path",
                                                                                       "required":  true,
                                                                                       "schema":  {
                                                                                                      "type":  "integer",
                                                                                                      "format":  "int32"
                                                                                                  }
                                                                                   }
                                                                               ],
                                                                "responses":  {
                                                                                  "200":  {
                                                                                              "description":  "OK"
                                                                                          }
                                                                              }
                                                            }
                                             },
                  "/api/v1/customers/{id}/deactivate":  {
                                                            "patch":  {
                                                                          "tags":  [
                                                                                       "Customers"
                                                                                   ],
                                                                          "summary":  "Deactivate customer record without physical deletion.",
                                                                          "parameters":  [
                                                                                             {
                                                                                                 "name":  "id",
                                                                                                 "in":  "path",
                                                                                                 "required":  true,
                                                                                                 "schema":  {
                                                                                                                "type":  "integer",
                                                                                                                "format":  "int32"
                                                                                                            }
                                                                                             }
                                                                                         ],
                                                                          "responses":  {
                                                                                            "200":  {
                                                                                                        "description":  "OK"
                                                                                                    }
                                                                                        }
                                                                      }
                                                        },
                  "/api/v1/customers/{id}/audit":  {
                                                       "get":  {
                                                                   "tags":  [
                                                                                "Customers"
                                                                            ],
                                                                   "summary":  "Retrieve customer audit trail history displaying user, action, timestamp, and changes.",
                                                                   "parameters":  [
                                                                                      {
                                                                                          "name":  "id",
                                                                                          "in":  "path",
                                                                                          "required":  true,
                                                                                          "schema":  {
                                                                                                         "type":  "integer",
                                                                                                         "format":  "int32"
                                                                                                     }
                                                                                      }
                                                                                  ],
                                                                   "responses":  {
                                                                                     "200":  {
                                                                                                 "description":  "OK"
                                                                                             }
                                                                                 }
                                                               }
                                                   },
                  "/api/v1/customers/{id}/details":  {
                                                         "get":  {
                                                                     "tags":  [
                                                                                  "Customers"
                                                                              ],
                                                                     "summary":  "Retrieve customer details with supporting information (profile, billing/shipping addresses, financial summary).",
                                                                     "parameters":  [
                                                                                        {
                                                                                            "name":  "id",
                                                                                            "in":  "path",
                                                                                            "required":  true,
                                                                                            "schema":  {
                                                                                                           "type":  "integer",
                                                                                                           "format":  "int32"
                                                                                                       }
                                                                                        }
                                                                                    ],
                                                                     "responses":  {
                                                                                       "200":  {
                                                                                                   "description":  "OK"
                                                                                               }
                                                                                   }
                                                                 }
                                                     }
              },
    "schemas":  {
                    "CreateCustomerRequest":  {
                                                  "type":  "object",
                                                  "properties":  {
                                                                     "customerCode":  {
                                                                                          "type":  "string",
                                                                                          "nullable":  true
                                                                                      },
                                                                     "name":  {
                                                                                  "type":  "string",
                                                                                  "nullable":  true
                                                                              },
                                                                     "email":  {
                                                                                   "type":  "string",
                                                                                   "nullable":  true
                                                                               },
                                                                     "phone":  {
                                                                                   "type":  "string",
                                                                                   "nullable":  true
                                                                               },
                                                                     "companyName":  {
                                                                                         "type":  "string",
                                                                                         "nullable":  true
                                                                                     },
                                                                     "taxId":  {
                                                                                   "type":  "string",
                                                                                   "nullable":  true
                                                                               },
                                                                     "address":  {
                                                                                     "type":  "string",
                                                                                     "nullable":  true
                                                                                 },
                                                                     "city":  {
                                                                                  "type":  "string",
                                                                                  "nullable":  true
                                                                              },
                                                                     "state":  {
                                                                                   "type":  "string",
                                                                                   "nullable":  true
                                                                               },
                                                                     "postalCode":  {
                                                                                        "type":  "string",
                                                                                        "nullable":  true
                                                                                    },
                                                                     "country":  {
                                                                                     "type":  "string",
                                                                                     "nullable":  true
                                                                                 },
                                                                     "website":  {
                                                                                     "type":  "string",
                                                                                     "nullable":  true
                                                                                 },
                                                                     "notes":  {
                                                                                   "type":  "string",
                                                                                   "nullable":  true
                                                                               },
                                                                     "currency":  {
                                                                                      "type":  "string",
                                                                                      "nullable":  true
                                                                                  },
                                                                     "paymentTerms":  {
                                                                                          "type":  "string",
                                                                                          "nullable":  true
                                                                                      },
                                                                     "addresses":  {
                                                                                       "type":  "array",
                                                                                       "items":  {
                                                                                                     "$ref":  "#/components/schemas/CustomerAddressDto"
                                                                                                 },
                                                                                       "nullable":  true
                                                                                   }
                                                                 },
                                                  "additionalProperties":  false
                                              },
                    "CustomerAddressDto":  {
                                               "type":  "object",
                                               "properties":  {
                                                                  "id":  {
                                                                             "type":  "integer",
                                                                             "format":  "int32",
                                                                             "nullable":  true
                                                                         },
                                                                  "addressType":  {
                                                                                      "type":  "string",
                                                                                      "nullable":  true
                                                                                  },
                                                                  "addressLine1":  {
                                                                                       "type":  "string",
                                                                                       "nullable":  true
                                                                                   },
                                                                  "addressLine2":  {
                                                                                       "type":  "string",
                                                                                       "nullable":  true
                                                                                   },
                                                                  "city":  {
                                                                               "type":  "string",
                                                                               "nullable":  true
                                                                           },
                                                                  "state":  {
                                                                                "type":  "string",
                                                                                "nullable":  true
                                                                            },
                                                                  "postalCode":  {
                                                                                     "type":  "string",
                                                                                     "nullable":  true
                                                                                 },
                                                                  "country":  {
                                                                                  "type":  "string",
                                                                                  "nullable":  true
                                                                              },
                                                                  "isDefault":  {
                                                                                    "type":  "boolean"
                                                                                }
                                                              },
                                               "additionalProperties":  false
                                           },
                    "CustomerStatus":  {
                                           "enum":  [
                                                        "Active",
                                                        "Inactive",
                                                        "All"
                                                    ],
                                           "type":  "string"
                                       },
                    "UpdateCustomerRequest":  {
                                                  "type":  "object",
                                                  "properties":  {
                                                                     "customerCode":  {
                                                                                          "type":  "string",
                                                                                          "nullable":  true
                                                                                      },
                                                                     "name":  {
                                                                                  "type":  "string",
                                                                                  "nullable":  true
                                                                              },
                                                                     "email":  {
                                                                                   "type":  "string",
                                                                                   "nullable":  true
                                                                               },
                                                                     "phone":  {
                                                                                   "type":  "string",
                                                                                   "nullable":  true
                                                                               },
                                                                     "companyName":  {
                                                                                         "type":  "string",
                                                                                         "nullable":  true
                                                                                     },
                                                                     "taxId":  {
                                                                                   "type":  "string",
                                                                                   "nullable":  true
                                                                               },
                                                                     "address":  {
                                                                                     "type":  "string",
                                                                                     "nullable":  true
                                                                                 },
                                                                     "city":  {
                                                                                  "type":  "string",
                                                                                  "nullable":  true
                                                                              },
                                                                     "state":  {
                                                                                   "type":  "string",
                                                                                   "nullable":  true
                                                                               },
                                                                     "postalCode":  {
                                                                                        "type":  "string",
                                                                                        "nullable":  true
                                                                                    },
                                                                     "country":  {
                                                                                     "type":  "string",
                                                                                     "nullable":  true
                                                                                 },
                                                                     "website":  {
                                                                                     "type":  "string",
                                                                                     "nullable":  true
                                                                                 },
                                                                     "notes":  {
                                                                                   "type":  "string",
                                                                                   "nullable":  true
                                                                               },
                                                                     "currency":  {
                                                                                      "type":  "string",
                                                                                      "nullable":  true
                                                                                  },
                                                                     "paymentTerms":  {
                                                                                          "type":  "string",
                                                                                          "nullable":  true
                                                                                      },
                                                                     "status":  {
                                                                                    "type":  "string",
                                                                                    "nullable":  true
                                                                                },
                                                                     "isActive":  {
                                                                                      "type":  "boolean",
                                                                                      "nullable":  true
                                                                                  },
                                                                     "rowVersion":  {
                                                                                        "type":  "string",
                                                                                        "format":  "date-time",
                                                                                        "nullable":  true
                                                                                    },
                                                                     "addresses":  {
                                                                                       "type":  "array",
                                                                                       "items":  {
                                                                                                     "$ref":  "#/components/schemas/CustomerAddressDto"
                                                                                                 },
                                                                                       "nullable":  true
                                                                                   }
                                                                 },
                                                  "additionalProperties":  false
                                              }
                }
}

```
