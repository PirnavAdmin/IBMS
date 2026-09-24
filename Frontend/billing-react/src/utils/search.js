export const SEARCH_DELAY = 300;

export function scheduleSearch(value, commit) {
  const timer = setTimeout(() => commit(value.trim()), SEARCH_DELAY);
  return () => clearTimeout(timer);
}

export function searchParams(previous, value, pageKey = 'pageNumber') {
  const search = value.trim();
  return previous.search === search ? previous : { ...previous, search, [pageKey]: 1 };
}

// Use only for complete, locally filtered lists, never server-paginated results.
export function prioritizePrefix(rows, search, values = Object.values) {
  const term = search.trim().toLowerCase();
  if (!term) return rows;
  const starts = row => values(row).some(value => String(value ?? '').toLowerCase().startsWith(term));
  return [...rows].sort((a, b) => Number(starts(b)) - Number(starts(a)));
}
