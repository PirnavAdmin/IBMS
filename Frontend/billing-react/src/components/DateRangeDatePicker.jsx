import dayjs from 'dayjs';
import { ConfigProvider, DatePicker } from 'antd';
import '../styles/DateRangeFilter.css';

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
    <span className="date-range-date-field" onInputCapture={event => { if (event.target.value === '') onChange(''); }}>
      <DatePicker {...props} className="date-range-date-picker" format="YYYY-MM-DD"
        classNames={{ popup: { root: 'date-range-calendar' } }}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); } }}
        value={value ? dayjs(value) : null}
        onChange={date => onChange(date ? date.format('YYYY-MM-DD') : '')} />
    </span>
  </ConfigProvider>;
}
