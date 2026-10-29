import { useState } from 'react';
import { Menu } from '@mui/icons-material';
import { useMediaQuery } from '@mui/material';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { DashboardSidebar } from '../components/dashboard/DashboardSidebar';
import { DashboardHeader } from '../components/dashboard/DashboardHeader';
import { queryClient } from '../queryClient';
import { useTableScrollHeaders } from '../hooks/useTableScrollHeaders';
import '../styles/Dashboard.css';
import '../styles/ModuleSpacing.css';
import '../styles/AppTheme.css';
import '../styles/WorkspaceResponsive.css';
import '../styles/DropdownTheme.css';
import '../styles/RowActions.css';
import '../styles/WorkspaceUI.css';

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
  '/integrations': 'integrations',
  '/webhooks': 'webhooks',
  '/background-jobs': 'background-jobs',
  '/export-jobs': 'export-jobs',
  '/integration-settings': 'integrations',
  '/user-role-administration': 'user-role-administration',
  '/settings': 'settings',
  '/support': 'support',
};

export const AppLayout = () => {
  const tableScrollRoot = useTableScrollHeaders();
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
    queryClient.clear();
    navigate('/login');
  };

  return <div ref={tableScrollRoot} className={`app-layout${!mobileNavigation && sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
    <button type="button" className="app-layout-menu" onClick={toggleNavigation} aria-label={navigationExpanded ? 'Collapse navigation' : 'Expand navigation'}  aria-expanded={navigationExpanded} aria-controls="app-primary-navigation"><Menu /></button>
    <DashboardSidebar activeItem={activeItem} open={sidebarOpen} onSelect={(item) => openRoute(Object.keys(routeModules).find((route) => routeModules[route] === item) || '/dashboard')} onNavigate={openRoute} onClose={() => setSidebarOpen(false)} />
    <div className="app-layout-main">{!hasPageHeader && <DashboardHeader searchQuery={searchQuery} onSearch={onSearch} onSignOut={signOut} />}<div className={`app-layout-content${hasPageHeader ? ' app-layout-content-with-header' : ''}`}><Outlet context={{ searchQuery, onSearch }} /></div></div>
  </div>;
};
