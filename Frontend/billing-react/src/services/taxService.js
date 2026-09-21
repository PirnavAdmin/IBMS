import { apiClient } from '../../../billing-api-client/apiClient.js';

const endpoint = '/api/v1/settings/taxes';
const ratesEndpoint = `${endpoint}/rates`;
const unwrap = response => {
  if (response?.success === false) throw new Error(response.message || 'The tax request was rejected.');
  return response?.data ?? response;
};
const dateOnly = value => value ? String(value).slice(0, 10) : '';
const uiType = value => value === 'Custom' ? 'Custom Tax' : value;
const apiType = value => value === 'Custom Tax' ? 'Custom' : value;

const mapRate = rate => ({
  id: rate.id, name: rate.name ?? '', code: rate.code ?? '', type: uiType(rate.taxType ?? rate.type ?? ''),
  rate: Number(rate.rate ?? 0), calculation: rate.isInclusive ? 'Inclusive' : 'Exclusive', priority: Number(rate.priority ?? 0),
  effectiveFrom: dateOnly(rate.effectiveFrom), effectiveTo: dateOnly(rate.effectiveTo),
  status: rate.status ?? (rate.isActive === false ? 'Inactive' : 'Active'),
});
const ratePayload = values => ({
  name: values.name.trim(), code: values.code.trim(), taxType: apiType(values.type), rate: Number(values.rate),
  isInclusive: values.calculation === 'Inclusive', priority: Number(values.priority),
  effectiveFrom: values.effectiveFrom || null, effectiveTo: values.effectiveTo || null, status: values.status,
});

export const taxApi = {
  getSettings: () => apiClient.get(endpoint),
  createRate: payload => apiClient.post(ratesEndpoint, payload),
  updateRate: (id, payload) => apiClient.put(`${ratesEndpoint}/${encodeURIComponent(id)}`, payload),
};
export const taxService = {
  async list() {
    const settings = unwrap(await taxApi.getSettings());
    return (settings.taxRates ?? settings.TaxRates ?? []).map(mapRate);
  },
  async save(values, id) {
    const response = id ? await taxApi.updateRate(id, ratePayload(values)) : await taxApi.createRate(ratePayload(values));
    return mapRate(unwrap(response));
  },
};
export function taxError(error) {
  const status = error?.response?.status;
  if (status === 400) return error?.message || 'The tax settings request was rejected. Check the entered values.';
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return 'You do not have permission to manage tax settings.';
  if (status === 404) return 'The requested tax rule was not found.';
  if (status === 409) return 'Tax settings have changed. Reload before trying again.';
  if (status >= 500) return 'The server could not load tax settings. Please retry.';
  return error?.message || 'Unable to connect to tax settings. Check your connection and retry.';
}
