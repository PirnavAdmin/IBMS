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
      amount: '$500.00',
      numericValue: 500,
      chipText: '3 overdue invoices',
      chipType: 'warning',
      borderTopColor: '#F59E0B',
    },
    {
      id: 'paid',
      type: 'metric',
      label: 'Paid',
      amount: '$1,080.00',
      numericValue: 1080,
      chipText: '1 deposit on hold',
      chipType: 'alert',
      borderTopColor: '#06B6D4',
    },
    {
      id: 'deposited',
      type: 'metric',
      label: 'Deposited',
      amount: '$2,500.00',
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
  netProfit: '$3,900',
  profitPercent: '80%',
  trendText: 'Up 80% from this time last quarter',
  income: {
    amount: '$26,000',
    percent: 85,
    reviewCount: 8,
    reviewText: '8 to review',
    color: '#10B981',
  },
  expense: {
    amount: '$22,100',
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
  totalSpending: '$22,100',
  spendingPercent: '100%',
  trendText: 'Up 34% from this time last month',
  categories: [
    { name: 'Rent & lease', percentage: 38, amount: '$8,398', color: '#2563EB' },
    { name: 'Inventory assets', percentage: 26, amount: '$5,746', color: '#06B6D4' },
    { name: 'Automotive', percentage: 16, amount: '$3,536', color: '#8B5CF6' },
    { name: 'Salary & wages', percentage: 12, amount: '$2,652', color: '#F97316' },
    { name: 'Other', percentage: 8, amount: '$1,768', color: '#DC2626' },
  ],
  footerLink: 'View all spending',
};

export const BANK_ACCOUNTS_DATA = {
  asOf: 'As of today',
  subtitle: "Today's bank balance",
  totalBalance: '$46,380',
  accounts: [
    {
      id: 'checking-1234',
      name: 'Checking (1234)',
      type: 'bank',
      bankBalance: '$32,300.00',
      portalBalance: '$4,000.00',
      updated: 'Updated 5 sec ago',
      reviewText: '4 to review',
      iconType: 'chase',
    },
    {
      id: 'mastercard-0987',
      name: 'Mastercard (0987)',
      type: 'card',
      bankBalance: '$8,080.00',
      portalBalance: '$2,000.00',
      updated: 'Updated 3 days ago',
      reviewText: '9 to review',
      iconType: 'mastercard',
    },
  ],
  workingCapital: {
    title: 'QuickBooks Term Loan',
    subtitle: 'Up to $200K may be available',
    actionText: 'Apply',
  },
  footerLink: 'Go to registers',
};

export const TOP_CUSTOMERS_DATA = [
  { id: '1', name: 'ABC Traders Logistics', volume: '$12,400', share: 78, invoices: 24 },
  { id: '2', name: 'Nova Cloud Services', volume: '$8,950', share: 56, invoices: 18 },
  { id: '3', name: 'Zenith Global Retail', volume: '$6,200', share: 42, invoices: 12 },
  { id: '4', name: 'Apex Engineering Corp', volume: '$4,800', share: 31, invoices: 9 },
  { id: '5', name: 'Nexus Telecom Infra', volume: '$3,150', share: 22, invoices: 7 },
];
