import { useCurrentUser } from '../hooks/useCurrentUser';
import { dashboardNavigation } from '../data/dashboardNavigation';
import { hasPermission } from '../utils/permissionUtils';
import { isPlatformAdmin, platformNavigation } from '../pages/Platform/platformAccess';
import { useCallback, useRef, useState } from 'react';
import Menu from '@mui/icons-material/Menu';
import useMediaQuery from '@mui/material/useMediaQuery';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { DashboardSidebar } from '../components/dashboard/DashboardSidebar';
import { DashboardHeader } from '../components/dashboard/DashboardHeader';
import { queryClient } from '../queryClient';
import { ScreenErrorBoundary } from '../components/PageLoading';
import { useTableScrollHeaders } from '../hooks/useTableScrollHeaders';
import '../styles/Dashboard.css';
import '../styles/ModuleSpacing.css';
import '../styles/AppTheme.css';
import '../styles/WorkspaceResponsive.css';
import '../styles/DropdownTheme.css';
import '../styles/RowActions.css';
import '../styles/WorkspaceUI.css';
import '../styles/AstraSidebar.css';
import '../styles/TenantColors.css';

const routeModules = {
  '/platform/dashboard': 'platform-dashboard',
  '/platform/tenants': 'platform-tenants',
  '/platform/users': 'platform-users',
  '/platform/audit': 'platform-audit',
  '/platform/settings': 'platform-settings',
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
};

export const AppLayout = () => {
  const currentUser = useCurrentUser();
  const platform = isPlatformAdmin(currentUser);
  const tableScrollRoot = useTableScrollHeaders();
  const navigate = useNavigate();
  const menuRef = useRef(null);
  const { pathname, search: locationSearch, state: locationState } = useLocation();
  const searchScope = pathname;
  const [moduleSearch, setModuleSearch] = useState(null);
  const registerModuleSearch = useCallback((id, registration) => {
    setModuleSearch(current => registration ? { ...registration, id } : current?.id === id ? null : current);
  }, []);
  const activeSearch = moduleSearch?.scope === pathname ? moduleSearch : null;
  const auditSearch = pathname === '/audit-activity';
  const navigationSearch = !activeSearch && !auditSearch;
  const navigationItems = (platform ? platformNavigation : dashboardNavigation).flatMap(group => group.items).filter(item => hasPermission(item.permission, currentUser));
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
  const hasPageHeader = pathname === '/dashboard' || pathname === '/taxes' || pathname.startsWith('/taxes/');
  const signOut = () => {
    localStorage.removeItem('billing_auth_token');
    localStorage.removeItem('billing_auth_user');
    queryClient.clear();
    navigate('/login');
  };

  return <div ref={tableScrollRoot} className={`app-layout astra-layout${platform ? ' platform-layout' : ''}${!mobileNavigation && sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
    <button ref={menuRef} type="button" className="app-layout-menu" onClick={toggleNavigation} aria-label={navigationExpanded ? 'Collapse navigation' : 'Expand navigation'}  aria-expanded={navigationExpanded} aria-controls="app-primary-navigation"><Menu /></button>
    <DashboardSidebar activeItem={activeItem} open={sidebarOpen} mobile={mobileNavigation} collapsed={!mobileNavigation && sidebarCollapsed} onToggle={toggleNavigation} onSelect={(item) => openRoute(Object.keys(routeModules).find((route) => routeModules[route] === item) || '/dashboard')} onNavigate={openRoute} onClose={() => { setSidebarOpen(false); menuRef.current?.focus(); }} />
    <div className="app-layout-main">{!hasPageHeader && <DashboardHeader searchQuery={activeSearch?.value ?? searchQuery} onSearch={activeSearch?.onChange || onSearch} navigationItems={navigationSearch ? navigationItems : undefined} searchLabel={activeSearch?.label || (auditSearch ? 'Search current activity page' : 'Search modules')} searchPlaceholder={activeSearch ? activeSearch.label + '...' : auditSearch ? 'Search current activity page...' : 'Search modules...'} onSignOut={signOut} />}<div className={`app-layout-content${hasPageHeader ? ' app-layout-content-with-header' : ''}`}><ScreenErrorBoundary resetKey={pathname} onNavigateHome={() => openRoute('/dashboard')}><Outlet context={{ searchQuery: activeSearch?.value ?? searchQuery, onSearch: activeSearch?.onChange || (auditSearch ? onSearch : undefined), registerModuleSearch }} /></ScreenErrorBoundary></div></div>
  </div>;
};
