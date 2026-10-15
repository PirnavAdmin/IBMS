export function localCalendarDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Invoice display convention: keep the calendar day supplied by date-only/API fields.
export function displayDate(value) {
  if (!value) return '\u2014';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '\u2014' : displayDate(localCalendarDate(value));
  const text = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return text;
  return text || '\u2014';
}

// Audit and delivery timestamps retain their existing IST conversion, with Invoice dates.
export function displayDateTime(value, { includeSeconds = true, includeZone = true } = {}) {
  if (!value) return '\u2014';
  let target = value;
  if (typeof value === 'string') {
    target = value.trim().replace(' ', 'T');
    if (/^\d{4}-\d{2}-\d{2}$/.test(target)) target += 'T00:00:00+05:30';
    else if (/T\d{2}:\d{2}/.test(target) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(target)) target += 'Z';
  }
  const date = new Date(target);
  if (Number.isNaN(date.getTime())) return 'Unavailable';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', ...(includeSeconds ? { second: '2-digit' } : {}),
    hour12: true, ...(includeZone ? { timeZoneName: 'short' } : {}),
  }).format(date);
}
