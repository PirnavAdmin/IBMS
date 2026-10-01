// Respect the API timezone; never guess a missing server timezone.
export function parseQuotationTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const timestamp = value.trim();
  // Event timestamps require an explicit timezone; report malformed server contracts.
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestamp)) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatQuotationTimestamp(value, options = {}) {
  const date = parseQuotationTimestamp(value);
  if (!date) return value ? 'Date unavailable (missing or invalid timezone)' : 'Date unavailable';
  return date.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
    ...options,
  });
}
