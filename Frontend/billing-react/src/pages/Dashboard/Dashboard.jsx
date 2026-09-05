import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button } from '@mui/material';
import { DashboardHeader } from '../../components/dashboard/DashboardHeader';
import { DashboardFilters } from '../../components/dashboard/DashboardFilters';
import { StatCard } from '../../components/dashboard/StatCard';
import { RevenueChart, InvoiceStatusChart, OutstandingAging } from '../../components/dashboard/DashboardCharts';
import { DataTableCard, TopCustomers, RecentActivity, QuickActions } from '../../components/dashboard/DashboardSections';
import { DashboardSkeleton } from '../../components/dashboard/DashboardStates';
import { useDashboard } from '../../hooks/useDashboard';
import '../../styles/Dashboard.css';

export const Dashboard = () => {
  const navigate = useNavigate();
  const { data, isLoading, error, isEmpty, retry } = useDashboard();
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({ period: 'This Month', application: 'All Applications', unit: 'All Units' });
  const filteredData = useMemo(() => {
    if (!data || !searchQuery.trim()) return data;
    const query = searchQuery.toLowerCase();
    const matches = (row) => Object.values(row).some((value) => String(value).toLowerCase().includes(query));
    return { ...data, recentInvoices: data.recentInvoices.filter(matches), recentPayments: data.recentPayments.filter(matches), topCustomers: data.topCustomers.filter(matches), overdueInvoices: data.overdueInvoices.filter(matches), recentActivity: data.recentActivity.filter(matches) };
  }, [data, searchQuery]);
  const signOut = () => {
    localStorage.removeItem('billing_auth_token');
    localStorage.removeItem('billing_auth_user');
    navigate('/login');
  };

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <main className="bd-state-page"><Alert severity="error">We couldn’t load the dashboard.</Alert><Button variant="contained" onClick={retry}>Try again</Button></main>;
  if (isEmpty) return <main className="bd-state-page"><div className="bd-empty"><h2>No dashboard activity yet</h2><p>Create your first invoice to start seeing billing insights here.</p><Button variant="contained" onClick={() => navigate('/invoices/new')}>Create invoice</Button></div></main>;

  return <div className="bd-shell">
    <DashboardHeader searchQuery={searchQuery} onSearch={setSearchQuery} onSignOut={signOut} />
    <main className="bd-main">
      <div className="bd-title-row"><div><h1>Billing Dashboard</h1><p>Overview of your billing performance and financial activity</p></div><DashboardFilters values={filters} onChange={setFilters} onRefresh={retry} onCreate={() => navigate('/invoices/new')} /></div>
      <section className="bd-kpi-grid" aria-label="Billing summary">{Object.values(filteredData.summary).map((stat) => <StatCard key={stat.id} data={stat} />)}</section>
      <section className="bd-chart-grid"><RevenueChart data={filteredData.revenue} /><InvoiceStatusChart data={filteredData.invoiceStatus} /><OutstandingAging data={filteredData.outstandingAging} /></section>
      <section className="bd-detail-grid">
        <DataTableCard title="Recent Invoices" columns={filteredData.tableColumns.invoices} rows={filteredData.recentInvoices} className="bd-span-5" />
        <DataTableCard title="Recent Payments" columns={filteredData.tableColumns.payments} rows={filteredData.recentPayments} className="bd-span-4" />
        <TopCustomers data={filteredData.topCustomers} />
        <DataTableCard title="Overdue Invoices" icon="warning" columns={filteredData.tableColumns.overdue} rows={filteredData.overdueInvoices} className="bd-span-5 bd-overdue-card" />
        <RecentActivity data={filteredData.recentActivity} />
        <QuickActions onAction={(action) => action.route && navigate(action.route)} />
      </section>
    </main>
  </div>;
};

export default Dashboard;
