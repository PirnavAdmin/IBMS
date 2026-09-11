// HTTP-only SPA fallback checks. 17 is a route placeholder, not a fetched customer.
// This does not execute React, authenticate, or call the backend.
import fs from 'node:fs';
const paths = ['/customers', '/customers/create', '/customers/17', '/customers/17/edit', ...['addresses', 'invoices', 'payments', 'statement', 'audit'].map(tab => `/customers/17?tab=${tab}`)];
const results = [];
for (const path of paths) {
  const response = await fetch(`http://127.0.0.1:4173${path}`);
  const html = await response.text();
  const hasRoot = html.includes('id="root"');
  const script = html.match(/<script[^>]*src="([^"]+)"/)?.[1];
  const assetStatus = script ? (await fetch(new URL(script, response.url))).status : null;
  results.push({ path, status: response.status, hasRoot, assetStatus, result: response.status === 200 && hasRoot && assetStatus === 200 ? 'PASS (HTML shell only)' : 'FAIL' });
}
fs.writeFileSync('qa/customer-management-2026-09-10/route-shell-results.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
process.exitCode = results.some(r => r.result === 'FAIL') ? 1 : 0;
