import { formatInr } from './StatCard';

const CardHeading = ({ title, subtitle, filter }) => <div className="bd-card-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{filter && <select defaultValue={filter} aria-label={`${title} period`}><option>{filter}</option></select>}</div>;
const points = (data, key, width = 440, height = 190) => data.map((item, i) => `${18 + i * ((width - 36) / (data.length - 1))},${height - (item[key] / 400000) * (height - 28)}`).join(' ');

export const RevenueChart = ({ data }) => <article className="bd-card bd-revenue"><CardHeading title="Revenue Overview" filter="This Year" /><div className="bd-line-chart"><div className="bd-y-labels"><span>₹4,00,000</span><span>₹3,00,000</span><span>₹2,00,000</span><span>₹1,00,000</span><span>₹0</span></div><svg viewBox="0 0 440 190" preserveAspectRatio="none" aria-label="Invoiced and collected revenue line chart"><g className="bd-grid-lines"><line x1="0" y1="10" x2="440" y2="10"/><line x1="0" y1="53" x2="440" y2="53"/><line x1="0" y1="96" x2="440" y2="96"/><line x1="0" y1="139" x2="440" y2="139"/><line x1="0" y1="182" x2="440" y2="182"/></g><polyline className="bd-line invoiced" points={points(data, 'invoiced')} /><polyline className="bd-line collected" points={points(data, 'collected')} /></svg><div className="bd-x-labels">{data.map((item) => <span key={item.label}>{item.label}</span>)}</div></div><div className="bd-legend"><span><i className="dark"/>Invoiced</span><span><i/>Collected</span></div></article>;

export const InvoiceStatusChart = ({ data }) => {
  const max = Math.max(...data.map((item) => item.value));
  return <article className="bd-card"><CardHeading title="Invoice Status" subtitle="Monthly revenue performance" filter="Last 6 Months" /><div className="bd-bars" aria-label="Invoice status vertical bar chart">{data.map((item) => <div key={item.label} className="bd-bar-column"><div className="bd-bar" style={{ height: `${(item.value / max) * 88}%` }} title={`${item.value} invoices`} /><span>{item.label}</span></div>)}</div></article>;
};

export const OutstandingAging = ({ data }) => {
  const max = Math.max(...data.map((item) => item.value));
  return <article className="bd-card"><CardHeading title="Outstanding Aging" subtitle="Outstanding amount by aging period" filter="This Month" /><div className="bd-aging">{data.map((item) => <div className="bd-aging-row" key={item.label}><span>{item.label}</span><div className="bd-aging-track"><i style={{ width: `${(item.value / max) * 100}%`, background: item.color }} /></div><strong>{formatInr(item.value)}</strong></div>)}</div></article>;
};
