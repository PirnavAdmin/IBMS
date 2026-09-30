export function QuotationStatusBadge({ status }) { return <span className={`quote-status ${String(status || '').toLowerCase()}`}>{status || 'Unknown'}</span>; }
