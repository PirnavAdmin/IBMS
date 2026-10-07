import { useMemo, useState } from 'react';
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
import { billingInsights, defaultDashboardFilters, money } from './dashboardModel';
import '../../styles/Dashboard.css';
import '../../styles/DashboardPremium.css';
const Notice = ({ children, retry }) => <div className="premium-notice" role="alert"><span>{children}</span>{retry && <button onClick={retry}>Retry</button>}</div>;
const Records = ({ title, query, allowed, rows, type }) => <article className="premium-panel premium-records"><header><div><h2>{title}</h2></div>{allowed && <Link to={`/${type}`}>View all <ArrowForward fontSize="small" /></Link>}</header>
  {!allowed ? <Notice>Your role does not have access to this module.</Notice> : query.isPending ? <div className="premium-empty" role="status">Loading records...</div> : query.isError ? <Notice retry={query.refetch}>{query.error.message}</Notice> : !rows.length ? <div className="premium-empty">No recent {type} found.</div> : <div className="premium-table-scroll"><table><thead><tr><th>Record / Customer</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><Link to={`/${type}/${row.id}`}>{row.invoiceNumber || row.paymentNumber || `#${row.id}`}</Link><small>{row.customerName || row.customer?.name || 'Customer name unavailable'}</small></td><td>{(row.invoiceDate || row.paymentDate)?.slice(0, 10) || 'Unavailable'}</td><td>{money(type === 'invoices' ? row.totalAmount : row.amount, row.currency)}</td><td><span className={`premium-status status-${row.status?.toLowerCase().replaceAll(' ', '-')}`}>{row.status}</span></td></tr>)}</tbody></table></div>}
</article>;
export const Dashboard = () => {
  const navigate = useNavigate();
  const [filters, setFilters] = useState(defaultDashboardFilters);
  const [selectedCurrency] = useState('');
  const [recordsSearch, setRecordsSearch] = useState('');
  const { invoices, payments, invoicesAllowed, paymentsAllowed, refresh } = useDashboard(filters);
  const user = authApi.getCurrentUser();
  const currencies = [...new Set([...(invoices.isError ? [] : invoices.data || []), ...(payments.isError ? [] : payments.data || [])].map(row => row.currency).filter(Boolean))].sort();
  const currency = currencies.includes(selectedCurrency) ? selectedCurrency : currencies[0];
  const result = useMemo(() => {
    if (!currency) return { data: null };
    try { return { data: billingInsights(invoices.isError ? [] : invoices.data || [], payments.isError ? [] : payments.data || [], currency) }; }
    catch (error) { return { error }; }
  }, [invoices.data, payments.data, invoices.isError, payments.isError, currency]);
  const loading = (invoicesAllowed && invoices.isPending) || (paymentsAllowed && payments.isPending);
  const invoiceReady = invoicesAllowed && invoices.isSuccess;
  const paymentReady = paymentsAllowed && payments.isSuccess;
  const matchesRecord = row => {
    const term = recordsSearch.trim().toLowerCase();
    return !term || [row.invoiceNumber, row.paymentNumber, row.customerName, row.customer?.name, row.status, row.id].some(value => String(value ?? '').toLowerCase().includes(term));
  };
  const actions = [
    ...(invoicePermissions(user).manage ? [{ title: 'Create Invoice', route: '/invoices/new', icon: Add, tone: 'invoice' }] : []),
    ...(paymentPermissions(user).create ? [{ title: 'Record Payment', route: '/payments/new', icon: PaymentsOutlined, tone: 'payment' }] : []),
    ...(invoicePermissions(user).manage ? [{ title: 'Add Customer', route: '/customers/create', icon: PersonAddAlt, tone: 'customer' }, { title: 'Add Product / Service', route: '/products/new', icon: Inventory2Outlined, tone: 'product' }, { title: 'Create Credit Note', route: '/credit-notes/new', icon: AssignmentReturnOutlined, tone: 'credit' }] : []),
  ];
  return <div className="bd-shell premium-dashboard"><DashboardHeader searchQuery={recordsSearch} onSearch={setRecordsSearch} onSignOut={() => { authApi.logout(); navigate('/login'); }} /><main className="premium-main">
    <div className="premium-title"><div><span className="premium-eyebrow">BILLING OVERVIEW</span><h1>Billing Dashboard</h1><p>Invoiced, collected, outstanding and overdue amounts at a glance.</p></div><span className="premium-tag">Tenant-scoped data</span></div>
    <DashboardFilters values={filters} onChange={setFilters} onRefresh={refresh} isRefreshing={invoices.isFetching || payments.isFetching} recordsSearch={recordsSearch} onRecordsSearch={setRecordsSearch} />
    {loading ? <DashboardSkeleton /> : <>
      {!invoicesAllowed ? <Notice>Invoice analytics are unavailable for your role.</Notice> : invoices.isError && <Notice retry={invoices.refetch}>Invoice data could not be loaded. {invoices.error.message}</Notice>}
      {!paymentsAllowed ? <Notice>Payment analytics are unavailable for your role.</Notice> : payments.isError && <Notice retry={payments.refetch}>Payment data could not be loaded. {payments.error.message}</Notice>}
      {result.error && <Notice retry={refresh}>{result.error.message}</Notice>}
      {result.data && !result.error && <section className="premium-kpis" aria-label="Billing summary">{result.data.summary.map(stat => <StatCard key={stat.id} data={(stat.id === 'paid' ? paymentReady : invoiceReady) ? stat : { ...stat, value: null, meta: 'Source unavailable - retry above' }} />)}</section>}
      {!currency && (invoiceReady || paymentReady) && <div className="premium-empty premium-panel">No billing activity in this date range. Choose another range or create your first record.</div>}
    </>}
    <section className="premium-actions"><header><h2>Quick Actions</h2></header><div>{actions.map(action => { const Icon = action.icon; return <Link key={action.route} className={`premium-action-${action.tone}`} to={action.route}><i aria-hidden="true"><Icon /></i><strong>{action.title}</strong></Link>; })}</div></section>
    {!loading && result.data && !result.error && <><section className="premium-analytics">{invoiceReady && paymentReady ? <RevenueChart data={result.data.revenue} currency={currency} summary={result.data.summary} invoices={invoices.data} /> : <article className="premium-panel"><header><h2>Revenue Trend</h2></header><div className="premium-empty">Both invoice and payment sources are required for this comparison. Retry the unavailable source above.</div></article>}{invoiceReady ? <OutstandingAging data={result.data.aging} currency={currency} /> : <article className="premium-panel"><header><h2>Outstanding Aging</h2></header><div className="premium-empty">Invoice balances are unavailable. Retry the invoice source above.</div></article>}</section></>}
    {!loading && <section className="premium-details"><Records title="Recent Payments" query={payments} allowed={paymentsAllowed} rows={(result.data?.payments || []).filter(matchesRecord)} type="payments" /><Records title="Recent Invoices" query={invoices} allowed={invoicesAllowed} rows={(result.data?.invoices || []).filter(matchesRecord)} type="invoices" /></section>}
  </main></div>;
};
export default Dashboard;
