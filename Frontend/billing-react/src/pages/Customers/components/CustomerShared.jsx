import { displayDate as invoiceDate, displayDateTime } from '../../../utils/localDate';
import { Card, Skeleton } from '@mui/material';
import { DashboardErrorState } from '../../../components/dashboard/DashboardStates';
import { StatusBadge as DashboardStatusBadge } from '../../../components/dashboard/DashboardSections';
const StatusBadge = ({ value }) => value == null || value === '' ? <span>—</span> : <DashboardStatusBadge value={String(value)} />;
const formatCurrency = (value, currency) => {
  if (value == null || value === '' || !Number.isFinite(Number(value)) || !currency?.trim()) return '—';
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency.trim().toUpperCase() }).format(Number(value)); } catch { return '—'; }
};

export { StatusBadge, formatCurrency };
export const displayDate = (value, time = false) => time ? displayDateTime(value, { includeSeconds: false, includeZone: false }) : invoiceDate(value);
export function CustomerState({ query }) {
  if (query.isPending) return <div role="status" aria-label="Loading customer data" className="customer-detail-skeleton"><Skeleton height={80} /><div className="customer-summary">{[0, 1, 2].map(i => <Skeleton key={i} variant="rounded" height={92} />)}</div><Skeleton variant="rounded" height={220} /></div>;
  if (query.isError) return <DashboardErrorState title={["NOT_FOUND", "INVALID_ID"].includes(query.error.code) ? "Customer not found" : "Unable to load customer data"} message={query.error.message} onRetry={!['NOT_FOUND', 'INVALID_ID'].includes(query.error.code) ? () => query.refetch() : undefined} />;
  return null;
}
export function InformationCard({ title, fields }) {
  return <Card className="customer-card" component="section"><h2>{title}</h2><dl className="customer-fields">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value === null || value === undefined || value === '' ? '—' : value}</dd></div>)}</dl></Card>;
}
export function FinancialSummary({ items, currency }) {
  return <div className="customer-summary">{items.map(([label, amount, highlight, count]) => <Card key={label} className={`customer-summary-card ${highlight ? 'customer-summary-highlight' : ''}`}><span>{label}</span><strong>{count ? (amount ?? '—') : formatCurrency(amount, currency)}</strong></Card>)}</div>;
}
