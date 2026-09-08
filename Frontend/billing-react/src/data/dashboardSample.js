import { dashboardMockData } from './dashboardMockData.js';

// Deterministic frontend-only fixtures. Never used to save financial records.
export const sampleApplications = ['All Applications', 'Web App', 'Partner Portal'];
export const sampleUnits = ['All Units', 'North', 'South'];
export const defaultDashboardFilters = { start: '2026-07-01', end: '2026-09-30', application: 'All Applications', unit: 'All Units' };
const customers = ['TechNova Pvt Ltd', 'ABC Solutions', 'CloudSoft Technologies', 'Nexa Labs', 'DigitalEdge'];
const records = Array.from({ length: 108 }, (_, i) => {
  const month = Math.floor(i / 12) + 1;
  const date = `2026-${String(month).padStart(2, '0')}-${String((i % 12) * 2 + 1).padStart(2, '0')}`;
  const amount = (12500 + (i * 791) % 67000) * 100;
  const draft = i % 7 === 0;
  const paid = draft ? 0 : i % 3 === 0 ? amount : i % 3 === 1 ? Math.floor(amount / 2) : 0;
  return { id: `INV-${1100 + i}`, date, dueDate: `2026-${String(Math.min(month + 1, 12)).padStart(2, '0')}-01`, application: i % 2 ? 'Partner Portal' : 'Web App', unit: Math.floor(i / 2) % 2 ? 'South' : 'North', customer: customers[i % customers.length], amount, paid, draft };
});

export function selectDashboardSample(filters) {
  const rows = records.filter((r) => (!filters.start || r.date >= filters.start) && (!filters.end || r.date <= filters.end) && (filters.application === 'All Applications' || r.application === filters.application) && (filters.unit === 'All Units' || r.unit === filters.unit));
  const issued = rows.filter((r) => !r.draft);
  const asOf = filters.end || '2026-09-30';
  const daysDue = (r) => Math.floor((Date.parse(asOf) - Date.parse(r.dueDate)) / 86400000);
  const sum = (list, key) => list.reduce((total, row) => total + row[key], 0);
  const total = sum(issued, 'amount'), paid = sum(issued, 'paid');
  const overdue = issued.filter((r) => daysDue(r) > 0 && r.amount > r.paid);
  const summary = structuredClone(dashboardMockData.summary);
  summary.totalInvoiced = { ...summary.totalInvoiced, value: total / 100, meta: `${issued.length} issued invoices` };
  summary.totalPaid = { ...summary.totalPaid, value: paid / 100, meta: `${issued.filter((r) => r.paid > 0).length} payments` };
  summary.outstanding = { ...summary.outstanding, value: (total - paid) / 100, meta: `${issued.filter((r) => r.paid < r.amount).length} unpaid invoices` };
  summary.overdue = { ...summary.overdue, value: (sum(overdue, 'amount') - sum(overdue, 'paid')) / 100, meta: `${overdue.length} overdue invoices` };
  summary.drafts = { ...summary.drafts, value: rows.length - issued.length, meta: 'Not included in issued totals' };
  const months = [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort();
  const revenue = months.map((month) => { const group = issued.filter((r) => r.date.startsWith(month)); return { label: new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en', { month: 'short', timeZone: 'UTC' }), invoiced: sum(group, 'amount') / 100, collected: sum(group, 'paid') / 100 }; });
  const outstandingAging = [{ label: 'Current', max: 0 }, { label: '1-30 Days', max: 30 }, { label: '31-60 Days', max: 60 }, { label: '61-90 Days', max: 90 }, { label: '90+ Days', max: Infinity }].map((bucket, index, buckets) => ({ label: bucket.label, color: ['#6f2f0d', '#dea071', '#f4c18e', '#ff934c', '#ff5252'][index], value: issued.filter((r) => daysDue(r) <= bucket.max && (index === 0 || daysDue(r) > buckets[index - 1].max)).reduce((n, r) => n + r.amount - r.paid, 0) / 100 }));
  const topCustomers = customers.map((customer) => ({ customer, amount: sum(issued.filter((r) => r.customer === customer), 'amount') / 100, initials: customer[0] })).filter((r) => r.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 5).map((r, index) => ({ ...r, rank: index + 1 }));
  const recentPayments = issued.filter((r) => r.paid > 0).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map((r, index) => ({ customer: r.customer, invoice: r.id, method: ['UPI', 'Bank Transfer', 'Credit Card'][index % 3], amount: r.paid / 100, status: 'Completed' }));
  return { summary, revenue, outstandingAging, topCustomers, recentPayments, tableColumns: dashboardMockData.tableColumns, recordCount: rows.length };
}
