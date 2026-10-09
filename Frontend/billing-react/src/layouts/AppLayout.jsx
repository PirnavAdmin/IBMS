import { useState } from 'react';
import { Menu } from '@mui/icons-material';
import { useMediaQuery } from '@mui/material';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { DashboardSidebar } from '../components/dashboard/DashboardSidebar';
import { DashboardHeader } from '../components/dashboard/DashboardHeader';
import '../styles/Dashboard.css';
import '../styles/ModuleSpacing.css';
import '../styles/AppTheme.css';

const routeModules = {
  '/dashboard': 'dashboard',
  '/invoices': 'invoices',
  '/quotations': 'quotations',
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
  '/integration-settings': 'integrations',
  '/settings': 'settings',
  '/support': 'support',
};

export const AppLayout = () => {
  const navigate = useNavigate();
  const { pathname, search: locationSearch, state: locationState } = useLocation();
  const searchScope = pathname + locationSearch;
  const [headerSearch, setHeaderSearch] = useState({ scope: '', value: '' });
  const searchQuery = headerSearch.scope === searchScope ? headerSearch.value : '';
  const onSearch = (value) => setHeaderSearch({ scope: searchScope, value });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const mobileNavigation = useMediaQuery('(max-width: 1179px)');
  const navigationExpanded = mobileNavigation ? sidebarOpen : !sidebarCollapsed;
  const toggleNavigation = () => mobileNavigation
    ? setSidebarOpen(value => !value)
    : setSidebarCollapsed(value => !value);
  const activeItem = Object.entries(routeModules).find(([route]) => pathname === route || pathname.startsWith(`${route}/`))?.[1] || 'dashboard';
  const openRoute = (route) => {
    setSidebarOpen(false);
    if (route === '/quotations' && pathname === route) {
      navigate(route, { state: { ...locationState, quotationManagementReset: Date.now() } });
      return;
    }
    navigate(route);
  };
  const hasPageHeader = pathname === '/dashboard' || pathname === '/taxes' || pathname.startsWith('/taxes/') || pathname === '/settings/taxes' || pathname.startsWith('/settings/taxes/');
  const signOut = () => {
    localStorage.removeItem('billing_auth_token');
    localStorage.removeItem('billing_auth_user');
    navigate('/login');
  };

  return <div className={`app-layout${!mobileNavigation && sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
    <button type="button" className="app-layout-menu" onClick={toggleNavigation} aria-label={navigationExpanded ? 'Collapse navigation' : 'Expand navigation'} title={navigationExpanded ? 'Collapse navigation' : 'Expand navigation'} aria-expanded={navigationExpanded} aria-controls="app-primary-navigation"><Menu /></button>
    <DashboardSidebar activeItem={activeItem} open={sidebarOpen} onSelect={(item) => openRoute(Object.keys(routeModules).find((route) => routeModules[route] === item) || '/dashboard')} onNavigate={openRoute} onClose={() => setSidebarOpen(false)} />
    <div className="app-layout-main">{!hasPageHeader && <DashboardHeader searchQuery={searchQuery} onSearch={onSearch} onSignOut={signOut} />}<div className={`app-layout-content${hasPageHeader ? ' app-layout-content-with-header' : ''}`}><Outlet context={{ searchQuery, onSearch }} /></div></div>
  </div>;
};
