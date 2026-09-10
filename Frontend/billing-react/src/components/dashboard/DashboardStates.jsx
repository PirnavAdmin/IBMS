import { Skeleton } from '@mui/material';
import { DnsOutlined, DescriptionOutlined, PowerOffOutlined, Refresh } from '@mui/icons-material';

const SectionSkeleton = ({ title, chart = false }) => <section className="bd-card bd-section-skeleton" aria-label={`Loading ${title}`}>
  <Skeleton width="55%" height={32} />
  {chart ? <Skeleton variant="rounded" height={220} /> : Array.from({ length: 5 }, (_, index) => <Skeleton key={index} width={index % 2 ? '85%' : '100%'} height={32} />)}
</section>;

export const DashboardSkeleton = () => <div className="bd-dashboard-skeleton" role="status" aria-label="Loading dashboard" aria-busy="true">
  <section className="bd-kpi-grid" aria-label="Loading billing summary">{Array.from({ length: 5 }, (_, index) => <div className="bd-stat bd-stat-skeleton" key={index}><Skeleton variant="rounded" width={44} height={44} /><Skeleton width="75%" height={26} /><Skeleton width="90%" height={36} /><Skeleton width="65%" height={20} /></div>)}</section>
  <div className="bd-chart-grid">{['Revenue Trend', 'Outstanding Aging'].map((title) => <SectionSkeleton key={title} title={title} chart />)}</div>
  <div className="bd-detail-grid">{['Recent Payments', 'Top Customers'].map((title) => <SectionSkeleton key={title} title={title} />)}</div>
</div>;

export const DashboardErrorState = ({ onRetry, title = "Unable to load data", message = "Please check your connection and try again." }) => <section className="bd-dashboard-error" role="alert">
  <div className="bd-error-illustration" aria-hidden="true"><PowerOffOutlined /><div><DnsOutlined /><DescriptionOutlined /></div></div>
  <h2>{title}</h2>
  <p>{message}</p>
  {onRetry && <button className="bd-retry" onClick={onRetry}><Refresh /> Retry</button>}
</section>;
