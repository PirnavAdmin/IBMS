import { DateRangeFilter } from '../../components/DateRangeFilter';

export function DeliveryDateRange({ startDate, endDate, onChange }) {
  return <DateRangeFilter className="delivery-date-range" startDate={startDate} endDate={endDate}
    onApply={onChange} title="Date Range (UTC)" fromLabel="From Date (UTC)" toLabel="To Date (UTC)"
    latestDate={new Date().toISOString().slice(0, 10)} />;
}