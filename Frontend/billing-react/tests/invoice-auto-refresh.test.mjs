import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('invoice list and details do not poll automatically while quotation refresh remains enabled', async () => {
  const invoiceFiles = [
    '../src/pages/Invoices/InvoiceList.jsx',
    '../src/pages/Invoices/InvoiceDetails.jsx',
  ];
  for (const file of invoiceFiles) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /refetchInterval\s*:/, `${file} should not poll automatically`);
  }

  const quotations = await readFile(new URL('../src/pages/Quotations/QuotationManagement.jsx', import.meta.url), 'utf8');
  assert.match(quotations, /window\.setInterval\(refreshQuotes,30000\)/);
});
