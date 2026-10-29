import { useId, useState } from 'react';
import { Button, ConfigProvider, Modal } from 'antd';
import dayjs from 'dayjs';
import { DateRangeDatePicker, dateRangeTheme } from './DateRangeDatePicker';
import { ArrowDropDown, CalendarTodayOutlined } from '@mui/icons-material';
import { displayDate, localCalendarDate } from '../utils/localDate';
import { dateRangeError } from '../utils/dateRangeValidation';
import '../styles/DateRangeFilter.css';

export function DateRangeFilter({ startDate = '', endDate = '', onApply, dropdownIcon = <ArrowDropDown />,
  confirmationMessage, title = 'Date Range', fromLabel = 'From Date', toLabel = 'To Date', latestDate, className = '' }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState({ startDate: '', endDate: '' });
  const today = latestDate || localCalendarDate();
  const error = dateRangeError(draft, today);
  const label = startDate && endDate ? displayDate(startDate) + ' – ' + displayDate(endDate)
    : startDate ? 'From ' + displayDate(startDate) : endDate ? 'Until ' + displayDate(endDate) : 'Date Range';
  const apply = value => {
    onApply(value);
    setOpen(false);
    setNotice({ key: value.startDate + '|' + value.endDate, message: value.startDate ? confirmationMessage || 'Date range applied: ' + displayDate(value.startDate) + ' – ' + displayDate(value.endDate) : 'Date filter cleared.' });
  };
  return <ConfigProvider theme={dateRangeTheme}>
    <div className="date-range-control">
      <Button htmlType="button" className={"invoice-filter-date-range date-range-filter " + className} icon={<CalendarTodayOutlined />}
        aria-label={'Date Range: ' + label} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
        onClick={() => { setDraft({ startDate, endDate }); setOpen(true); }}><span className="date-range-label">{startDate && endDate ? <><span>{displayDate(startDate)}</span><span aria-hidden="true">–</span><span>{displayDate(endDate)}</span></> : label}</span>{dropdownIcon}</Button>
      {notice && notice.key === startDate + '|' + endDate && <span className="date-range-feedback" role="status">{notice.message}</span>}
    </div>
    <Modal title={title} open={open} onCancel={() => setOpen(false)} footer={null} width={400}
      centered zIndex={2000} destroyOnHidden className="date-range-modal">
      <form id={id} aria-label={title} className="date-range-form" onSubmit={event => {
        event.preventDefault(); event.stopPropagation();
        if (!dateRangeError(draft, today)) apply(draft);
      }}>
        <label htmlFor={id + '-from'}>{fromLabel}<DateRangeDatePicker id={id + '-from'} aria-label={fromLabel}
          value={draft.startDate} maxDate={dayjs(today)} onChange={startDate => setDraft(previous => ({ ...previous, startDate }))} /></label>
        <label htmlFor={id + '-to'}>{toLabel}<DateRangeDatePicker id={id + '-to'} aria-label={toLabel}
          value={draft.endDate} maxDate={dayjs(today)} status={draft.startDate && draft.endDate && error ? 'error' : undefined}
          aria-invalid={Boolean(error)} aria-describedby={error ? id + '-error' : undefined}
          onChange={endDate => setDraft(previous => ({ ...previous, endDate }))} /></label>
        {error && <span id={id + '-error'} role="alert" className="date-range-error">{error}</span>}
        <div className="date-range-actions"><Button htmlType="button" onClick={() => apply({ startDate: '', endDate: '' })}>Clear</Button>
          <Button type="primary" htmlType="submit" disabled={Boolean(error)}>Apply</Button></div>
      </form>
    </Modal>
  </ConfigProvider>;
}
