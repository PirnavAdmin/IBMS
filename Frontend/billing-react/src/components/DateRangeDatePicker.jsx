import { createContext, forwardRef, useContext, useLayoutEffect, useMemo, useRef } from 'react';
import dayjs from 'dayjs';
import { validDate } from '../utils/dateRangeValidation';
import ConfigProvider from 'antd/es/config-provider';
import DatePicker from 'antd/es/date-picker';
import '../styles/DateRangeFilter.css';

// Accept compact digit entry without rewriting partial ISO edits or hiding
// invalid input from the range validator. Never truncate excess input.
const normalizeManualDate = value => {
  const text = value || '';
  if (!/^\d{0,8}$/.test(text) && !/^\d{4}-\d{0,4}$/.test(text) && !/^\d{4}-\d{2}-\d{0,2}$/.test(text)) return text;
  const digits = text.replace(/\D/g, '');
  let formatted = digits.length <= 4 ? digits : digits.length <= 6
    ? `${digits.slice(0, 4)}-${digits.slice(4)}`
    : `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
  if (text.endsWith('-') && [4, 6].includes(digits.length)) formatted += '-';
  return formatted;
};
// Explicit tokens also theme calendars rendered in a portal outside the app shell.
export const dateRangeTheme = {
  components: { DatePicker: { zIndexPopup: 2100 } },
  token: {
    motion: false,
    colorPrimary: '#795137', colorPrimaryHover: '#987455', colorPrimaryActive: '#633D28',
    colorPrimaryBg: '#F0E2D0', colorPrimaryBgHover: '#E6D3BC',
    colorLink: '#795137', colorLinkHover: '#987455', colorInfo: '#795137',
    controlOutline: 'rgba(121,81,55,.16)',
    colorText: '#35271F', colorTextSecondary: '#756354',
    colorIcon: '#B65A20', colorIconHover: '#8B3F12',
    colorTextPlaceholder: '#8B7764', colorTextLightSolid: '#FFFFFF',
    colorBgContainer: '#FFFDF9', colorBgElevated: '#FFFDF9', colorBorder: '#D5C6B5',
    borderRadius: 8, fontFamily: 'inherit', fontSize: 13,
  },
};

// Keep the editable draft separate from the calendar's parsed date. Otherwise,
// editing a selected date passes null to the picker and erases partial typing.
const DateRangeInputContext = createContext(null);
const DateRangeTextInput = forwardRef(function DateRangeTextInput({ onChange, ...props }, ref) {
  const draft = useContext(DateRangeInputContext);
  const pendingSelection = useRef(null);
  useLayoutEffect(() => {
    const selection = pendingSelection.current;
    pendingSelection.current = null;
    if (selection && selection.input === document.activeElement) {
      selection.input.setSelectionRange(selection.cursor, selection.cursor);
    }
  }, [draft.value]);
  return <input {...props} ref={ref} value={draft.value}
    onChange={event => {
      const input = event.target;
      const raw = input.value;
      const text = normalizeManualDate(raw);
      if (text !== raw) {
        const digitsBeforeCursor = raw.slice(0, input.selectionStart ?? raw.length).replace(/\D/g, '').length;
        const nextCursor = digitsBeforeCursor <= 4 ? digitsBeforeCursor : digitsBeforeCursor <= 6 ? digitsBeforeCursor + 1 : digitsBeforeCursor + 2;
        input.value = text;
        pendingSelection.current = { input, cursor: Math.min(nextCursor, text.length) };
      }
      onChange?.(event);
      draft.onChange(text);
    }} />;
});

export function DateRangeDatePicker({ value = '', onChange, ...props }) {
  const calendarValue = useMemo(() => validDate(value) ? dayjs(value) : null, [value]);
  return <ConfigProvider theme={dateRangeTheme}>
    <DateRangeInputContext.Provider value={{ value, onChange }}>
      <span className="date-range-date-field">
        <DatePicker {...props} className="date-range-date-picker" format="YYYY-MM-DD" preserveInvalidOnBlur placement="bottomLeft" placeholder="YYYY-MM-DD"
          components={{ input: DateRangeTextInput }} inputReadOnly={false}
          classNames={{ popup: { root: 'date-range-calendar' } }}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); } }}
          value={calendarValue}
          onChange={date => onChange(date ? date.format('YYYY-MM-DD') : '')} />
      </span>
    </DateRangeInputContext.Provider>
  </ConfigProvider>;
}
