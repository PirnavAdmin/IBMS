/**
 * Mock & Temporary Data Layer for invoice.billing Dashboard UI
 * Replicating QuickBooks Business Dashboard Structure
 */

export const SIDEBAR_SECTIONS = [
  {
    title: 'OVERVIEW',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'Dashboard', active: true },
    ],
  },
  {
    title: 'BILLING',
    items: [
      { id: 'customers', label: 'Customers', icon: 'PeopleOutline' },
      { id: 'products', label: 'Products & Services', icon: 'Inventory2Outlined' },
      { id: 'invoices', label: 'Invoices', icon: 'ReceiptOutlined', hasSubmenu: true },
      { id: 'payments', label: 'Payments', icon: 'CurrencyRupee' },
      { id: 'credit-notes', label: 'Credit Notes', icon: 'AssignmentReturnOutlined' },
    ],
  },
  {
    title: 'SETTINGS',
    items: [
      { id: 'tax-config', label: 'Tax Configuration', icon: 'TuneOutlined' },
      { id: 'numbering', label: 'Invoice Numbering', icon: 'Tag' },
      { id: 'templates', label: 'Templates & Branding', icon: 'PaletteOutlined' },
    ],
  },
  {
    title: 'ANALYTICS',
    items: [
      { id: 'reports', label: 'Reports', icon: 'BarChartOutlined', hasSubmenu: true },
      { id: 'audit-logs', label: 'Audit Logs', icon: 'HistoryOutlined' },
    ],
  },
  {
    title: 'INTEGRATIONS',
    items: [
      { id: 'integrations', label: 'Integrations', icon: 'HubOutlined' },
    ],
  },
];

export const QUICK_ACTION_PILLS = [
  { id: 'get-paid', label: 'Get paid online' },
  { id: 'create-invoice', label: 'Create invoice', primary: true },
  { id: 'create-check', label: 'Create check' },
  { id: 'add-deposit', label: 'Add bank deposit' },
  { id: 'record-expense', label: 'Record expense' },
  { id: 'show-all', label: 'Show all', isLink: true },
];

export const FUNNEL_DATA = {
  period: 'This month',
  stages: [
    {
      id: 'create-request',
      type: 'action',
      title: 'Create a new payment request',
      linkText: 'Learn more',
      actionLabel: 'Request pay...',
      borderTopColor: '#9A4F2F',
    },
    {
      id: 'not-paid',
      type: 'metric',
      label: 'Not paid',
      amount: '₹500.00',
      numericValue: 500,
      chipText: '3 overdue invoices',
      chipType: 'warning',
      borderTopColor: '#F59E0B',
    },
    {
      id: 'paid',
      type: 'metric',
      label: 'Paid',
      amount: '₹1,080.00',
      numericValue: 1080,
      chipText: '1 deposit on hold',
      chipType: 'alert',
      borderTopColor: '#06B6D4',
    },
    {
      id: 'deposited',
      type: 'metric',
      label: 'Deposited',
      amount: '₹2,500.00',
      numericValue: 2500,
      chipText: '1 deposited',
      chipType: 'success',
      borderTopColor: '#10B981',
    },
  ],
};

export const PROFIT_LOSS_DATA = {
  period: 'This month',
  subtitle: 'Net profit for May',
  netProfit: '₹3,900',
  profitPercent: '80%',
  trendText: 'Up 80% from this time last quarter',
  income: {
    amount: '₹26,000',
    percent: 85,
    reviewCount: 8,
    reviewText: '8 to review',
    color: '#10B981',
  },
  expense: {
    amount: '₹22,100',
    percent: 72,
    reviewCount: 15,
    reviewText: '15 to review',
    color: '#06B6D4',
  },
  footerLink: 'Categorize 77 transactions',
};

export const EXPENSES_DATA = {
  period: 'This month',
  subtitle: 'Spending for March',
  totalSpending: '₹22,100',
  spendingPercent: '100%',
  trendText: 'Up 34% from this time last month',
  categories: [
    { name: 'Rent & lease', percentage: 38, amount: '₹8,398', color: '#2563EB' },
    { name: 'Inventory assets', percentage: 26, amount: '₹5,746', color: '#06B6D4' },
    { name: 'Automotive', percentage: 16, amount: '₹3,536', color: '#8B5CF6' },
    { name: 'Salary & wages', percentage: 12, amount: '₹2,652', color: '#F97316' },
    { name: 'Other', percentage: 8, amount: '₹1,768', color: '#DC2626' },
  ],
  footerLink: 'View all spending',
};

export const BANK_ACCOUNTS_DATA = {
  asOf: 'As of today',
  subtitle: "Today's bank balance",
  totalBalance: '₹46,380',
  accounts: [
    {
      id: 'checking-1234',
      name: 'Checking (1234)',
      type: 'bank',
      bankBalance: '₹32,300.00',
      portalBalance: '₹4,000.00',
      updated: 'Updated 5 sec ago',
      reviewText: '4 to review',
      iconType: 'chase',
    },
    {
      id: 'mastercard-0987',
      name: 'Mastercard (0987)',
      type: 'card',
      bankBalance: '₹8,080.00',
      portalBalance: '₹2,000.00',
      updated: 'Updated 3 days ago',
      reviewText: '9 to review',
      iconType: 'mastercard',
    },
  ],
  workingCapital: {
    title: 'QuickBooks Term Loan',
    subtitle: 'Up to ₹20,00,000 may be available',
    actionText: 'Apply',
  },
  footerLink: 'Go to registers',
};

export const TOP_CUSTOMERS_DATA = [
  { id: '1', name: 'ABC Traders Logistics', volume: '₹12,400', share: 78, invoices: 24 },
  { id: '2', name: 'Nova Cloud Services', volume: '₹8,950', share: 56, invoices: 18 },
  { id: '3', name: 'Zenith Global Retail', volume: '₹6,200', share: 42, invoices: 12 },
  { id: '4', name: 'Apex Engineering Corp', volume: '₹4,800', share: 31, invoices: 9 },
  { id: '5', name: 'Nexus Telecom Infra', volume: '₹3,150', share: 22, invoices: 7 },
];

/* --- Outstanding invoice and bill management system dashboard data --- */
export const OVERDUE_DASHBOARD_TABS = [
  { id: 'overview', label: 'Overview', sublabel: '' },
  { id: 'this-month', label: 'This month', sublabel: 'September' },
  { id: 'last-30', label: 'Last 30 days', sublabel: '07 Aug-05 Sep' },
  { id: 'this-quarter', label: 'This quarter', sublabel: 'Jul-Sep' },
  { id: 'this-year', label: 'This year', sublabel: '2026' },
  { id: 'all-time', label: 'All time', sublabel: '' },
];

export const OVERDUE_KPI_METRICS = {
  trackedHours: {
    billed: { hrs: '1305', min: '26', sec: '39' },
    unbilled: { hrs: '187', min: '00', sec: '00' },
  },
  cashFlow: {
    net: '₹ 1,02,265.13',
    received: '₹1,82,528.93',
    sent: '₹81,263.81',
  },
  pendingInvoices: {
    total: '₹1,17,350.12',
    overdue: '₹97,749.98',
    paidPercent: 78,
  },
  expenses: '₹82,542.74',
};

export const REVENUE_PERIODS = {
  year: [
    { month: 'Jan', amount: 48500, label: '₹48.5k' },
    { month: 'Feb', amount: 62000, label: '₹62.0k' },
    { month: 'Mar', amount: 78900, label: '₹78.9k' },
    { month: 'Apr', amount: 54200, label: '₹54.2k' },
    { month: 'May', amount: 89100, label: '₹89.1k' },
    { month: 'Jun', amount: 94300, label: '₹94.3k' },
    { month: 'Jul', amount: 71200, label: '₹71.2k' },
    { month: 'Aug', amount: 104500, label: '₹104.5k' },
    { month: 'Sep', amount: 118200, label: '₹118.2k' },
    { month: 'Oct', amount: 86400, label: '₹86.4k' },
    { month: 'Nov', amount: 92700, label: '₹92.7k' },
    { month: 'Dec', amount: 125000, label: '₹125.0k' },
  ],
  q1: [
    { month: 'Jan', amount: 48500, label: '₹48.5k' },
    { month: 'Feb', amount: 62000, label: '₹62.0k' },
    { month: 'Mar', amount: 78900, label: '₹78.9k' },
  ],
  q2: [
    { month: 'Apr', amount: 54200, label: '₹54.2k' },
    { month: 'May', amount: 89100, label: '₹89.1k' },
    { month: 'Jun', amount: 94300, label: '₹94.3k' },
  ],
  q3: [
    { month: 'Jul', amount: 71200, label: '₹71.2k' },
    { month: 'Aug', amount: 104500, label: '₹104.5k' },
    { month: 'Sep', amount: 118200, label: '₹118.2k' },
  ],
  q4: [
    { month: 'Oct', amount: 86400, label: '₹86.4k' },
    { month: 'Nov', amount: 92700, label: '₹92.7k' },
    { month: 'Dec', amount: 125000, label: '₹125.0k' },
  ],
};

export const TRACKED_HOURS_BARS = [
  { date: 'Jul 7', hours: 22 },
  { date: 'Jul 16', hours: 59 },
  { date: 'Jul 21', hours: 26 },
  { date: 'Jul 28', hours: 50 },
  { date: 'Aug 4', hours: 24 },
  { date: 'Aug 11', hours: 50 },
  { date: 'Aug 16', hours: 52 },
  { date: 'Aug 25', hours: 78 },
  { date: 'Sep 1', hours: 26 },
  { date: 'Sep 6', hours: 85 },
  { date: 'Sep 15', hours: 29 },
  { date: 'Sep 22', hours: 25 },
  { date: 'Sep 29', hours: 60 },
  { date: 'Sep 30', hours: 20 },
];

export const OVERDUE_INVOICES = [
  { id: 'Invoice #20', date: 'Aug 15, 2026', amount: '₹178.32' },
  { id: 'Invoice #20', date: 'Aug 23, 2026', amount: '₹3,030.00' },
  { id: 'Invoice #20', date: 'Mar 7, 2026', amount: '₹3,774.00' },
];

export const OVERDUE_BILLS = [
  { id: 'Bill # 003893', date: 'Sep 16, 2025', amount: '₹54.39' },
  { id: 'Bill # 005438', date: 'Aug 23, 2026', amount: '₹15.01' },
  { id: 'Bill # 001915', date: 'Sep 11, 2025', amount: '₹15.01' },
];

export const CUSTOMER_BALANCES = [
  { name: 'Bill winter', amount: '₹ 7,000.34' },
  { name: 'Nick summer', amount: '₹ 4,033.00' },
  { name: 'Bill mayor', amount: '₹ 3,253.00' },
];

