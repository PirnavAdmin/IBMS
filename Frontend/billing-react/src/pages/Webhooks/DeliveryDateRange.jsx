import { useState } from 'react';
import { Button, Popover, TextField } from '@mui/material';
import { ArrowDropDown, CalendarTodayOutlined } from '@mui/icons-material';

const displayDate = value => value.split('-').reverse().join('/');

export function DeliveryDateRange({ startDate, endDate, onChange }) {
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
    <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={close}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      marginThreshold={8} PaperProps={{ className: 'delivery-date-range-popover' }}>
      <div id="delivery-date-range-dialog" role="dialog" aria-label="Date Range (UTC)">
        <p>Creation date range (UTC)</p>
        <TextField fullWidth size="small" type="date" label="From Date (UTC)" value={startDate}
          InputLabelProps={{ shrink: true }} onChange={event => onChange({ startDate: event.target.value, endDate })} />
        <TextField fullWidth size="small" type="date" label="To Date (UTC)" value={endDate}
          InputLabelProps={{ shrink: true }} inputProps={{ min: startDate || undefined }}
          onChange={event => onChange({ startDate, endDate: event.target.value })} error={invalid}
          helperText={invalid ? 'To Date must be on or after From Date.' : undefined} />
        <div className="delivery-date-range-actions"><Button onClick={() => onChange({ startDate: '', endDate: '' })}>Clear Dates</Button><Button variant="contained" onClick={close}>Done</Button></div>
      </div>
    </Popover>
  </>;
}
