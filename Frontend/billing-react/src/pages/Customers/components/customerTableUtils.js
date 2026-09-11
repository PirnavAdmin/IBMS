export const emptyFilters = { search: '', start: '', end: '' };
export function filterCustomerRows(rows, filters, dateKey = 'date', searchKeys) {
  const search = (filters.search || '').trim().toLowerCase();
  return rows.filter((row) => (!search || (searchKeys ? searchKeys.map((key) => row[key]) : Object.values(row)).some((value) => String(value ?? '').toLowerCase().includes(search)))
    && (!filters.start || String(row[dateKey] || '').slice(0, 10) >= filters.start)
    && (!filters.end || String(row[dateKey] || '').slice(0, 10) <= filters.end)
    && Object.entries(filters).every(([key, value]) => ['search', 'start', 'end'].includes(key) || !value || row[key] === value));
}
export function rankCustomerNameMatches(rows, search) {
  const query = (search || '').trim().toLowerCase();
  if (!query) return rows;
  const rank = (row) => Math.min(...['name', 'displayName'].map((key) => {
    const value = String(row[key] || '').toLowerCase();
    return value === query ? 0 : value.startsWith(query) ? 1 : value.split(/\s+/).some((word) => word.startsWith(query)) ? 2 : value.includes(query) ? 3 : 4;
  }));
  // Stable sorting preserves the selected column order within equal matches.
  return [...rows].sort((a, b) => rank(a) - rank(b));
}
export function sortCustomerRows(rows, key, direction) {
  return [...rows].sort((a, b) => (direction === 'asc' ? 1 : -1) * (typeof a[key] === 'number' ? a[key] - b[key] : String(a[key] ?? '').localeCompare(String(b[key] ?? ''))));
}
