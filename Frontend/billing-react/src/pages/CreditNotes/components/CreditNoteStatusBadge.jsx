const statusClasses = {
  Draft: 'draft',
  'Pending Approval': 'pending',
  Approved: 'approved',
  Issued: 'issued',
  'Partially Refunded': 'partial',
  Refunded: 'refunded',
  Rejected: 'rejected',
  Cancelled: 'cancelled',
};

export function CreditNoteStatusBadge({ status }) {
  return <span className={`cn-status cn-status-${statusClasses[status] || 'draft'}`}><i />{status || 'Draft'}</span>;
}
