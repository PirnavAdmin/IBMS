import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import { DateRangeFilter } from '../DateRangeFilter';
import { useId } from 'react';
import Refresh from '@mui/icons-material/Refresh';
import RestartAlt from '@mui/icons-material/RestartAlt';
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import { defaultDashboardFilters } from '../../pages/Dashboard/dashboardModel';
import { dashboardPeriods } from '../../pages/Dashboard/dashboardPeriods';

export const DashboardFilters = ({ values, onChange, onRefresh, isRefreshing, currencies = [], currency = '' }) => {
  const currencyLabelId = useId();
  const periodLabelId = useId();
  const periods = dashboardPeriods();
  const selectedPeriod = periods.find(period => period.start === values.start && period.end === values.end)?.id || 'custom';
  const selectPeriod = id => {
    const period = periods.find(option => option.id === id);
    if (period) onChange({ ...values, start: period.start, end: period.end });
  };

  const reset = () => { onChange(defaultDashboardFilters()); };

  return <section className="premium-filters" aria-label="Dashboard filters">
    <div className="premium-filter-field"><span>Date Range</span><DateRangeFilter startDate={values.start} endDate={values.end} onApply={({ startDate, endDate }) => onChange({ ...values, start: startDate, end: endDate })} dropdownIcon={<KeyboardArrowDown fontSize="small" />} /></div>

    <div className="premium-filter-field premium-period-field">
      <span id={periodLabelId}>Period</span>
      <Select
        className="premium-currency-select"
        labelId={periodLabelId}
        inputProps={{ 'aria-label': 'Period' }}
        value={selectedPeriod}
        fullWidth
        size="small"
        IconComponent={KeyboardArrowDown}
        onChange={event => selectPeriod(event.target.value)}
        MenuProps={{ PaperProps: { className: 'premium-currency-menu' }, MenuListProps: { 'aria-label': 'Period options' }, marginThreshold: 8 }}
      >
        {periods.map(period => <MenuItem key={period.id} value={period.id}>{period.label}</MenuItem>)}
        {selectedPeriod === 'custom' && <MenuItem value="custom" disabled>Custom dates</MenuItem>}
      </Select>
    </div>

    <div className="premium-filter-field premium-currency-field">
      <span id={currencyLabelId}>Billing Currency</span>
      <div className="premium-currency-control">
        <Select
          className="premium-currency-select"
          labelId={currencyLabelId}
          inputProps={{ 'aria-label': 'Billing Currency' }}
          value={currency || ''}
          disabled={!currencies.length}
          displayEmpty
          fullWidth
          size="small"
          IconComponent={KeyboardArrowDown}
          onChange={event => onChange({ ...values, currency: event.target.value })}
          MenuProps={{
            PaperProps: { className: 'premium-currency-menu' },
            MenuListProps: { 'aria-label': 'Billing Currency options' },
            marginThreshold: 8,
          }}
        >
          {!currencies.length && <MenuItem value="" disabled>{isRefreshing ? 'Loading currencies...' : 'No currencies available'}</MenuItem>}
          {currencies.map(code => <MenuItem key={code} value={code}>{code}</MenuItem>)}
        </Select>
      </div>
    </div>

    <div className="premium-filter-actions">
    <button type="button" onClick={reset}><RestartAlt fontSize="small" />Reset</button>
    <button type="button" className="primary" onClick={onRefresh} disabled={isRefreshing} aria-busy={isRefreshing}>
      <Refresh fontSize="small" className={isRefreshing ? 'bd-spin' : ''} />Refresh
    </button>
    </div>
  </section>;
};
