import {
  BrandingWatermarkOutlined,
  FormatListNumberedOutlined,
  FileDownloadOutlined,
  IntegrationInstructionsOutlined,
  ChevronRight,
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
  SupportAgentOutlined,
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

export const DashboardSidebar = ({ activeItem, open, onSelect, onNavigate, onClose }) => {
  const visibleSections = dashboardNavigation
    .map((section) => {
      const visibleItems = section.items.filter((item) => !item.permission || hasPermission(item.permission));
      if (visibleItems.length === 0) return null;
      return { ...section, items: visibleItems };
    })
    .filter(Boolean);

  return (
    <>
      <button className={`bd-sidebar-backdrop ${open ? 'is-open' : ''}`} onClick={onClose} aria-label="Close navigation" />
      <aside id="app-primary-navigation" className={`bd-sidebar ${open ? 'is-open' : ''}`} aria-label="Primary navigation">
        <button className="bd-sidebar-brand" onClick={() => onNavigate('/dashboard')} aria-label="Go to dashboard" >
          <InvoiceBillingLogo size={20} />
          <strong>INVOICE<span>.</span>BILLING</strong>
        </button>
        <div className="bd-sidebar-scroll">
        <nav className="bd-sidebar-nav">
          {visibleSections.map((section) => <div className="bd-nav-section" key={section.label}>
            <small>{section.label}</small>
            {section.items.map((item) => {
              const Icon = iconMap[item.icon] || DashboardOutlined;
              return <button key={item.id} className={`bd-nav-item ${item.id === 'user-role-administration' ? 'bd-nav-item-user-role' : ''} ${activeItem === item.id ? 'active' : ''}`} aria-label={item.label} title={item.label} aria-current={activeItem === item.id ? 'page' : undefined} onClick={() => item.route ? onNavigate(item.route) : onSelect(item.id)}>
                <Icon /><span>{item.label}</span>{!item.route && <ChevronRight className="bd-nav-arrow" />}
              </button>;
            })}
          </div>)}
        </nav>
        <div className="bd-sidebar-footer">
          <button onClick={() => onSelect('support')} aria-label="Help & Support" ><SupportAgentOutlined /><span>Help & Support</span></button>
          <p>Workspace</p><strong>Acme Business India</strong>
        </div>
        </div>
      </aside>
    </>
  );
};
