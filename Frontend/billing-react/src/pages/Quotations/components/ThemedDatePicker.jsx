import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const pad = value => String(value).padStart(2, '0');
const toDateValue = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const fromDateValue = value => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
};

function calendarPosition(anchor) {
  const rect = anchor.getBoundingClientRect();
  const height = 360;
  const top = window.innerHeight - rect.bottom >= height + 8 || window.innerHeight - rect.bottom >= rect.top
    ? rect.bottom + 4 : rect.top - height - 4;
  const width = Math.min(280, window.innerWidth - 16);
  return { top: Math.max(8, Math.min(top, window.innerHeight - height - 8)), left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), width };
}

export function ThemedDatePicker({ label, value, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
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
      const trigger = rootRef.current?.querySelector('.quote-date-trigger');
      if (trigger) setPosition(calendarPosition(trigger));
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
  const choose = date => { onChange(toDateValue(date)); setOpen(false); };

  return <div className="quote-date-picker" ref={rootRef}>
    <button type="button" className="quote-date-trigger" aria-label={label} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={() => { if (!open) { const date = fromDateValue(value) || new Date(); setMonth(new Date(date.getFullYear(), date.getMonth(), 1)); } setOpen(current => !current); }} onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}>
      <span className={display ? '' : 'placeholder'}>{display || 'Select date'}</span><span aria-hidden="true" className="quote-date-icon">▦</span>
    </button>
    {open && position && createPortal(<div ref={calendarRef} className="quote-calendar" role="dialog" aria-label={`${label} calendar`} style={position}>
      <header className="quote-calendar-header"><button type="button" aria-label="Previous month" onClick={() => setMonth(date => new Date(date.getFullYear(), date.getMonth() - 1, 1))}>‹</button><strong>{monthLabel}</strong><button type="button" aria-label="Next month" onClick={() => setMonth(date => new Date(date.getFullYear(), date.getMonth() + 1, 1))}>›</button></header>
      <div className="quote-calendar-grid quote-calendar-weekdays">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => <span key={day}>{day}</span>)}</div>
      <div className="quote-calendar-grid">{days.map(({ date, inMonth }) => {
        const dateValue = toDateValue(date);
        return <button type="button" key={dateValue} className={`${inMonth ? '' : 'outside-month'}${dateValue === value ? ' selected' : ''}${dateValue === today ? ' today' : ''}`} aria-pressed={dateValue === value} onClick={() => choose(date)}>{date.getDate()}</button>;
      })}</div>
      <footer className="quote-calendar-footer"><button type="button" onClick={() => { onChange(''); setOpen(false); }}>Clear</button><button type="button" onClick={() => choose(new Date())}>Today</button></footer>
    </div>, document.body)}
  </div>;
}
