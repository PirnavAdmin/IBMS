import { apiClient } from 'billing-api-client';
import { customerPayload, customerQuery, mapCustomer, mapCustomerPage, unwrapCustomerResponse } from './customerContract';
import type { Customer, CustomerQueryParams, CustomerSummary } from './types';

const endpoint = '/api/v1/customers';
const config = { headers: { Accept: 'application/json' } };
// One-time cleanup of the obsolete Customer demo store only. Never read it as API data.
try { if (typeof localStorage !== 'undefined') localStorage.removeItem('ibms.customers.demo.v1'); } catch { /* Browser storage may be unavailable; backend requests still work. */ }
const customerPath = (id: string) => {
  if (!/^\d+$/.test(id) || Number(id) < 1) throw new Error('A valid backend customer ID is required.');
  return `${endpoint}/${encodeURIComponent(id)}`;
};
async function request<T>(operation: () => Promise<T>): Promise<T> {
  try { const result = await operation(); unwrapCustomerResponse(result); return result; }
  catch (error: any) {
    if (error?.response?.status === 401) throw new Error('Your session is missing or expired. Sign in and retry.');
    if (error?.response?.status === 403) throw new Error('Your account does not have access to these customer records.');
    if (error?.message === 'Network Error') throw new Error('Please check your connection and try again.');
    throw error;
  }
}
export async function getCustomers(params: CustomerQueryParams, signal?: AbortSignal) {
  const query = customerQuery(params);
  return request(async () => mapCustomerPage(await apiClient.get(endpoint, { ...config, params: query, signal }), params));
}
export async function getCustomerById(id: string, signal?: AbortSignal): Promise<Customer> {
  return request(async () => mapCustomer(await apiClient.get(customerPath(id), { ...config, signal })));
}
export async function getCustomerDetails(id: string, signal?: AbortSignal): Promise<Customer> {
  return request(async () => mapCustomer(await apiClient.get(`${customerPath(id)}/details`, { ...config, signal })));
}
export async function createCustomer(values: Partial<Customer>): Promise<void> {
  await request(() => apiClient.post(endpoint, customerPayload(values), config));
}
export async function updateCustomer(id: string, values: Partial<Customer>, original?: Customer): Promise<void> {
  const existing = original ?? await getCustomerById(id);
  await request(() => apiClient.put(customerPath(id), customerPayload(values, existing), config));
}
export async function deactivateCustomer(id: string): Promise<void> {
  await request(() => apiClient.patch(`${customerPath(id)}/deactivate`, undefined, config));
}
// Existing activation action uses documented PUT fields, not an invented PATCH endpoint.
export async function activateCustomer(id: string): Promise<void> {
  const existing = await getCustomerById(id);
  await request(() => apiClient.put(customerPath(id), { ...customerPayload({}, existing), status: 'Active', isActive: true }, config));
}
export async function deleteCustomer(id: string): Promise<void> {
  await request(() => apiClient.delete(customerPath(id), config));
}
export async function getCustomerSummary(signal?: AbortSignal): Promise<CustomerSummary> {
  return request(async () => {
    const data = unwrapCustomerResponse(await apiClient.get(`${endpoint}/summary`, { ...config, signal }));
    const total = Number(data.totalCustomers);
    const active = Number(data.activeCustomers);
    const inactive = Number(data.inactiveCustomers);
    const outstanding = Number(data.totalOutstanding);
    if (![total, active, inactive, outstanding].every(Number.isFinite)) throw new Error('Customer summary API returned invalid aggregate values.');
    return { total, active, inactive, outstanding, currency: typeof data.currency === 'string' && data.currency ? data.currency : 'USD' };
  });
}
