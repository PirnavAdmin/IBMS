import { useId, useState } from 'react';
import { Button, Popover } from '@mui/material';
import { DateRangeDatePicker } from '../../components/DateRangeDatePicker';
import { ArrowDropDown, CalendarTodayOutlined } from '@mui/icons-material';

const displayDate = value => value.split('-').reverse().join('/');

export function DeliveryDateRange({ startDate, endDate, onChange }) {
  const id = useId();
  const [anchor, setAnchor] = useState(null);
  const invalid = Boolean(startDate && endDate && startDate > endDate);
  const label = startDate && endDate ? `${displayDate(startDate)} – ${displayDate(endDate)}`
    : startDate ? `From ${displayDate(startDate)}` : endDate ? `Until ${displayDate(endDate)}` : 'Date Range';
  const close = () => setAnchor(null);
  return <>
    <Button className="delivery-date-range" variant="outlined" size="small"
      startIcon={<CalendarTodayOutlined />} endIcon={<ArrowDropDown />}
      aria-label={`Date Range: ${label}`} aria-haspopup="dialog" aria-expanded={Boolean(anchor)}
      aria-controls={anchor ? 'delivery-date-range-dialog' : undefined}
      onClick={event => setAnchor(event.currentTarget)}>{label}</Button>
    <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={close} disableEnforceFocus
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      marginThreshold={8} PaperProps={{ className: 'delivery-date-range-popover' }}>
      <div id="delivery-date-range-dialog" role="dialog" aria-label="Date Range (UTC)">
        <p>Creation date range (UTC)</p>
        <label htmlFor={`${id}-from`}>From Date (UTC)<DateRangeDatePicker id={`${id}-from`} aria-label="From Date (UTC)" value={startDate}
          onChange={startDate => onChange({ startDate, endDate })} /></label>
        <label htmlFor={`${id}-to`}>To Date (UTC)<DateRangeDatePicker id={`${id}-to`} aria-label="To Date (UTC)" value={endDate}
          onChange={endDate => onChange({ startDate, endDate })} status={invalid ? 'error' : undefined}
          aria-invalid={invalid} aria-describedby={invalid ? `${id}-error` : undefined} /></label>
        {invalid && <span id={`${id}-error`} role="alert" className="date-range-error">To Date must be on or after From Date.</span>}
        <div className="delivery-date-range-actions"><Button onClick={() => onChange({ startDate: '', endDate: '' })}>Clear Dates</Button><Button variant="contained" onClick={close}>Done</Button></div>
      </div>
    </Popover>
  </>;
}
