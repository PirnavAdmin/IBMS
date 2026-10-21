export const initialQuotationQuery = { search: '', status: '', customerId: '', fromDate: '', toDate: '', pageNumber: 1, pageSize: 10, sortBy: 'quotationDate', sortOrder: 'desc' };
export function quotationQuery(params) {
  return Object.fromEntries(Object.entries(params).filter(([key, value]) => Object.hasOwn(initialQuotationQuery, key) && value !== '' && value != null));
}
export function quotationPage(data) {
  if (!Array.isArray(data?.items) || !Number.isFinite(data.totalCount)) throw new Error('Invalid quotation list response. Please retry.');
  return data;
}
export function quotationUpdatedTimestamp(quotation) {
  const timestamps = [
    quotation.updatedAtUtc, quotation.UpdatedAtUtc, quotation.updatedAt, quotation.UpdatedAt,
    quotation.lastUpdatedAtUtc, quotation.LastUpdatedAtUtc, quotation.lastUpdatedAt,
  ];
  for (const timestamp of timestamps) {
    if (timestamp == null || timestamp === '') continue;
    const parsed = timestamp instanceof Date ? timestamp.getTime() : Date.parse(String(timestamp));
    if (Number.isFinite(parsed)) return parsed;
  }
  const rowVersion = quotation.rowVersion || quotation.RowVersion;
  if (typeof rowVersion === 'string' && /^[A-Za-z0-9+/]{11}=$/.test(rowVersion) && typeof atob === 'function') {
    const bytes = Uint8Array.from(atob(rowVersion), character => character.charCodeAt(0));
    if (bytes.length === 8) {
      const ticks = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(0, true);
      const unixMilliseconds = Number((ticks - 621355968000000000n) / 10000n);
      if (Number.isFinite(unixMilliseconds)) return unixMilliseconds;
    }
  }
  const creationTimestamps = [
    quotation.createdAtUtc, quotation.CreatedAtUtc, quotation.createdAt, quotation.CreatedAt,
    quotation.quotationDate, quotation.QuotationDate,
  ];
  for (const timestamp of creationTimestamps) {
    if (timestamp == null || timestamp === '') continue;
    const parsed = timestamp instanceof Date ? timestamp.getTime() : Date.parse(String(timestamp));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}
export function compareQuotationUpdates(a, b, direction = 'desc') {
  const order = direction === 'asc' ? 1 : -1;
  const timestampDifference = quotationUpdatedTimestamp(a) - quotationUpdatedTimestamp(b);
  if (timestampDifference) return timestampDifference * order;
  const idDifference = Number(a.id) - Number(b.id);
  if (Number.isFinite(idDifference) && idDifference) return idDifference * order;
  return String(a.quoteNumber || '').localeCompare(String(b.quoteNumber || ''), undefined, { numeric: true }) * order;
}
export function quotationCreatedTimestamp(quotation) {
  const timestamps = [
    quotation.createdAtUtc, quotation.CreatedAtUtc, quotation.createdAt, quotation.CreatedAt,
  ];
  for (const timestamp of timestamps) {
    if (timestamp == null || timestamp === '') continue;
    const parsed = timestamp instanceof Date ? timestamp.getTime() : Date.parse(String(timestamp));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}
export function compareQuotationCreations(a, b, direction = 'desc') {
  const order = direction === 'asc' ? 1 : -1;
  const timestampDifference = quotationCreatedTimestamp(a) - quotationCreatedTimestamp(b);
  if (timestampDifference) return timestampDifference * order;
  const idDifference = Number(a.id) - Number(b.id);
  if (Number.isFinite(idDifference) && idDifference) return idDifference * order;
  return String(a.quoteNumber || '').localeCompare(String(b.quoteNumber || ''), undefined, { numeric: true }) * order;
}
export function compareQuotationNumbers(a, b, direction = 'asc') {
  const order = direction === 'asc' ? 1 : -1;
  const numberDifference = String(a.quoteNumber || '').localeCompare(String(b.quoteNumber || ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
  if (numberDifference) return numberDifference * order;
  const idDifference = Number(a.id) - Number(b.id);
  return Number.isFinite(idDifference) ? idDifference * order : 0;
}
