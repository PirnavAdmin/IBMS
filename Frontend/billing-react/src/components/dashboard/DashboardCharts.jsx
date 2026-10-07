import { useId } from 'react';
import { Link } from 'react-router-dom';
import { ArrowForward } from '@mui/icons-material';
import { money } from '../../pages/Dashboard/dashboardModel';
import { agingRadial, revenueAmounts, revenueCohort } from '../../pages/Dashboard/dashboardRadial';

const RingSurface = ({ className, radius }) => {
  const id = useId();
  return <>
    <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stopColor="#fffcf7" /><stop offset="100%" stopColor="#f4eada" />
    </linearGradient></defs>
    <circle className={className} cx="100" cy="100" r={radius} fill={`url(#${id})`} />
  </>;
};

// Percentages use matched invoice totals and paid balances. Missing bases show amounts.
const AmountRing = ({ label, value, currency, tone, percentage }) => (
  <div className={`premium-amount-ring premium-ring-${tone}`}>
    <div className="premium-ring-visual">
      <svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">
        <RingSurface className="premium-ring-center" radius={92} />

        <circle className="premium-ring-track" cx="100" cy="100" r="80" />
        <circle className="premium-ring-progress" cx="100" cy="100" r="80" pathLength="100" strokeDasharray={percentage == null ? undefined : `${Math.min(100, Math.max(0, percentage))} 100`} transform="rotate(-90 100 100)" />

      </svg>
      <div className="premium-ring-value"><strong>{percentage != null ? `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(percentage)}%` : value == null ? 'Unavailable' : new Intl.NumberFormat('en-IN', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 2 }).format(value)}</strong><small>{label}</small></div>
    </div>
    <span className="premium-ring-label"><i />{label} <small>{value == null ? '' : money(value, currency)}</small></span>
  </div>
);

export const RevenueChart = ({ data, currency, summary, invoices = [] }) => {
  const amounts = revenueAmounts(summary);
  const cohort = revenueCohort(invoices, currency);
  const { invoiced, collected } = cohort || amounts;
  return <article className="premium-panel premium-revenue-overview">
    <header><div><h2>Revenue Trend</h2><p>{cohort ? 'Collections against issued invoices in this range' : 'Monthly invoiced and completed collections'} &middot; {currency}</p></div><Link className="premium-view-all" to="/invoices">View all <ArrowForward fontSize="small" /></Link></header>
    {!data.length ? <div className="premium-empty">No billing activity in this date range.</div> : <>
      <div className="premium-revenue-rings">
        <AmountRing label="Invoiced" value={invoiced} currency={currency} tone="invoiced" percentage={cohort?.invoicedPercent} />
        <AmountRing label="Collected" value={collected} currency={currency} tone="collected" percentage={cohort?.collectedPercent} />
      </div>
      <details className="premium-chart-data"><summary>Monthly breakdown</summary><div className="premium-table-scroll"><table><thead><tr><th>Month</th><th>Invoiced</th><th>Collected (payment dates)</th></tr></thead><tbody>{data.map(row => <tr key={row.label}><td>{row.label}</td><td>{money(row.invoiced, currency)}</td><td>{money(row.collected, currency)}</td></tr>)}</tbody></table></div></details>
    </>}
  </article>;
};

export const OutstandingAging = ({ data, currency }) => {
  const id = useId();
  const { total, buckets, currentShare } = agingRadial(data);
  const segments = buckets.filter(row => row.value > 0);
  return <article className="premium-panel premium-aging-panel">
    <header><div><h2>Outstanding Aging</h2><p>Outstanding aging breakdown &middot; Current balances &middot; {currency}</p></div></header>
    {total === 0 ? <div className="premium-empty">No outstanding balances in this date range.</div> : <div className="premium-aging">
      <div className="premium-aging-ring">
        <svg viewBox="0 0 200 200" role="img" aria-labelledby={id}>
          <title id={id}>Outstanding {money(total, currency)}. {segments.map(row => `${row.label}: ${money(row.value, currency)}, ${row.share.toFixed(1)}%`).join('; ')}</title>
          <RingSurface className="premium-aging-center" radius={94} />

          <circle className="premium-aging-track" cx="100" cy="100" r="79" />
          <g transform="rotate(-90 100 100)">{segments.map(row => <circle key={row.label} cx="100" cy="100" r="79" pathLength="100" fill="none" stroke={row.color} strokeWidth="17" strokeDasharray={`${row.share} ${100 - row.share}`} strokeDashoffset={-row.offset}><title>{row.label}: {money(row.value, currency)} ({row.share.toFixed(1)}%)</title></circle>)}</g>

        </svg>
        <div className="premium-ring-value"><small>Outstanding</small><strong>{money(total, currency)}</strong><span className="premium-current-share">{currentShare.toFixed(1)}% <small>Current</small></span></div>
      </div>
      <div className="premium-aging-legend">{buckets.filter(row => row.label !== 'No due date' || row.value > 0).map(row => <div key={row.label}><i style={{ background: row.color }} /><span>{row.label}</span><small>{row.share.toFixed(1)}%</small><strong>{money(row.value, currency)}</strong></div>)}</div>
    </div>}
  </article>;
};
