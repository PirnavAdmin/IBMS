import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('only quotations refresh automatically on intervals and focus', async () => {
  const invoiceFiles = [
    '../src/pages/Invoices/InvoiceList.jsx',
    '../src/pages/Invoices/InvoiceDetails.jsx',
  ];
  for (const file of invoiceFiles) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /refetchInterval\s*:/, `${file} should not poll automatically`);
    assert.doesNotMatch(source, /refetchOnWindowFocus\s*:\s*true/, `${file} should not refetch automatically on focus`);
  }

  const quotations = await readFile(new URL('../src/pages/Quotations/QuotationManagement.jsx', import.meta.url), 'utf8');
  assert.match(quotations, /window\.setInterval\(refreshQuotes,30000\)/);
  assert.match(quotations, /window\.addEventListener\('focus',refreshWhenVisible\)/);
  assert.match(quotations, /document\.addEventListener\('visibilitychange',refreshWhenVisible\)/);
});
