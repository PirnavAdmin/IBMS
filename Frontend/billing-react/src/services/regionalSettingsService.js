import { useState, useEffect, useCallback, useRef } from 'react';
import { authApi, apiClient } from 'billing-api-client';
import countries195Data from '../data/countries195.json';
import { CURRENCY_CODES, getCurrencySymbol } from '../utils/currencies.js';

export const COUNTRIES_LIST = countries195Data;
export const BILLING_COUNTRIES_LIST = COUNTRIES_LIST.filter(country => CURRENCY_CODES.includes(country.currency));
const ENDPOINT = '/api/v1/settings/country';
const REGIONAL_SETTINGS_EVENT = 'invoice_billing_regional_settings_changed';
const EMPTY_COUNTRIES = [];

export function findCountry(countryOrCode) {
  const value = String(countryOrCode || '').trim().toLowerCase();
  return COUNTRIES_LIST.find(country => country.name.toLowerCase() === value || country.code.toLowerCase() === value) || null;
}

export function findCountryByCallingCode(phoneCode, preferredCountryCode = null) {
  const value = String(phoneCode || '').trim();
  if (!value) return null;
  const normalized = value.startsWith('+') ? value : `+${value}`;
  const preferred = findCountry(preferredCountryCode);
  return (preferred?.phoneCode === normalized ? preferred : null) || COUNTRIES_LIST.find(country => country.phoneCode === normalized) || null;
}

// Authentication storage identifies the request scope only. Country selections are
// never read from storage or held in a module-level fallback cache.
export function getRegionalSessionScope() {
  try {
    const token = localStorage.getItem('billing_auth_token');
    const user = authApi.getCurrentUser();
    return token ? JSON.stringify([token, user?.tenantId ?? user?.tenant_id ?? null, user?.id ?? user?.email ?? null]) : null;
  } catch { return null; }
}

function requireCurrentSession(scope) {
  if (!scope || scope !== getRegionalSessionScope()) {
    throw new Error('Your session changed. Reload country settings before saving.');
  }
}

// Axios runs request interceptors asynchronously. Check scope again immediately
// before transport so an account switch cannot submit the old draft as the new user.
function requestOptions(scope) {
  const transforms = apiClient.defaults.transformRequest;
  return { transformRequest: [data => { requireCurrentSession(scope); return data; }, ...(Array.isArray(transforms) ? transforms : [transforms]).filter(Boolean)] };
}

function mapResponse(response) {
  if (response?.success !== true) throw new Error(response?.message || 'Country settings could not be confirmed by the server.');
  if (!Array.isArray(response.data?.countries)) throw new Error('The server returned an invalid country settings response.');
  const seen = new Set();
  const countries = response.data.countries.map(item => {
    const code = String(item?.countryCode || '').trim().toUpperCase();
    const canonical = COUNTRIES_LIST.find(country => country.code === code);
    if (!canonical) throw new Error(`The server returned an unsupported country code: ${code || '(missing)'}.`);
    if (seen.has(code)) throw new Error(`The server returned duplicate country settings for ${code}.`);
    seen.add(code);
    const currency = String(item.currency || canonical.currency).trim().toUpperCase();
    return { ...canonical, phoneCode: String(item.phoneCode || canonical.phoneCode).trim(), currency, currencySymbol: getCurrencySymbol(currency) };
  });
  return { selectedCountries: countries, message: response.message, updatedAtUtc: response.data.updatedAtUtc ?? null };
}

export function countrySelectionError(countries) {
  if (!Array.isArray(countries)) return 'Select countries from the available country list.';
  const seen = new Set();
  for (const item of countries) {
    const canonical = findCountry(typeof item === 'string' ? item : item?.code);
    if (!canonical) return 'The selection contains an unsupported country. Reload country settings.';
    if (seen.has(canonical.code)) return `Duplicate country selected: ${canonical.name}.`;
    seen.add(canonical.code);
    if (!CURRENCY_CODES.includes(item?.currency ?? canonical.currency)) return `The billing currency for ${canonical.name} is unsupported. Remove this country before saving.`;
    if (typeof item === 'object' && (item.currency !== canonical.currency || item.phoneCode !== canonical.phoneCode)) {
      return `The saved calling code or currency for ${canonical.name} does not match the supported country metadata. Remove and reselect this country before saving.`;
    }
  }
  return '';
}

export const regionalSettingsService = {
  async getSelectedCountries() {
    const scope = getRegionalSessionScope();
    requireCurrentSession(scope);
    const response = await apiClient.get(ENDPOINT, requestOptions(scope));
    requireCurrentSession(scope);
    return mapResponse(response).selectedCountries;
  },

  // Preserve the incoming loader entry point with the same fresh, scoped GET.
  async loadSelectedCountries() {
    return regionalSettingsService.getSelectedCountries();
  },

  async saveSelectedCountries(countries) {
    const scope = getRegionalSessionScope();
    requireCurrentSession(scope);
    const validation = countrySelectionError(countries);
    if (validation) throw new Error(validation);
    const selected = countries.map(item => findCountry(typeof item === 'string' ? item : item.code));
    const response = await apiClient.put(ENDPOINT, {
      countries: selected.map(country => ({ country: country.name, countryCode: country.code, phoneCode: country.phoneCode, currency: country.currency })),
    }, requestOptions(scope));
    requireCurrentSession(scope);
    const result = mapResponse(response);
    // Consumers refetch their own scoped state; this event carries no cached data.
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(REGIONAL_SETTINGS_EVENT));
    return result;
  },
};

export async function getDefaultCountryFromSettings() {
  return (await regionalSettingsService.getSelectedCountries())[0] || null;
}

export function useRegionalSettings() {
  const [, observeSession] = useState(0);
  const scope = getRegionalSessionScope();
  const requestId = useRef(0);
  const [selection, setSelection] = useState({ scope: null, countries: EMPTY_COUNTRIES, status: 'loading', error: null });
  const reloadCountries = useCallback(async () => {
    const id = ++requestId.current;
    if (!scope) {
      setSelection({ scope, countries: EMPTY_COUNTRIES, status: 'error', error: new Error('Sign in to load country settings.') });
      return;
    }
    setSelection({ scope, countries: EMPTY_COUNTRIES, status: 'loading', error: null });
    try {
      const countries = await regionalSettingsService.getSelectedCountries();
      if (id === requestId.current && scope === getRegionalSessionScope()) setSelection({ scope, countries, status: 'success', error: null });
    } catch (error) {
      if (id === requestId.current && scope === getRegionalSessionScope()) setSelection({ scope, countries: EMPTY_COUNTRIES, status: 'error', error });
    }
  }, [scope]);

  useEffect(() => {
    reloadCountries();
    return () => { requestId.current++; };
  }, [reloadCountries]);

  useEffect(() => {
    const sessionChanged = () => observeSession(value => value + 1);
    const storageChanged = event => {
      if (event.key === null || event.key === 'billing_auth_token' || event.key === 'billing_auth_user') sessionChanged();
    };
    window.addEventListener('storage', storageChanged);
    window.addEventListener('focus', sessionChanged);
    window.addEventListener(REGIONAL_SETTINGS_EVENT, reloadCountries);
    return () => {
      window.removeEventListener('storage', storageChanged);
      window.removeEventListener('focus', sessionChanged);
      window.removeEventListener(REGIONAL_SETTINGS_EVENT, reloadCountries);
    };
  }, [reloadCountries]);

  const current = selection.scope === scope;
  const selectedCountries = current ? selection.countries : EMPTY_COUNTRIES;
  return {
    sessionScope: scope,
    settingsLoading: !current || selection.status === 'loading',
    settingsError: current ? selection.error?.message || '' : '',
    reloadSettings: reloadCountries,
    selectedCountries,
    availableCountries: COUNTRIES_LIST,
    selectedCurrencies: [...new Set(selectedCountries.map(country => country.currency).filter(currency => CURRENCY_CODES.includes(currency)))],
    selectedPhoneCodes: [...new Set(selectedCountries.map(country => country.phoneCode))],
    hasSelectedCountries: selectedCountries.length > 0,
    defaultCountry: selectedCountries[0] || null,
    defaultCallingCode: selectedCountries[0]?.phoneCode || null,
    loading: !current || selection.status === 'loading',
    loaded: current && selection.status === 'success',
    error: current ? selection.error : null,
    reloadCountries,
    saveCountries: regionalSettingsService.saveSelectedCountries,
  };
}

export default regionalSettingsService;
