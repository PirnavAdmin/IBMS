export const dashboardNavigation = [
  {
    label: 'Overview',
    items: [{ id: 'dashboard', label: 'Dashboard', icon: 'dashboard', route: '/dashboard' }],
  },
  {
    label: 'Billing',
    items: [
      { id: 'invoices', label: 'Invoices', icon: 'invoice', route: '/invoices', permission: 'invoices.view' },
      { id: 'quotations', label: 'Quotation Management', icon: 'quotation', route: '/quotations', permission: 'quotations.view' },
      { id: 'payments', label: 'Payments', icon: 'payment', route: '/payments', permission: 'payments.view' },
      { id: 'customers', label: 'Customers', icon: 'customer', route: '/customers', permission: 'customers.view' },
      { id: 'products', label: 'Products & Services', icon: 'product', route: '/products', permission: 'products.view' },
      { id: 'credit-notes', label: 'Credit Notes', icon: 'credit', route: '/credit-notes', permission: 'creditnotes.view' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'recurring', label: 'Recurring Billing', icon: 'recurring', route: '/recurring-billing', permission: 'billing.view' },
      { id: 'background-jobs', label: 'Background Jobs', icon: 'jobs', route: '/background-jobs', permission: ['settings.view', 'settings.manage', 'integrations.manage'] },
      { id: 'export-jobs', label: 'Export Jobs', icon: 'exports', route: '/export-jobs', permission: ['billing.view', 'invoices.view', 'reports.view'] },
    ],
  },
  {
    label: 'Insights',
    items: [
      { id: 'reports', label: 'Reports', icon: 'report', route: '/reports', permission: 'reports.view' },
    ],
  },
  {
    label: 'Configuration & Administration',
    items: [
      { id: 'templates', label: 'Templates & Branding', icon: 'template', route: '/templates-branding', permission: ['settings.view', 'settings.manage', 'invoices.manage'] },
      { id: 'activity', label: 'Audit Activity', icon: 'activity', route: '/audit-activity', permission: 'audit.view' },
      { id: 'integrations', label: 'Integration Settings', icon: 'integration', route: '/integrations', permission: 'integrations.manage' },
      { id: 'webhooks', label: 'Webhook Configuration', icon: 'integration', route: '/webhooks', permission: 'integrations.manage' },
      { id: 'user-role-administration', label: 'User & Role Administration', icon: 'user-role', route: '/user-role-administration', permission: ['users.view', 'roles.view', 'users.assign'] },
      { id: 'settings', label: 'Settings / Administration', icon: 'settings', route: '/settings', permission: ['settings.view', 'settings.manage'] },
    ],
  },
];
