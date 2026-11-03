import dayjs from 'dayjs';
import { validDate } from '../utils/dateRangeValidation';
import ConfigProvider from 'antd/es/config-provider';
import DatePicker from 'antd/es/date-picker';
import '../styles/DateRangeFilter.css';

const normalizeManualDate = value => {
  const digits = (value || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
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

export function DateRangeDatePicker({ value, onChange, ...props }) {
  return <ConfigProvider theme={dateRangeTheme}>
    <span className="date-range-date-field"
      onInputCapture={event => {
        if (!(event.target instanceof HTMLInputElement)) return;
        const input = event.target;
        const cursor = input.selectionStart ?? input.value.length;
        const digitsBeforeCursor = input.value.slice(0, cursor).replace(/\D/g, '').length;
        const typed = normalizeManualDate(input.value);
        input.value = typed;
        const nextCursor = digitsBeforeCursor <= 4 ? digitsBeforeCursor : digitsBeforeCursor <= 6 ? digitsBeforeCursor + 1 : digitsBeforeCursor + 2;
        input.setSelectionRange(Math.min(nextCursor, typed.length), Math.min(nextCursor, typed.length));
        // Keep Ant's internal text while the user is still typing; commit complete ISO dates.
        if (!typed || validDate(typed)) onChange(typed);
      }}
      onBlurCapture={event => {
        if (event.target instanceof HTMLInputElement && event.target.value && !validDate(event.target.value)) onChange(event.target.value);
      }}>
      <DatePicker {...props} className="date-range-date-picker" format="YYYY-MM-DD" preserveInvalidOnBlur placement="bottomLeft" placeholder="YYYY-MM-DD"
        classNames={{ popup: { root: 'date-range-calendar' } }}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); } }}
        value={validDate(value) ? dayjs(value) : null}
        onChange={date => onChange(date ? date.format('YYYY-MM-DD') : '')} />
    </span>
  </ConfigProvider>;
}
