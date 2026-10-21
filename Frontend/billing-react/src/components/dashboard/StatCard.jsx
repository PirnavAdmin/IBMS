import { Link } from 'react-router-dom';
import { CheckCircleOutline, DescriptionOutlined, ReceiptLongOutlined, WarningAmber, AccountBalanceWalletOutlined } from '@mui/icons-material';
import { money } from '../../pages/Dashboard/dashboardModel';
const icons = { invoice: ReceiptLongOutlined, paid: CheckCircleOutline, wallet: AccountBalanceWalletOutlined, warning: WarningAmber, draft: DescriptionOutlined };
export const formatInr = value => money(value, 'INR');
export const summaryDestination = id => ({ invoiced: '/invoices', paid: '/payments', outstanding: '/invoices', overdue: '/invoices', drafts: '/invoices' }[id]);
export const StatCard = ({ data }) => { const Icon = icons[data.icon]; const to = data.value == null ? undefined : summaryDestination(data.id); const Card = to ? Link : 'article'; return <Card to={to} className={`premium-stat premium-stat-${data.id}${to ? ' premium-stat-link dashboard-clickable-card' : ''}`}><div><i aria-hidden="true"><Icon /></i><span>{data.label}</span></div><strong className="dashboard-kpi-value">{data.value == null ? 'Unavailable' : data.valueType === 'number' ? data.value : money(data.value, data.currency)}</strong><small>{data.meta}</small></Card>; };
