import { displayDate } from '../../utils/localDate';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from 'billing-api-client';
import { Add, PaymentsOutlined, PersonAddAlt, Inventory2Outlined, AssignmentReturnOutlined, ArrowForward } from '@mui/icons-material';
import { DashboardHeader } from '../../components/dashboard/DashboardHeader';
import { DashboardFilters } from '../../components/dashboard/DashboardFilters';
import { StatCard } from '../../components/dashboard/StatCard';
import { RevenueChart, OutstandingAging } from '../../components/dashboard/DashboardCharts';
import { DashboardSkeleton } from '../../components/dashboard/DashboardStates';
import { useDashboard } from '../../hooks/useDashboard';
import { invoicePermissions } from '../Invoices/services/invoiceService';
import { paymentPermissions } from '../Payments/paymentService';
import { billingInsights, defaultDashboardFilters, filterDashboardRecords, money, selectDashboardCurrency } from './dashboardModel';
import { searchInputError } from '../../utils/search';
import { billingCurrencies } from '../../utils/currencies';
import '../../styles/Dashboard.css';
import '../../styles/DashboardPremium.css';
const Notice = ({ children, retry }) => <div className="premium-notice" role="alert"><span>{children}</span>{retry && <button onClick={retry}>Retry</button>}</div>;
export const DashboardRecords = ({ title, query, allowed, rows, type, searchQuery = '', recent = true }) => {
  const term = searchQuery.trim().toLocaleLowerCase();
  const error = searchInputError(searchQuery);
  const visibleRows = filterDashboardRecords(rows, searchQuery);
  const recordLabel = `${recent ? 'recent ' : ''}${type}`;
  return <article className="premium-panel premium-records"><header><div><h2>{title}</h2></div>{allowed && <Link to={`/${type}`}>View all <ArrowForward fontSize="small" /></Link>}</header>
  {!allowed ? <Notice>Your role does not have access to this module.</Notice> : query.isPending ? <div className="premium-empty" role="status">Loading records...</div> : query.isError ? <Notice retry={query.refetch}>{query.error.message}</Notice> : !visibleRows.length ? <div className="premium-empty" role="status">{error || (term ? `No ${recordLabel} match your search.` : `No ${recordLabel} found.`)}</div> : <div className="premium-table-scroll ibms-table-frame"><table><thead><tr><th>Record / Customer</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>{visibleRows.map(row => <tr key={row.id}><td><Link to={`/${type}/${row.id}`}>{(type === 'payments' ? row.paymentNumber : row.invoiceNumber) || `#${row.id}`}</Link><small>{row.customerName || row.customer?.name || 'Customer name unavailable'}</small></td><td>{displayDate(row.invoiceDate || row.paymentDate)}</td><td>{money(type === 'invoices' ? row.totalAmount : row.amount, row.currency)}</td><td><span className={`premium-status status-${row.status?.toLowerCase().replaceAll(' ', '-')}`}>{row.status}</span></td></tr>)}</tbody></table></div>}
</article>;
};
export const DashboardSearchResults = ({ invoices, payments, invoicesAllowed, paymentsAllowed, currency, searchQuery, onClear }) => {
  const error = searchInputError(searchQuery);
  const invoiceRows = invoicesAllowed && !invoices.isError ? (invoices.data || []).filter(row => row.currency === currency) : [];
  const paymentRows = paymentsAllowed && !payments.isError ? (payments.data || []).filter(row => row.currency === currency) : [];
  const pending = (invoicesAllowed && invoices.isPending) || (paymentsAllowed && payments.isPending);
  const invoiceCount = filterDashboardRecords(invoiceRows, searchQuery).length;
  const paymentCount = filterDashboardRecords(paymentRows, searchQuery).length;
  return <section id="dashboard-search-results" className="premium-search-results" aria-label="Search results">
    <header className="premium-search-heading"><div><h2>Search results</h2><p role="status">{error || (pending ? 'Searching records…' : `${invoiceCount} ${invoiceCount === 1 ? 'invoice' : 'invoices'} · ${paymentCount} ${paymentCount === 1 ? 'payment' : 'payments'}`)}{!error && !pending && ' in the selected date range and currency.'}</p></div><button type="button" onClick={onClear}>Clear search</button></header>
    {!error && <div className="premium-details"><DashboardRecords title="Invoices" query={invoices} allowed={invoicesAllowed} rows={invoiceRows} type="invoices" searchQuery={searchQuery} recent={false} /><DashboardRecords title="Payments" query={payments} allowed={paymentsAllowed} rows={paymentRows} type="payments" searchQuery={searchQuery} recent={false} /></div>}
  </section>;
};
export const Dashboard = () => {
  const navigate = useNavigate();
  const [recordsSearch, setRecordsSearch] = useState('');
  const mainRef = useRef(null);
  const updateRecordsSearch = value => { setRecordsSearch(value); mainRef.current?.scrollTo({ top: 0 }); };
  const [filters, setFilters] = useState(defaultDashboardFilters);
  const { invoices, payments, invoicesAllowed, paymentsAllowed, refresh } = useDashboard(filters);
  const user = authApi.getCurrentUser();
  const currencies = billingCurrencies([...(invoices.isError ? [] : invoices.data || []), ...(payments.isError ? [] : payments.data || [])]);
  const currency = selectDashboardCurrency(currencies, filters.currency || '');
  const result = useMemo(() => {
    if (!currency) return { data: null };
    try { return { data: billingInsights(invoices.isError ? [] : invoices.data || [], payments.isError ? [] : payments.data || [], currency) }; }
    catch (error) { return { error }; }
  }, [invoices.data, payments.data, invoices.isError, payments.isError, currency]);
  const loading = (invoicesAllowed && invoices.isPending) || (paymentsAllowed && payments.isPending);
  const invoiceReady = invoicesAllowed && invoices.isSuccess;
  const paymentReady = paymentsAllowed && payments.isSuccess;
  const actions = [
    ...(invoicePermissions(user).manage ? [{ title: 'Create Invoice', route: '/invoices/new', icon: Add, tone: 'invoice' }] : []),
    ...(paymentPermissions(user).create ? [{ title: 'Record Payment', route: '/payments/new', icon: PaymentsOutlined, tone: 'payment' }] : []),
    ...(invoicePermissions(user).manage ? [{ title: 'Add Customer', route: '/customers/create', icon: PersonAddAlt, tone: 'customer' }, { title: 'Add Product / Service', route: '/products/new', icon: Inventory2Outlined, tone: 'product' }, { title: 'Create Credit Note', route: '/credit-notes/new', icon: AssignmentReturnOutlined, tone: 'credit' }] : []),
  ];
  return <div className="bd-shell premium-dashboard"><DashboardHeader searchQuery={recordsSearch} onSearch={updateRecordsSearch} searchPlaceholder="Search billing records..." searchLabel="Search invoices, payments or customers" searchResultsId="dashboard-search-results" onSignOut={() => { authApi.logout(); navigate('/login'); }} /><main ref={mainRef} className="premium-main">
    <div className="premium-title"><div><span className="premium-eyebrow">BILLING OVERVIEW</span><h1>Billing Dashboard</h1><p>Invoiced, collected, outstanding and overdue amounts at a glance.</p></div><span className="premium-tag">Tenant-scoped data</span></div>
    <DashboardFilters currencies={currencies} currency={currency} values={filters} onChange={setFilters} onRefresh={refresh} isRefreshing={invoices.isFetching || payments.isFetching} />
    {recordsSearch.trim() ? <DashboardSearchResults invoices={invoices} payments={payments} invoicesAllowed={invoicesAllowed} paymentsAllowed={paymentsAllowed} currency={currency} searchQuery={recordsSearch} onClear={() => updateRecordsSearch('')} /> : <>
    {loading ? <DashboardSkeleton /> : <>
      {!invoicesAllowed ? <Notice>Invoice analytics are unavailable for your role.</Notice> : invoices.isError && <Notice retry={invoices.refetch}>Invoice data could not be loaded. {invoices.error.message}</Notice>}
      {!paymentsAllowed ? <Notice>Payment analytics are unavailable for your role.</Notice> : payments.isError && <Notice retry={payments.refetch}>Payment data could not be loaded. {payments.error.message}</Notice>}
      {result.error && <Notice retry={refresh}>{result.error.message}</Notice>}
      {result.data && !result.error && <section className="premium-kpis" aria-label="Billing summary">{result.data.summary.map(stat => <StatCard key={stat.id} filters={filters} data={(stat.id === 'paid' ? paymentReady : invoiceReady) ? stat : { ...stat, value: null, meta: 'Source unavailable - retry above' }} />)}</section>}
      {!currency && (invoiceReady || paymentReady) && <div className="premium-empty premium-panel">No billing activity in this date range. Choose another range or create your first record.</div>}
    </>}
    <section className="premium-actions"><header><h2>Quick Actions</h2></header><div>{actions.map(action => { const Icon = action.icon; return <Link key={action.route} className={`dashboard-clickable-card premium-action-${action.tone}`} to={action.route}><i aria-hidden="true"><Icon /></i><strong>{action.title}</strong></Link>; })}</div></section>
    {!loading && result.data && !result.error && <><section className="premium-analytics">{invoiceReady && paymentReady ? <RevenueChart data={result.data.revenue} currency={currency} summary={result.data.summary} invoices={invoices.data} /> : <article className="premium-panel"><header><h2>Revenue Trend</h2></header><div className="premium-empty">Both invoice and payment sources are required for this comparison. Retry the unavailable source above.</div></article>}{invoiceReady ? <OutstandingAging key={`${currency}:${filters.start}:${filters.end}`} data={result.data.aging} currency={currency} invoices={invoices.data} /> : <article className="premium-panel"><header><h2>Outstanding Aging</h2></header><div className="premium-empty">Invoice balances are unavailable. Retry the invoice source above.</div></article>}</section></>}
    {!loading && <section className="premium-details"><DashboardRecords title="Recent Payments" query={payments} allowed={paymentsAllowed} rows={result.data?.payments || []} type="payments" searchQuery={recordsSearch} /><DashboardRecords title="Recent Invoices" query={invoices} allowed={invoicesAllowed} rows={result.data?.invoices || []} type="invoices" searchQuery={recordsSearch} /></section>}
    </>}
  </main></div>;
};
export default Dashboard;
