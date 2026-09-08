import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@mui/material';
import { DashboardHeader } from '../../components/dashboard/DashboardHeader';
import { DashboardFilters } from '../../components/dashboard/DashboardFilters';
import { StatCard } from '../../components/dashboard/StatCard';
import { RevenueChart, OutstandingAging } from '../../components/dashboard/DashboardCharts';
import { DataTableCard, TopCustomers, QuickActions } from '../../components/dashboard/DashboardSections';
import { DashboardSkeleton, DashboardErrorState } from '../../components/dashboard/DashboardStates';
import { useDashboard } from '../../hooks/useDashboard';
import '../../styles/Dashboard.css';
import { defaultDashboardFilters, selectDashboardSample } from '../../data/dashboardSample';

export const Dashboard = () => {
  const navigate = useNavigate();
  const { data, isLoading, error, isEmpty, loadDashboardData } = useDashboard();
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState(defaultDashboardFilters);
  const filteredData = useMemo(() => {
    if (!data) return null;
    const sample = selectDashboardSample(filters);
    const query = searchQuery.trim().toLowerCase();
    const matches = (row) => Object.values(row).some((value) => String(value).toLowerCase().includes(query));
    return { ...sample, recentPayments: sample.recentPayments.filter(matches), topCustomers: sample.topCustomers.filter(matches) };
  }, [data, filters, searchQuery]);

  const signOut = () => {
    localStorage.removeItem('billing_auth_token');
    localStorage.removeItem('billing_auth_user');
    navigate('/login');
  };

  return <div className="bd-shell">
    <DashboardHeader searchQuery={searchQuery} onSearch={setSearchQuery} onSignOut={signOut} />
    <main className="bd-main bd-requirements-dashboard">
      <div className="bd-title-row"><div><h1>Billing Dashboard</h1><p>Invoiced, collected, outstanding and overdue amounts at a glance.</p></div><DashboardFilters values={filters} onChange={setFilters} onRefresh={loadDashboardData} isRefreshing={isLoading} /></div>
      <QuickActions onAction={(action) => action.route && navigate(action.route)} />
      {isLoading ? <DashboardSkeleton /> : error ? <DashboardErrorState onRetry={loadDashboardData} /> : isEmpty ? <div className="bd-empty"><h2>No dashboard activity yet</h2><p>Create your first invoice to start seeing billing insights here.</p><Button variant="contained" onClick={() => navigate('/invoices/new')}>Create invoice</Button></div> : <>
      <section className="bd-kpi-grid" aria-label="Billing summary">{['totalInvoiced', 'totalPaid', 'outstanding', 'overdue', 'drafts'].map((key) => filteredData.summary[key]).filter(Boolean).map((stat) => <StatCard key={stat.id} data={stat} />)}</section>
      <section className="bd-chart-grid"><RevenueChart data={filteredData.revenue} /><OutstandingAging data={filteredData.outstandingAging} /></section>
      <section className="bd-detail-grid">
        <DataTableCard title="Recent Payments" columns={filteredData.tableColumns.payments} rows={filteredData.recentPayments} className="bd-span-4" onViewAll={() => navigate('/payments')} />
        <TopCustomers data={filteredData.topCustomers} onViewAll={() => navigate('/customers')} />
      </section>
      </>}
    </main>
  </div>;
};

export default Dashboard;
