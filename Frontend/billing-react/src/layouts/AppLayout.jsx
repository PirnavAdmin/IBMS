import { useState } from 'react';
import { Menu } from '@mui/icons-material';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { DashboardSidebar } from '../components/dashboard/DashboardSidebar';
import { DashboardHeader } from '../components/dashboard/DashboardHeader';
import '../styles/Dashboard.css';

const routeModules = {
  '/dashboard': 'dashboard',
  '/invoices': 'invoices',
  '/payments': 'payments',
  '/customers': 'customers',
  '/products': 'products',
  '/credit-notes': 'credit-notes',
  '/recurring-billing': 'recurring',
  '/expenses': 'expenses',
  '/taxes': 'taxes',
  '/reports': 'reports',
  '/audit-activity': 'activity',
  '/templates-branding': 'templates',
  '/invoice-numbering': 'numbering',
  '/integration-settings': 'integrations',
  '/settings': 'settings',
  '/support': 'support',
};

export const AppLayout = () => {
  const navigate = useNavigate();
  const { pathname, search: locationSearch } = useLocation();
  const searchScope = pathname + locationSearch;
  const [headerSearch, setHeaderSearch] = useState({ scope: '', value: '' });
  const searchQuery = headerSearch.scope === searchScope ? headerSearch.value : '';
  const onSearch = (value) => setHeaderSearch({ scope: searchScope, value });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const activeItem = Object.entries(routeModules).find(([route]) => pathname === route || pathname.startsWith(`${route}/`))?.[1] || 'dashboard';
  const openRoute = (route) => { setSidebarOpen(false); navigate(route); };
  const hasPageHeader = pathname === '/dashboard' || pathname === '/invoices' || pathname === '/taxes' || pathname.startsWith('/taxes/');
  const signOut = () => {
    localStorage.removeItem('billing_auth_token');
    localStorage.removeItem('billing_auth_user');
    navigate('/login');
  };

  return <div className="app-layout">
    <button className="app-layout-menu" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu /></button>
    <DashboardSidebar activeItem={activeItem} open={sidebarOpen} onSelect={(item) => openRoute(Object.keys(routeModules).find((route) => routeModules[route] === item) || '/dashboard')} onNavigate={openRoute} onClose={() => setSidebarOpen(false)} />
    <div className="app-layout-main">{!hasPageHeader && <DashboardHeader searchQuery={searchQuery} onSearch={onSearch} onSignOut={signOut} />}<Outlet context={{ searchQuery, onSearch }} /></div>
  </div>;
};
