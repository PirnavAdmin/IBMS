const KEY = 'ibms.tax-workspace.v1';
const definitions = [
  ['GST0', 'GST 0%', 'GST', 0, 'Intra & Inter State'],
  ['CGST9', 'CGST 9%', 'GST', 9, 'Intra State'],
  ['SGST9', 'SGST 9%', 'GST', 9, 'Intra State'],
  ['IGST18', 'IGST 18%', 'GST', 18, 'Inter State'],
  ['GST5', 'GST 5%', 'GST', 5, 'Intra & Inter State'],
  ['GST12', 'GST 12%', 'GST', 12, 'Intra & Inter State'],
  ['GST18', 'GST 18%', 'GST', 18, 'Intra & Inter State'],
  ['GST28', 'GST 28%', 'GST', 28, 'Intra & Inter State'],
  ['CESS1', 'Compensation cess 1%', 'Cess', 1, 'Specified Goods'],
  ['CUSTOM2', 'Custom levy 2%', 'Custom', 2, 'Services'],
  ['CESS3', 'Compensation cess 3%', 'Cess', 3, 'Specified Goods'],
  ['UGST18', 'UGST 18%', 'GST', 18, 'Union Territory'],
];
export const seed = () => ({
  taxes: definitions.map(([code, name, type, rate, applicable], i) => ({ id: code, code, name, type, rate, applicable, country: 'India', from: '2025-04-01', to: '', description: `${name} — illustrative billing configuration for ${applicable.toLowerCase()} transactions.`, active: ![9, 10].includes(i), include: true, draft: false, createdBy: 'Sample administrator', createdOn: '2025-04-01T09:30:00', updatedBy: 'Sample administrator', updatedOn: '2025-04-01T09:30:00', audit: [{ action: 'Sample configuration created', actor: 'Sample administrator', at: '2025-04-01T09:30:00' }] })),
  settings: { enabled: true, gstin: '', legalName: '', state: 'Karnataka', scheme: 'Regular', rounding: 'Nearest rupee', precision: '2', calculation: 'Per line item', inclusive: false, shipping: true, supply: 'Customer billing address', missing: 'Require place of supply', reverse: false },
  rates: [{ id: 'cgst', transaction: 'Intra State', component: 'CGST', rate: 9, active: true }, { id: 'sgst', transaction: 'Intra State', component: 'SGST', rate: 9, active: true }, { id: 'igst', transaction: 'Inter State', component: 'IGST', rate: 18, active: true }, { id: 'ugst', transaction: 'UT (Union Territory)', component: 'UGST', rate: 18, active: true }],
});
export function readTaxes() {
  try { const data = JSON.parse(localStorage.getItem(KEY)); if (data && Array.isArray(data.taxes) && Array.isArray(data.rates) && data.settings) return data; } catch { /* Fall back to illustrative configurations. */ }
  return seed();
}
export function writeTaxes(data) { localStorage.setItem(KEY, JSON.stringify(data)); }
export const date = (value, time = false) => value ? new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) }) : 'No end date';
export function exportTaxes(rows) {
  const cell = value => `"${String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""')}"`;
  const lines = [['Tax Code', 'Tax Name', 'Tax Type', 'Rate %', 'Applicable For', 'Country', 'Effective From', 'Effective To', 'Status'], ...rows.map(t => [t.code, t.name, t.type, t.rate, t.applicable, t.country, t.from, t.to, t.active ? 'Active' : 'Inactive'])];
  const url = URL.createObjectURL(new Blob(['\uFEFF', lines.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'tax-configurations.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
