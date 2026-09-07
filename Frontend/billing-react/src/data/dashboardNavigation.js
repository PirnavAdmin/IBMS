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
      { id: 'taxes', label: 'Taxes & GST', icon: 'tax' },
      { id: 'recurring', label: 'Recurring Billing', icon: 'recurring' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { id: 'reports', label: 'Reports', icon: 'report' },
    ],
  },
  {
    label: 'Configuration & Administration',
    items: [
      { id: 'templates', label: 'Templates & Branding', icon: 'template' },
      { id: 'numbering', label: 'Invoice Numbering', icon: 'numbering' },
      { id: 'activity', label: 'Audit Activity', icon: 'activity' },
      { id: 'integrations', label: 'Integration Settings', icon: 'integration' },
      { id: 'settings', label: 'Settings / Administration', icon: 'settings' },
    ],
  },
];
