import { apiClient } from '../../../../../billing-api-client/apiClient.js';

export const INVOICE_EXPORT_LIMIT = 10000;
export async function downloadInvoiceCsv(query) {
  const { page, pageSize, ...filters } = query;
  // The shared client supplies authentication and tenant headers and unwraps response.data.
  const blob = await apiClient.get('/api/v1/invoices/export', {
    params: { ...filters, format: 'csv' }, responseType: 'blob',
    headers: { Accept: 'text/csv' },
  });
  if (!(blob instanceof Blob) || !blob.size || !/^text\/csv(?:;|$)/i.test(blob.type)) {
    throw new Error('The server did not return an invoice CSV. Export was not downloaded.');
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = `invoices_export_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
