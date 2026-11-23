import { useEffect, useId, useRef, useState } from 'react';
import Button from 'antd/es/button';
import ConfigProvider from 'antd/es/config-provider';
import Popover from 'antd/es/popover';
import dayjs from 'dayjs';
import { DateRangeDatePicker, dateRangeTheme } from './DateRangeDatePicker';
import ArrowDropDown from '@mui/icons-material/ArrowDropDown';
import CalendarTodayOutlined from '@mui/icons-material/CalendarTodayOutlined';
import Close from '@mui/icons-material/Close';
import { displayDate, localCalendarDate } from '../utils/localDate';
import { dateRangeError, validDate } from '../utils/dateRangeValidation';
import { useExclusiveDropdown } from '../hooks/useExclusiveDropdown';
import '../styles/DateRangeFilter.css';

export function DateRangeFilter({ startDate = '', endDate = '', onApply, dropdownIcon = <ArrowDropDown />,
  confirmationMessage, title = 'Date Range', fromLabel = 'From Date', toLabel = 'To Date', latestDate, className = '', popoverClassName = '', inline = false, placement = 'bottomLeft', iconOnly = false, lockScroll = false, scrollBasedPlacement = false }) {
  const id = useId();
  const controlRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [activePlacement, setActivePlacement] = useState(placement);
  const [notice, setNotice] = useState('');
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    if (!notice) return undefined;
    const timeout = setTimeout(() => setNotice(''), 3000);
    return () => clearTimeout(timeout);
  }, [notice]);
  useExclusiveDropdown(open, setOpen);
  useEffect(() => {
    if (!open || !lockScroll) return undefined;
    const targets = [document.querySelector('.app-layout-content'), document.documentElement, document.body].filter(Boolean);
    const previous = targets.map((element) => ({
      element,
      overflow: element.style.getPropertyValue('overflow'),
      overflowPriority: element.style.getPropertyPriority('overflow'),
      overscroll: element.style.getPropertyValue('overscroll-behavior'),
      overscrollPriority: element.style.getPropertyPriority('overscroll-behavior'),
    }));
    targets.forEach((element) => {
      element.style.setProperty('overflow', 'hidden');
      element.style.setProperty('overscroll-behavior', 'none');
    });
    return () => previous.forEach(({ element, overflow, overflowPriority, overscroll, overscrollPriority }) => {
      if (overflow) element.style.setProperty('overflow', overflow, overflowPriority);
      else element.style.removeProperty('overflow');
      if (overscroll) element.style.setProperty('overscroll-behavior', overscroll, overscrollPriority);
      else element.style.removeProperty('overscroll-behavior');
    });
  }, [open, lockScroll]);
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
  const content = <div className="date-range-inline-panel" role="dialog" aria-labelledby={id + '-heading'} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } }}>
    <div className="date-range-panel-heading"><strong id={id + '-heading'}>{title}</strong><Button type="text" htmlType="button" aria-label="Close" icon={<Close />} onClick={() => setOpen(false)} /></div>
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
  const changeOpen = next => {
    if (next) {
      setDraft({ startDate, endDate });
      setAttempted(false);
      if (scrollBasedPlacement) {
        const scrollViewport = controlRef.current?.closest('.app-layout-content');
        const hasScrollableContent = scrollViewport && scrollViewport.scrollHeight > scrollViewport.clientHeight + 1;
        const scrollTop = hasScrollableContent
          ? scrollViewport.scrollTop
          : Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop);
        const side = scrollTop <= 0 ? 'top' : 'bottom';
        const alignment = placement.endsWith('Right') ? 'Right' : 'Left';
        setActivePlacement(`${side}${alignment}`);
      }
    }
    setOpen(next);
  };
  const trigger = <Button htmlType="button" className={"invoice-filter-date-range date-range-filter " + className + (iconOnly ? ' date-range-icon-only' : '') + (startDate || endDate ? ' has-dates' : '')} icon={<CalendarTodayOutlined />}
    aria-label={'Date Range: ' + label} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
    title={startDate && endDate ? `${displayDate(startDate)} – ${displayDate(endDate)}` : 'Filter by date range'}
    onClick={inline ? () => changeOpen(!open) : undefined}>
    <span className={`date-range-label${iconOnly ? ' visually-hidden' : ''}`}>{startDate && endDate ? <><span>{displayDate(startDate)}</span><span aria-hidden="true">–</span><span>{displayDate(endDate)}</span></> : label}</span>{!iconOnly && dropdownIcon}
  </Button>;
  return <ConfigProvider theme={dateRangeTheme}>
    <div ref={controlRef} className={`date-range-control${inline ? ' date-range-control-inline' : ''}`}>
      {inline ? <>{trigger}{open && content}</> : <Popover open={open} trigger="click" placement={activePlacement} content={content} destroyOnHidden zIndex={2000}
        classNames={{ root: `date-range-popover ${popoverClassName}`.trim() }} onOpenChange={changeOpen}>{trigger}</Popover>}
      {notice && notice.key === startDate + '|' + endDate && <span className="date-range-feedback" role="status">{notice.message}</span>}
    </div>
  </ConfigProvider>;
}
