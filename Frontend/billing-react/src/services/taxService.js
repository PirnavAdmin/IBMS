import { apiClient } from '../../../billing-api-client/apiClient.js';

const endpoint = '/api/v1/settings/taxes';
const ratesEndpoint = `${endpoint}/rates`;
const safeMessage = value => typeof value === 'string' && value.length <= 500 && !/[<>]|\bat System\.|\bstack trace\b|SqlException/i.test(value) ? value : '';
const unwrap = response => {
  if (response?.success === false) throw new Error(safeMessage(response.message) || 'The tax request was rejected.');
  const data = response && Object.hasOwn(response, 'data') ? response.data : response;
  if (!data || typeof data !== 'object') throw new Error('The backend returned invalid tax settings. Please retry.');
  return data;
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
    const rates = settings.taxRates ?? settings.TaxRates;
    if (!Array.isArray(rates) || rates.some(rate => !rate || rate.id == null)) throw new Error('The backend returned an invalid tax list. Please retry.');
    return rates.map(mapRate);
  },
  async save(values, id) {
    const response = id ? await taxApi.updateRate(id, ratePayload(values)) : await taxApi.createRate(ratePayload(values));
    const rate = unwrap(response);
    if (rate.id == null) throw new Error('The backend did not confirm the saved tax rule. Reload before trying again.');
    return mapRate(rate);
  },
};
export function taxError(error) {
  const status = error?.response?.status;
  if (status === 400) {
    const data = error.response.data;
    const messages = data?.errors && typeof data.errors === 'object' ? Object.values(data.errors).flat().map(safeMessage).filter(Boolean) : [];
    return messages.join(' ') || safeMessage(data?.message) || 'The tax settings request was rejected. Check the entered values.';
  }
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return 'You do not have permission to manage tax settings.';
  if (status === 404) return 'The requested tax rule was not found.';
  if (status === 409) return 'Tax settings have changed. Reload before trying again.';
  if (status >= 500) return 'The server could not load tax settings. Please retry.';
  return error?.message !== 'Network Error' && safeMessage(error?.message) || 'Unable to connect to tax settings. Check your connection and retry.';
}
