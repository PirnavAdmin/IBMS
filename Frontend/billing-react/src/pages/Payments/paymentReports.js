import { displayDate, formatIndianDateTime, paymentService } from './paymentService';

const escapeHtml = value => String(value == null || value === '' ? '\u2014' : value)
  .replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

const amount = (value, currency) => value == null ? '\u2014'
  : `${currency || 'INR'} ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const table = (columns, rows) => `<table><thead><tr>${columns.map(value => `<th>${escapeHtml(value)}</th>`).join('')}</tr></thead><tbody>${rows.length
  ? rows.map(row => `<tr>${row.map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('')
  : `<tr><td colspan="${columns.length}">No records available.</td></tr>`}</tbody></table>`;

// Match the Products & Services report: plain Arial, title, bordered tables.
const document = (title, body, landscape = false) => `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
  @page{size:${landscape ? 'landscape' : 'A4'};margin:12mm}
  body{margin:0;background:white;color:#111;font:12px Arial,sans-serif}
  h1{font-size:20px;margin:0 0 12px}h2{font-size:15px;margin:20px 0 10px}
  table{width:100%;border-collapse:collapse;table-layout:fixed}
  th,td{border:1px solid #999;padding:6px 8px;text-align:left;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap}
  th{font-weight:700}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}
  h2{break-after:avoid}
  </style></head><body><h1>${escapeHtml(title)}</h1>${body}</body></html>`;

export function buildPaymentListReport(payments) {
  return document('Payments', table(
    ['Payment Number / ID', 'Date', 'Customer', 'Invoice', 'Method', 'Amount', 'Allocated', 'Status'],
    payments.map(p => [p.paymentNumber || p.id, displayDate(p.paymentDate), p.customerName, p.invoiceDisplay,
      p.methodDisplay, amount(p.amount, p.currency), amount(p.allocatedAmount, p.currency), p.status])
  ), true);
}

export function buildPaymentReceiptReport(p) {
  const summary = [
    ['Payment Number / ID', p.paymentNumber || p.id], ['Payment Date', displayDate(p.paymentDate)],
    ['Customer', p.customerName], ['Method', p.methodDisplay], ['Status', p.status],
    ['Amount', amount(p.amount, p.currency)], ['Allocated Amount', amount(p.allocatedAmount, p.currency)],
    ['Reference', p.reference || p.providerTransactionId || p.chequeNumber], ['Notes', p.notes],
    ['Created By', p.createdBy], ['Created At', formatIndianDateTime(p.createdAtUtc)],
    ['Bank', p.bankName], ['Provider', p.providerName], ['Cheque Status', p.clearingStatus],
  ];
  const allocations = (p.allocations || []).map(a => [a.invoiceNumber || a.invoiceId,
    amount(a.allocatedAmount, p.currency), amount(a.invoicePaidAmount, p.currency),
    amount(a.invoiceBalanceAmount, p.currency), a.invoiceStatus]);
  const reversal = p.status === 'Reversed' ? '<h2>Reversal Information</h2>' + table(['Field', 'Value'], [
    ['Status', p.status], ['Reversal Date', formatIndianDateTime(p.reversedAtUtc)],
    ['Reason', p.reversalReason], ['Reversed By', p.reversedBy],
  ]) : '';
  return document('Payment Receipt', '<h2>Payment Summary</h2>' + table(['Field', 'Value'], summary)
    + '<h2>Invoice Allocation</h2>' + table(['Invoice', 'Allocated Amount', 'Paid Total', 'Outstanding', 'Status'], allocations) + reversal);
}

export async function getPaymentReportRows(filters, options) {
  const first = await paymentService.getPayments({ ...filters, pageNumber: 1, pageSize: 100 }, options);
  const rows = [...first.items];
  for (let pageNumber = 2; pageNumber <= Math.ceil(first.totalCount / first.pageSize); pageNumber += 1) {
    const page = await paymentService.getPayments({ ...filters, pageNumber, pageSize: first.pageSize }, options);
    if (page.totalCount !== first.totalCount || page.pageNumber !== pageNumber) {
      throw new Error('Payments changed while preparing the report. Please retry.');
    }
    rows.push(...page.items);
  }
  if (rows.length !== first.totalCount || new Set(rows.map(row => row.id)).size !== rows.length) {
    throw new Error('The complete filtered payments could not be retrieved. Please retry.');
  }
  return rows;
}

// An isolated document excludes application fonts, icon circles, and controls.
// It also supports receipt links without relying on browser pop-up permission.
export function printPaymentDocument(report) {
  window.document.getElementById('payment-print-document')?.remove();
  const frame = window.document.createElement('iframe');
  frame.id = 'payment-print-document';
  frame.title = 'Printable payment report';
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1100px;height:800px;border:0;';
  frame.onload = () => {
    const printWindow = frame.contentWindow;
    printWindow.addEventListener('afterprint', () => frame.remove(), { once: true });
    printWindow.focus();
    printWindow.print();
  };
  frame.srcdoc = report;
  window.document.body.appendChild(frame);
}
