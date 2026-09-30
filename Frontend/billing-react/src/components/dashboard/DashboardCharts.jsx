import { formatInr } from './StatCard';

const CardHeading = ({ title, subtitle, filter }) => <div className="bd-card-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{filter && <select defaultValue={filter} aria-label={`${title} period`}><option>{filter}</option></select>}</div>;
export const RevenueChart = ({ data }) => {
  const maximum = Math.max(1, ...data.flatMap((item) => [Number(item.invoiced) || 0, Number(item.collected) || 0]));
  const ceiling = Math.ceil(maximum / 10000) * 10000;
  const x = (index) => data.length < 2 ? 204 : 22 + index * (364 / (data.length - 1));
  const y = (value) => 168 - ((Number(value) || 0) / ceiling) * 142;
  const makeCurve = (key) => {
    const points = data.map((item, index) => [x(index), y(item[key])]);
    if (points.length < 2) return points.length ? `M ${points[0][0]} ${points[0][1]}` : '';
    return points.reduce((path, point, index) => {
      if (!index) return `M ${point[0]} ${point[1]}`;
      const previous = points[index - 1];
      const middle = (previous[0] + point[0]) / 2;
      return `${path} C ${middle} ${previous[1]}, ${middle} ${point[1]}, ${point[0]} ${point[1]}`;
    }, '');
  };
  const collectedPeakIndex = data.reduce((peak, item, index) => (Number(item.collected) || 0) > (Number(data[peak]?.collected) || 0) ? index : peak, 0);
  const peak = data[collectedPeakIndex];
  return <article className="bd-card bd-revenue"><CardHeading title="Revenue Trend" subtitle="Invoiced and collected amounts for selected filters" />
    {!data.length ? <p className="bd-no-results">No records in this date range.</p> : <>
      <div className="bd-line-chart bd-revenue-line-chart">
        <div className="bd-y-labels">{[1, .75, .5, .25, 0].map((ratio) => <span key={ratio}>{new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(ceiling * ratio)}</span>)}</div>
        <svg viewBox="0 0 440 190" preserveAspectRatio="none" role="img" aria-label="Revenue trend showing invoiced and collected INR amounts">
          <defs>
            <linearGradient id="revenue-invoiced-stroke" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#795940" /><stop offset="100%" stopColor="#a87952" /></linearGradient>
            <linearGradient id="revenue-collected-stroke" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#b98962" /><stop offset="100%" stopColor="#d4935f" /></linearGradient>
            <linearGradient id="revenue-area-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b98962" stopOpacity=".22" /><stop offset="100%" stopColor="#b98962" stopOpacity="0" /></linearGradient>
            <linearGradient id="revenue-invoiced-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#795940" stopOpacity=".13" /><stop offset="100%" stopColor="#795940" stopOpacity="0" /></linearGradient>
          </defs>
          <g className="bd-grid-lines">{[26, 62, 97, 133, 168].map((line) => <line key={line} x1="0" y1={line} x2="410" y2={line} />)}</g>
          {data.length > 1 && <path className="bd-revenue-area bd-revenue-invoiced-area" d={`${makeCurve('invoiced')} L ${x(data.length - 1)} 168 L ${x(0)} 168 Z`} />}
          {data.length > 1 && <path className="bd-revenue-area" d={`${makeCurve('collected')} L ${x(data.length - 1)} 168 L ${x(0)} 168 Z`} />}
          <path className="bd-revenue-line bd-revenue-invoiced-line" d={makeCurve('invoiced')} />
          <path className="bd-revenue-line bd-revenue-collected-line" d={makeCurve('collected')} />
          {data.map((item, index) => <g className="bd-revenue-points" key={`point-${item.label}`}>
            <circle cx={x(index)} cy={y(item.invoiced)} r="2.5"><title>{item.label} invoiced: {formatInr(item.invoiced)}</title></circle>
            <circle cx={x(index)} cy={y(item.collected)} r="2.5"><title>{item.label} collected: {formatInr(item.collected)}</title></circle>
          </g>)}
          {peak && <g className="bd-revenue-highlight" transform={`translate(${x(collectedPeakIndex)} ${y(peak.collected)})`}>
            <circle r="7" /><circle className="bd-revenue-highlight-core" r="3" />
            <g className="bd-revenue-tooltip" transform={`translate(${collectedPeakIndex > data.length - 2 ? -96 : 0} -45)`}>
              <rect x="-44" y="-17" width="88" height="37" rx="8" />
              <text className="bd-revenue-tooltip-label" x="0" y="-2" textAnchor="middle">{peak.label}</text>
              <text className="bd-revenue-tooltip-value" x="0" y="12" textAnchor="middle">{formatInr(peak.collected)}</text>
            </g>
          </g>}
        </svg>
        <div className="bd-x-labels">{data.map((item) => <span key={item.label}>{item.label}</span>)}</div>
      </div>
      <div className="bd-legend bd-revenue-legend"><span><i className="dark" />Invoiced</span><span><i />Collected</span></div>
    </>}
  </article>;
};

export const InvoiceStatusChart = ({ data }) => {
  const max = Math.max(1, ...data.map((item) => item.value));
  return <article className="bd-card"><CardHeading title="Invoice Status" subtitle="Monthly revenue performance" filter="Last 6 Months" /><div className="bd-bars" aria-label="Invoice status vertical bar chart">{data.map((item) => <div key={item.label} className="bd-bar-column"><div className="bd-bar" style={{ height: `${(item.value / max) * 88}%` }} title={`${item.value} invoices`} /><span>{item.label}</span></div>)}</div></article>;
};

export const OutstandingAging = ({ data }) => {
  const safeValues = data.map((item) => Math.max(0, Number(item.value) || 0));
  const max = Math.max(1, ...safeValues);
  const total = Math.max(0, safeValues.reduce((sum, value) => sum + value, 0));
  let position = 0;
  const ringStops = data.map((item) => {
    const start = position;
    const value = Math.max(0, Number(item.value) || 0);
    position += total ? (value / total) * 100 : 0;
    return `${item.color || '#ead8c4'} ${start}% ${position}%`;
  }).join(', ');
  const ringGradient = ringStops || '#ead8c4 0% 100%';
  return <article className="bd-card bd-outstanding-aging"><CardHeading title="Outstanding Aging" subtitle="Sample outstanding amount by aging period" />
    <div className="bd-aging-overview" style={{ background: `linear-gradient(#fffaf4,#fffaf4) padding-box, conic-gradient(from 235deg, ${ringGradient}) border-box` }} aria-label="Outstanding aging distribution summary">
      <div className="bd-aging-overview-values">{data.slice(0, 3).map((item) => <div key={item.label}><strong>{formatInr(item.value)}</strong><span>{item.label}</span></div>)}</div>
    </div>
    <div className="bd-aging">{data.map((item, index) => {
      const value = safeValues[index];
      const share = total ? (value / total) * 100 : 0;
      return <div className="bd-aging-row" key={item.label}><span>{item.label}</span><div className="bd-aging-track" role="img" aria-label={`${item.label}: ${formatInr(value)}, ${share.toFixed(1)}% of total outstanding`}><i style={{ width: `${(value / max) * 100}%`, background: item.color || '#c78956' }} /></div><strong>{formatInr(value)}<small>{share.toFixed(0)}%</small></strong></div>;
    })}</div>
  </article>;
};
