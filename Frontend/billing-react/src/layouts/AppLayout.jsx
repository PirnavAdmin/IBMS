import { useState } from 'react';
import { Menu } from '@mui/icons-material';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { DashboardSidebar } from '../components/dashboard/DashboardSidebar';
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
  const { pathname } = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const activeItem = Object.entries(routeModules).find(([route]) => pathname === route || pathname.startsWith(`${route}/`))?.[1] || 'dashboard';
  const openRoute = (route) => { setSidebarOpen(false); navigate(route); };

  return <div className="app-layout">
    <button className="app-layout-menu" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu /></button>
    <DashboardSidebar activeItem={activeItem} open={sidebarOpen} onSelect={(item) => openRoute(Object.keys(routeModules).find((route) => routeModules[route] === item) || '/dashboard')} onNavigate={openRoute} onClose={() => setSidebarOpen(false)} />
    <div className="app-layout-main"><Outlet /></div>
  </div>;
};
