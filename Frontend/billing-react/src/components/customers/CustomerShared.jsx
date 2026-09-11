import { Card, Skeleton } from '@mui/material';
import { DashboardErrorState } from '../dashboard/DashboardStates';
import { StatusBadge as DashboardStatusBadge } from '../dashboard/DashboardSections';
const StatusBadge = ({ value }) => value == null || value === '' ? <span>—</span> : <DashboardStatusBadge value={String(value)} />;
const formatCurrency = (value, currency = 'INR') => {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
  const curr = currency || 'INR';
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: curr }).format(Number(value)); } catch { return `${value} ${curr}`; }
};

export { StatusBadge, formatCurrency };
export const displayDate = (value, time = false) => value && !Number.isNaN(Date.parse(value)) ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(new Date(value.length === 10 ? `${value}T00:00:00` : value)) : '—';
export function CustomerState({ query }) {
  if (query.isPending) return <div role="status" aria-label="Loading customer data"><Skeleton height={80} /><Skeleton variant="rounded" height={220} /></div>;
  if (query.isError) return <DashboardErrorState title={["NOT_FOUND", "INVALID_ID"].includes(query.error.code) ? "Customer not found" : "Unable to load customer data"} message={query.error.message} onRetry={!['NOT_FOUND', 'INVALID_ID'].includes(query.error.code) ? () => query.refetch() : undefined} />;
  return null;
}
export function InformationCard({ title, fields }) {
  return <Card className="customer-card" component="section"><h2>{title}</h2><dl className="customer-fields">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value === null || value === undefined || value === '' ? '—' : value}</dd></div>)}</dl></Card>;
}
export function FinancialSummary({ items, currency }) {
  return <div className="customer-summary">{items.map(([label, amount, highlight, count]) => <Card key={label} className={`customer-summary-card ${highlight ? 'customer-summary-highlight' : ''}`}><span>{label}</span><strong>{count ? (amount ?? '—') : formatCurrency(amount, currency)}</strong></Card>)}</div>;
}
