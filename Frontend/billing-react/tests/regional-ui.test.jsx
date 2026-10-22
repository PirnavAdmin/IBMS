import test from 'node:test';
import assert from 'node:assert/strict';
import { apiClient } from 'billing-api-client';
import { BILLING_COUNTRIES_LIST, COUNTRIES_LIST, regionalSettingsService } from '../src/services/regionalSettingsService.js';

test('unsupported billing currency cannot return through stored or submitted country settings', async () => {
  const originalStorage = globalThis.localStorage;
  const originalPut = apiClient.put;
  const storage = new Map([['invoice_billing_selected_countries_default', JSON.stringify(['Angola', 'India'])]]);
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const calls = [];
  apiClient.put = async (url, payload) => { calls.push({ url, payload }); return { success: true }; };
  try {
    assert.ok(COUNTRIES_LIST.some(country => country.code === 'AO'));
    assert.ok(!BILLING_COUNTRIES_LIST.some(country => country.currency === 'AOA'));
    assert.deepEqual(regionalSettingsService.getSelectedCountries().map(country => country.code), ['IN']);
    await regionalSettingsService.saveSelectedCountries(['Angola', 'India']);
    assert.deepEqual(calls[0].payload.countries.map(country => country.currency), ['INR']);
    assert.deepEqual(JSON.parse(storage.get('invoice_billing_selected_countries_default')), ['India']);
  } finally {
    apiClient.put = originalPut;
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  }
});
