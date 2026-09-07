import { useLocation } from 'react-router-dom';

const titles = { payments: 'Payments', customers: 'Customers', products: 'Products & Services', 'credit-notes': 'Credit Notes', 'recurring-billing': 'Recurring Billing', expenses: 'Expenses', taxes: 'Taxes & GST', reports: 'Reports', 'templates-branding': 'Templates & Branding', 'invoice-numbering': 'Invoice Numbering', 'audit-activity': 'Audit Activity', 'integration-settings': 'Integration Settings', settings: 'Settings / Administration', support: 'Help & Support' };

export const ModulePlaceholder = () => {
  const module = useLocation().pathname.split('/')[1];
  return <main className="module-placeholder"><div><span>Billing workspace</span><h1>{titles[module] || 'Module'}</h1><p>This module is ready for your content and backend integration.</p></div></main>;
};
