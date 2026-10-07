import { useState, useRef, useEffect } from 'react';
import { Refresh, RestartAlt, KeyboardArrowDown } from '@mui/icons-material';
import { defaultDashboardFilters } from '../../pages/Dashboard/dashboardModel';
import { dashboardPeriods } from '../../pages/Dashboard/dashboardPeriods';

export const DashboardFilters = ({ values, onChange, onRefresh, isRefreshing, recordsSearch, onRecordsSearch }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const periods = dashboardPeriods();
  const selectedPeriod = periods.find(period => period.start === values.start && period.end === values.end)?.id || 'custom';
  const currentLabel = periods.find(p => p.id === selectedPeriod)?.label || (selectedPeriod === 'custom' ? 'Custom dates' : 'Select period');

  useEffect(() => {
    const handleClickOutside = event => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const setDate = (key, value) => {
    const next = { ...values, [key]: value };
    if (next.start && next.end && next.start > next.end) next[key === 'start' ? 'end' : 'start'] = value;
    onChange(next);
  };

  const selectPeriod = id => {
    const period = periods.find(option => option.id === id);
    if (period) onChange({ ...values, start: period.start, end: period.end });
    setIsOpen(false);
  };

  const reset = () => { onChange(defaultDashboardFilters()); onRecordsSearch(''); };

  return <section className="premium-filters" aria-label="Dashboard filters">
    {['start', 'end'].map((key, index) => (
      <label key={key}>
        {index ? 'To Date' : 'From Date'}
        <input type="date" value={values[key]} onChange={event => setDate(key, event.target.value)} />
      </label>
    ))}

    <div className="premium-filter-field premium-period-field" ref={dropdownRef}>
      <span className="premium-filter-label">Period</span>
      <div className="premium-select-wrapper">
        <button
          type="button"
          className="premium-select-trigger"
          onClick={() => setIsOpen(prev => !prev)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <span>{currentLabel}</span>
          <KeyboardArrowDown className={`premium-select-arrow ${isOpen ? 'open' : ''}`} fontSize="small" />
        </button>
        {isOpen && (
          <ul className="premium-select-menu" role="listbox">
            {periods.map(period => (
              <li
                key={period.id}
                role="option"
                aria-selected={selectedPeriod === period.id}
                className={`premium-select-option ${selectedPeriod === period.id ? 'selected' : ''}`}
                onClick={() => selectPeriod(period.id)}
              >
                {period.label}
              </li>
            ))}
            {selectedPeriod === 'custom' && (
              <li className="premium-select-option selected" role="option" aria-selected="true">
                Custom dates
              </li>
            )}
          </ul>
        )}
      </div>
    </div>

    <label>
      Search recent records
      <input type="search" value={recordsSearch} onChange={event => onRecordsSearch(event.target.value)} placeholder="Invoice, payment or customer" />
    </label>
    <button type="button" onClick={reset}><RestartAlt fontSize="small" />Reset</button>
    <button type="button" className="primary" onClick={onRefresh} disabled={isRefreshing} aria-busy={isRefreshing}>
      <Refresh fontSize="small" className={isRefreshing ? 'bd-spin' : ''} />Refresh
    </button>
  </section>;
};
