import { Add, Assessment, CurrencyRupee, Description, MailOutline, ReceiptLong, Warning } from '@mui/icons-material';
import { formatInr } from './StatCard';

export const StatusBadge = ({ value }) => <span className={`bd-badge bd-badge-${value.toLowerCase().replaceAll(' ', '-')}`}>{value}</span>;
const CardTitle = ({ title, warning, onViewAll }) => <div className="bd-section-title"><h2>{warning && <Warning />}{title}</h2>{onViewAll && <button onClick={onViewAll}>View All <span>&rarr;</span></button>}</div>;

export const DataTableCard = ({ title, columns, rows, className = '', icon, onViewAll }) => {
  const tableClass = `bd-table-${title.toLowerCase().replaceAll(' ', '-')}`;
  return <article className={`bd-card bd-table-card ${tableClass} ${className}`}><CardTitle title={title} warning={icon === 'warning'} onViewAll={onViewAll} /><div className="bd-table-scroll"><table><thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={`${title}-${index}`}>{columns.map((column) => <td key={column.key} className={`bd-cell-${column.key} ${column.type === 'danger' ? 'bd-danger' : ''}`}>{column.type === 'currency' ? formatInr(row[column.key]) : column.type === 'status' ? <StatusBadge value={row[column.key]} /> : row[column.key]}</td>)}</tr>) : <tr><td className="bd-no-results" colSpan={columns.length}>No matching records found.</td></tr>}</tbody></table></div></article>;
};

export const TopCustomers = ({ data, onViewAll }) => <article className="bd-card bd-span-3"><CardTitle title="Top Customers" onViewAll={onViewAll} /><div className="bd-customer-head"><span>#</span><span>Customer</span><span>Amount</span></div>{data.length ? data.map((customer, index) => <div className="bd-customer-row" key={customer.customer}><span>{customer.rank}</span><span><i className={`bd-customer-avatar avatar-${index}`}>{customer.initials}</i>{customer.customer}</span><strong>{formatInr(customer.amount)}</strong></div>) : <p className="bd-no-results">No matching customers.</p>}</article>;

const activityIcons = { payment: CurrencyRupee, invoice: Description, sent: MailOutline, overdue: Warning };
export const RecentActivity = ({ data }) => <article className="bd-card bd-span-4"><CardTitle title="Recent Activity" /><div className="bd-activity-list">{data.length ? data.map((activity) => { const Icon = activityIcons[activity.type] || ReceiptLong; return <div className={`bd-activity bd-activity-${activity.type}`} key={activity.id}><i><Icon /></i><span><strong>{activity.text}</strong><small>{activity.timestamp}</small></span></div>; }) : <p className="bd-no-results">No matching activity.</p>}</div></article>;

const quickActions = [
  { label: 'Create Invoice', icon: Add, route: '/invoices/new', tone: 'brown' },
  { label: 'Record Payment', icon: CurrencyRupee, tone: 'green', unavailable: 'Payment entry is not available yet.' },
  { label: 'View Overdue', icon: Warning, route: '/invoices?status=Overdue', tone: 'red' },
  { label: 'Reports', icon: Assessment, route: '/reports', tone: 'neutral' },
];
export const QuickActions = ({ onAction }) => <article className="bd-card bd-dashboard-actions"><CardTitle title="Quick Actions" /><div className="bd-quick-grid">{quickActions.map((action) => { const Icon = action.icon; return <div key={action.label} title={action.unavailable}><button className={`bd-quick bd-quick-${action.tone}`} disabled={Boolean(action.unavailable)} onClick={() => onAction(action)}><Icon /><span>{action.label}</span></button>{action.unavailable && <small>{action.unavailable}</small>}</div>; })}</div></article>;
