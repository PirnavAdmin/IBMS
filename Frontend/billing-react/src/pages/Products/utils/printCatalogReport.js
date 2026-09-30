const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

// Open synchronously from the button click so the browser can allow the print tab.
export function printCatalogReport({ title, columns, rows }) {
  const cell = value => escapeHtml(value ?? '-');
  const report = `<!doctype html><html><head><meta charset="utf-8"><title>${cell(title)}</title><style>
    @page{size:A4;margin:14mm}body{font:12px Arial,sans-serif;color:#302521}header{border-bottom:2px solid #4a2c2a;margin-bottom:16px;padding-bottom:10px}h1{font-size:22px;margin:8px 0}.meta{color:#756763}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:8px;border:1px solid #ddd2c7;text-align:left;overflow-wrap:anywhere;white-space:pre-wrap}th{background:#f4eadd}tr{break-inside:avoid}thead{display:table-header-group}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  </style></head><body><header><b>INVOICE.BILLING</b><h1>${cell(title)}</h1><div class="meta">Generated ${cell(new Date().toLocaleString())}</div></header><table><thead><tr>${columns.map(label => `<th>${cell(label)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(row => `<tr>${row.map(value => `<td>${cell(value)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${columns.length}">No records available.</td></tr>`}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`;
  const url = URL.createObjectURL(new Blob([report], { type: 'text/html' }));
  const printWindow = window.open(url, '_blank');
  if (!printWindow) {
    URL.revokeObjectURL(url);
    throw new Error('Allow pop-ups to open the printable report and save it as PDF.');
  }
  printWindow.opener = null;
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
