export const dashboardNavigation = [
  {
    label: 'Overview',
    items: [{ id: 'dashboard', label: 'Dashboard', icon: 'dashboard', route: '/dashboard' }],
  },
  {
    label: 'Billing',
    items: [
      { id: 'invoices', label: 'Invoices', icon: 'invoice', route: '/invoices' },
      { id: 'payments', label: 'Payments', icon: 'payment' },
      { id: 'customers', label: 'Customers', icon: 'customer' },
      { id: 'products', label: 'Products & Services', icon: 'product' },
      { id: 'credit-notes', label: 'Credit Notes', icon: 'credit' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'recurring', label: 'Recurring Billing', icon: 'recurring' },
      { id: 'expenses', label: 'Expenses', icon: 'expense' },
      { id: 'taxes', label: 'Taxes & GST', icon: 'tax' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { id: 'reports', label: 'Reports', icon: 'report' },
      { id: 'activity', label: 'Audit Activity', icon: 'activity' },
    ],
  },
];
