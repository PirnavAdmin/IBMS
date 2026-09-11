import { apiClient } from 'billing-api-client';
import { requireCustomerId } from '../../../../../billing-contracts/customer.contracts.js';
import { customerPayload, customerQuery, mapCustomer, mapCustomerPage, unwrapCustomerResponse } from './customerContract';


const endpoint = '/api/v1/customers';
const config = { headers: { Accept: 'application/json' } };
// One-time cleanup of the obsolete Customer demo store only. Never read it as API data.
try { if (typeof localStorage !== 'undefined') localStorage.removeItem('ibms.customers.demo.v1'); } catch { /* Browser storage may be unavailable; backend requests still work. */ }
const customerPath = (id) => {
  return `${endpoint}/${requireCustomerId(id)}`;
};
async function request(operation) {
  try { const result = await operation(); unwrapCustomerResponse(result); return result; }
  catch (error) {
    if (error?.response?.status === 401) throw new Error('Your session is missing or expired. Sign in and retry.');
    if (error?.response?.status === 403) throw new Error('Your account does not have access to these customer records.');
    if (error?.message === 'Network Error') throw new Error('Please check your connection and try again.');
    throw error;
  }
}
export async function getCustomers(params, signal) {
  const query = customerQuery(params);
  return request(async () => mapCustomerPage(await apiClient.get(endpoint, { ...config, params: query, signal }), params));
}
export async function getCustomerById(id, signal) {
  return request(async () => mapCustomer(await apiClient.get(customerPath(id), { ...config, signal })));
}
export async function getCustomerDetails(id, signal) {
  return request(async () => mapCustomer(await apiClient.get(`${customerPath(id)}/details`, { ...config, signal })));
}
export async function createCustomer(values) {
  await request(() => apiClient.post(endpoint, customerPayload(values), config));
}
export async function updateCustomer(id, values, original) {
  const existing = original ?? await getCustomerById(id);
  await request(() => apiClient.put(customerPath(id), customerPayload(values, existing), config));
}
export async function deactivateCustomer(id) {
  await request(() => apiClient.patch(`${customerPath(id)}/deactivate`, undefined, config));
}
// Existing activation action uses documented PUT fields, not an invented PATCH endpoint.
export async function activateCustomer(id) {
  const existing = await getCustomerById(id);
  await request(() => apiClient.put(customerPath(id), { ...customerPayload({}, existing), status: 'Active', isActive: true }, config));
}
export async function deleteCustomer(id) {
  await request(() => apiClient.delete(customerPath(id), config));
}
export async function getCustomerSummary(signal) {
  return request(async () => {
    const data = unwrapCustomerResponse(await apiClient.get(`${endpoint}/summary`, { ...config, signal }));
    const availableNumber = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
    const total = availableNumber(data.totalCustomers);
    const active = availableNumber(data.activeCustomers);
    const inactive = availableNumber(data.inactiveCustomers);
    const outstanding = availableNumber(data.totalOutstanding);
    return { total, active, inactive, outstanding, currency: typeof data.currency === 'string' ? data.currency.trim() : '' };
  });
}
