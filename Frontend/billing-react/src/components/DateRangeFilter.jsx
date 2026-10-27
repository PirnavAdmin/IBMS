import { useId, useState } from 'react';
import { Button, ConfigProvider, Popover } from 'antd';
import { DateRangeDatePicker, dateRangeTheme } from './DateRangeDatePicker';
import { ArrowDropDown, CalendarTodayOutlined } from '@mui/icons-material';
import { displayDate } from '../utils/localDate';
import '../styles/DateRangeFilter.css';

// UI values remain local YYYY-MM-DD strings; callers own their existing API mapping.
export function DateRangeFilter({ startDate = '', endDate = '', onApply, dropdownIcon = <ArrowDropDown /> }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ startDate: '', endDate: '' });
  const invalid = Boolean(draft.startDate && draft.endDate && draft.endDate < draft.startDate);
  const label = startDate && endDate ? `${displayDate(startDate)} \u2013 ${displayDate(endDate)}`
    : startDate ? `From ${displayDate(startDate)}` : endDate ? `Until ${displayDate(endDate)}` : 'Date Range';
  const apply = value => { onApply(value); setOpen(false); };
  return <ConfigProvider theme={dateRangeTheme}>
    <Popover destroyOnHidden trigger="click" placement="bottomLeft" open={open} onOpenChange={next => {
      if (next) setDraft({ startDate, endDate });
      setOpen(next);
    }} content={<form id={id} role="dialog" aria-label="Date Range" className="date-range-form" onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); }
    }} onSubmit={event => { event.preventDefault(); event.stopPropagation(); if (!invalid) apply(draft); }}>
      <label htmlFor={`${id}-from`}>From Date<DateRangeDatePicker id={`${id}-from`} aria-label="From Date" value={draft.startDate} onChange={startDate => setDraft(previous => ({ ...previous, startDate }))} /></label>
      <label htmlFor={`${id}-to`}>To Date<DateRangeDatePicker id={`${id}-to`} aria-label="To Date" value={draft.endDate} status={invalid ? 'error' : undefined} aria-invalid={invalid} aria-describedby={invalid ? `${id}-error` : undefined} onChange={endDate => setDraft(previous => ({ ...previous, endDate }))} /></label>
      {invalid && <span id={`${id}-error`} role="alert" className="date-range-error">To Date must be on or after From Date.</span>}
      <div className="date-range-actions"><Button htmlType="button" onClick={() => apply({ startDate: '', endDate: '' })}>Clear</Button><Button type="primary" htmlType="submit" disabled={invalid}>Apply</Button></div>
    </form>}>
      <Button htmlType="button" className="invoice-filter-date-range date-range-filter" icon={<CalendarTodayOutlined />} aria-label={`Date Range: ${label}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}>{label}{dropdownIcon}</Button>
    </Popover>
  </ConfigProvider>;
}
