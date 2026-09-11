// Read-only reachability/authorization checks, NOT authenticated integration tests.
// The unavailable browser session is not read or replaced; no credentials are supplied.
import fs from 'node:fs';
import { apiClient } from '../../Frontend/billing-api-client/apiClient.js';
const results = [];
for (const url of ['/api/v1/customers', '/api/v1/customers/summary']) {
  try {
    const response = await apiClient.get(url, { headers: { Accept: 'application/json' } });
    results.push({ method: 'GET', url, result: '2xx (client unwraps status)', authenticated: false, responseKeys: Object.keys(response || {}) });
  } catch (error) {
    results.push({ method: 'GET', url, status: error.response?.status ?? null, authenticated: false, code: error.code ?? null });
  }
}
fs.writeFileSync('qa/customer-management-2026-09-10/public-access-results.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
