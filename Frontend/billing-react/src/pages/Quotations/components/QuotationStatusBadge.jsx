export function QuotationStatusBadge({ status, expired = false }) { return <span className={`quote-status ${expired ? 'expired' : status.toLowerCase()}`}>{expired ? 'Expired' : status}</span>; }
