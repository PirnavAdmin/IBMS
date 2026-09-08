import { formatInr } from './StatCard';

const CardHeading = ({ title, subtitle, filter }) => <div className="bd-card-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{filter && <select defaultValue={filter} aria-label={`${title} period`}><option>{filter}</option></select>}</div>;
export const RevenueChart = ({ data }) => {
  const maximum = Math.max(10000, ...data.flatMap((item) => [item.invoiced, item.collected]));
  const ceiling = Math.ceil(maximum / 10000) * 10000;
  const x = (i) => data.length === 1 ? 220 : 18 + i * (404 / Math.max(1, data.length - 1));
  const y = (value) => 182 - (value / ceiling) * 172;
  const points = (key) => data.map((item, i) => `${x(i)},${y(item[key])}`).join(' ');
  return <article className="bd-card bd-revenue"><CardHeading title="Revenue Trend" subtitle="Sample invoiced and collected amounts for selected filters" />
    {!data.length ? <p className="bd-no-results">No records in this date range.</p> : <>
      <div className="bd-line-chart"><div className="bd-y-labels">{[1, .75, .5, .25, 0].map((ratio) => <span key={ratio}>{new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(ceiling * ratio)}</span>)}</div>
      <svg viewBox="0 0 440 190" preserveAspectRatio="none" role="img" aria-label="Invoiced and collected revenue in INR"><g className="bd-grid-lines">{[10, 53, 96, 139, 182].map((n) => <line key={n} x1="0" y1={n} x2="440" y2={n} />)}</g>
      <polyline className="bd-line invoiced" points={points('invoiced')} /><polyline className="bd-line collected" points={points('collected')} />
      {data.map((item, i) => <g key={item.label}><circle cx={x(i)} cy={y(item.invoiced)} r="4" fill="#6f2f0d"><title>{item.label}: invoiced {formatInr(item.invoiced)}</title></circle><circle cx={x(i)} cy={y(item.collected)} r="4" fill="#dc8b54"><title>{item.label}: collected {formatInr(item.collected)}</title></circle></g>)}
      </svg><div className="bd-x-labels">{data.map((item) => <span key={item.label}>{item.label}</span>)}</div></div>
      <div className="bd-legend"><span><i className="dark" />Invoiced</span><span><i />Collected</span></div>
    </>}
  </article>;
};

export const InvoiceStatusChart = ({ data }) => {
  const max = Math.max(1, ...data.map((item) => item.value));
  return <article className="bd-card"><CardHeading title="Invoice Status" subtitle="Monthly revenue performance" filter="Last 6 Months" /><div className="bd-bars" aria-label="Invoice status vertical bar chart">{data.map((item) => <div key={item.label} className="bd-bar-column"><div className="bd-bar" style={{ height: `${(item.value / max) * 88}%` }} title={`${item.value} invoices`} /><span>{item.label}</span></div>)}</div></article>;
};

export const OutstandingAging = ({ data }) => {
  const max = Math.max(1, ...data.map((item) => item.value));
  return <article className="bd-card"><CardHeading title="Outstanding Aging" subtitle="Sample outstanding amount by aging period" /><div className="bd-aging">{data.map((item) => <div className="bd-aging-row" key={item.label}><span>{item.label}</span><div className="bd-aging-track"><i style={{ width: `${(item.value / max) * 100}%`, background: item.color }} /></div><strong>{formatInr(item.value)}</strong></div>)}</div></article>;
};
