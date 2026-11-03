import { localCalendarDate } from './localDate.js';
export const validDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
export function dateRangeError({ startDate, endDate }, today = localCalendarDate()) {
  if ((startDate && !validDate(startDate)) || (endDate && !validDate(endDate))) return 'Enter valid dates in YYYY-MM-DD format.';
  if (!startDate || !endDate) return 'Select both From Date and To Date.';
  if (endDate < startDate) return 'To Date must be on or after From Date.';
  if (startDate > today || endDate > today) return 'Future dates are not allowed when searching records.';
  return '';
}
