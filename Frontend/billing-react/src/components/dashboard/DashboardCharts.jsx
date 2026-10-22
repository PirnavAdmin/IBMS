import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowForward } from '@mui/icons-material';
import { Tooltip } from '@mui/material';
import { money } from '../../pages/Dashboard/dashboardModel';
import { agingRadial, outstandingInvoiceDetails, revenueAmounts, revenueCohort } from '../../pages/Dashboard/dashboardRadial';
import { displayDate } from '../../utils/localDate';

const chartTooltipProps = { arrow: true, enterTouchDelay: 0 };

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
const AmountRing = ({ label, value, currency, tone, percentage, description }) => (
  <Tooltip {...chartTooltipProps} title={<><strong>{label}: {value == null ? 'Unavailable' : money(value, currency)}</strong><br />{description}</>}>
  <div className={`premium-amount-ring premium-ring-${tone}`} tabIndex={0} aria-label={`${label}: ${value == null ? 'Unavailable' : money(value, currency)}. ${description}`}>
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
  </Tooltip>
);

export const RevenueChart = ({ data, currency, summary, invoices = [] }) => {
  const amounts = revenueAmounts(summary);
  const cohort = revenueCohort(invoices, currency);
  const { invoiced, collected } = cohort || amounts;
  const trend = data.slice(-6);
  const maximum = Math.max(1, ...trend.flatMap(row => [row.invoiced, row.collected]));
  return <article className="premium-panel premium-revenue-overview">
    <header><div><h2>Revenue Trend</h2><p>{cohort ? 'Collections against issued invoices in this range' : 'Monthly invoiced and completed collections'} &middot; {currency}</p></div><Link className="premium-view-all" to="/invoices">View all <ArrowForward fontSize="small" /></Link></header>
    {!data.length ? <div className="premium-empty">No billing activity in this date range.</div> : <>
      <div className="premium-revenue-rings">
        <AmountRing label="Invoiced" value={invoiced} currency={currency} tone="invoiced" percentage={cohort?.invoicedPercent} description="Total value of issued invoices in the selected date range. Drafts, cancelled and voided invoices are excluded." />
        <AmountRing label="Collected" value={collected} currency={currency} tone="collected" percentage={cohort?.collectedPercent} description={cohort ? `${cohort.collectedPercent.toFixed(1)}% collected against these same issued invoices, based on their paid balances.` : 'Completed payments by payment date. These may relate to invoices issued outside this range.'} />
      </div>
      <div className="premium-monthly-trend" aria-label="Recent monthly revenue">
        <div className="premium-trend-heading"><span>Monthly activity</span><small><i />Invoiced <i />Collected</small></div>
        <div className="premium-month-bars">{trend.map(row => <Tooltip key={row.label} {...chartTooltipProps} title={<>{row.label}<br />Invoiced: {money(row.invoiced, currency)}<br />Collected by payment date: {money(row.collected, currency)}</>}><div className="premium-month-column" tabIndex={0} aria-label={`${row.label}: invoiced ${money(row.invoiced, currency)}, collected by payment date ${money(row.collected, currency)}`}><div className="premium-month-bar-pair"><i style={{ height: `${Math.max(0, row.invoiced) / maximum * 100}%` }} /><i style={{ height: `${Math.max(0, row.collected) / maximum * 100}%` }} /></div><small>{row.label}</small></div></Tooltip>)}</div>
      </div>
      <details className="premium-chart-data"><summary>Monthly breakdown</summary><div className="premium-table-scroll ibms-table-frame"><table><thead><tr><th>Month</th><th>Invoiced</th><th>Collected (payment dates)</th></tr></thead><tbody>{data.map(row => <tr key={row.label}><td>{row.label}</td><td>{money(row.invoiced, currency)}</td><td>{money(row.collected, currency)}</td></tr>)}</tbody></table></div></details>
    </>}
  </article>;
};

export const OutstandingAging = ({ data, currency, invoices = [] }) => {
  const id = useId();
  const [hoveredBucket, setHoveredBucket] = useState(null);
  const [selectedBucket, setSelectedBucket] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const { total, buckets, currentShare } = agingRadial(data);
  const segments = buckets.filter(row => row.value > 0);
  const activeBucket = buckets.find(row => row.label === (hoveredBucket || selectedBucket));
  const outstanding = outstandingInvoiceDetails(invoices, currency);
  const detailRows = outstanding.filter(row => !selectedBucket || row.agingBucket === selectedBucket);
  const overdue = buckets.filter(row => !['Current', 'No due date'].includes(row.label)).reduce((sum, row) => sum + row.value, 0);
  const selectBucket = label => { setSelectedBucket(current => current === label ? null : label); setShowDetails(true); };
  return <article className="premium-panel premium-aging-panel">
    <header><div><h2>Outstanding Aging</h2><p>Outstanding aging breakdown &middot; Current balances &middot; {currency}</p></div></header>
    {total === 0 ? <div className="premium-empty">No outstanding balances in this date range.</div> : <>
    <div className="premium-aging-insights"><span>Overdue balance <strong>{money(overdue, currency)}</strong></span><span>Open invoices <strong>{outstanding.length}</strong></span></div>
    <div className="premium-aging">
      <div className="premium-aging-ring">
        <svg viewBox="0 0 200 200" role="img" aria-labelledby={id}>
          <title id={id}>{`Outstanding ${money(total, currency)}. ${segments.map(row => `${row.label}: ${money(row.value, currency)}, ${row.share.toFixed(1)}%`).join('; ')}`}</title>
          <RingSurface className="premium-aging-center" radius={94} />

          <circle className="premium-aging-track" cx="100" cy="100" r="79" />
          <g transform="rotate(-90 100 100)">{segments.map(row => <circle className={`premium-aging-segment ${activeBucket?.label === row.label ? 'is-active' : ''}`} key={row.label} cx="100" cy="100" r="79" pathLength="100" fill="none" stroke={row.color} strokeWidth="17" strokeDasharray={`${row.share} ${100 - row.share}`} strokeDashoffset={-row.offset} onMouseEnter={() => setHoveredBucket(row.label)} onMouseLeave={() => setHoveredBucket(null)} onClick={() => selectBucket(row.label)}><title>{`${row.label}: ${money(row.value, currency)} (${row.share.toFixed(1)}%)`}</title></circle>)}</g>

        </svg>
        <div className="premium-ring-value" aria-live="polite"><small>{activeBucket?.label || 'Outstanding'}</small><strong>{money(activeBucket?.value ?? total, currency)}</strong><span className="premium-current-share">{(activeBucket?.share ?? currentShare).toFixed(1)}% <small>{activeBucket ? 'of total outstanding' : 'Current'}</small></span></div>
      </div>
      <div className="premium-aging-legend">{buckets.filter(row => row.label !== 'No due date' || row.value > 0).map(row => <Tooltip key={row.label} {...chartTooltipProps} title={`${row.label}: ${money(row.value, currency)} · ${row.share.toFixed(1)}% of outstanding. ${outstanding.filter(invoice => invoice.agingBucket === row.label).length} open invoices. Select to view details.`}><button type="button" className={activeBucket?.label === row.label ? 'is-active' : ''} aria-pressed={selectedBucket === row.label} aria-controls={`${id}-details`} onMouseEnter={() => setHoveredBucket(row.label)} onMouseLeave={() => setHoveredBucket(null)} onFocus={() => setHoveredBucket(row.label)} onBlur={() => setHoveredBucket(null)} onClick={() => selectBucket(row.label)}><span className="premium-aging-bucket"><i aria-hidden="true" style={{ background: row.color }} />{row.label}</span><small>{row.share.toFixed(1)}%</small><strong>{money(row.value, currency)}</strong><span className="premium-bucket-meter" aria-hidden="true"><i style={{ width: `${row.share}%`, background: row.color }} /></span></button></Tooltip>)}</div>
    </div>
    <div className="premium-outstanding-details"><button type="button" className="premium-details-toggle" aria-expanded={showDetails} aria-controls={`${id}-details`} onClick={() => setShowDetails(current => !current)}>{showDetails ? 'Hide' : 'View'} outstanding details <span aria-hidden="true">{showDetails ? '−' : '+'}</span></button>
      {showDetails && <div id={`${id}-details`}><div className="premium-details-heading"><strong>{selectedBucket || 'All outstanding invoices'} <small>({detailRows.length})</small></strong>{selectedBucket && <button type="button" onClick={() => setSelectedBucket(null)}>Show all</button>}</div>{detailRows.length ? <div className="premium-table-scroll ibms-table-frame"><table><thead><tr><th>Invoice / Customer</th><th>Due date</th><th>Balance</th></tr></thead><tbody>{detailRows.map(row => <tr key={row.id}><td><Link to={`/invoices/${row.id}`}>{row.invoiceNumber || `Invoice #${row.id}`}</Link><small>{row.customerName || row.customer?.name || 'NA'}</small></td><td>{row.dueDate ? displayDate(row.dueDate) : 'No due date'}</td><td>{money(row.balanceAmount, currency)}</td></tr>)}</tbody></table></div> : <p className="premium-empty">No outstanding invoices in this bucket.</p>}</div>}
    </div>
    </>}
  </article>;
};
