import React, { useState } from 'react';
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
} from '@mui/icons-material';
import {
  SIDEBAR_SECTIONS,
  QUICK_ACTION_PILLS,
  FUNNEL_DATA,
  PROFIT_LOSS_DATA,
  EXPENSES_DATA,
  BANK_ACCOUNTS_DATA,
  TOP_CUSTOMERS_DATA,
} from './dashboardData';
import '../../styles/Dashboard.css';

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
                        onClick={() => setActiveTab(item.id)}
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

          {/* SECTION HEADER: BUSINESS AT A GLANCE */}
          <div className="qb-section-header">
            <Typography variant="h5" className="qb-section-title">
              Business at a glance
            </Typography>

            <div className="qb-section-controls">
              <Tooltip title="Customize Widgets">
                <IconButton size="small" className="qb-tool-btn">
                  <Tune fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={isBalanceHidden ? 'Show Balances' : 'Hide Balances'}>
                <IconButton
                  size="small"
                  onClick={() => setIsBalanceHidden(!isBalanceHidden)}
                  className="qb-tool-btn"
                >
                  {isBalanceHidden ? <Visibility fontSize="small" /> : <VisibilityOff fontSize="small" />}
                </IconButton>
              </Tooltip>
            </div>
          </div>

          {/* 2-COLUMN DASHBOARD GRID */}
          <div className="qb-dashboard-grid">
            {/* LEFT MAJOR COLUMN (~68%) */}
            <div className="qb-grid-left-col">
              {/* 1. SALES & GET PAID FUNNEL */}
              <div className="qb-card qb-funnel-card">
                <div className="qb-card-header">
                  <span className="qb-card-title">SALES &amp; GET PAID FUNNEL</span>
                  <div className="qb-card-dropdown">
                    <span>{activeFunnelPeriod}</span>
                    <KeyboardArrowDown sx={{ fontSize: 16 }} />
                  </div>
                </div>

                <div className="qb-funnel-stages-row">
                  {/* Stage 1: Action */}
                  <div className="funnel-stage-box stage-action">
                    <span className="stage-action-title">
                      {FUNNEL_DATA.stages[0].title}
                    </span>
                    <span className="stage-action-link">
                      {FUNNEL_DATA.stages[0].linkText}
                    </span>
                    <button className="stage-action-btn">
                      <span>{FUNNEL_DATA.stages[0].actionLabel}</span>
                      <KeyboardArrowDown sx={{ fontSize: 16 }} />
                    </button>
                  </div>

                  {/* Stage 2: Not paid */}
                  <div className="funnel-stage-box stage-metric">
                    <div className="stage-indicator-bar bar-amber" />
                    <span className="stage-label">{FUNNEL_DATA.stages[1].label}</span>
                    <span className="stage-amount">{maskValue(FUNNEL_DATA.stages[1].amount)}</span>
                    <div className="stage-chip chip-warning">
                      <WarningAmber sx={{ fontSize: 13, mr: 0.5 }} />
                      <span>{FUNNEL_DATA.stages[1].chipText}</span>
                    </div>
                  </div>

                  {/* Stage 3: Paid */}
                  <div className="funnel-stage-box stage-metric">
                    <div className="stage-indicator-bar bar-cyan" />
                    <span className="stage-label">{FUNNEL_DATA.stages[2].label}</span>
                    <span className="stage-amount">{maskValue(FUNNEL_DATA.stages[2].amount)}</span>
                    <div className="stage-chip chip-alert">
                      <ErrorOutline sx={{ fontSize: 13, mr: 0.5 }} />
                      <span>{FUNNEL_DATA.stages[2].chipText}</span>
                    </div>
                  </div>

                  {/* Stage 4: Deposited */}
                  <div className="funnel-stage-box stage-metric">
                    <div className="stage-indicator-bar bar-green" />
                    <span className="stage-label">{FUNNEL_DATA.stages[3].label}</span>
                    <span className="stage-amount">{maskValue(FUNNEL_DATA.stages[3].amount)}</span>
                    <div className="stage-chip chip-success">
                      <CheckCircleOutline sx={{ fontSize: 13, mr: 0.5 }} />
                      <span>{FUNNEL_DATA.stages[3].chipText}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. SPLIT ROW: PROFIT & LOSS + EXPENSES */}
              <div className="qb-split-row">
                {/* PROFIT & LOSS CARD */}
                <div className="qb-card qb-pl-card">
                  <div className="qb-card-header">
                    <span className="qb-card-title">PROFIT &amp; LOSS</span>
                    <div className="qb-card-dropdown">
                      <span>{activePLPeriod}</span>
                      <KeyboardArrowDown sx={{ fontSize: 16 }} />
                    </div>
                  </div>

                  <span className="qb-card-subtitle">{PROFIT_LOSS_DATA.subtitle}</span>

                  <div className="pl-profit-headline">
                    <span className="pl-profit-val">{maskValue(PROFIT_LOSS_DATA.netProfit)}</span>
                    <span className="pl-info-pill">
                      <InfoOutlined sx={{ fontSize: 14, mr: 0.3 }} />
                      <span>{PROFIT_LOSS_DATA.profitPercent}</span>
                    </span>
                  </div>

                  <div className="pl-trend-row">
                    <ArrowUpward sx={{ fontSize: 14, color: '#10B981', mr: 0.5 }} />
                    <span>{PROFIT_LOSS_DATA.trendText}</span>
                  </div>

                  {/* Income Progress Bar */}
                  <div className="pl-metric-section">
                    <div className="pl-metric-label-row">
                      <span className="pl-metric-val">{maskValue(PROFIT_LOSS_DATA.income.amount)}</span>
                      <span className="pl-review-link">{PROFIT_LOSS_DATA.income.reviewText}</span>
                    </div>
                    <span className="pl-bar-tag">Income</span>
                    <div className="pl-bar-container">
                      <div className="pl-bar-fill fill-income" style={{ width: `${PROFIT_LOSS_DATA.income.percent}%` }} />
                      <div className="pl-bar-hatched hatched-income" />
                    </div>
                  </div>

                  {/* Expense Progress Bar */}
                  <div className="pl-metric-section">
                    <div className="pl-metric-label-row">
                      <span className="pl-metric-val">{maskValue(PROFIT_LOSS_DATA.expense.amount)}</span>
                      <span className="pl-review-link">{PROFIT_LOSS_DATA.expense.reviewText}</span>
                    </div>
                    <span className="pl-bar-tag">Expense</span>
                    <div className="pl-bar-container">
                      <div className="pl-bar-fill fill-expense" style={{ width: `${PROFIT_LOSS_DATA.expense.percent}%` }} />
                      <div className="pl-bar-hatched hatched-expense" />
                    </div>
                  </div>

                  <div className="qb-card-footer">
                    <span className="qb-card-link">{PROFIT_LOSS_DATA.footerLink}</span>
                    <IconButton size="small"><MoreVert fontSize="small" /></IconButton>
                  </div>
                </div>

                {/* EXPENSES DONUT CARD */}
                <div className="qb-card qb-expenses-card">
                  <div className="qb-card-header">
                    <span className="qb-card-title">EXPENSES</span>
                    <div className="qb-card-dropdown">
                      <span>{activeExpPeriod}</span>
                      <KeyboardArrowDown sx={{ fontSize: 16 }} />
                    </div>
                  </div>

                  <span className="qb-card-subtitle">{EXPENSES_DATA.subtitle}</span>

                  <div className="pl-profit-headline">
                    <span className="pl-profit-val">{maskValue(EXPENSES_DATA.totalSpending)}</span>
                    <span className="pl-info-pill">
                      <InfoOutlined sx={{ fontSize: 14, mr: 0.3 }} />
                      <span>{EXPENSES_DATA.spendingPercent}</span>
                    </span>
                  </div>

                  <div className="pl-trend-row trend-amber">
                    <ArrowUpward sx={{ fontSize: 14, color: '#F59E0B', mr: 0.5 }} />
                    <span>{EXPENSES_DATA.trendText}</span>
                  </div>

                  {/* Donut Chart & Category Legend */}
                  <div className="exp-chart-layout">
                    {/* SVG Donut Chart */}
                    <div className="exp-donut-wrapper">
                      <svg viewBox="0 0 42 42" className="exp-donut-svg">
                        <circle cx="21" cy="21" r="15.91549430918954" fill="#ffffff" />
                        <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#F5ECE3" strokeWidth="6" />
                        {/* Segment 1: Rent & lease 38% */}
                        <circle
                          cx="21" cy="21" r="15.91549430918954" fill="transparent"
                          stroke="#2563EB" strokeWidth="6" strokeDasharray="38 62" strokeDashoffset="25"
                        />
                        {/* Segment 2: Inventory 26% */}
                        <circle
                          cx="21" cy="21" r="15.91549430918954" fill="transparent"
                          stroke="#06B6D4" strokeWidth="6" strokeDasharray="26 74" strokeDashoffset="-13"
                        />
                        {/* Segment 3: Automotive 16% */}
                        <circle
                          cx="21" cy="21" r="15.91549430918954" fill="transparent"
                          stroke="#8B5CF6" strokeWidth="6" strokeDasharray="16 84" strokeDashoffset="-39"
                        />
                        {/* Segment 4: Salary & wages 12% */}
                        <circle
                          cx="21" cy="21" r="15.91549430918954" fill="transparent"
                          stroke="#F97316" strokeWidth="6" strokeDasharray="12 88" strokeDashoffset="-55"
                        />
                        {/* Segment 5: Other 8% */}
                        <circle
                          cx="21" cy="21" r="15.91549430918954" fill="transparent"
                          stroke="#DC2626" strokeWidth="6" strokeDasharray="8 92" strokeDashoffset="-67"
                        />
                      </svg>
                    </div>

                    {/* Category List */}
                    <div className="exp-categories-list">
                      {EXPENSES_DATA.categories.map((cat, idx) => (
                        <div key={idx} className="exp-category-row">
                          <span className="cat-dot" style={{ backgroundColor: cat.color }} />
                          <span className="cat-name">{cat.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="qb-card-footer">
                    <span className="qb-card-link">{EXPENSES_DATA.footerLink}</span>
                    <IconButton size="small"><MoreVert fontSize="small" /></IconButton>
                  </div>
                </div>
              </div>

              {/* 3. TOP CUSTOMERS CARD */}
              <div className="qb-card qb-customers-card">
                <div className="qb-card-header">
                  <span className="qb-card-title">TOP CUSTOMERS</span>
                  <div className="qb-card-dropdown">
                    <span>{activeCustPeriod}</span>
                    <KeyboardArrowDown sx={{ fontSize: 16 }} />
                  </div>
                </div>

                <div className="customers-list-stack">
                  {TOP_CUSTOMERS_DATA.map((cust) => (
                    <div key={cust.id} className="cust-row-item">
                      <div className="cust-info-block">
                        <span className="cust-name">{cust.name}</span>
                        <span className="cust-invoices">{cust.invoices} invoices</span>
                      </div>
                      <div className="cust-bar-wrapper">
                        <div className="cust-bar-track">
                          <div className="cust-bar-fill" style={{ width: `${cust.share}%` }} />
                        </div>
                      </div>
                      <span className="cust-amount">{maskValue(cust.volume)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN (~32%): BANK ACCOUNTS */}
            <div className="qb-grid-right-col">
              <div className="qb-card qb-bank-card">
                <div className="qb-card-header">
                  <span className="qb-card-title">BANK ACCOUNTS</span>
                  <span className="qb-card-meta">{BANK_ACCOUNTS_DATA.asOf}</span>
                </div>

                <span className="qb-card-subtitle">{BANK_ACCOUNTS_DATA.subtitle}</span>
                <span className="qb-total-bank-val">{maskValue(BANK_ACCOUNTS_DATA.totalBalance)}</span>

                {/* Accounts List */}
                <div className="bank-accounts-stack">
                  {/* Account 1: Checking (1234) */}
                  <div className="bank-account-item">
                    <div className="bank-avatar-icon avatar-blue">
                      <AccountBalance sx={{ fontSize: 20, color: '#0052cc' }} />
                    </div>
                    <div className="bank-account-details">
                      <div className="bank-account-title-row">
                        <span className="bank-account-name">{BANK_ACCOUNTS_DATA.accounts[0].name}</span>
                        <span className="bank-balance-num">{maskValue(BANK_ACCOUNTS_DATA.accounts[0].bankBalance)}</span>
                      </div>
                      <div className="bank-account-sub-row">
                        <span className="portal-balance-lbl">Bank balance</span>
                        <span className="portal-balance-val">in invoice.billing {maskValue(BANK_ACCOUNTS_DATA.accounts[0].portalBalance)}</span>
                      </div>
                      <div className="bank-account-footer-row">
                        <span className="bank-sync-time">{BANK_ACCOUNTS_DATA.accounts[0].updated}</span>
                        <span className="bank-review-link">{BANK_ACCOUNTS_DATA.accounts[0].reviewText}</span>
                      </div>
                    </div>
                  </div>

                  {/* Account 2: Mastercard (0987) */}
                  <div className="bank-account-item">
                    <div className="bank-avatar-icon avatar-navy">
                      <CreditCard sx={{ fontSize: 20, color: '#003366' }} />
                    </div>
                    <div className="bank-account-details">
                      <div className="bank-account-title-row">
                        <span className="bank-account-name">{BANK_ACCOUNTS_DATA.accounts[1].name}</span>
                        <span className="bank-balance-num">{maskValue(BANK_ACCOUNTS_DATA.accounts[1].bankBalance)}</span>
                      </div>
                      <div className="bank-account-sub-row">
                        <span className="portal-balance-lbl">Bank balance</span>
                        <span className="portal-balance-val">in invoice.billing {maskValue(BANK_ACCOUNTS_DATA.accounts[1].portalBalance)}</span>
                      </div>
                      <div className="bank-account-footer-row">
                        <span className="bank-sync-time">{BANK_ACCOUNTS_DATA.accounts[1].updated}</span>
                        <span className="bank-review-link">{BANK_ACCOUNTS_DATA.accounts[1].reviewText}</span>
                      </div>
                    </div>
                  </div>

                  {/* Account 3: Working Capital Offer Card */}
                  <div className="bank-account-item bank-offer-item">
                    <div className="bank-avatar-icon avatar-green">
                      <span className="qb-mini-logo">qb</span>
                    </div>
                    <div className="bank-account-details">
                      <div className="bank-account-title-row">
                        <span className="bank-account-name">{BANK_ACCOUNTS_DATA.workingCapital.title}</span>
                        <button className="bank-apply-btn">
                          {BANK_ACCOUNTS_DATA.workingCapital.actionText}
                        </button>
                      </div>
                      <span className="bank-offer-sub">{BANK_ACCOUNTS_DATA.workingCapital.subtitle}</span>
                    </div>
                  </div>
                </div>

                <div className="qb-card-footer">
                  <span className="qb-card-link">{BANK_ACCOUNTS_DATA.footerLink}</span>
                  <IconButton size="small"><MoreVert fontSize="small" /></IconButton>
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
