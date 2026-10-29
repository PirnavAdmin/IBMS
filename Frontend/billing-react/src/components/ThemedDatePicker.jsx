import { CalendarTodayOutlined, ChevronLeft, ChevronRight } from '@mui/icons-material';
import './ThemedDatePicker.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useExclusiveDropdown } from '../hooks/useExclusiveDropdown';

const pad = value => String(value).padStart(2, '0');
const toDateValue = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const fromDateValue = value => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return toDateValue(date) === value ? date : null;
};

function calendarPosition(anchor) {
  const rect = anchor.getBoundingClientRect();
  const top = rect.bottom + 4;
  const maxHeight = Math.max(0, window.innerHeight - top - 8);
  const width = Math.min(280, window.innerWidth - 16);
  return { top, left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), width, maxHeight };
}

export function ThemedDatePicker({ label, value, onChange, disabled = false, min, max, required = false, className = "", renderTrigger }) {
  const [open, setOpen] = useState(false);
  useExclusiveDropdown(open, setOpen);
  const [position, setPosition] = useState(null);
  const [month, setMonth] = useState(() => {
    const date = fromDateValue(value) || new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const rootRef = useRef(null);
  const calendarRef = useRef(null);
  const selected = fromDateValue(value);
  const today = toDateValue(new Date());
  const days = useMemo(() => {
    const offset = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const previousCount = new Date(month.getFullYear(), month.getMonth(), 0).getDate();
    return Array.from({ length: 42 }, (_, index) => {
      const day = index - offset + 1;
      const date = day < 1
        ? new Date(month.getFullYear(), month.getMonth() - 1, previousCount + day)
        : day > count
          ? new Date(month.getFullYear(), month.getMonth() + 1, day - count)
          : new Date(month.getFullYear(), month.getMonth(), day);
      return { date, inMonth: day > 0 && day <= count };
    });
  }, [month]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = event => {
      if (!rootRef.current?.contains(event.target) && !calendarRef.current?.contains(event.target)) setOpen(false);
    };
    const updatePosition = () => {
      const trigger = rootRef.current?.querySelector('[data-date-anchor]');
      if (trigger) setPosition(calendarPosition(rootRef.current));
    };
    updatePosition();
    document.addEventListener('pointerdown', closeOutside);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  const display = selected ? selected.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  const monthLabel = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const allowed = date => (!min || toDateValue(date) >= min) && (!max || toDateValue(date) <= max);
  const choose = date => { if (!allowed(date)) return; onChange(toDateValue(date)); setOpen(false); };
  const toggle = () => { if (disabled) return; if (!open) { const date = fromDateValue(value) || new Date(); setMonth(new Date(date.getFullYear(), date.getMonth(), 1)); } setOpen(current => !current); };
  useEffect(() => { if (!open) return; const escape = event => { if (event.key === 'Escape') { setOpen(false); rootRef.current?.querySelector('[data-date-anchor]')?.focus(); } }; document.addEventListener('keydown', escape); return () => document.removeEventListener('keydown', escape); }, [open]);

  return <div className={`quote-date-picker ${className}`} ref={rootRef}>
    {renderTrigger ? renderTrigger({ open, toggle }) : <button data-date-anchor type="button" className="quote-date-trigger" aria-label={label} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={toggle}>
      <span className={display ? '' : 'placeholder'}>{display || 'Select date'}</span><CalendarTodayOutlined aria-hidden="true" className="quote-date-icon" fontSize="small" />
    </button>}
    {open && position && createPortal(<div ref={calendarRef} className="quote-calendar" role="dialog" aria-label={`${label} calendar`} style={position}>
      <header className="quote-calendar-header"><button type="button" aria-label="Previous month" onClick={() => setMonth(date => new Date(date.getFullYear(), date.getMonth() - 1, 1))}><ChevronLeft fontSize="small" /></button><strong>{monthLabel}</strong><button type="button" aria-label="Next month" onClick={() => setMonth(date => new Date(date.getFullYear(), date.getMonth() + 1, 1))}><ChevronRight fontSize="small" /></button></header>
      <div className="quote-calendar-grid quote-calendar-weekdays">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => <span key={day}>{day}</span>)}</div>
      <div className="quote-calendar-grid">{days.map(({ date, inMonth }) => {
        const dateValue = toDateValue(date);
        return <button type="button" key={dateValue} className={`${inMonth ? '' : 'outside-month'}${dateValue === value ? ' selected' : ''}${dateValue === today ? ' today' : ''}`} aria-label={date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })} disabled={!allowed(date)} aria-pressed={dateValue === value} onClick={() => choose(date)}>{date.getDate()}</button>;
      })}</div>
      <footer className="quote-calendar-footer"><button type="button" disabled={required} onClick={() => { onChange(''); setOpen(false); }}>Clear</button><button type="button" disabled={!allowed(new Date())} onClick={() => choose(new Date())}>Today</button></footer>
    </div>, document.body)}
  </div>;
}
