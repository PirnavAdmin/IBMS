import { Add, CalendarMonth, Refresh } from '@mui/icons-material';

const SelectBox = ({ label, value, options, onChange, icon }) => <label className="bd-filter">{icon}<span><small>{label}</small><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></span></label>;

export const DashboardFilters = ({ values, onChange, onRefresh, onCreate, isRefreshing = false }) => <div className="bd-filters">
  <SelectBox label="Period" value={values.period} options={['This Month', 'Last Month', 'This Year']} icon={<CalendarMonth />} onChange={(period) => onChange({ ...values, period })} />
  <SelectBox label="Application" value={values.application} options={['All Applications', 'Billing', 'Payments']} onChange={(application) => onChange({ ...values, application })} />
  <SelectBox label="Business Unit" value={values.unit} options={['All Units', 'North', 'South']} onChange={(unit) => onChange({ ...values, unit })} />
  <button className="bd-refresh" onClick={onRefresh} disabled={isRefreshing} aria-busy={isRefreshing} aria-label="Refresh dashboard"><Refresh className={isRefreshing ? 'bd-spin' : undefined} /></button>
  <button className="bd-create" onClick={onCreate}><Add /> Create Invoice</button>
</div>;
