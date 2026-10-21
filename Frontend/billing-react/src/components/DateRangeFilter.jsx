import { useId, useState } from 'react';
import { Button, ConfigProvider, Input, Popover } from 'antd';
import { ArrowDropDown, CalendarTodayOutlined } from '@mui/icons-material';
import { displayDate } from '../utils/localDate';
import '../styles/DateRangeFilter.css';

// UI values remain local YYYY-MM-DD strings; callers own their existing API mapping.
export function DateRangeFilter({ startDate = '', endDate = '', onApply }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ startDate: '', endDate: '' });
  const invalid = Boolean(draft.startDate && draft.endDate && draft.endDate < draft.startDate);
  const label = startDate && endDate ? `${displayDate(startDate)} \u2013 ${displayDate(endDate)}`
    : startDate ? `From ${displayDate(startDate)}` : endDate ? `Until ${displayDate(endDate)}` : 'Date Range';
  const apply = value => { onApply(value); setOpen(false); };
  return <ConfigProvider theme={{ token: { motion: false, colorPrimary: '#715238', colorPrimaryHover: '#96704e', colorBgElevated: '#fffdf9', colorBorder: '#e4d8c8', borderRadius: 8, fontFamily: 'inherit', fontSize: 13 } }}>
    <Popover destroyOnHidden trigger="click" placement="bottomLeft" open={open} onOpenChange={next => {
      if (next) setDraft({ startDate, endDate });
      setOpen(next);
    }} content={<form id={id} role="dialog" aria-label="Date Range" className="date-range-form" onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); }
    }} onSubmit={event => { event.preventDefault(); event.stopPropagation(); if (!invalid) apply(draft); }}>
      <label htmlFor={`${id}-from`}>From Date<Input id={`${id}-from`} type="date" aria-label="From Date" value={draft.startDate} onChange={event => setDraft(previous => ({ ...previous, startDate: event.target.value }))} /></label>
      <label htmlFor={`${id}-to`}>To Date<Input id={`${id}-to`} type="date" aria-label="To Date" min={draft.startDate || undefined} value={draft.endDate} status={invalid ? 'error' : undefined} aria-invalid={invalid} aria-describedby={invalid ? `${id}-error` : undefined} onChange={event => setDraft(previous => ({ ...previous, endDate: event.target.value }))} /></label>
      {invalid && <span id={`${id}-error`} role="alert" className="date-range-error">To Date must be on or after From Date.</span>}
      <div className="date-range-actions"><Button htmlType="button" onClick={() => apply({ startDate: '', endDate: '' })}>Clear</Button><Button type="primary" htmlType="submit" disabled={invalid}>Apply</Button></div>
    </form>}>
      <Button htmlType="button" className="invoice-filter-date-range date-range-filter" icon={<CalendarTodayOutlined />} aria-label={`Date Range: ${label}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}>{label}<ArrowDropDown /></Button>
    </Popover>
  </ConfigProvider>;
}
