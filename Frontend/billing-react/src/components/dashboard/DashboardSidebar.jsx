import {
  AccountBalanceWalletOutlined,
  AssessmentOutlined,
  AutorenewOutlined,
  ChevronRight,
  DashboardOutlined,
  HistoryOutlined,
  Inventory2Outlined,
  PaymentsOutlined,
  PeopleOutline,
  ReceiptLongOutlined,
  ReceiptOutlined,
  RequestQuoteOutlined,
  SettingsOutlined,
  SupportAgentOutlined,
} from '@mui/icons-material';
import { dashboardNavigation } from '../../data/dashboardNavigation';

const iconMap = {
  dashboard: DashboardOutlined,
  invoice: ReceiptLongOutlined,
  payment: PaymentsOutlined,
  customer: PeopleOutline,
  product: Inventory2Outlined,
  credit: RequestQuoteOutlined,
  recurring: AutorenewOutlined,
  expense: AccountBalanceWalletOutlined,
  tax: ReceiptOutlined,
  report: AssessmentOutlined,
  activity: HistoryOutlined,
};

export const DashboardSidebar = ({ activeItem, open, onSelect, onNavigate, onClose }) => (
  <>
    <button className={`bd-sidebar-backdrop ${open ? 'is-open' : ''}`} onClick={onClose} aria-label="Close navigation" />
    <aside className={`bd-sidebar ${open ? 'is-open' : ''}`} aria-label="Primary navigation">
      <button className="bd-sidebar-brand" onClick={() => onNavigate('/dashboard')}>
        <span><ReceiptLongOutlined /></span>
        <strong>invoice<span>.</span>billing</strong>
      </button>
      <nav className="bd-sidebar-nav">
        {dashboardNavigation.map((section) => <div className="bd-nav-section" key={section.label}>
          <small>{section.label}</small>
          {section.items.map((item) => {
            const Icon = iconMap[item.icon] || DashboardOutlined;
            return <button key={item.id} className={`bd-nav-item ${activeItem === item.id ? 'active' : ''}`} onClick={() => item.route ? onNavigate(item.route) : onSelect(item.id)}>
              <Icon /><span>{item.label}</span>{!item.route && <ChevronRight className="bd-nav-arrow" />}
            </button>;
          })}
        </div>)}
      </nav>
      <div className="bd-sidebar-footer">
        <button onClick={() => onSelect('settings')}><SettingsOutlined />Settings</button>
        <button onClick={() => onSelect('support')}><SupportAgentOutlined />Help & Support</button>
        <p>Workspace</p><strong>Acme Business India</strong>
      </div>
    </aside>
  </>
);
