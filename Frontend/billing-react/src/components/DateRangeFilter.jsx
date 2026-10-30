import { useEffect, useId, useState } from 'react';
import { Button, ConfigProvider, Popover } from 'antd';
import dayjs from 'dayjs';
import { DateRangeDatePicker, dateRangeTheme } from './DateRangeDatePicker';
import { ArrowDropDown, CalendarTodayOutlined } from '@mui/icons-material';
import { displayDate, localCalendarDate } from '../utils/localDate';
import { dateRangeError, validDate } from '../utils/dateRangeValidation';
import { useExclusiveDropdown } from '../hooks/useExclusiveDropdown';
import '../styles/DateRangeFilter.css';

export function DateRangeFilter({ startDate = '', endDate = '', onApply, dropdownIcon = <ArrowDropDown />,
  confirmationMessage, title = 'Date Range', fromLabel = 'From Date', toLabel = 'To Date', latestDate, className = '' }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    if (!notice) return undefined;
    const timeout = setTimeout(() => setNotice(''), 3000);
    return () => clearTimeout(timeout);
  }, [notice]);
  useExclusiveDropdown(open, setOpen);
  const [draft, setDraft] = useState({ startDate: '', endDate: '' });
  const today = latestDate || localCalendarDate();
  const error = dateRangeError(draft, today);
  const visibleError = (attempted || draft.startDate || draft.endDate) ? error : '';
  const label = startDate && endDate ? displayDate(startDate) + ' – ' + displayDate(endDate)
    : startDate ? 'From ' + displayDate(startDate) : endDate ? 'Until ' + displayDate(endDate) : 'Date Range';
  const apply = value => {
    onApply(value);
    setOpen(false);
    setNotice({ key: value.startDate + '|' + value.endDate, message: value.startDate ? confirmationMessage || 'Date range applied: ' + displayDate(value.startDate) + ' – ' + displayDate(value.endDate) : 'Date filter cleared.' });
  };
  const content = <div className="date-range-inline-panel" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } }}>
    <div className="date-range-panel-heading"><strong>{title}</strong><Button type="text" htmlType="button" aria-label="Close" onClick={() => setOpen(false)}>&times;</Button></div>
      <form id={id} aria-label={title} className="date-range-form" onSubmit={event => {
        event.preventDefault(); event.stopPropagation(); setAttempted(true);
        if (!dateRangeError(draft, today)) apply(draft);
      }}>
        <p id={id + '-hint'} className="date-range-hint">Choose a start and end date to filter records.</p>
        <div className="date-range-fields">
        <label htmlFor={id + '-from'}>{fromLabel}<DateRangeDatePicker id={id + '-from'} aria-label={fromLabel}
          value={draft.startDate} status={draft.startDate && !validDate(draft.startDate) ? 'error' : undefined}
          aria-invalid={Boolean(draft.startDate && !validDate(draft.startDate))} aria-describedby={visibleError ? id + '-error' : id + '-hint'} maxDate={dayjs(today)} onChange={startDate => setDraft(previous => ({ ...previous, startDate }))} /></label>
        <label htmlFor={id + '-to'}>{toLabel}<DateRangeDatePicker id={id + '-to'} aria-label={toLabel}
          value={draft.endDate} maxDate={dayjs(today)} status={draft.endDate && visibleError ? 'error' : undefined}
          aria-invalid={Boolean(visibleError)} aria-describedby={visibleError ? id + '-error' : id + '-hint'}
          onChange={endDate => setDraft(previous => ({ ...previous, endDate }))} /></label>
        </div>
        {visibleError && <span id={id + '-error'} role="alert" className="date-range-error">{visibleError}</span>}
        <div className="date-range-actions"><Button htmlType="button" onClick={() => apply({ startDate: '', endDate: '' })}>Clear</Button>
          <Button type="primary" htmlType="submit" disabled={Boolean(error)}>Apply</Button></div>
      </form>
  </div>;
  return <ConfigProvider theme={dateRangeTheme}>
    <div className="date-range-control">
      <Popover open={open} trigger="click" placement="bottomLeft" content={content} destroyOnHidden zIndex={2000}
        classNames={{ root: 'date-range-popover' }} onOpenChange={next => {
          if (next) { setDraft({ startDate, endDate }); setAttempted(false); }
          setOpen(next);
        }}>
      <Button htmlType="button" className={"invoice-filter-date-range date-range-filter " + className} icon={<CalendarTodayOutlined />}
        aria-label={'Date Range: ' + label} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
        ><span className="date-range-label">{startDate && endDate ? <><span>{displayDate(startDate)}</span><span aria-hidden="true">–</span><span>{displayDate(endDate)}</span></> : label}</span>{dropdownIcon}</Button>
      </Popover>
      {notice && notice.key === startDate + '|' + endDate && <span className="date-range-feedback" role="status">{notice.message}</span>}
    </div>
  </ConfigProvider>;
}
