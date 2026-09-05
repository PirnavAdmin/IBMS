import { ArrowUpward, CheckCircle, CreditCard, Description, ReceiptLong, Warning, Wallet } from '@mui/icons-material';

const icons = { invoice: ReceiptLong, paid: CheckCircle, wallet: Wallet, warning: Warning, draft: Description, card: CreditCard };
export const formatInr = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

export const StatCard = ({ data }) => {
  const Icon = icons[data.icon] || ReceiptLong;
  return <article className={`bd-stat bd-tone-${data.tone}`}><div className="bd-stat-icon"><Icon /></div><div className="bd-stat-copy"><span>{data.label}</span><strong>{data.valueType === 'number' ? data.value : formatInr(data.value)}</strong><small className={data.trend ? 'bd-positive' : ''}>{data.trend && <ArrowUpward fontSize="inherit" />}{data.meta}</small></div></article>;
};
