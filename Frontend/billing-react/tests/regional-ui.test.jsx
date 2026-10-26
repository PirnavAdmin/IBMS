import test from 'node:test';
import assert from 'node:assert/strict';
import { apiClient } from 'billing-api-client';
import { BILLING_COUNTRIES_LIST, COUNTRIES_LIST, regionalSettingsService } from '../src/services/regionalSettingsService.js';

test('unsupported billing currency cannot return through stored or submitted country settings', async () => {
  const originalStorage = globalThis.localStorage;
  const originalPut = apiClient.put;
  const storage = new Map([['invoice_billing_selected_countries_default', JSON.stringify(['Angola', 'India'])], ['billing_auth_token', 'regional-session-1'], ['billing_auth_user', JSON.stringify({tenantId: 1, id: 'account-1'})]]);
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const calls = [];
  apiClient.put = async (url, payload) => { calls.push({ url, payload }); return { success: true }; };
  try {
    assert.ok(COUNTRIES_LIST.some(country => country.code === 'AO'));
    assert.ok(!BILLING_COUNTRIES_LIST.some(country => country.currency === 'AOA'));
    assert.deepEqual(regionalSettingsService.getSelectedCountries(), []);
    await regionalSettingsService.saveSelectedCountries(['Angola', 'India']);
    assert.deepEqual(calls[0].payload.countries.map(country => country.currency), ['INR']);
    assert.deepEqual(regionalSettingsService.getSelectedCountries().map(country => country.code), ['IN']);
    assert.deepEqual(JSON.parse(storage.get('invoice_billing_selected_countries_default')), ['Angola', 'India']);
    storage.set('billing_auth_user', JSON.stringify({tenantId: 2, id: 'account-2'}));
    assert.deepEqual(regionalSettingsService.getSelectedCountries(), []);
    storage.set('billing_auth_user', JSON.stringify({tenantId: 1, id: 'account-1'}));
    assert.deepEqual(regionalSettingsService.getSelectedCountries(), []);
    await regionalSettingsService.saveSelectedCountries(['India']);
    storage.set('billing_auth_token', 'regional-session-2');
    assert.deepEqual(regionalSettingsService.getSelectedCountries(), []);
    apiClient.put = async () => ({status: 200});
    await assert.rejects(regionalSettingsService.saveSelectedCountries(['Canada']), /could not be saved/);
    assert.deepEqual(regionalSettingsService.getSelectedCountries(), []);
    apiClient.put = async () => { throw Object.assign(new Error('Country endpoint unavailable'), {response: {status: 404}}); };
    await assert.rejects(regionalSettingsService.saveSelectedCountries(['Canada']), /endpoint unavailable/);
  } finally {
    apiClient.put = originalPut;
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  }
});
