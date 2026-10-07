import { CheckCircleOutline, DescriptionOutlined, ReceiptLongOutlined, WarningAmber, AccountBalanceWalletOutlined } from '@mui/icons-material';
import { money } from '../../pages/Dashboard/dashboardModel';
const icons = { invoice: ReceiptLongOutlined, paid: CheckCircleOutline, wallet: AccountBalanceWalletOutlined, warning: WarningAmber, draft: DescriptionOutlined };
export const formatInr = value => money(value, 'INR');
export const StatCard = ({ data }) => { const Icon = icons[data.icon]; return <article className={`premium-stat premium-stat-${data.id}`}><div><i aria-hidden="true"><Icon /></i><span>{data.label}</span></div><strong>{data.value == null ? 'Unavailable' : data.valueType === 'number' ? data.value : money(data.value, data.currency)}</strong><small>{data.meta}</small></article>; };
