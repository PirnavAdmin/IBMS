import { useEffect, useId, useRef, useState } from 'react';
import { Tooltip } from '@mui/material';
import { authApi } from 'billing-api-client';
import { getDisplayName, getInitials } from '../../utils/userDisplay';
import {
  BrandingWatermarkOutlined,
  FormatListNumberedOutlined,
  FileDownloadOutlined,
  IntegrationInstructionsOutlined,
  ChevronLeft,
  ExpandMore,
  Logout,
  DashboardOutlined,
  HistoryOutlined,
  Inventory2Outlined,
  PaymentsOutlined,
  ManageAccountsOutlined,
  PeopleOutline,
  ReceiptLongOutlined,
  ReceiptOutlined,
  RequestQuoteOutlined,
  SettingsOutlined,
  ScheduleOutlined,
  NotificationsOutlined,
} from '@mui/icons-material';
import { InvoiceBillingLogo } from '../InvoiceBillingLogo';
import { dashboardNavigation } from '../../data/dashboardNavigation';
import { hasPermission } from '../../utils/permissionUtils';

const iconMap = {
  dashboard: DashboardOutlined,
  invoice: ReceiptLongOutlined,
  quotation: RequestQuoteOutlined,
  payment: PaymentsOutlined,
  customer: PeopleOutline,
  product: Inventory2Outlined,
  credit: RequestQuoteOutlined,
  template: BrandingWatermarkOutlined,
  numbering: FormatListNumberedOutlined,
  integration: IntegrationInstructionsOutlined,
  settings: SettingsOutlined,
  'user-role': ManageAccountsOutlined,
  tax: ReceiptOutlined,
  activity: HistoryOutlined,
  notification: NotificationsOutlined,
  jobs: ScheduleOutlined,
  exports: FileDownloadOutlined,
};

export const DashboardSidebar = ({ activeItem, open, collapsed = false, mobile = false, onToggle, onSignOut, onSelect, onNavigate, onClose }) => {
  const asideRef = useRef(null);
  const menuId = useId();
  const activeSection = dashboardNavigation.find(section => section.label !== 'Overview' && section.items.some(item => item.id === activeItem))?.label;
  const [expandedSection, setExpandedSection] = useState(activeSection || 'Billing');
  useEffect(() => { if (activeSection) setExpandedSection(activeSection); }, [activeItem, activeSection]);
  const user = authApi.getCurrentUser();
  const name = getDisplayName(user);
  const secondary = user?.email || (Array.isArray(user?.roles) ? user.roles.join(', ') : user?.role) || 'Signed in';
  const sections = dashboardNavigation.map(section => ({ ...section,
    items: section.items.filter(item => !item.permission || hasPermission(item.permission)),
  })).filter(section => section.items.length);
  const count = sections.reduce((sum, section) => sum + section.items.length, 0);
  const navigate = item => item.route ? onNavigate(item.route) : onSelect(item.id);
  const keyboard = event => {
    if (event.key === 'Escape') {
      if (open) { event.preventDefault(); onClose(); }
      return;
    }
    const control = event.target.closest('.bd-nav-item, .astra-group-toggle');
    if (!control) return;
    if (control.matches('.astra-group-toggle') && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      setExpandedSection(event.key === 'ArrowRight' ? control.dataset.section : null);
      return;
    }
    const rows = [...asideRef.current.querySelectorAll('.bd-nav-item, .astra-group-toggle')].filter(row => !row.closest('[hidden]') && (!collapsed || !row.matches('.astra-group-toggle')));
    const current = rows.indexOf(control);
    let next;
    if (event.key === 'ArrowDown') next = (current + 1) % rows.length;
    if (event.key === 'ArrowUp') next = (current - 1 + rows.length) % rows.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = rows.length - 1;
    if (next !== undefined) { event.preventDefault(); rows[next]?.focus(); }
  };
  const renderSection = section => {
    const index = section.items.findIndex(item => item.id === activeItem);
    const standalone = section.label === 'Overview';
    const expanded = standalone || collapsed || expandedSection === section.label;
    const sectionId = `${menuId}-${section.label.toLowerCase().replace(/[^a-z]+/g, '-')}`;
    const label = section.label === 'Configuration & Administration' ? 'Workspace settings' : section.label;
    return <section className={`bd-nav-section astra-nav-section${section.label === 'Configuration & Administration' ? ' astra-config-section' : ''}`} key={section.label} aria-label={section.label}>
      {!standalone && <h2 className="astra-section-heading"><button type="button" className={`astra-group-toggle${index >= 0 ? ' is-active' : ''}`} data-section={section.label} aria-expanded={expanded} aria-controls={sectionId} onClick={() => setExpandedSection(expandedSection === section.label ? null : section.label)}><span>{label}</span><ExpandMore aria-hidden="true" /></button></h2>}
      <div id={sectionId} className="astra-section-list" hidden={!expanded}>
        <span className="astra-active-pill" aria-hidden="true" style={{ transform: `translateY(calc(${Math.max(0, index)} * (var(--astra-row-height) + var(--astra-row-gap))))`, opacity: index >= 0 ? 1 : 0 }} />
        {section.items.map(item => {
          const Icon = iconMap[item.icon] || DashboardOutlined;
          return <Tooltip key={item.id} title={item.label} placement="right" arrow disableHoverListener={!collapsed} disableFocusListener={!collapsed}>
            <button type="button" className={`bd-nav-item ${activeItem === item.id ? 'active' : ''}`} aria-label={item.label} aria-current={activeItem === item.id ? 'page' : undefined} onClick={() => navigate(item)}>
              <Icon /><span>{item.label}</span>
            </button>
          </Tooltip>;
        })}
      </div>
    </section>;
  };
  return <>
    <button type="button" className={`bd-sidebar-backdrop ${open ? 'is-open' : ''}`} onClick={onClose} aria-label="Close navigation" />
    <aside ref={asideRef} id="app-primary-navigation" className={`bd-sidebar astra-sidebar ${open ? 'is-open' : ''}`} style={{ '--astra-menu-count': count || 1 }} aria-label="Primary navigation" aria-hidden={mobile && !open ? true : undefined} inert={mobile && !open ? '' : undefined} onKeyDown={keyboard}>
      <button type="button" className="astra-collapse" onClick={onToggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} aria-controls="astra-menu-content"><ChevronLeft /></button>
      <button type="button" className="bd-sidebar-brand" onClick={() => onNavigate('/dashboard')} aria-label="Go to dashboard">
        <InvoiceBillingLogo size={22} /><strong>INVOICE<span>.</span>BILLING</strong>
      </button>
      <nav id="astra-menu-content" className="astra-menu-content" aria-label="Module navigation">
        {sections.map(renderSection)}
      </nav>
      <footer className="astra-profile">
        <span className="astra-avatar" title={name}>{getInitials(name)}</span>
        <div className="astra-profile-copy"><strong title={name}>{name}</strong><small title={secondary}>{secondary}</small></div>
        <Tooltip title="Sign out" placement="right"><button type="button" aria-label="Sign out" className="astra-signout" onClick={onSignOut}><Logout /></button></Tooltip>
      </footer>
    </aside>
  </>;
};
