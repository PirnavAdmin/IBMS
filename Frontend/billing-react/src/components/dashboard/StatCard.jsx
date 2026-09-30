import { ArrowUpward, CheckCircle, CreditCard, Description, ReceiptLong, Warning, Wallet } from '@mui/icons-material';
import { useId } from 'react';

const icons = { invoice: ReceiptLong, paid: CheckCircle, wallet: Wallet, warning: Warning, draft: Description, card: CreditCard };
export const formatInr = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

export const StatCard = ({ data }) => {
  const Icon = icons[data.icon] || ReceiptLong;
  const waveId = useId();
  return <article className={`bd-stat bd-tone-${data.tone}`}>
    <svg className="bd-stat-wave" viewBox="0 0 180 64" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={waveId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity=".32" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0 63 C25 63 28 51 52 52 S85 51 102 31 S126 13 145 16 S168 12 180 3 L180 64 L0 64 Z" fill={`url(#${waveId})`} />
      <path d="M0 63 C25 63 28 51 52 52 S85 51 102 31 S126 13 145 16 S168 12 180 3" fill="none" stroke="white" strokeOpacity=".38" strokeWidth="1.2" />
    </svg>
    <div className="bd-stat-icon"><Icon /></div><div className="bd-stat-copy"><span>{data.label}</span><strong>{data.valueType === 'number' ? data.value : formatInr(data.value)}</strong><small className={data.trend ? 'bd-positive' : ''}>{data.trend && <ArrowUpward fontSize="inherit" />}{data.meta}</small></div></article>;
};
