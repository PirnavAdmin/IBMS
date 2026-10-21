// Print an isolated document in the current tab, without changing the SPA route.
export function printDocument(report, id = 'billing-print-document') {
  window.document.getElementById(id)?.remove();
  const frame = window.document.createElement('iframe');
  frame.id = id;
  frame.title = 'Printable billing report';
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

export const escapeReportText = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const reportTable = (headers, rows) => `<table><thead><tr>${headers.map(value=>`<th>${escapeReportText(value)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(value=>`<td>${escapeReportText(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
export function reportDocument(title, body, extraStyles = '', landscape = true) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeReportText(title)}</title><style>
  @page{size:${landscape ? 'landscape' : 'A4'};margin:12mm}
  body{margin:0;background:white;color:#35231C;font:12px Arial,sans-serif}
  h1{font-size:20px;margin:0 0 12px;color:#633D28}h2{font-size:15px;color:#633D28}
  table{width:100%;border-collapse:collapse;table-layout:fixed}
  th,td{border:1px solid #BBA58C;padding:6px 8px;text-align:left;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap}
  th{background:#F0E2D0;color:#4B2E1E}thead{display:table-header-group}tr{break-inside:avoid}
  body{print-color-adjust:exact;-webkit-print-color-adjust:exact}${extraStyles}
  </style></head><body><h1>${escapeReportText(title)}</h1>${body}</body></html>`;
}
