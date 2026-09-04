const STORAGE_KEY = 'invoice_billing_invoices_v1';

const seedInvoices = [
  { id: 'INV-2026-0039', customer: 'ABC Traders Logistics', email: 'invoicing@abctraders.com', issueDate: '2026-08-15', dueDate: '2026-08-30', total: 178.32, status: 'overdue' },
  { id: 'INV-2026-0040', customer: 'Nova Cloud Services', email: 'accounts@novacloud.com', issueDate: '2026-08-23', dueDate: '2026-09-02', total: 3030, status: 'overdue' },
  { id: 'INV-2026-0041', customer: 'Bill winter', email: 'billing@winterglobal.com', issueDate: '2026-09-01', dueDate: '2026-09-16', total: 3774, status: 'sent' },
  { id: 'INV-2026-0038', customer: 'Apex Engineering Corp', email: 'finance@apexeng.com', issueDate: '2026-07-11', dueDate: '2026-07-26', total: 12400, status: 'paid' },
];

export const getInvoices = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : seedInvoices;
  } catch {
    return seedInvoices;
  }
};

export const saveInvoice = (invoice) => {
  const invoices = getInvoices();
  const index = invoices.findIndex((item) => item.id === invoice.id);
  const next = index >= 0
    ? invoices.map((item) => (item.id === invoice.id ? invoice : item))
    : [invoice, ...invoices];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
};

export const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 2,
}).format(Number(amount || 0));

export const formatDate = (date) => new Intl.DateTimeFormat('en-IN', {
  day: 'numeric', month: 'short', year: 'numeric',
}).format(new Date(`${date}T00:00:00`));
