import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
} from '@mui/material';
import {
  KeyboardArrowDown,
  Search,
  Fullscreen,
  FullscreenExit,
  Tune,
  Visibility,
  VisibilityOff,
  MoreVert,
  InfoOutlined,
  ArrowUpward,
  Dashboard as DashboardIcon,
  PeopleOutline,
  Inventory2Outlined,
  ReceiptOutlined,
  CurrencyRupee,
  AssignmentReturnOutlined,
  TuneOutlined,
  Tag,
  PaletteOutlined,
  BarChartOutlined,
  HistoryOutlined,
  HubOutlined,
  ChevronRight,
  AccountCircle,
  SettingsOutlined,
  Logout,
  AutoAwesome,
  NotificationsNone,
  HelpOutline,
  BookmarkBorder,
  FlashOnOutlined,
  PictureInPictureAltOutlined,
  WarningAmber,
  CheckCircleOutline,
  ErrorOutline,
  CreditCard,
  AccountBalance,
  Receipt,
  LocalShipping,
} from '@mui/icons-material';
import {
  SIDEBAR_SECTIONS,
  QUICK_ACTION_PILLS,
  FUNNEL_DATA,
  PROFIT_LOSS_DATA,
  EXPENSES_DATA,
  BANK_ACCOUNTS_DATA,
  TOP_CUSTOMERS_DATA,
  OVERDUE_DASHBOARD_TABS,
  OVERDUE_KPI_METRICS,
  TRACKED_HOURS_BARS,
  OVERDUE_INVOICES,
  OVERDUE_BILLS,
  CUSTOMER_BALANCES,
  REVENUE_PERIODS,
} from './dashboardData';
import '../../styles/Dashboard.css';
import { formatCurrency, formatDate, getInvoices } from '../../data/billingStore';

const ICON_MAP = {
  Dashboard: DashboardIcon,
  PeopleOutline: PeopleOutline,
  Inventory2Outlined: Inventory2Outlined,
  ReceiptOutlined: ReceiptOutlined,
  CurrencyRupee: CurrencyRupee,
  AssignmentReturnOutlined: AssignmentReturnOutlined,
  TuneOutlined: TuneOutlined,
  Tag: Tag,
  PaletteOutlined: PaletteOutlined,
  BarChartOutlined: BarChartOutlined,
  HistoryOutlined: HistoryOutlined,
  HubOutlined: HubOutlined,
};

export const Dashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isBalanceHidden, setIsBalanceHidden] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState("David's Landscaping");
  const [companyAnchor, setCompanyAnchor] = useState(null);
  const [activeFunnelPeriod, setActiveFunnelPeriod] = useState('This month');
  const [activePLPeriod, setActivePLPeriod] = useState('This month');
  const [activeExpPeriod, setActiveExpPeriod] = useState('This month');
  const [activeCustPeriod, setActiveCustPeriod] = useState('This year');
  const [selectedTimeTab, setSelectedTimeTab] = useState('overview');
  const [revenuePeriod, setRevenuePeriod] = useState('year');
  const [searchQuery, setSearchQuery] = useState('');
  const invoices = useMemo(() => getInvoices(), []);
  const today = new Date();
  const visibleInvoices = useMemo(() => invoices.filter((invoice) => {
    const invoiceDate = new Date(`${invoice.issueDate}T00:00:00`);
    if (selectedTimeTab === 'this-month') return invoiceDate.getMonth() === today.getMonth() && invoiceDate.getFullYear() === today.getFullYear();
    if (selectedTimeTab === 'last-30') return (today - invoiceDate) / 86400000 <= 30;
    if (selectedTimeTab === 'this-quarter') return Math.floor(invoiceDate.getMonth() / 3) === Math.floor(today.getMonth() / 3) && invoiceDate.getFullYear() === today.getFullYear();
    if (selectedTimeTab === 'this-year') return invoiceDate.getFullYear() === today.getFullYear();
    return true;
  }), [invoices, selectedTimeTab]);
  const filteredInvoices = useMemo(() => visibleInvoices.filter((invoice) =>
    `${invoice.id} ${invoice.customer} ${invoice.status}`.toLowerCase().includes(searchQuery.toLowerCase())
  ), [visibleInvoices, searchQuery]);
  const overdueInvoices = filteredInvoices.filter((invoice) => invoice.status === 'overdue');
  const pendingInvoices = filteredInvoices.filter((invoice) => ['sent', 'overdue'].includes(invoice.status));
  const paidInvoices = filteredInvoices.filter((invoice) => invoice.status === 'paid');
  const pendingTotal = pendingInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const overdueTotal = overdueInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const receivedTotal = paidInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const customerBalanceRows = Object.entries(pendingInvoices.reduce((result, invoice) => {
    result[invoice.customer] = (result[invoice.customer] || 0) + invoice.total;
    return result;
  }, {})).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 3);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  const handleSignOut = () => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('billing_auth_token');
        localStorage.removeItem('billing_auth_user');
      }
    } catch (err) {
      console.warn('Error clearing credentials on sign out:', err);
    }
    navigate('/login');
  };

  const maskValue = (val) => (isBalanceHidden ? '••••••' : val);
  const handleNav = (itemId) => {
    if (itemId === 'invoices') navigate('/invoices');
    else setActiveTab(itemId);
  };

  return (
    <div className="qb-dashboard-container">
      {/* 1. TOP APP BAR */}
      <header className="qb-topbar">
        <div className="qb-topbar-left">
          {/* Company Selector Dropdown */}
          <div
            className="qb-company-pill"
            onClick={(e) => setCompanyAnchor(e.currentTarget)}
          >
            <span className="qb-company-name">{selectedCompany}</span>
            <KeyboardArrowDown sx={{ fontSize: 18, color: '#7D6E66' }} />
          </div>

          <Menu
            anchorEl={companyAnchor}
            open={Boolean(companyAnchor)}
            onClose={() => setCompanyAnchor(null)}
          >
            <MenuItem onClick={() => { setSelectedCompany("David's Landscaping"); setCompanyAnchor(null); }}>
              David's Landscaping (Primary)
            </MenuItem>
            <MenuItem onClick={() => { setSelectedCompany("Acme Enterprises Ltd"); setCompanyAnchor(null); }}>
              Acme Enterprises Ltd
            </MenuItem>
            <MenuItem onClick={() => { setSelectedCompany("Global Logistics Corp"); setCompanyAnchor(null); }}>
              Global Logistics Corp
            </MenuItem>
          </Menu>
        </div>

        {/* Global Search Pill Bar */}
        <div className="qb-search-container">
          <Search sx={{ fontSize: 20, color: '#7D6E66', ml: 1.5, mr: 1 }} />
          <input
            type="text"
            className="qb-search-input"
            placeholder="Search, jump to, or ask a question"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>

        {/* Right Utility Icons */}
        <div className="qb-topbar-right">
          <button className="qb-expert-btn">
            <div className="expert-avatar" />
            <span>Contact experts</span>
          </button>

          <Tooltip title="Bookmarks">
            <IconButton size="small" className="qb-icon-btn">
              <BookmarkBorder fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title="Quick Insights">
            <IconButton size="small" className="qb-icon-btn">
              <FlashOnOutlined fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title="Multi-Window">
            <IconButton size="small" className="qb-icon-btn">
              <PictureInPictureAltOutlined fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title="Notifications">
            <IconButton size="small" className="qb-icon-btn">
              <NotificationsNone fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title="Settings">
            <IconButton size="small" className="qb-icon-btn">
              <SettingsOutlined fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title="Help">
            <IconButton size="small" className="qb-icon-btn">
              <HelpOutline fontSize="small" />
            </IconButton>
          </Tooltip>

          {/* AI Assistant Pill Badge */}
          <div className="qb-ai-badge">
            <AutoAwesome sx={{ fontSize: 16, color: '#2563EB' }} />
          </div>
        </div>
      </header>

      {/* 2. BODY LAYOUT: SIDEBAR + MAIN VIEW */}
      <div className="qb-body-wrapper">
        {/* LEFT ENTERPRISE NAVIGATION SIDEBAR */}
        <aside className="qb-sidebar-enterprise">
          {/* Brand Logo Header */}
          <div className="qb-sidebar-header">
            <div className="qb-brand-mark">
              <span className="qb-brand-glyph">◈</span>
              <span className="qb-brand-bold">invoice</span>
              <span className="qb-brand-dot">.</span>
              <span className="qb-brand-light">billing</span>
            </div>
          </div>

          {/* Navigation Sections */}
          <div className="qb-sidebar-scroll-area">
            {SIDEBAR_SECTIONS.map((section, sIdx) => (
              <div key={sIdx} className="qb-nav-section-group">
                <span className="qb-section-heading-lbl">{section.title}</span>
                <div className="qb-nav-items-stack">
                  {section.items.map((item) => {
                    const IconComponent = ICON_MAP[item.icon] || DashboardIcon;
                    return (
                      <button
                        key={item.id}
                        className={`qb-enterprise-nav-item ${activeTab === item.id ? 'active' : ''}`}
                        onClick={() => handleNav(item.id)}
                      >
                        <div className="qb-item-left">
                          <IconComponent sx={{ fontSize: 18 }} className="qb-nav-glyph" />
                          <span className="qb-item-label">{item.label}</span>
                        </div>
                        {item.hasSubmenu && (
                          <ChevronRight sx={{ fontSize: 16, color: '#7D6E66' }} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Bottom Divider & User Profile + Actions */}
          <div className="qb-sidebar-bottom-panel">
            <div className="qb-sidebar-divider" />

            {/* Admin Profile Block */}
            <div className="qb-admin-profile-card">
              <div className="qb-admin-avatar">
                <AccountCircle sx={{ fontSize: 34, color: '#9A4F2F' }} />
              </div>
              <div className="qb-admin-info">
                <span className="qb-admin-name">Admin</span>
                <span className="qb-admin-role">Administrator</span>
              </div>
            </div>

            {/* Settings & Sign Out Actions */}
            <div className="qb-sidebar-user-actions">
              <button className="qb-user-action-btn" onClick={() => setActiveTab('settings')}>
                <SettingsOutlined sx={{ fontSize: 17 }} />
                <span>Settings</span>
              </button>

              <button className="qb-user-action-btn btn-signout" onClick={handleSignOut}>
                <Logout sx={{ fontSize: 17 }} />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </aside>

        {/* MAIN DASHBOARD CANVAS */}
        <main className="qb-main-content">
          {/* SUB-HEADER: CREATE ACTIONS PILLS */}
          <div className="qb-actions-subbar">
            <div className="qb-actions-group">
              <span className="qb-actions-title">Create actions</span>
              <div className="qb-pills-row">
                {QUICK_ACTION_PILLS.map((pill) =>
                  pill.isLink ? (
                    <button key={pill.id} className="qb-pill-link">
                      {pill.label}
                    </button>
                  ) : (
                    <button
                      key={pill.id}
                      className={`qb-action-pill ${pill.primary ? 'primary' : ''}`}
                      onClick={() => {
                        if (pill.id === 'create-invoice') navigate('/invoices/new');
                      }}
                    >
                      {pill.label}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="qb-subbar-tools">
              <Tooltip title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
                <IconButton size="small" onClick={toggleFullscreen} className="qb-tool-icon">
                  {isFullscreen ? <FullscreenExit fontSize="small" /> : <Fullscreen fontSize="small" />}
                </IconButton>
              </Tooltip>
            </div>
          </div>

          {/* ================= OUTSTANDING INVOICE AND BILL MANAGEMENT SYSTEM DASHBOARD ================= */}
          <div className="ob-dashboard-container">
            {/* Header */}
            <div className="ob-dashboard-header">
              <div className="ob-header-main-row">
                <div>
                  <h1 className="ob-dashboard-title">
                    Invoice &amp; Bill Management
                  </h1>
                  <p className="ob-dashboard-sub">
                    Real-time overview of cash flow, billable hours, receivables, and overdue balances.
                  </p>
                </div>
                <div className="ob-header-actions">
                  <button className="ob-primary-action-btn" onClick={() => navigate('/invoices/new')}>
                    + New Invoice
                  </button>
                </div>
              </div>
            </div>

            {/* Time Tabs Bar */}
            <div className="ob-tabs-bar">
              {OVERDUE_DASHBOARD_TABS.map((tab) => (
                <button
                  key={tab.id}
                  className={`ob-tab-btn ${selectedTimeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setSelectedTimeTab(tab.id)}
                >
                  <span className="ob-tab-label">{tab.label}</span>
                  {tab.sublabel && <span className="ob-tab-sublabel">{tab.sublabel}</span>}
                </button>
              ))}
            </div>

            {/* Top 4 KPI Cards */}
            <div className="ob-kpi-grid">
              {/* Card 1: Tracked hours */}
              <div className="ob-kpi-card">
                <div className="ob-kpi-header">Tracked hours</div>
                <div className="ob-kpi-body">
                  <div className="ob-time-row">
                    <span>Invoices</span> <span className="ob-time-num">{filteredInvoices.length}</span>
                  </div>
                  <div className="ob-time-row unbilled">
                    <span>Drafts</span> <span className="ob-time-num">{filteredInvoices.filter((invoice) => invoice.status === 'draft').length}</span>
                  </div>
                  <span className="ob-time-unbilled-lbl">Invoices in the selected period</span>
                </div>
              </div>

              {/* Card 2: Cash flow */}
              <div className="ob-kpi-card">
                <div className="ob-kpi-header">Cash flow</div>
                <div className="ob-kpi-body">
                  <span className="ob-cash-net">{maskValue(formatCurrency(receivedTotal - overdueTotal))}</span>
                  <div className="ob-cash-split">
                    <div className="ob-cash-col">
                      <span className="ob-cash-received">{maskValue(formatCurrency(receivedTotal))}</span>
                      <span className="ob-cash-sublbl">Payments received</span>
                    </div>
                    <div className="ob-cash-col">
                      <span className="ob-cash-sent">{maskValue(formatCurrency(overdueTotal))}</span>
                      <span className="ob-cash-sublbl">Outstanding receivables</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: Pending invoices */}
              <div className="ob-kpi-card">
                <div className="ob-kpi-header">Pending invoices</div>
                <div className="ob-kpi-body">
                  <span className="ob-pending-total">{maskValue(formatCurrency(pendingTotal))}</span>
                  <div className="ob-pending-donut-wrap">
                    <svg viewBox="0 0 36 36" className="ob-pending-donut">
                      <circle cx="18" cy="18" r="14" fill="none" stroke="#F4E8DC" strokeWidth="6" />
                      <circle
                        cx="18"
                        cy="18"
                        r="14"
                        fill="none"
                        stroke="#9A4F2F"
                        strokeWidth="6"
                        strokeDasharray={`${pendingTotal ? Math.round((overdueTotal / pendingTotal) * 100) : 0} ${pendingTotal ? 100 - Math.round((overdueTotal / pendingTotal) * 100) : 100}`}
                        strokeDashoffset="25"
                      />
                    </svg>
                  </div>
                  <span className="ob-pending-overdue">
                    Overdue : <strong className="ob-pending-overdue-val">{maskValue(formatCurrency(overdueTotal))}</strong>
                  </span>
                </div>
              </div>

              {/* Card 4: Expenses */}
              <div className="ob-kpi-card">
                <div className="ob-kpi-header">Expenses</div>
                <div className="ob-kpi-body">
                  <span className="ob-expenses-val">{maskValue(formatCurrency(0))}</span>
                  <span className="ob-cash-sublbl">Expense tracking coming next</span>
                </div>
              </div>
            </div>

            {/* Middle Section: Revenue Received (Month-wise) Bar Chart */}
            <div className="ob-chart-card">
              <div className="ob-chart-top-bar">
                <div className="ob-chart-title-group">
                  <span className="ob-chart-heading">Revenue Received (Month-wise)</span>
                  <span className="ob-chart-sub">Monthly breakdown of received customer payments</span>
                </div>
                <div className="ob-chart-filter-group">
                  <label htmlFor="rev-period-select" className="ob-chart-filter-lbl">Period:</label>
                  <select
                    id="rev-period-select"
                    className="ob-chart-period-select"
                    value={revenuePeriod}
                    onChange={(e) => setRevenuePeriod(e.target.value)}
                  >
                    <option value="year">Full Year 2026 (All Months)</option>
                    <option value="q1">Q1 (Jan - Mar)</option>
                    <option value="q2">Q2 (Apr - Jun)</option>
                    <option value="q3">Q3 (Jul - Sep)</option>
                    <option value="q4">Q4 (Oct - Dec)</option>
                  </select>
                </div>
              </div>

              <div className="ob-chart-main">
                <div className="ob-chart-y-axis">
                  <span className="ob-y-axis-title">Revenue (₹)</span>
                  <span className="ob-y-tick">₹120k</span>
                  <span className="ob-y-tick">₹90k</span>
                  <span className="ob-y-tick">₹60k</span>
                  <span className="ob-y-tick">₹30k</span>
                  <span className="ob-y-tick">₹0</span>
                </div>

                <div className="ob-chart-bars-area">
                  {/* Grid lines */}
                  <div className="ob-grid-line" style={{ bottom: '25%' }} />
                  <div className="ob-grid-line" style={{ bottom: '50%' }} />
                  <div className="ob-grid-line" style={{ bottom: '75%' }} />
                  <div className="ob-grid-line" style={{ bottom: '100%' }} />

                  {/* Monthly Revenue Bars */}
                  {(REVENUE_PERIODS[revenuePeriod] || REVENUE_PERIODS.year).map((bar, bIdx) => {
                    const heightPercent = Math.min(100, Math.round((bar.amount / 125000) * 100));
                    return (
                      <div
                        key={bIdx}
                        className="ob-bar-col"
                        title={`${bar.month}: ₹${bar.amount.toLocaleString('en-IN')} received`}
                      >
                        <div className="ob-bar-rect" style={{ height: `${heightPercent}%` }} />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="ob-x-labels-row">
                {(REVENUE_PERIODS[revenuePeriod] || REVENUE_PERIODS.year).map((bar, bIdx) => (
                  <span key={bIdx} className="ob-x-label">{bar.month}</span>
                ))}
              </div>

              <div className="ob-chart-footer">
                <span className="ob-legend-square" />
                <span>Monthly revenue received</span>
              </div>
            </div>

            {/* Bottom Row: 3 Green-Header Cards */}
            <div className="ob-tables-grid">
              {/* Table 1: Overdue invoices */}
              <div className="ob-table-card">
                <div className="ob-table-header">Overdue invoices</div>
                <div className="ob-table-body">
                  {overdueInvoices.length ? overdueInvoices.slice(0, 3).map((inv) => (
                    <div key={inv.id} className="ob-table-row">
                      <div className="ob-table-left">
                        <div className="ob-row-icon-circle">
                          <Receipt sx={{ fontSize: 16 }} />
                        </div>
                        <div className="ob-row-info">
                          <span className="ob-row-title">{inv.id} · {inv.customer}</span>
                          <span className="ob-row-date">Due {formatDate(inv.dueDate)}</span>
                        </div>
                      </div>
                      <span className="ob-row-amount-red">{maskValue(formatCurrency(inv.total))}</span>
                    </div>
                  )) : <div className="ob-table-row"><span className="ob-row-date">No overdue invoices for this view.</span></div>}
                </div>
              </div>

              {/* Table 2: Overdue bills */}
              <div className="ob-table-card">
                <div className="ob-table-header">Overdue bills</div>
                <div className="ob-table-body">
                  {OVERDUE_BILLS.map((bill, idx) => (
                    <div key={idx} className="ob-table-row">
                      <div className="ob-table-left">
                        <div className="ob-row-icon-circle">
                          <LocalShipping sx={{ fontSize: 16 }} />
                        </div>
                        <div className="ob-row-info">
                          <span className="ob-row-title">{bill.id}</span>
                          <span className="ob-row-date">{bill.date}</span>
                        </div>
                      </div>
                      <span className="ob-row-amount-red">{maskValue(bill.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Table 3: Customer balance */}
              <div className="ob-table-card">
                <div className="ob-table-header">Customer balance</div>
                <div className="ob-table-body">
                  {customerBalanceRows.length ? customerBalanceRows.map((cust) => (
                    <div key={cust.name} className="ob-table-row">
                      <div className="ob-table-left">
                        <div className="ob-row-icon-circle">
                          <AccountCircle sx={{ fontSize: 18 }} />
                        </div>
                        <div className="ob-row-info">
                          <span className="ob-row-title">{cust.name}</span>
                        </div>
                      </div>
                      <span className="ob-row-amount-dark">{maskValue(formatCurrency(cust.amount))}</span>
                    </div>
                  )) : <div className="ob-table-row"><span className="ob-row-date">No customer balances for this view.</span></div>}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
