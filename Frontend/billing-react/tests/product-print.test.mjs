import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProductListReport } from '../src/pages/Products/utils/productListReport.js';

test('Product print: only title and table, escaped values and all rows retained', () => {
  const products = Array.from({ length: 205 }, (_, id) => ({ productCode: `P-${id}`, name: '<script>unsafe</script>', price: 1000, status: 'Active', categoryId: 1 }));
  const html = buildProductListReport(products, [{ id: 1, name: 'Category A' }]);
  assert.doesNotMatch(html, /Applied Filters|No filters|Generated|Actions|pagination|<button|<input|<select|INVOICE.BILLING/);
  assert.match(html, /<h1>Products &amp; Services<\/h1>/);
  assert.match(html, /&lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.match(html, /Category A/);
  assert.match(html, /INR 1,000\.00/);
  assert.equal((html.match(/<tr>/g) || []).length, 206);
  assert.match(html, /display:table-header-group/);
  assert.match(html, /break-inside:avoid/);
  assert.match(html, /window.print/);
});
