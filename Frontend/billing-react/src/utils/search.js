export const SEARCH_DELAY = 300;

export const EMPTY_SEARCH_GUIDANCE = "Enter a search term, or leave this field blank to show all records matching the other filters.";

export function searchInputError(value) {
  const term = String(value ?? "").trim();
  if (!term) return "";
  if (/[\u0000-\u001f\u007f]/.test(term)) return "Remove control characters from the search term.";
  return /[\p{L}\p{N}]/u.test(term) ? "" : "Enter at least one letter or number. Symbols alone cannot be searched.";
}

export function scheduleSearch(value, commit) {
  if (searchInputError(value)) return () => {};
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
