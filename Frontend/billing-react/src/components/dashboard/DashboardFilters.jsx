import { Refresh } from '@mui/icons-material';
import { defaultDashboardFilters, sampleApplications, sampleUnits } from '../../data/dashboardSample';

export const DashboardFilters = ({ values, onChange, onRefresh, isRefreshing = false }) => {
  const setDate = (key, value) => {
    const next = { ...values, [key]: value };
    if (next.start && next.end && next.start > next.end) next[key === 'start' ? 'end' : 'start'] = value;
    onChange(next);
  };
  return <div className="bd-filters">
    <label className="bd-filter"><span><small>From date</small><input type="date" aria-label="Start date" value={values.start} onChange={(e) => setDate('start', e.target.value)} /></span></label>
    <label className="bd-filter"><span><small>To date</small><input type="date" aria-label="End date" value={values.end} onChange={(e) => setDate('end', e.target.value)} /></span></label>
    <label className="bd-filter"><span><small>Application</small><select value={values.application} onChange={(e) => onChange({ ...values, application: e.target.value })}>{sampleApplications.map((option) => <option key={option}>{option}</option>)}</select></span></label>
    <label className="bd-filter"><span><small>Business Unit</small><select value={values.unit} onChange={(e) => onChange({ ...values, unit: e.target.value })}>{sampleUnits.map((option) => <option key={option}>{option}</option>)}</select></span></label>
    <button className="bd-filter-reset" onClick={() => onChange({ ...defaultDashboardFilters })}>Reset filters</button>
    <button className="bd-refresh" onClick={onRefresh} disabled={isRefreshing} aria-busy={isRefreshing} aria-label="Refresh dashboard"><Refresh className={isRefreshing ? 'bd-spin' : undefined} /></button>
  </div>;
};
