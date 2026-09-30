const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const reportPrice = product => `${product.currency || 'INR'} ${Number(product.price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function buildProductListReport(products, categories = []) {
  const rows = products.map(product => `<tr>${[product.productCode, product.name, product.type, product.category || categories.find(category => String(category.id) === String(product.categoryId))?.name || '-', product.unit || '-', reportPrice(product), product.taxCategory || '-', product.hsnSac || '-', product.status].map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Products &amp; Services</title><style>
    @page{size:landscape;margin:12mm}
    body{margin:0;background:white;color:#111;font:12px Arial,sans-serif}
    h1{font-size:20px;margin:0 0 12px}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th,td{border:1px solid #999;padding:6px 8px;text-align:left;vertical-align:middle;overflow-wrap:anywhere}
    th{font-weight:700}thead{display:table-header-group}
    th:nth-child(6),td:nth-child(6){text-align:right}
    tr{break-inside:avoid;page-break-inside:avoid}
  </style></head><body><h1>Products &amp; Services</h1><table><thead><tr>${['Product Code','Product Name','Type','Category','Unit','Price','Tax Category','HSN/SAC','Status'].map(label => `<th>${label}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>{window.print()}</script></body></html>`;
}
